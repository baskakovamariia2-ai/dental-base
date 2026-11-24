// Dental Base — уведомления (расписание дня)
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "Dental Base", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "Dental Base", {
      body: data.body || "",
      tag: data.tag || "dental-base",
      renotify: true,
      requireInteraction: true, // не исчезает само (где система это поддерживает)
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/schedule" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/schedule";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
