/* NammaPros Partner service worker: background job-offer alerts and a small offline shell. */
const CACHE = "np-partner-v1";
const SHELL = ["/jobs", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Page navigations: network first, fall back to the cached shell when offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match("/jobs")));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "NammaPros", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "New job offer";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Open the app to accept.",
      tag: data.offer_id ? `offer-${data.offer_id}` : "job-offer",
      renotify: true,
      requireInteraction: true,
      vibrate: [500, 200, 500, 200, 500],
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/jobs" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/jobs";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => "focus" in w);
      if (open) {
        open.navigate(url);
        return open.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
