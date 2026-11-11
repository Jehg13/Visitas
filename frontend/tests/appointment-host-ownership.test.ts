import { describe, expect, it } from "bun:test";
import {
  isSameAppointmentPartner,
  isSameAppointmentVisitor,
} from "../src/appointment-host-ownership";

describe("appointment host ownership matching", () => {
  it("matches duplicate company records by normalized name and type", () => {
    expect(
      isSameAppointmentPartner(
        { name: "CyMEZ", type: "Contratista", rfc: "N/A" },
        { name: "cymez", type: "Contratista", rfc: "" },
      ),
    ).toBe(true);
    expect(
      isSameAppointmentPartner(
        { name: "CyMEZ", type: "Contratista", rfc: "ABC123" },
        { name: "CyMEZ", type: "Proveedor", rfc: "ABC123" },
      ),
    ).toBe(false);
    expect(
      isSameAppointmentPartner(
        { name: "CyMEZ", type: "Contratista", rfc: "ABC123" },
        { name: "CyMEZ", type: "Contratista", rfc: "XYZ789" },
      ),
    ).toBe(false);
  });

  it("matches duplicate visitor records while separating conflicting contact details", () => {
    expect(
      isSameAppointmentVisitor(
        { fullName: "José Pérez", phone: "555-0101", email: "jose@example.com" },
        { fullName: "Jose Perez", phone: "555-0101", email: "JOSE@example.com" },
      ),
    ).toBe(true);
    expect(
      isSameAppointmentVisitor(
        { fullName: "José Pérez", phone: "555-0101", email: "jose@example.com" },
        { fullName: "Jose Perez", phone: "555-0101", email: "other@example.com" },
      ),
    ).toBe(false);
  });
});
