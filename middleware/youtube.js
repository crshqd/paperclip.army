// middleware/youtube.js

const { spawn } = require("child_process");
const https = require("https");

function validId(id) {
    return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

// Common yt-dlp options
const ytBaseArgs = [
    "--js-runtimes",
    "node",
    "--remote-components",
    "ejs:github",
    "--no-playlist",
    // The SABR-only restriction (see yt-dlp issue #12482) appears to be
    // applied per-client, per-session — pinning to one client (even a
    // normally-reliable one like android) means a single bad roll takes
    // the whole thing down. Trying several at once gives more chances
    // that at least one isn't currently gated. android_sdkless is
    // excluded — it's been unreliable independent of SABR.
    "--extractor-args",
    "youtube:player_client=default,-android_sdkless",
];

const streamCache = new Map();

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Reuse TCP+TLS connections to googlevideo instead of renegotiating on
// every single range request. Without this, Node's default agent
// (keepAlive: false) opens a brand new handshake per request, and every
// one of those starts from TCP slow-start — which caps throughput hard
// when the browser is firing off many small range requests while
// buffering, regardless of what the CDN itself would otherwise allow.
const googlevideoAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 32,
    maxFreeSockets: 8,
});

function parseExpiry(mediaUrl) {
    try {
        const u = new URL(mediaUrl);
        const expire = u.searchParams.get("expire");

        if (expire) {
            // googlevideo URLs embed a Unix timestamp in seconds.
            return Number(expire) * 1000 - 60 * 1000;
        }
    } catch (err) {
        // Fall through to default TTL.
    }

    return Date.now() + 5 * 60 * 1000;
}

function pickBestVideoFormat(candidates) {
    return candidates
        .slice()
        .sort(
            (a, b) =>
                (b.height || 0) - (a.height || 0) ||
                (b.tbr || 0) - (a.tbr || 0)
        )[0];
}

function pickBestAudioFormat(candidates) {
    return candidates
        .slice()
        .sort(
            (a, b) =>
                (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0)
        )[0];
}

// Build separate directly-fetchable adaptive streams.
//
// videoUrl = video-only stream
// audioUrl = audio-only stream
function buildStreamInfo(info) {
    const duration =
        typeof info.duration === "number" ? info.duration : null;

    const usable = (info.formats || []).filter(
        (f) =>
            f.url &&
            (f.protocol === "https" || f.protocol === "http")
    );

    if (usable.length === 0) {
        throw new Error(
            "No directly-fetchable YouTube formats available"
        );
    }

    // Prefer H.264 video-only.
    const videoOnly = usable.filter(
        (f) =>
            f.vcodec !== "none" &&
            f.acodec === "none"
    );

    const videoH264 = videoOnly.filter(
        (f) => (f.vcodec || "").startsWith("avc1")
    );

    const bestVideo = pickBestVideoFormat(
        videoH264.length ? videoH264 : videoOnly
    );

    // Prefer AAC audio-only.
    const audioOnly = usable.filter(
        (f) =>
            f.acodec !== "none" &&
            f.vcodec === "none"
    );

    const audioAac = audioOnly.filter(
        (f) => (f.acodec || "").startsWith("mp4a")
    );

    const bestAudio = pickBestAudioFormat(
        audioAac.length ? audioAac : audioOnly
    );

    if (!bestVideo) {
        throw new Error(
            "No directly-fetchable video-only format available"
        );
    }

    if (!bestAudio) {
        throw new Error(
            "No directly-fetchable audio-only format available"
        );
    }

    const videoExpires = parseExpiry(bestVideo.url);
    const audioExpires = parseExpiry(bestAudio.url);

    return {
        mode: "adaptive",

        videoUrl: bestVideo.url,
        audioUrl: bestAudio.url,

        videoExt: bestVideo.ext,
        audioExt: bestAudio.ext,

        vcodec: bestVideo.vcodec,
        acodec: bestAudio.acodec,

        width: bestVideo.width || null,
        height: bestVideo.height || null,
        fps: bestVideo.fps || null,

        abr: bestAudio.abr || bestAudio.tbr || null,
        tbr: bestVideo.tbr || null,

        duration,

        // Cache is only valid while BOTH URLs are valid.
        expiresAt: Math.min(videoExpires, audioExpires),
    };
}

function fetchVideoInfo(id) {
    return new Promise((resolve, reject) => {
        const youtubeUrl =
            `https://www.youtube.com/watch?v=${id}`;

        const yt = spawn("yt-dlp", [
            ...ytBaseArgs,
            "-j",
            youtubeUrl,
        ]);

        let stdout = "";
        let stderr = "";

        yt.stdout.on("data", (chunk) => {
            stdout += chunk;
        });

        yt.stderr.on("data", (chunk) => {
            stderr += chunk;
        });

        yt.on("error", (err) => {
            reject(err);
        });

        yt.on("close", (code) => {
            if (stderr.trim()) {
                console.warn(
                    `[yt-dlp] ${id}:\n${stderr.trim()}`
                );
            }

            if (code !== 0) {
                return reject(
                    new Error(
                        `yt-dlp exited with ${code}: ${stderr}`
                    )
                );
            }

            const firstLine = stdout.trim().split("\n")[0];

            if (!firstLine) {
                return reject(
                    new Error("yt-dlp returned no metadata")
                );
            }

            try {
                resolve(JSON.parse(firstLine));
            } catch (err) {
                reject(
                    new Error(
                        `Failed to parse yt-dlp JSON: ${err.message}`
                    )
                );
            }
        });
    });
}

function probeFormats(id) {
    return fetchVideoInfo(id).then((info) => {
        console.log(
            "[youtube proxy] formats:",
            (info.formats || []).map((f) => ({
                format_id: f.format_id,
                ext: f.ext,
                protocol: f.protocol,
                vcodec: f.vcodec,
                acodec: f.acodec,
                width: f.width,
                height: f.height,
                fps: f.fps,
                filesize: f.filesize,
                abr: f.abr,
                tbr: f.tbr,
                url: f.url ? f.url.slice(0, 150) : null,
            }))
        );

        const streams = buildStreamInfo(info);

        console.log("[youtube proxy] selected streams:", {
            mode: streams.mode,
            duration: streams.duration,
            vcodec: streams.vcodec,
            acodec: streams.acodec,
            width: streams.width,
            height: streams.height,
            fps: streams.fps,
            videoUrl: streams.videoUrl?.slice(0, 150),
            audioUrl: streams.audioUrl?.slice(0, 150),
        });

        return streams;
    });
}

async function resolveStreams(id, forceRefresh = false) {
    const cached = streamCache.get(id);

    if (
        !forceRefresh &&
        cached &&
        cached.expiresAt > Date.now()
    ) {
        return cached;
    }

    const streams = await probeFormats(id);

    streamCache.set(id, streams);

    return streams;
}

// Proxy one of the direct YouTube media URLs.
//
// streamKey is either:
//   "videoUrl"
//   "audioUrl"
//
// This matters because when a signed URL expires, we must refresh
// the SAME type of stream rather than accidentally refreshing video
// while an audio request is happening.
function proxyMediaRequest(
    id,
    mediaUrl,
    req,
    res,
    alreadyRetried,
    streamKey
) {
    const target = new URL(mediaUrl);

    const headers = {
        "User-Agent": UA,
        "Referer": "https://www.youtube.com/",
    };

    if (req.headers.range) {
        headers["Range"] = req.headers.range;
    }

    const upstreamReq = https.request(
        {
            hostname: target.hostname,
            path: `${target.pathname}${target.search}`,
            method: "GET",
            headers,
            agent: googlevideoAgent,
        },
        (upstreamRes) => {
            // Signed YouTube URL expired.
            if (
                (upstreamRes.statusCode === 403 ||
                    upstreamRes.statusCode === 404) &&
                !alreadyRetried
            ) {
                upstreamRes.resume();

                resolveStreams(id, true)
                    .then((freshStreams) => {
                        const freshUrl =
                            freshStreams[streamKey];

                        if (!freshUrl) {
                            throw new Error(
                                `Refreshed stream missing ${streamKey}`
                            );
                        }

                        proxyMediaRequest(
                            id,
                            freshUrl,
                            req,
                            res,
                            true,
                            streamKey
                        );
                    })
                    .catch((err) => {
                        console.error(
                            "[youtube proxy] refresh failed:",
                            err
                        );

                        if (!res.headersSent) {
                            res.status(502).json({
                                error:
                                    "Failed to refresh YouTube media URL",
                            });
                        }
                    });

                return;
            }

            res.status(upstreamRes.statusCode);

            const passthroughHeaders = [
                "content-type",
                "content-length",
                "content-range",
                "accept-ranges",
                "cache-control",
                "expires",
            ];

            for (const h of passthroughHeaders) {
                if (upstreamRes.headers[h]) {
                    res.setHeader(
                        h,
                        upstreamRes.headers[h]
                    );
                }
            }

            if (!upstreamRes.headers["accept-ranges"]) {
                res.setHeader("Accept-Ranges", "bytes");
            }

            upstreamRes.pipe(res);

            upstreamRes.on("error", (err) => {
                console.error(
                    "[youtube proxy] upstream error:",
                    err
                );

                if (!res.destroyed) {
                    res.destroy(err);
                }
            });
        }
    );

    upstreamReq.on("error", (err) => {
        console.error(
            "[youtube proxy] request error:",
            err
        );

        if (!res.headersSent) {
            res.status(502).json({
                error:
                    "Failed to reach YouTube media server",
            });
        }
    });

    req.on("close", () => {
        upstreamReq.destroy();
    });

    upstreamReq.end();
}

function youtube(type) {
    if (
        !["audio", "video", "comments"].includes(type)
    ) {
        throw new Error(
            'youtube() requires either "audio", "video", or "comments"'
        );
    }

    return (req, res, next) => {
        const id = req.params.id;

        if (!validId(id)) {
            return res.status(400).json({
                error: "Invalid YouTube video ID",
            });
        }

        const youtubeUrl =
            `https://www.youtube.com/watch?v=${id}`;

        // -------------------------
        // Comments
        // -------------------------

        if (type === "comments") {
            const yt = spawn("yt-dlp", [
                ...ytBaseArgs,
                "--skip-download",
                "--get-comments",
                "--dump-single-json",
                "--extractor-args",
                "youtube:comment_sort=top;max_comments=30,30,0,0",
                youtubeUrl,
            ]);

            let stdout = "";
            let stderr = "";

            yt.stdout.on("data", (chunk) => {
                stdout += chunk;
            });

            yt.stderr.on("data", (chunk) => {
                stderr += chunk;
            });

            yt.on("error", (err) => {
                console.error("[yt-dlp]", err);

                if (!res.headersSent) {
                    res.status(502).json({
                        error: "Failed to start yt-dlp",
                    });
                }
            });

            yt.on("close", (code) => {
                console.log(
                    "yt-dlp comments exit:",
                    code
                );

                if (code !== 0) {
                    console.error("[yt-dlp]", stderr);

                    if (!res.headersSent) {
                        return res.status(502).json({
                            error:
                                "Failed to retrieve YouTube comments",
                        });
                    }

                    return;
                }

                try {
                    const info = JSON.parse(stdout);

                    const comments = Array.isArray(
                        info.comments
                    )
                        ? info.comments.slice(0, 30)
                        : [];

                    res.json({
                        comments,
                    });
                } catch (err) {
                    console.error(
                        "[yt-dlp] Invalid JSON:",
                        err
                    );

                    if (!res.headersSent) {
                        res.status(502).json({
                            error:
                                "Invalid response from yt-dlp",
                        });
                    }
                }
            });

            req.on("close", () => {
                if (!yt.killed) {
                    yt.kill();
                }
            });

            return;
        }

        // -------------------------
        // Resolve streams
        // -------------------------

        resolveStreams(id)
            .then((streams) => {
                // -------------------------
                // Metadata
                // -------------------------

                if (req.query.info !== undefined) {
                    return res.json({
                        mode: streams.mode,
                        duration: streams.duration,

                        video: {
                            ext: streams.videoExt,
                            codec: streams.vcodec,
                            width: streams.width,
                            height: streams.height,
                            fps: streams.fps,
                        },

                        audio: {
                            ext: streams.audioExt,
                            codec: streams.acodec,
                            abr: streams.abr,
                        },
                    });
                }

                // -------------------------
                // Video
                // -------------------------

                if (type === "video") {
                    return proxyMediaRequest(
                        id,
                        streams.videoUrl,
                        req,
                        res,
                        false,
                        "videoUrl"
                    );
                }

                // -------------------------
                // Audio
                // -------------------------

                if (type === "audio") {
                    return proxyMediaRequest(
                        id,
                        streams.audioUrl,
                        req,
                        res,
                        false,
                        "audioUrl"
                    );
                }
            })
            .catch((err) => {
                console.error(
                    "[youtube proxy] failed to resolve streams:",
                    err
                );

                if (!res.headersSent) {
                    res.status(502).json({
                        error:
                            "Failed to resolve YouTube streams",
                    });
                }
            });
    };
}

module.exports = youtube;