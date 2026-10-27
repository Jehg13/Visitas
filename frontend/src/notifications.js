const appAlertEvent = "visitas:alert";
export function notifyUser(message, type = "error") {
    if (!message.trim())
        return;
    window.dispatchEvent(new CustomEvent(appAlertEvent, {
        detail: { type, message },
    }));
}
export function listenForAlerts(listener) {
    const handler = (event) => {
        if (event instanceof CustomEvent)
            listener(event.detail);
    };
    window.addEventListener(appAlertEvent, handler);
    return () => window.removeEventListener(appAlertEvent, handler);
}
export function confirmUser(message, confirmLabel = "Confirmar") {
    return new Promise((resolve) => {
        window.dispatchEvent(new CustomEvent(appAlertEvent, {
            detail: { type: "info", message, confirmLabel, cancelLabel: "Cancelar", resolve },
        }));
    });
}
