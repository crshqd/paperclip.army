const https = require("node:https");

function proxy(targetBase) {

  return (req, res) => {
    try {
      const target = new URL(
        req.path.replace(/^\/+/, ""),
        targetBase
      );

      const headers = {
        ...req.headers,
        host: target.host,
      };

      // These are hop-by-hop headers and shouldn't be forwarded.
      delete headers.connection;
        delete headers["content-length"];

      const proxyReq = https.request(
        target,
        {
          method: req.method,
          headers,
        },
        (proxyRes) => {
          res.status(proxyRes.statusCode || 502);

          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (value !== undefined) {
              res.setHeader(key, value);
            }
          }

          proxyRes.pipe(res);
        }
      );

      proxyReq.on("error", (err) => {
        console.error(err);

        if (!res.headersSent) {
          res.status(502).json({
            error: "Forwarding request failed",
          });
        } else {
          res.destroy(err);
        }
      });

      req.on("close", () => {
        proxyReq.destroy();
      });

      if (["GET", "HEAD"].includes(req.method)) {
        proxyReq.end();
      } else {
        req.pipe(proxyReq);
      }
    } catch (err) {
      console.error(err);
      res.status(502).json({
        error: "Forwarding request failed",
      });
    }
  };
}

module.exports = proxy;