// middleware/youtube-api.js

const { spawn } = require("child_process");

function youtubeApi(type) {
  if (!["search"].includes(type)) {
    throw new Error(
      'youtubeApi() requires "search"'
    );
  }

  return (req, res, next) => {
    let target;

    if (type === "search") {
      const query = req.query.q;

      if (!query || typeof query !== "string") {
        return res.status(400).json({
          error: "Missing search query",
        });
      }

      let limit = Number.parseInt(req.query.limit, 10) || 10;
      limit = Math.max(1, Math.min(limit, 50));

      target = `ytsearch${limit}:${query}`;
    }

    const yt = spawn("yt-dlp", [
      "--flat-playlist",
      "--dump-single-json",
      "--js-runtimes",
      "node",
      target,
    ]);

    let stdout = "";
    let stderr = "";

    yt.stdout.on("data", chunk => {
      stdout += chunk;
    });

    yt.stderr.on("data", chunk => {
      stderr += chunk;
    });

    yt.on("error", err => {
      console.error("[yt-dlp]", err);

      if (!res.headersSent) {
        res.status(502).json({
          error: "Failed to start yt-dlp",
        });
      }
    });

    yt.on("close", code => {
      if (code !== 0) {
        console.error("[yt-dlp]", stderr);

        if (!res.headersSent) {
          return res.status(502).json({
            error: "Failed to retrieve YouTube data",
          });
        }

        return;
      }

      try {
        const info = JSON.parse(stdout);

        res.json({
          results: info.entries || [],
        });
      } catch (err) {
        console.error("[yt-dlp] JSON parse error:", err);

        if (!res.headersSent) {
          res.status(502).json({
            error: "yt-dlp returned invalid JSON",
          });
        }
      }
    });

    req.on("close", () => {
      if (!yt.killed) {
        yt.kill();
      }
    });
  };
}

module.exports = youtubeApi;