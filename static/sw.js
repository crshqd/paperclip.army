importScripts("/p/scram/all.js");

const scramjet = new ScramjetServiceWorker();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  if (scramjet.route(event)) {
    event.respondWith(scramjet.fetch(event));
  }
});