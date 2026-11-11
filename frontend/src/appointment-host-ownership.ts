type AppointmentPartnerIdentity = {
  name: string;
  type: string;
  rfc: string;
};

type AppointmentVisitorIdentity = {
  fullName: string;
  phone: string;
  email: string;
};

function normalizeIdentity(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function isSameAppointmentPartner(
  first: AppointmentPartnerIdentity,
  second: AppointmentPartnerIdentity,
) {
  if (
    first.type !== second.type ||
    normalizeIdentity(first.name) !== normalizeIdentity(second.name)
  ) {
    return false;
  }
  const firstRfc = normalizeIdentity(first.rfc === "N/A" ? "" : first.rfc);
  const secondRfc = normalizeIdentity(second.rfc === "N/A" ? "" : second.rfc);
  return !firstRfc || !secondRfc || firstRfc === secondRfc;
}

export function isSameAppointmentVisitor(
  first: AppointmentVisitorIdentity,
  second: AppointmentVisitorIdentity,
) {
  if (normalizeIdentity(first.fullName) !== normalizeIdentity(second.fullName)) {
    return false;
  }
  for (const field of ["email", "phone"] as const) {
    const firstValue = normalizeIdentity(first[field]);
    const secondValue = normalizeIdentity(second[field]);
    if (firstValue && secondValue && firstValue !== secondValue) return false;
  }
  return true;
}
