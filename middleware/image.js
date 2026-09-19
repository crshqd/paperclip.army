const https = require("node:https");
const http = require("node:http");

function imageProxy() {
  return (req, res) => {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: "Missing url" });
    }

    let target;

    try {
      target = new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    if (!["http:", "https:"].includes(target.protocol)) {
      return res.status(400).json({ error: "Invalid protocol" });
    }

    const client = target.protocol === "https:" ? https : http;

    const proxyReq = client.get(target, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
      },
    }, (proxyRes) => {
      const contentType = proxyRes.headers["content-type"] || "";

      if (!contentType.toLowerCase().startsWith("image/")) {
        proxyRes.destroy();

        return res.status(415).json({
          error: "URL did not return an image",
          contentType: contentType || null,
        });
      }

      res.status(proxyRes.statusCode || 200);
      res.setHeader("Content-Type", contentType);

      if (proxyRes.headers["content-length"]) {
        res.setHeader(
          "Content-Length",
          proxyRes.headers["content-length"]
        );
      }

      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error(err);

      if (!res.headersSent) {
        res.status(502).json({
          error: "Image fetch failed",
        });
      } else {
        res.destroy(err);
      }
    });

    req.on("close", () => {
      proxyReq.destroy();
    });
  };
}

module.exports = imageProxy;