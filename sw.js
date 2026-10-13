/* HALBA service worker — network-first for the app shell (updates arrive on
   the next visit), cache as a fallback when offline. Feed data always comes
   from the network (it's live content). */
var CACHE = "halba-shell-v10";
var SHELL = ["./", "index.html", "styles.css", "app.js", "config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "icons/favicon-32.png", "brand/logo-horizontal-white.svg", "brand/mark.svg"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});
