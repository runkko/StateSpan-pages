const SHELL_CACHE = "self-observer-shell-v5";
const STATIC_CACHE = "self-observer-static-v1";
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const SHELL = [`${BASE_PATH}/`, `${BASE_PATH}/icon-192.png`, `${BASE_PATH}/icon-512.png`];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/_next/static/")) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

self.addEventListener("push", (event) => {
  const intent = readPushIntent(event.data);
  if (!intent) return;
  event.waitUntil(showPushIntent(intent));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url;
  const fallbackUrl = `${self.location.origin}${BASE_PATH}/`;
  const targetUrl = typeof requestedUrl === "string" && requestedUrl.startsWith(self.location.origin)
    ? requestedUrl
    : fallbackUrl;
  event.waitUntil(focusOrOpenApplication(targetUrl));
});

async function focusOrOpenApplication(targetUrl) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (existing) {
    await existing.focus();
    return;
  }
  await self.clients.openWindow(targetUrl);
}

async function showPushIntent(intent) {
  const fallbackUrl = `${self.location.origin}${BASE_PATH}/`;
  const requestedUrl = typeof intent.url === "string" && intent.url.startsWith(self.location.origin)
    ? intent.url
    : fallbackUrl;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const hasVisibleApplication = windows.some((client) => client.visibilityState === "visible");
  if (!hasVisibleApplication) {
    await self.registration.showNotification(intent.title, {
      body: intent.body,
      tag: intent.id,
      icon: `${BASE_PATH}/icon-192.png`,
      badge: `${BASE_PATH}/icon-192.png`,
      timestamp: Number.isFinite(Date.parse(intent.occurredAt)) ? Date.parse(intent.occurredAt) : Date.now(),
      data: {
        ...intent.data,
        kind: intent.kind,
        occurredAt: intent.occurredAt,
        url: requestedUrl,
      },
    });
  }
  for (const client of windows) {
    client.postMessage({ type: "statespan-notification-delivered", intentId: intent.id });
  }
}

function readPushIntent(data) {
  if (!data) return null;
  try {
    const value = data.json();
    if (!value || typeof value !== "object") return null;
    if (value.schemaVersion !== 1) return null;
    if (typeof value.id !== "string" || typeof value.kind !== "string") return null;
    if (typeof value.title !== "string" || typeof value.body !== "string") return null;
    if (typeof value.occurredAt !== "string") return null;
    return {
      id: value.id,
      kind: value.kind,
      title: value.title,
      body: value.body,
      occurredAt: value.occurredAt,
      data: value.data && typeof value.data === "object" ? value.data : {},
      url: typeof value.url === "string" ? value.url : null,
    };
  } catch {
    return null;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match(`${BASE_PATH}/`));
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const update = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached || caches.match(`${BASE_PATH}/`));
  return cached || update;
}
