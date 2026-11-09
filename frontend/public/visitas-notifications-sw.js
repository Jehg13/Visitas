self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      tag: payload.tag,
      requireInteraction: payload.requireInteraction,
      vibrate: payload.vibrate,
      data: payload.data,
      actions: payload.actions,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  const timerId = Number(data.timerId);
  event.notification.close();

  if (
    (event.action === "snooze" || event.action === "cancel") &&
    Number.isSafeInteger(timerId) &&
    timerId > 0
  ) {
    event.waitUntil(
      fetch(`/api/v1/daily-log/timers/${timerId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: event.action }),
      }).then(async (response) => {
        if (response.ok) return;
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (clients.length > 0) {
          await clients[0].focus();
        } else {
          await self.clients.openWindow(data.url || "/bitacora");
        }
      }),
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const target = new URL(data.url || "/bitacora", self.location.origin);
      for (const client of clients) {
        if (new URL(client.url).origin === target.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target.href);
          return;
        }
      }
      await self.clients.openWindow(target.href);
    }),
  );
});
