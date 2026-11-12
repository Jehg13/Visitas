export function inheritManualRegistrationReference(
  details: string,
  sourceDetails: string,
  registrationFolio: unknown,
): string {
  const sourceFolio = sourceDetails.match(/^Registro manual · Folio (\d{8})(?: ·|$)/)?.[1];
  const folio = sourceFolio ??
    (typeof registrationFolio === "string" && /^\d{8}$/.test(registrationFolio)
      ? registrationFolio
      : null);
  if (!folio) return details;

  const note = details
    .replace(/^Registro manual · Folio \d{8}(?: ·\s*)?/, "")
    .trim();
  return [`Registro manual · Folio ${folio}`, note].filter(Boolean).join(" · ");
}
