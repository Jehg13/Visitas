import { describe, expect, it } from "bun:test";
import { inheritManualRegistrationReference } from "./daily-log-details";

describe("manual visit movement details", () => {
  it("keeps the registration folio on later movement rows", () => {
    expect(
      inheritManualRegistrationReference(
        "Se verificó la identificación",
        "Registro manual · Folio 12345678 · Checklist de entrada completado",
        null,
      ),
    ).toBe("Registro manual · Folio 12345678 · Se verificó la identificación");
  });

  it("uses the related arrival folio when the selected movement has no tag", () => {
    expect(
      inheritManualRegistrationReference("Salida autorizada", "", "87654321"),
    ).toBe("Registro manual · Folio 87654321 · Salida autorizada");
  });

  it("leaves ordinary movement details unchanged without a manual folio", () => {
    expect(
      inheritManualRegistrationReference("Observación", "Llegada registrada", null),
    ).toBe("Observación");
  });
});
