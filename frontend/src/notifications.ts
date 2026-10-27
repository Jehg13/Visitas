export type AppAlertType = "success" | "error" | "info";

export type AppAlertPayload = {
  type: AppAlertType;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve?: (confirmed: boolean) => void;
};

const appAlertEvent = "visitas:alert";

export function notifyUser(message: string, type: AppAlertType = "error") {
  if (!message.trim()) return;
  window.dispatchEvent(new CustomEvent<AppAlertPayload>(appAlertEvent, {
    detail: { type, message },
  }));
}

export function listenForAlerts(listener: (alert: AppAlertPayload) => void) {
  const handler = (event: Event) => {
    if (event instanceof CustomEvent) listener(event.detail as AppAlertPayload);
  };
  window.addEventListener(appAlertEvent, handler);
  return () => window.removeEventListener(appAlertEvent, handler);
}

export function confirmUser(message: string, confirmLabel = "Confirmar") {
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<AppAlertPayload>(appAlertEvent, {
      detail: { type: "info", message, confirmLabel, cancelLabel: "Cancelar", resolve },
    }));
  });
}
