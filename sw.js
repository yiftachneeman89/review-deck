// Review Deck service worker: makes the app installable and lets the deck open without a connection.
// Network first (so updates show up right away), cached copy when offline.
const CACHE = "review-deck-v16";
const SHELL = ["./", "index.html", "style.css?v=13", "home.css?v=13", "app.js?v=15", "theme.js?v=1", "insights.js?v=13", "features.js?v=13", "search.js?v=13", "findgame.js?v=13", "explain.js?v=13", "shared.js?v=5", "manifest.webmanifest", "icons/logo.svg", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      // offline: the cached copy; the start page only stands in for pages, never for a script or a picture
      .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))),
  );
});
