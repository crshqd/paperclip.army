// m3u8-proxy.js

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function setCorsHeaders(res) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

function m3u8Proxy(options = {}) {
  const allowedOrigin = options.allowedOrigin || "*";

  return async function (req, res, next) {
    const targetUrl = req.query.url;

    // Not a proxy request — let Express continue.
    if (!targetUrl) {
      return next();
    }

    const corsHeaders = {
      ...CORS_HEADERS,
      "Access-Control-Allow-Origin": allowedOrigin,
    };

    for (const [key, value] of Object.entries(corsHeaders)) {
      res.setHeader(key, value);
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    let parsedTarget;

    try {
      parsedTarget = new URL(targetUrl);
    } catch {
      return res.status(400).send("Invalid URL");
    }

    const referer = req.query.referer || undefined;
    const userAgent = req.query.ua || undefined;

    const headers = {};

    if (referer) {
      headers.Referer = referer;
    }

    if (userAgent) {
      headers["User-Agent"] = userAgent;
    }

    let upstream;

    try {
      upstream = await fetch(parsedTarget, {
        headers,
        redirect: "follow",
      });
    } catch (err) {
      console.error("Proxy fetch failed:", err);
      return res.status(502).send("Upstream fetch failed");
    }

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .send(`Upstream returned ${upstream.status}`);
    }

    const contentType =
      upstream.headers.get("content-type") || "";

    const isPlaylist =
      parsedTarget.pathname.toLowerCase().endsWith(".m3u8") ||
      contentType.includes("mpegurl") ||
      contentType.includes("vnd.apple.mpegurl");

    // Not an M3U8 — stream it directly.
    if (!isPlaylist) {
      upstream.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      for (const [key, value] of Object.entries(corsHeaders)) {
        res.setHeader(key, value);
      }

      return res.send(
        Buffer.from(await upstream.arrayBuffer())
      );
    }

    // M3U8 playlist — rewrite URLs.
    const playlist = await upstream.text();

    // req.baseUrl is whatever path the middleware
    // was mounted on.
    const proxyUrl =
      `${req.protocol}://${req.get("host")}${req.baseUrl}`;

    const rewritten = rewritePlaylist(
      playlist,
      parsedTarget.toString(),
      proxyUrl,
      referer,
      userAgent
    );

    res.status(200);
    res.setHeader(
      "Content-Type",
      "application/vnd.apple.mpegurl"
    );
    res.setHeader("Cache-Control", "no-store");

    return res.send(rewritten);
  };
}


function rewritePlaylist(
  playlistText,
  originalUrl,
  proxyUrl,
  referer,
  userAgent
) {
  const base = new URL(originalUrl);

  function proxied(url) {
    const params = new URLSearchParams({
      url,
    });

    if (referer) {
      params.set("referer", referer);
    }

    if (userAgent) {
      params.set("ua", userAgent);
    }

    return `${proxyUrl}?${params.toString()}`;
  }

  function resolve(url) {
    try {
      return new URL(url, base).toString();
    } catch {
      return url;
    }
  }

  return playlistText
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      // Handle URI="..." tags such as:
      // #EXT-X-KEY
      // #EXT-X-MAP
      if (
        trimmed.startsWith("#") &&
        /URI="([^"]+)"/.test(trimmed)
      ) {
        return trimmed.replace(
          /URI="([^"]+)"/,
          (_, uri) =>
            `URI="${proxied(resolve(uri))}"`
        );
      }

      // Comments / tags / blank lines
      if (
        trimmed.startsWith("#") ||
        trimmed === ""
      ) {
        return line;
      }

      // Segment or child playlist
      return proxied(resolve(trimmed));
    })
    .join("\n");
}


module.exports = m3u8Proxy;