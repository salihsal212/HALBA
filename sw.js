/* HALBA service worker — app-shell cache so the app opens instantly.
   Feed data always comes from the network (it's live content). */
var CACHE = "halba-shell-v2";
var SHELL = ["./", "index.html", "styles.css", "app.js", "config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "icons/favicon-32.png", "brand/logo-horizontal-white.svg"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }));
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Supabase etc: network only
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request);
    })
  );
});
