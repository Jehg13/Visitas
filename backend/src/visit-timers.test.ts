import { describe, expect, test } from "bun:test";
import {
  formatElapsedMinutes,
  getVisitTimerIntervalMinutes,
} from "./visit-timers";

describe("visit timer intervals and reminders", () => {
  test("uses fifteen minutes for arrival and thirty for entry", () => {
    expect(getVisitTimerIntervalMinutes("Llegada")).toBe(15);
    expect(getVisitTimerIntervalMinutes("Ingreso")).toBe(30);
  });

  test("formats repeated reminders with the total elapsed time", () => {
    expect(formatElapsedMinutes(15)).toBe("15 minutos");
    expect(formatElapsedMinutes(30)).toBe("30 minutos");
    expect(formatElapsedMinutes(60)).toBe("1 hora");
    expect(formatElapsedMinutes(61)).toBe("1 hora y 1 minuto");
    expect(formatElapsedMinutes(90)).toBe("1 hora y 30 minutos");
    expect(formatElapsedMinutes(120)).toBe("2 horas");
  });
});
