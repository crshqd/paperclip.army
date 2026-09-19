const express = require("express");
const { spawn } = require("child_process");
const { server: wisp } = require("@mercuryworkshop/wisp-js/server");
const { createBareServer } = require("@tomphttp/bare-server-node");
const m3u8 = require("./middleware/m3u8");
const youtube = require("./middleware/youtube");
const youtubeApi = require("./middleware/youtubeapi");
const proxy = require("./middleware/proxy");
const image = require("./middleware/image");
const media = require("./middleware/media");
const http = require('http');
const compression = require('compression');

const app = express();
const wispprefix = "/api/membercount/";
const bareprefix = "/api/imageupload/";
const port = 8033;
const bare = createBareServer(bareprefix);
const server = http.createServer((req, res) => {
    if (bare.shouldRoute(req)) {
        bare.routeRequest(req, res);
        return;
    }
    app(req, res);
});
app.use(express.static("./static/"));
app.use(
  compression({ filter: (req, res) => {
      const type = res.getHeader("Content-Type");
      if (typeof type === "string" && (type.startsWith("audio/") || type.startsWith("video/"))) {
        return false;
      }
      return compression.filter(req, res);
  }})
);
app.get("/api/yt/:id/audio", youtube("audio"));
app.get("/api/yt/:id/video", youtube("video"));
app.get("/api/yt/:id/comments", youtube("comments"));
app.get("/api/yt/search", youtubeApi("search"));
app.use("/api/m3u8", m3u8());
app.use("/api/iptv", proxy("https://iptv-org.github.io/api/"));
app.use("/api/media", media());
app.use("/api/image", image());

server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith(wispprefix)) {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.destroy();
  }
});

app.use((req, res) => {
  res.status(404).send(req.path+" not found");
});

server.listen(port, () => {
  console.log("Server running on http://localhost:"+port);
  console.log("Wisp running on ws://localhost:"+port+""+wispprefix);
  console.log("Bare running on http://localhost:"+port+bareprefix)
});