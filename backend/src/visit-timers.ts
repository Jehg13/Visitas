export type VisitTimerPhase = "Llegada" | "Ingreso";

export function getVisitTimerIntervalMinutes(phase: VisitTimerPhase) {
  return phase === "Llegada" ? 15 : 30;
}

export function formatElapsedMinutes(totalMinutes: number) {
  const elapsedMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  if (hours === 0) return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  if (minutes === 0) return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  return `${hours} ${hours === 1 ? "hora" : "horas"} y ${minutes} ${
    minutes === 1 ? "minuto" : "minutos"
  }`;
}
