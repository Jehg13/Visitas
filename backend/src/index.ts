import pool from "./db";
import { authenticateUser, getActiveUser, type AuthenticatedUser } from "./auth";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import QRCode from "qrcode";

const port = Number(Bun.env.PORT ?? 3000);
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const sessionCookieName = "visitas_session";
const secureCookieAttribute = Bun.env.NODE_ENV === "production" ? "; Secure" : "";
const sectionAccessValues = ["recepcion", "anfitriones", "administrador"] as const;
const managedAccessValues = ["recepcion", "administrador"] as const;
type SectionAccess = (typeof sectionAccessValues)[number];

type AccessAccountRow = RowDataPacket & {
  login: string;
  name: string | null;
  email: string | null;
  active: string | null;
  role: string | null;
  phone: string | null;
  priv_admin: string | null;
  picture: Buffer | null;
};

type SectionAccessRow = RowDataPacket & {
  login: string;
  seccion: SectionAccess;
};

type UserSectionAccessRow = RowDataPacket & {
  seccion: SectionAccess;
};

type AccessLoginRow = RowDataPacket & {
  login: string;
  priv_admin?: string | null;
  section_admin?: number;
};

type DepartmentRow = RowDataPacket & {
  id: number;
  name: string;
};

type HostAccountRow = RowDataPacket & {
  login: string;
  name: string | null;
  email: string | null;
  role: string | null;
  phone: string | null;
};

type BusinessPartnerRow = RowDataPacket & {
  id: number;
  name: string;
  description: string;
  rfc: string;
  category: string;
  employee_count: number;
  partner_type: "Contratista" | "Proveedor";
  is_active: number;
};

type GeneralVisitorRow = RowDataPacket & {
  id: number;
  full_name: string;
  curp: string | null;
  phone: string;
  email: string;
};

type ExternalStaffRow = RowDataPacket & {
  id: number;
  business_partner_id: number;
  full_name: string;
  phone: string;
  email: string;
  partner_name: string;
  partner_type: "Contratista" | "Proveedor";
};

type AppointmentRow = RowDataPacket & {
  id: number;
  business_partner_id: number | null;
  visit_date: string;
  visit_time: string;
  visitor_name: string;
  visitor_email: string;
  registered_by: string;
  company_name: string;
  host_name: string;
  status: "Dentro" | "En proceso" | "Pendiente" | "Retirado" | "Cancelada";
};

type DailyLogRow = RowDataPacket & {
  id: number;
  entry_date: string;
  entry_time: string;
  event_type: "Llegada" | "Ingreso" | "Retiro" | "Observaciones";
  person_name: string;
  details: string | null;
  appointment_id: number | null;
  external_staff_id: number | null;
  visitor_record_id: number | null;
  company_name: string | null;
  host_name: string | null;
  category: "Visitante" | "Contratista" | "Proveedor" | "Sin categoría";
};

type DailyLogInput = {
  event: "Llegada" | "Ingreso" | "Retiro" | "Observaciones";
  date: string;
  time: string;
  personName: string;
  details: string;
  appointmentId: number | null;
  externalStaffId: number | null;
  visitorRecordId: number | null;
};

type BusinessPartnerInput = {
  name: string;
  description: string;
  rfc: string;
  category: string;
  employeeCount: number;
  type: "Contratista" | "Proveedor";
  status: "Activa" | "Inactiva";
};

type GeneralVisitorInput = {
  fullName: string;
  curp: string;
  phone: string;
  email: string;
};

type ExternalStaffInput = {
  businessPartnerId: number;
  fullName: string;
  phone: string;
  email: string;
};

type AppointmentInput = {
  visitorName: string;
  visitorEmail: string;
  businessPartnerId: number;
  hostName: string;
  date: string;
  time: string;
};

type EquipmentDeclaredItemInput = {
  itemType: "Equipo" | "Herramienta";
  quantity: number;
  product: string;
  brand: string;
  model: string;
  serialNumber: string;
  color: string;
  notes: string;
};

type EquipmentInspectionItemInput = Omit<EquipmentDeclaredItemInput, "itemType"> & {
  declarationItemId: number;
  incident: boolean;
  checked: boolean;
};

function parseEquipmentDeclaredItems(value: unknown): EquipmentDeclaredItemInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const items: EquipmentDeclaredItemInput[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { itemType, quantity, product, brand, model, serialNumber, color, notes } = item;
    if (
      (itemType !== "Equipo" && itemType !== "Herramienta") ||
      typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000 ||
      typeof product !== "string" || !product.trim() || product.trim().length > 180 ||
      typeof brand !== "string" || brand.length > 120 ||
      typeof model !== "string" || model.length > 120 ||
      typeof serialNumber !== "string" || serialNumber.length > 180 ||
      typeof color !== "string" || color.length > 80 ||
      typeof notes !== "string" || notes.length > 1000
    ) return null;
    items.push({
      itemType,
      quantity,
      product: product.trim(),
      brand: brand.trim(),
      model: model.trim(),
      serialNumber: serialNumber.trim(),
      color: color.trim(),
      notes: notes.trim(),
    });
  }
  return items;
}

function parseEquipmentInspectionItems(value: unknown): EquipmentInspectionItemInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const items: EquipmentInspectionItemInput[] = [];
  const ids = new Set<number>();
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { declarationItemId, quantity, product, brand, model, serialNumber, color, notes, incident, checked } = item;
    if (
      typeof declarationItemId !== "number" || !Number.isSafeInteger(declarationItemId) ||
      declarationItemId < 1 || ids.has(declarationItemId) ||
      typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 100000 ||
      typeof product !== "string" || product.length > 180 ||
      typeof brand !== "string" || brand.length > 120 ||
      typeof model !== "string" || model.length > 120 ||
      typeof serialNumber !== "string" || serialNumber.length > 180 ||
      typeof color !== "string" || color.length > 80 ||
      typeof notes !== "string" || notes.length > 1000 ||
      typeof incident !== "boolean" ||
      typeof checked !== "boolean" || !checked
    ) return null;
    ids.add(declarationItemId);
    items.push({
      declarationItemId,
      quantity,
      product: product.trim(),
      brand: brand.trim(),
      model: model.trim(),
      serialNumber: serialNumber.trim(),
      color: color.trim(),
      notes: notes.trim(),
      incident,
      checked,
    });
  }
  return items;
}

function hashEquipmentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
}

function parseBusinessPartner(value: unknown): BusinessPartnerInput | null {
  if (!isRecord(value)) return null;
  const { name, description, rfc, category, employeeCount, type, status } = value;
  if (
    typeof name !== "string" || !name.trim() || name.trim().length > 180 ||
    typeof description !== "string" || !description.trim() || description.trim().length > 65535 ||
    typeof rfc !== "string" || !rfc.trim() || rfc.trim().length > 13 ||
    typeof category !== "string" || !category.trim() || category.trim().length > 120 ||
    typeof employeeCount !== "number" || !Number.isSafeInteger(employeeCount) ||
    employeeCount < 0 || employeeCount > 4294967295 ||
    (type !== "Contratista" && type !== "Proveedor") ||
    (status !== "Activa" && status !== "Inactiva")
  ) {
    return null;
  }
  return {
    name: name.trim(),
    description: description.trim(),
    rfc: rfc.trim().toLocaleUpperCase(),
    category: category.trim(),
    employeeCount,
    type,
    status,
  };
}

function parseGeneralVisitor(value: unknown): GeneralVisitorInput | null {
  if (!isRecord(value)) return null;
  const { fullName, curp, phone, email } = value;
  if (
    typeof fullName !== "string" || !fullName.trim() || fullName.trim().length > 180 ||
    typeof curp !== "string" || curp.trim().length > 18 ||
    (curp.trim() !== "" && !/^[A-Za-z0-9]{18}$/.test(curp.trim())) ||
    typeof phone !== "string" || phone.length > 30 ||
    typeof email !== "string" || email.length > 254 ||
    (email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
  ) {
    return null;
  }
  return {
    fullName: fullName.trim(),
    curp: curp.trim().toLocaleUpperCase(),
    phone: phone.trim(),
    email: email.trim(),
  };
}

function parseExternalStaff(value: unknown): ExternalStaffInput | null {
  if (!isRecord(value)) return null;
  const { businessPartnerId, fullName, phone, email } = value;
  if (
    typeof businessPartnerId !== "number" ||
    !Number.isSafeInteger(businessPartnerId) ||
    businessPartnerId < 1 ||
    typeof fullName !== "string" || !fullName.trim() || fullName.trim().length > 180 ||
    typeof phone !== "string" || phone.length > 30 ||
    typeof email !== "string" || email.length > 254 ||
    (email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
  ) {
    return null;
  }
  return {
    businessPartnerId,
    fullName: fullName.trim(),
    phone: phone.trim(),
    email: email.trim(),
  };
}

function parseAppointment(value: unknown): AppointmentInput | null {
  if (!isRecord(value)) return null;
  const { visitorName, visitorEmail, businessPartnerId, hostName, date, time } = value;
  if (
    typeof visitorName !== "string" || !visitorName.trim() || visitorName.trim().length > 180 ||
    typeof visitorEmail !== "string" || visitorEmail.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorEmail.trim()) ||
    typeof businessPartnerId !== "number" ||
    !Number.isSafeInteger(businessPartnerId) || businessPartnerId < 1 ||
    typeof hostName !== "string" || !hostName.trim() || hostName.trim().length > 180 ||
    typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) {
    return null;
  }
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return null;
  }
  return {
    visitorName: visitorName.trim(),
    visitorEmail: visitorEmail.trim(),
    businessPartnerId,
    hostName: hostName.trim(),
    date,
    time,
  };
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseDailyLogInput(value: unknown): DailyLogInput | null {
  if (!isRecord(value)) return null;
  const { event, date, time, personName, details, appointmentId, externalStaffId, visitorRecordId } = value;
  const linkedIds = [appointmentId, externalStaffId, visitorRecordId].filter(
    (id) => typeof id === "number" && id > 0,
  );
  const validOptionalId = (id: unknown) =>
    id === null || id === undefined || (
      typeof id === "number" && Number.isSafeInteger(id) && id > 0
    );
  if (
    (event !== "Llegada" && event !== "Ingreso" && event !== "Retiro" && event !== "Observaciones") ||
    typeof date !== "string" || !isValidDateString(date) ||
    typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    typeof personName !== "string" || personName.trim().length > 180 ||
    (personName.trim().length === 0 && linkedIds.length === 0) ||
    typeof details !== "string" || details.trim().length > 4000 ||
    !validOptionalId(appointmentId) ||
    !validOptionalId(externalStaffId) ||
    !validOptionalId(visitorRecordId) ||
    linkedIds.length > 1
  ) {
    return null;
  }
  return {
    event,
    date,
    time,
    personName: personName.trim(),
    details: details.trim(),
    appointmentId: typeof appointmentId === "number" ? appointmentId : null,
    externalStaffId: typeof externalStaffId === "number" ? externalStaffId : null,
    visitorRecordId: typeof visitorRecordId === "number" ? visitorRecordId : null,
  };
}

async function listBusinessPartners() {
  const [rows] = await pool.query<BusinessPartnerRow[]>(
    `SELECT id, name, description, rfc, category, employee_count, partner_type, is_active
     FROM business_partners
     ORDER BY name, id`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    description: row.description,
    rfc: row.rfc,
    category: row.category,
    employeeCount: Number(row.employee_count),
    type: row.partner_type,
    status: row.is_active ? "Activa" as const : "Inactiva" as const,
  }));
}

async function listGeneralVisitors() {
  const [rows] = await pool.query<GeneralVisitorRow[]>(
    `SELECT id, full_name, curp, phone, email
     FROM general_visitors
     ORDER BY full_name, id`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    fullName: row.full_name,
    curp: row.curp ?? "",
    phone: row.phone,
    email: row.email,
  }));
}

async function listExternalStaff() {
  const [rows] = await pool.query<ExternalStaffRow[]>(
    `SELECT s.id, s.business_partner_id, s.full_name, s.phone, s.email,
            p.name AS partner_name, p.partner_type
     FROM external_staff s
     INNER JOIN business_partners p ON p.id = s.business_partner_id
     ORDER BY s.full_name, s.id`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    businessPartnerId: Number(row.business_partner_id),
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    relationshipType: row.partner_type,
    companyName: row.partner_name,
  }));
}

async function listAppointments() {
  const [rows] = await pool.query<AppointmentRow[]>(
    `SELECT id, DATE_FORMAT(visit_date, '%Y-%m-%d') AS visit_date,
            TIME_FORMAT(visit_time, '%H:%i') AS visit_time,
            visitor_name, visitor_email, registered_by, company_name, host_name, status
     FROM appointments
     ORDER BY visit_date DESC, visit_time, id DESC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    date: row.visit_date,
    time: row.visit_time,
    visitor: row.visitor_name,
    email: row.visitor_email,
    registeredBy: row.registered_by,
    company: row.company_name,
    host: row.host_name,
    status: row.status,
  }));
}

const dailyLogJoins = `
  LEFT JOIN appointments a ON a.id = d.appointment_id
  LEFT JOIN external_staff s ON s.id = COALESCE(
    d.external_staff_id,
    (
      SELECT matched_staff.id
      FROM external_staff AS matched_staff
      WHERE a.business_partner_id IS NOT NULL
        AND matched_staff.business_partner_id = a.business_partner_id
        AND LOWER(TRIM(matched_staff.full_name)) = LOWER(TRIM(d.person_name))
      ORDER BY matched_staff.id DESC
      LIMIT 1
    )
  )
  LEFT JOIN business_partners bp ON bp.id = COALESCE(s.business_partner_id, a.business_partner_id)
  LEFT JOIN general_visitors gv ON gv.id = COALESCE(d.visitor_record_id, a.visitor_record_id)`;

const dailyLogSubjectKey = `CASE
  WHEN s.id IS NOT NULL THEN CONCAT('external:', s.id)
  WHEN COALESCE(d.visitor_record_id, a.visitor_record_id) IS NOT NULL
    THEN CONCAT('visitor:', COALESCE(d.visitor_record_id, a.visitor_record_id))
  WHEN a.business_partner_id IS NOT NULL
    THEN CONCAT('external-name:', a.business_partner_id, ':', LOWER(TRIM(d.person_name)))
  WHEN d.appointment_id IS NOT NULL THEN CONCAT('appointment:', d.appointment_id)
  ELSE CONCAT('name:', LOWER(TRIM(d.person_name)))
END`;

async function listDailyLogEntries(
  fromDate: string,
  toDate: string,
  search: string,
  event: string,
  category: string,
  hosts: string[],
  page: number,
  pageSize: number,
) {
  const conditions = ["d.entry_date BETWEEN ? AND ?"];
  const parameters: Array<string | number> = [fromDate, toDate];
  if (search) {
    conditions.push(
      "(d.person_name LIKE ? OR COALESCE(bp.name, a.company_name, '') LIKE ? OR COALESCE(a.host_name, '') LIKE ?)",
    );
    const searchTerm = `%${search}%`;
    parameters.push(searchTerm, searchTerm, searchTerm);
  }
  if (event) {
    conditions.push("d.event_type = ?");
    parameters.push(event);
  }
  if (category) {
    conditions.push(
      `CASE
        WHEN bp.partner_type IS NOT NULL THEN bp.partner_type
        WHEN gv.id IS NOT NULL THEN 'Visitante'
        ELSE 'Sin categoría'
      END = ?`,
    );
    parameters.push(category);
  }
  if (hosts.length > 0) {
    conditions.push(`COALESCE(a.host_name, '') IN (${hosts.map(() => "?").join(", ")})`);
    parameters.push(...hosts);
  }
  const where = conditions.join(" AND ");
  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM daily_log_entries d
     ${dailyLogJoins}
     WHERE ${where}`,
    parameters,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const [rows] = await pool.execute<DailyLogRow[]>(
    `SELECT d.id,
            DATE_FORMAT(d.entry_date, '%Y-%m-%d') AS entry_date,
            TIME_FORMAT(d.entry_time, '%H:%i') AS entry_time,
            d.event_type, d.person_name, d.details,
            d.appointment_id, d.external_staff_id, d.visitor_record_id,
            COALESCE(bp.name, a.company_name) AS company_name,
            a.host_name,
            CASE
              WHEN bp.partner_type IS NOT NULL THEN bp.partner_type
              WHEN gv.id IS NOT NULL THEN 'Visitante'
              ELSE 'Sin categoría'
            END AS category
     FROM daily_log_entries d
     ${dailyLogJoins}
     WHERE ${where}
     ORDER BY d.entry_date DESC, d.entry_time DESC, d.id DESC
     LIMIT ? OFFSET ?`,
    [...parameters, pageSize, (page - 1) * pageSize],
  );
  const [hostRows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT host_name
     FROM appointments
     WHERE host_name <> ''
     ORDER BY host_name`,
  );
  return {
    entries: rows.map((row) => ({
      id: Number(row.id),
      date: row.entry_date,
      time: row.entry_time,
      event: row.event_type,
      person: row.person_name,
      details: row.details ?? "",
      appointmentId: row.appointment_id === null ? null : Number(row.appointment_id),
      externalStaffId: row.external_staff_id === null ? null : Number(row.external_staff_id),
      visitorRecordId: row.visitor_record_id === null ? null : Number(row.visitor_record_id),
      company: row.company_name ?? "",
      host: row.host_name ?? "",
      category: row.category,
    })),
    total,
    hosts: hostRows.map((row) => String(row.host_name)),
  };
}

async function getDailyLogSummary(fromDate: string, toDate: string) {
  const [[countRows], [insideRows], [pendingRows]] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS movement_count,
              SUM(event_type = 'Retiro') AS exit_count
       FROM daily_log_entries
       WHERE entry_date BETWEEN ? AND ?`,
      [fromDate, toDate],
    ),
    pool.query<RowDataPacket[]>(
      `WITH movements AS (
         SELECT d.id, d.event_type, d.entry_date, d.entry_time,
                ${dailyLogSubjectKey} AS subject_key
         FROM daily_log_entries d
         ${dailyLogJoins}
         WHERE d.event_type IN ('Ingreso', 'Retiro')
       ),
       ranked_movements AS (
         SELECT event_type,
                ROW_NUMBER() OVER (
                  PARTITION BY subject_key
                  ORDER BY entry_date DESC, entry_time DESC, id DESC
                ) AS row_num
         FROM movements
       )
       SELECT COUNT(*) AS inside_count
       FROM ranked_movements
       WHERE row_num = 1 AND event_type = 'Ingreso'`,
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS pending_count
       FROM appointments a
       WHERE a.visit_date BETWEEN ? AND ?
         AND a.status IN ('Pendiente', 'En proceso')
         AND NOT EXISTS (
           SELECT 1 FROM daily_log_entries d
           WHERE d.appointment_id = a.id AND d.event_type = 'Ingreso'
         )`,
      [fromDate, toDate],
    ),
  ]);
  return {
    movementCount: Number(countRows[0]?.movement_count ?? 0),
    insideNow: Number(insideRows[0]?.inside_count ?? 0),
    pendingArrivals: Number(pendingRows[0]?.pending_count ?? 0),
    exits: Number(countRows[0]?.exit_count ?? 0),
  };
}

async function listDepartments() {
  const [departments] = await pool.query<DepartmentRow[]>(
    "SELECT id, name FROM departments ORDER BY name, id",
  );
  return departments.map((department) => ({
    id: Number(department.id),
    name: department.name,
  }));
}

async function listHostAccounts() {
  const [accounts] = await pool.query<HostAccountRow[]>(
    "SELECT login, name, email, role, phone FROM accesos ORDER BY name, login",
  );
  return accounts.map((account) => ({
    login: account.login,
    name: account.name,
    email: account.email,
    role: account.role,
    phone: account.phone,
  }));
}

function publicUser(user: AuthenticatedUser, sectionAccess: SectionAccess[]) {
  return {
    login: user.login,
    name: user.name,
    email: user.email,
    role: user.role,
    isAdmin: user.isAdmin,
    sectionAccess,
  };
}

function createSessionToken(user: AuthenticatedUser) {
  const payload = Buffer.from(JSON.stringify({
    login: user.login,
    expiresAt: Date.now() + sessionLifetimeMs,
  })).toString("base64url");
  const signature = createHmac("sha256", user.sessionKey).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function getSessionToken(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${sessionCookieName}=`));
  return cookie?.slice(sessionCookieName.length + 1);
}

async function getRequestUser(request: Request) {
  const token = getSessionToken(request);
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  let claims: { login?: unknown; expiresAt?: unknown };
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof claims.login !== "string" ||
    typeof claims.expiresAt !== "number" ||
    claims.expiresAt <= Date.now()
  ) {
    return null;
  }

  const user = await getActiveUser(claims.login);
  if (!user) return null;
  const expected = createHmac("sha256", user.sessionKey).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }
  return user;
}

function pictureDataUrl(picture: Buffer | null) {
  if (!picture?.length) return "";
  const mimeType = picture.subarray(0, 8).toString("hex").startsWith("89504e47")
    ? "image/png"
    : picture.subarray(0, 3).toString("hex") === "ffd8ff"
      ? "image/jpeg"
      : picture.subarray(0, 4).toString("ascii") === "RIFF" &&
          picture.subarray(8, 12).toString("ascii") === "WEBP"
        ? "image/webp"
        : "application/octet-stream";
  return `data:${mimeType};base64,${picture.toString("base64")}`;
}

async function listAccessAccounts() {
  const [accounts] = await pool.query<AccessAccountRow[]>(
    `SELECT login, name, email, active, role, phone, priv_admin, picture
     FROM accesos
     ORDER BY login`,
  );
  const [sectionAccessRows] = await pool.query<SectionAccessRow[]>(
    "SELECT login, seccion FROM accesos_secciones",
  );
  const sectionsByLogin = new Map<string, SectionAccess[]>();
  for (const row of sectionAccessRows) {
    const sections = sectionsByLogin.get(row.login) ?? [];
    sections.push(row.seccion);
    sectionsByLogin.set(row.login, sections);
  }

  return accounts.map((account) => ({
    login: account.login,
    name: account.name,
    email: account.email,
    active: account.active,
    role: account.role,
    phone: account.phone,
    hasFullAccess: ["Y", "1"].includes(account.priv_admin ?? ""),
    picture: pictureDataUrl(account.picture),
    sectionAccess: sectionsByLogin.get(account.login) ?? [],
  }));
}

async function listUserSectionAccess(login: string, isAdmin: boolean): Promise<SectionAccess[]> {
  if (isAdmin) return [...sectionAccessValues];
  const [rows] = await pool.execute<UserSectionAccessRow[]>(
    "SELECT seccion FROM accesos_secciones WHERE login = ?",
    [login],
  );
  return rows.map((row) => row.seccion);
}

async function hasSectionAccess(user: AuthenticatedUser, section: SectionAccess) {
  if (user.isAdmin) return true;
  return (await listUserSectionAccess(user.login, false)).includes(section);
}

async function handleEquipmentRequest(request: Request, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/equipment/options" && request.method === "GET") {
    try {
      const user = await getRequestUser(request);
      if (!user) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
      if (!(await hasSectionAccess(user, "recepcion"))) {
        return Response.json({ error: "No tienes permiso para el módulo de equipo." }, { status: 403 });
      }
      const [partners] = await pool.query<RowDataPacket[]>(
        `SELECT id, name FROM business_partners
         WHERE is_active = TRUE
         ORDER BY name`,
      );
      const [staff] = await pool.query<RowDataPacket[]>(
        `SELECT s.id, s.business_partner_id, s.full_name, p.name AS company_name
         FROM external_staff s
         INNER JOIN business_partners p ON p.id = s.business_partner_id
         WHERE p.is_active = TRUE
         ORDER BY s.full_name`,
      );
      const [appointments] = await pool.query<RowDataPacket[]>(
        `SELECT a.id, a.business_partner_id, a.visitor_record_id, a.visitor_name,
                a.company_name, DATE_FORMAT(a.visit_date, '%Y-%m-%d') AS visit_date,
                TIME_FORMAT(a.visit_time, '%H:%i') AS visit_time,
                p.name AS linked_company_name
         FROM appointments a
         INNER JOIN business_partners p ON p.id = a.business_partner_id
         WHERE a.status NOT IN ('Cancelada', 'Retirado')
           AND a.visit_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         ORDER BY a.visit_date DESC, a.visit_time DESC
         LIMIT 200`,
      );
      return Response.json({
        partners: partners.map((row) => ({ id: Number(row.id), name: row.name })),
        staff: staff.map((row) => ({
          id: Number(row.id),
          businessPartnerId: Number(row.business_partner_id),
          fullName: row.full_name,
          companyName: row.company_name,
        })),
        appointments: appointments.map((row) => ({
          id: Number(row.id),
          businessPartnerId: Number(row.business_partner_id),
          visitorRecordId: row.visitor_record_id === null ? null : Number(row.visitor_record_id),
          visitorName: row.visitor_name,
          companyName: row.linked_company_name,
          date: row.visit_date,
          time: row.visit_time,
        })),
      });
    } catch (error) {
      console.error("Failed to load equipment options:", error);
      return Response.json({ error: "No se pudieron cargar empresas, personal y citas." }, { status: 500 });
    }
  }

  const declarationPath = url.pathname.match(
    /^\/api\/equipment\/declarations(?:\/(\d+)(?:\/(link|revoke|inspections\/(entrada|salida)))?)?$/,
  );
  if (!declarationPath || !["GET", "POST", "PUT"].includes(request.method)) return null;

  try {
    const user = await getRequestUser(request);
    if (!user) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
    if (!(await hasSectionAccess(user, "recepcion"))) {
      return Response.json({ error: "No tienes permiso para el módulo de equipo." }, { status: 403 });
    }

    const declarationId = declarationPath[1] ? Number(declarationPath[1]) : null;
    const action = declarationPath[2] ?? null;
    const phaseKey = declarationPath[3] ?? null;
    if (declarationId !== null && (!Number.isSafeInteger(declarationId) || declarationId < 1)) {
      return Response.json({ error: "La declaración seleccionada no es válida." }, { status: 400 });
    }

    if (request.method === "GET" && declarationId === null) {
      const search = (url.searchParams.get("q") ?? "").trim();
      const page = Number(url.searchParams.get("page") ?? 1);
      const pageSize = 50;
      if (search.length > 180 || !Number.isSafeInteger(page) || page < 1) {
        return Response.json({ error: "La búsqueda o página solicitada no es válida." }, { status: 400 });
      }
      const term = `%${search}%`;
      const [countRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM equipment_declarations d
         INNER JOIN business_partners p ON p.id = d.business_partner_id
         WHERE (? = '' OR d.person_name LIKE ? OR p.name LIKE ?)`,
        [search, term, term],
      );
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT d.id, d.person_name, d.status, d.created_by,
                DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                DATE_FORMAT(d.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
                p.name AS company_name,
                DATE_FORMAT(a.visit_date, '%Y-%m-%d') AS visit_date,
                TIME_FORMAT(a.visit_time, '%H:%i') AS visit_time,
                (SELECT COUNT(*) FROM equipment_declaration_items i WHERE i.declaration_id = d.id) AS item_count,
                (SELECT ei.status FROM equipment_inspections ei
                 WHERE ei.declaration_id = d.id AND ei.phase = 'Entrada' LIMIT 1) AS entry_status,
                (SELECT ei.status FROM equipment_inspections ei
                 WHERE ei.declaration_id = d.id AND ei.phase = 'Salida' LIMIT 1) AS exit_status,
                (SELECT COUNT(*) FROM equipment_inspection_items ii
                 INNER JOIN equipment_inspections ei ON ei.id = ii.inspection_id
                 WHERE ei.declaration_id = d.id AND ii.result = 'Incidencia') AS incident_count
         FROM equipment_declarations d
         INNER JOIN business_partners p ON p.id = d.business_partner_id
         LEFT JOIN appointments a ON a.id = d.appointment_id
         WHERE (? = '' OR d.person_name LIKE ? OR p.name LIKE ?)
         ORDER BY d.created_at DESC
         LIMIT ? OFFSET ?`,
        [search, term, term, pageSize, (page - 1) * pageSize],
      );
      return Response.json({
        total: Number(countRows[0].total),
        page,
        pageSize,
        declarations: rows.map((row) => ({
          id: Number(row.id),
          personName: row.person_name,
          companyName: row.company_name,
          status: row.status,
          createdBy: row.created_by,
          createdAt: row.created_at,
          submittedAt: row.submitted_at,
          visitDate: row.visit_date,
          visitTime: row.visit_time,
          itemCount: Number(row.item_count),
          entryStatus: row.entry_status,
          exitStatus: row.exit_status,
          incidentCount: Number(row.incident_count),
        })),
      });
    }

    if (request.method === "POST" && declarationId === null) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "La solicitud no tiene un formato válido." }, { status: 400 });
      }
      if (!isRecord(body)) {
        return Response.json({ error: "Completa la información de la declaración." }, { status: 400 });
      }
      const businessPartnerId = body.businessPartnerId;
      const externalStaffId = body.externalStaffId === null || body.externalStaffId === undefined
        ? null
        : body.externalStaffId;
      const appointmentId = body.appointmentId === null || body.appointmentId === undefined
        ? null
        : body.appointmentId;
      const manualPersonName = typeof body.personName === "string" ? body.personName.trim() : "";
      if (
        typeof businessPartnerId !== "number" || !Number.isSafeInteger(businessPartnerId) || businessPartnerId < 1 ||
        (externalStaffId !== null && (typeof externalStaffId !== "number" || !Number.isSafeInteger(externalStaffId) || externalStaffId < 1)) ||
        (appointmentId !== null && (typeof appointmentId !== "number" || !Number.isSafeInteger(appointmentId) || appointmentId < 1)) ||
        manualPersonName.length > 180
      ) {
        return Response.json({ error: "Revisa la empresa, persona y cita seleccionadas." }, { status: 400 });
      }
      if (externalStaffId !== null && appointmentId !== null) {
        return Response.json(
          { error: "Selecciona una cita o personal externo, no ambos: el sistema no tiene una relación directa entre ellos." },
          { status: 400 },
        );
      }

      const [partnerRows] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM business_partners WHERE id = ? AND is_active = TRUE LIMIT 1",
        [businessPartnerId],
      );
      if (partnerRows.length === 0) {
        return Response.json({ error: "La empresa no existe o está inactiva." }, { status: 400 });
      }

      let personName = manualPersonName;
      let visitorRecordId: number | null = null;
      if (externalStaffId !== null) {
        const [staffRows] = await pool.execute<RowDataPacket[]>(
          `SELECT full_name FROM external_staff
           WHERE id = ? AND business_partner_id = ? LIMIT 1`,
          [externalStaffId, businessPartnerId],
        );
        if (staffRows.length === 0) {
          return Response.json({ error: "La persona no pertenece a la empresa seleccionada." }, { status: 400 });
        }
        personName = staffRows[0].full_name;
      }

      if (appointmentId !== null) {
        const [appointmentRows] = await pool.execute<RowDataPacket[]>(
          `SELECT visitor_name, visitor_record_id FROM appointments
           WHERE id = ? AND business_partner_id = ?
             AND status NOT IN ('Cancelada', 'Retirado')
           LIMIT 1`,
          [appointmentId, businessPartnerId],
        );
        if (appointmentRows.length === 0) {
          return Response.json({ error: "La cita no existe o no corresponde a la empresa seleccionada." }, { status: 400 });
        }
        const appointmentName = String(appointmentRows[0].visitor_name).trim();
        personName = appointmentName;
        visitorRecordId = appointmentRows[0].visitor_record_id === null
          ? null
          : Number(appointmentRows[0].visitor_record_id);
      }
      if (!personName) {
        return Response.json({ error: "Selecciona una persona o escribe su nombre." }, { status: 400 });
      }

      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashEquipmentToken(token);
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO equipment_declarations
             (business_partner_id, external_staff_id, visitor_record_id, appointment_id, person_name,
              created_by, token_hash, token_expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
          [
            businessPartnerId,
            externalStaffId,
            visitorRecordId,
            appointmentId,
            personName,
            user.login,
            tokenHash,
          ],
        );
        await connection.commit();
        return Response.json(
          { id: result.insertId, personName, token, expiresInDays: 30 },
          { status: 201 },
        );
      } catch (error) {
        await connection.rollback();
        if (
          typeof error === "object" && error !== null &&
          "code" in error && error.code === "ER_DUP_ENTRY"
        ) {
          return Response.json({ error: "Esta cita ya tiene una declaración de equipo asociada." }, { status: 409 });
        }
        throw error;
      } finally {
        connection.release();
      }
    }

    if (request.method === "GET" && declarationId !== null && action === null) {
      const [declarationRows] = await pool.execute<RowDataPacket[]>(
        `SELECT d.id, d.person_name, d.status, d.created_by,
                DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                DATE_FORMAT(d.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
                p.name AS company_name,
                DATE_FORMAT(a.visit_date, '%Y-%m-%d') AS visit_date,
                TIME_FORMAT(a.visit_time, '%H:%i') AS visit_time
         FROM equipment_declarations d
         INNER JOIN business_partners p ON p.id = d.business_partner_id
         LEFT JOIN appointments a ON a.id = d.appointment_id
         WHERE d.id = ? LIMIT 1`,
        [declarationId],
      );
      const declaration = declarationRows[0];
      if (!declaration) return Response.json({ error: "No se encontró la declaración." }, { status: 404 });
      const [items] = await pool.execute<RowDataPacket[]>(
        `SELECT id, item_type, quantity, product, brand, model, serial_number, color, notes
         FROM equipment_declaration_items WHERE declaration_id = ? ORDER BY id`,
        [declarationId],
      );
      const [inspectionRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, phase, status, inspector_login, inspector_name,
                DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
                DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at
         FROM equipment_inspections WHERE declaration_id = ? ORDER BY started_at`,
        [declarationId],
      );
      const inspections = await Promise.all(inspectionRows.map(async (inspection) => {
        const [inspectionItems] = await pool.execute<RowDataPacket[]>(
          `SELECT ii.declaration_item_id, ii.declared_item_type, ii.declared_quantity, ii.declared_product,
                  ii.declared_brand, ii.declared_model, ii.declared_serial_number,
                  ii.declared_color, ii.checked_quantity, ii.checked_product,
                  ii.checked_brand, ii.checked_model, ii.checked_serial_number,
                  ii.checked_color, ii.result, ii.notes
           FROM equipment_inspection_items ii
           WHERE ii.inspection_id = ? ORDER BY ii.id`,
          [inspection.id],
        );
        return {
          phase: inspection.phase,
          status: inspection.status,
          inspectorLogin: inspection.inspector_login,
          inspectorName: inspection.inspector_name,
          startedAt: inspection.started_at,
          completedAt: inspection.completed_at,
          items: inspectionItems.map((item) => ({
            declarationItemId: Number(item.declaration_item_id),
            declaredItemType: item.declared_item_type,
            declaredQuantity: Number(item.declared_quantity),
            declaredProduct: item.declared_product,
            declaredBrand: item.declared_brand,
            declaredModel: item.declared_model,
            declaredSerialNumber: item.declared_serial_number,
            declaredColor: item.declared_color,
            checkedQuantity: Number(item.checked_quantity),
            checkedProduct: item.checked_product,
            checkedBrand: item.checked_brand,
            checkedModel: item.checked_model,
            checkedSerialNumber: item.checked_serial_number,
            checkedColor: item.checked_color,
            result: item.result,
            notes: item.notes,
          })),
        };
      }));
      return Response.json({
        declaration: {
          id: Number(declaration.id),
          personName: declaration.person_name,
          companyName: declaration.company_name,
          status: declaration.status,
          createdBy: declaration.created_by,
          createdAt: declaration.created_at,
          submittedAt: declaration.submitted_at,
          visitDate: declaration.visit_date,
          visitTime: declaration.visit_time,
          items: items.map((item) => ({
            id: Number(item.id),
             itemType: item.item_type,
             quantity: Number(item.quantity),
            product: item.product,
            brand: item.brand,
            model: item.model,
            serialNumber: item.serial_number,
            color: item.color,
            notes: item.notes,
          })),
          inspections,
        },
      });
    }

    if (request.method === "POST" && declarationId !== null && (action === "link" || action === "revoke")) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT id, status FROM equipment_declarations WHERE id = ? LIMIT 1",
        [declarationId],
      );
      const declaration = rows[0];
      if (!declaration) return Response.json({ error: "No se encontró la declaración." }, { status: 404 });
      if (declaration.status !== "Pendiente") {
        return Response.json({ error: "La declaración ya fue enviada y no requiere cambios en su enlace." }, { status: 409 });
      }
      if (action === "revoke") {
        await pool.execute(
          "UPDATE equipment_declarations SET token_revoked_at = NOW() WHERE id = ? AND status = 'Pendiente'",
          [declarationId],
        );
        return Response.json({ message: "Enlace revocado." });
      }
      const token = randomBytes(32).toString("base64url");
      await pool.execute(
        `UPDATE equipment_declarations
         SET token_hash = ?, token_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY),
             token_revoked_at = NULL
         WHERE id = ? AND status = 'Pendiente'`,
        [hashEquipmentToken(token), declarationId],
      );
      return Response.json({
        token,
        expiresInDays: 30,
      });
    }

    if (
      request.method === "PUT" && declarationId !== null &&
      action === `inspections/${phaseKey}` && (phaseKey === "entrada" || phaseKey === "salida")
    ) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "La revisión no tiene un formato válido." }, { status: 400 });
      }
      const inspectionItems = isRecord(body) ? parseEquipmentInspectionItems(body.items) : null;
      if (!inspectionItems) {
        return Response.json({ error: "Completa la revisión de todos los artículos." }, { status: 400 });
      }
      const phase = phaseKey === "entrada" ? "Entrada" : "Salida";
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [declarations] = await connection.execute<RowDataPacket[]>(
          `SELECT id, status FROM equipment_declarations WHERE id = ? LIMIT 1 FOR UPDATE`,
          [declarationId],
        );
        if (!declarations[0]) {
          await connection.rollback();
          return Response.json({ error: "No se encontró la declaración." }, { status: 404 });
        }
        if (declarations[0].status !== "Enviada") {
          await connection.rollback();
          return Response.json({ error: "La persona debe enviar su declaración antes de la verificación." }, { status: 409 });
        }
        const [existing] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM equipment_inspections
           WHERE declaration_id = ? AND phase = ? LIMIT 1`,
          [declarationId, phase],
        );
        if (existing.length) {
          await connection.rollback();
          return Response.json({ error: `La verificación de ${phase.toLowerCase()} ya fue completada.` }, { status: 409 });
        }
        if (phase === "Salida") {
          const [entryRows] = await connection.execute<RowDataPacket[]>(
            `SELECT id, status FROM equipment_inspections
             WHERE declaration_id = ? AND phase = 'Entrada' LIMIT 1`,
            [declarationId],
          );
          if (!entryRows[0] || entryRows[0].status !== "Completada") {
            await connection.rollback();
            return Response.json({ error: "Completa la verificación de entrada antes de la salida." }, { status: 409 });
          }
        }

        const [declaredItems] = await connection.execute<RowDataPacket[]>(
          `SELECT id, item_type, quantity, product, brand, model, serial_number, color
           FROM equipment_declaration_items WHERE declaration_id = ? ORDER BY id`,
          [declarationId],
        );
        if (
          declaredItems.length === 0 ||
          declaredItems.length !== inspectionItems.length ||
          declaredItems.some((item) => !inspectionItems.some((input) => input.declarationItemId === Number(item.id)))
        ) {
          await connection.rollback();
          return Response.json({ error: "La lista de artículos cambió. Recarga la declaración antes de continuar." }, { status: 409 });
        }

        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO equipment_inspections
             (declaration_id, phase, status, inspector_login, inspector_name, completed_at)
           VALUES (?, ?, 'Completada', ?, ?, NOW())`,
          [declarationId, phase, user.login, user.name?.trim() || user.login],
        );
        for (const declared of declaredItems) {
          const checked = inspectionItems.find((item) => item.declarationItemId === Number(declared.id))!;
          let expected = {
            quantity: Number(declared.quantity),
            product: String(declared.product),
            brand: String(declared.brand),
            model: String(declared.model),
            serialNumber: String(declared.serial_number),
            color: String(declared.color),
          };
          if (phase === "Salida") {
            const [entryItems] = await connection.execute<RowDataPacket[]>(
              `SELECT checked_quantity, checked_product, checked_brand, checked_model,
                      checked_serial_number, checked_color
               FROM equipment_inspection_items
               WHERE inspection_id = (
                 SELECT id FROM equipment_inspections
                 WHERE declaration_id = ? AND phase = 'Entrada' AND status = 'Completada'
               ) AND declaration_item_id = ? LIMIT 1`,
              [declarationId, declared.id],
            );
            if (!entryItems[0]) {
              await connection.rollback();
              return Response.json({ error: "No se encontró el detalle verificado durante la entrada." }, { status: 409 });
            }
            expected = {
              quantity: Number(entryItems[0].checked_quantity),
              product: String(entryItems[0].checked_product),
              brand: String(entryItems[0].checked_brand),
              model: String(entryItems[0].checked_model),
              serialNumber: String(entryItems[0].checked_serial_number),
              color: String(entryItems[0].checked_color),
            };
          }
          const differs =
            checked.quantity !== expected.quantity ||
            checked.product.trim().toLocaleLowerCase() !== expected.product.trim().toLocaleLowerCase() ||
            checked.brand.trim().toLocaleLowerCase() !== expected.brand.trim().toLocaleLowerCase() ||
            checked.model.trim().toLocaleLowerCase() !== expected.model.trim().toLocaleLowerCase() ||
            checked.serialNumber.trim().toLocaleLowerCase() !== expected.serialNumber.trim().toLocaleLowerCase() ||
            checked.color.trim().toLocaleLowerCase() !== expected.color.trim().toLocaleLowerCase();
          const incident = differs || checked.incident;
          if (incident && !checked.notes.trim()) {
            await connection.rollback();
            return Response.json(
              { error: `Agrega una observación para justificar la incidencia de “${declared.product}”.` },
              { status: 400 },
            );
          }
          await connection.execute(
            `INSERT INTO equipment_inspection_items
               (inspection_id, declaration_item_id, declared_item_type, declared_quantity, declared_product,
                declared_brand, declared_model, declared_serial_number, declared_color,
                checked_quantity, checked_product, checked_brand, checked_model,
                checked_serial_number, checked_color, result, notes, checked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              insert.insertId,
              declared.id,
              declared.item_type,
              Number(declared.quantity),
              declared.product,
              declared.brand,
              declared.model,
              declared.serial_number,
              declared.color,
              checked.quantity,
              checked.product.trim(),
              checked.brand.trim(),
              checked.model.trim(),
              checked.serialNumber.trim(),
              checked.color.trim(),
              incident ? "Incidencia" : "Conforme",
              checked.notes.trim(),
            ],
          );
        }
        await connection.commit();
        return Response.json({ message: `Verificación de ${phase.toLowerCase()} completada.` });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }

    return Response.json({ error: "La operación del módulo de equipo no es válida." }, { status: 400 });
  } catch (error) {
    console.error("Failed to handle equipment request:", error);
    return Response.json({ error: "No se pudo completar la operación del módulo de equipo." }, { status: 500 });
  }
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    const publicEquipmentPath = url.pathname.match(/^\/api\/equipment\/public\/([A-Za-z0-9_-]{40,60})$/);
    if (publicEquipmentPath && ["GET", "PUT"].includes(request.method)) {
      const tokenHash = hashEquipmentToken(publicEquipmentPath[1]);
      try {
        if (request.method === "GET") {
          const [declarations] = await pool.execute<RowDataPacket[]>(
            `SELECT d.id, d.person_name, d.status, d.token_expires_at,
                    p.name AS company_name,
                    DATE_FORMAT(a.visit_date, '%Y-%m-%d') AS visit_date,
                    TIME_FORMAT(a.visit_time, '%H:%i') AS visit_time
             FROM equipment_declarations d
             INNER JOIN business_partners p ON p.id = d.business_partner_id
             LEFT JOIN appointments a ON a.id = d.appointment_id
             WHERE d.token_hash = ?
               AND d.token_revoked_at IS NULL
               AND d.token_expires_at > NOW()
               AND d.status = 'Pendiente'
             LIMIT 1`,
            [tokenHash],
          );
          const declaration = declarations[0];
          if (!declaration) {
            return Response.json({ error: "Este enlace venció o fue revocado." }, { status: 404 });
          }
          const [items] = await pool.execute<RowDataPacket[]>(
            `SELECT id, item_type, quantity, product, brand, model, serial_number, color, notes
             FROM equipment_declaration_items
             WHERE declaration_id = ?
             ORDER BY id`,
            [declaration.id],
          );
          return Response.json({
            declaration: {
              id: Number(declaration.id),
              personName: declaration.person_name,
              companyName: declaration.company_name,
              visitDate: declaration.visit_date,
              visitTime: declaration.visit_time,
              status: declaration.status,
              items: items.map((item) => ({
                id: Number(item.id),
                itemType: item.item_type,
                quantity: Number(item.quantity),
                product: item.product,
                brand: item.brand,
                model: item.model,
                serialNumber: item.serial_number,
                color: item.color,
                notes: item.notes,
              })),
            },
          });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "La declaración no tiene un formato válido." }, { status: 400 });
        }
        const items = isRecord(body) ? parseEquipmentDeclaredItems(body.items) : null;
        if (!items) {
          return Response.json({ error: "Agrega entre 1 y 50 artículos y revisa sus datos." }, { status: 400 });
        }
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const [declarations] = await connection.execute<RowDataPacket[]>(
            `SELECT id, status
             FROM equipment_declarations
             WHERE token_hash = ?
               AND token_revoked_at IS NULL
               AND token_expires_at > NOW()
               AND status = 'Pendiente'
             LIMIT 1
             FOR UPDATE`,
            [tokenHash],
          );
          const declaration = declarations[0];
          if (!declaration) {
            await connection.rollback();
            return Response.json({ error: "Este enlace venció o fue revocado." }, { status: 404 });
          }
          await connection.execute(
            "DELETE FROM equipment_declaration_items WHERE declaration_id = ?",
            [declaration.id],
          );
          for (const item of items) {
            await connection.execute(
              `INSERT INTO equipment_declaration_items
                 (declaration_id, item_type, quantity, product, brand, model, serial_number, color, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                declaration.id,
                item.itemType,
                item.quantity,
                item.product,
                item.brand,
                item.model,
                item.serialNumber,
                item.color,
                item.notes,
              ],
            );
          }
          await connection.execute(
            `UPDATE equipment_declarations
             SET status = 'Enviada', submitted_at = NOW(), token_revoked_at = NOW()
             WHERE id = ? AND status = 'Pendiente'`,
            [declaration.id],
          );
          await connection.commit();
          return Response.json({ message: "La declaración de equipo se envió correctamente." });
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      } catch (error) {
        console.error("Failed to handle public equipment declaration:", error);
        return Response.json({ error: "No se pudo guardar la declaración. Inténtalo de nuevo." }, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
      }

      if (
        typeof body !== "object" ||
        body === null ||
        !("identifier" in body) ||
        !("password" in body) ||
        typeof body.identifier !== "string" ||
        typeof body.password !== "string" ||
        !body.identifier.trim() ||
        !body.password
      ) {
        return Response.json(
          { error: "Ingresa tu usuario o correo y tu contraseña." },
          { status: 400 },
        );
      }

      try {
        const user = await authenticateUser(body.identifier.trim(), body.password);
        if (!user) {
          return Response.json(
            { error: "Usuario o contraseña incorrectos, o cuenta inactiva." },
            { status: 401 },
          );
        }
        const token = createSessionToken(user);
        const accounts = user.isAdmin ? await listAccessAccounts() : [];
        const sectionAccess = await listUserSectionAccess(user.login, user.isAdmin);
        return Response.json(
          { user: publicUser(user, sectionAccess), accounts },
          {
            headers: {
              "Set-Cookie": `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeMs / 1000}${secureCookieAttribute}`,
            },
          },
        );
      } catch (error) {
        console.error("Authentication failed:", error);
        return Response.json(
          { error: "No se pudo validar el acceso. Inténtalo de nuevo." },
          { status: 500 },
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "La sesión expiró." }, { status: 401 });
        }
        const sectionAccess = await listUserSectionAccess(user.login, user.isAdmin);
        return Response.json({
          user: publicUser(user, sectionAccess),
          accounts: user.isAdmin ? await listAccessAccounts() : [],
        });
      } catch (error) {
        console.error("Failed to restore session:", error);
        return Response.json(
          { error: "No se pudo restaurar la sesión." },
          { status: 500 },
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      return new Response(null, {
        status: 204,
        headers: {
          "Set-Cookie": `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookieAttribute}`,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/host-accounts") {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        if (!(await hasSectionAccess(user, "recepcion"))) {
          return Response.json({ error: "No tienes permiso para consultar las cuentas de Accesos." }, { status: 403 });
        }
        return Response.json({ accounts: await listHostAccounts() });
      } catch (error) {
        console.error("Failed to load host account options:", error);
        return Response.json(
          { error: "No se pudieron cargar las cuentas disponibles para anfitriones." },
          { status: 500 },
        );
      }
    }

    const hostAccessPath = url.pathname.match(/^\/api\/host-access\/(.+)$/);
    if (request.method === "POST" && hostAccessPath) {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        if (!(await hasSectionAccess(user, "recepcion"))) {
          return Response.json({ error: "Solo Recepción puede asignar anfitriones." }, { status: 403 });
        }

        let login: string;
        try {
          login = decodeURIComponent(hostAccessPath[1]);
        } catch {
          return Response.json({ error: "El usuario seleccionado no es válido." }, { status: 400 });
        }
        if (!login || login.length > 255) {
          return Response.json({ error: "El usuario seleccionado no es válido." }, { status: 400 });
        }
        const [matches] = await pool.execute<AccessLoginRow[]>(
          "SELECT login FROM accesos WHERE login = ? LIMIT 1",
          [login],
        );
        if (matches.length === 0) {
          return Response.json({ error: "El login debe pertenecer a una cuenta de Accesos." }, { status: 404 });
        }

        const accountLogin = matches[0].login;
        await pool.execute(
          "INSERT IGNORE INTO accesos_secciones (login, seccion) VALUES (?, 'anfitriones')",
          [accountLogin],
        );
        return Response.json({
          sectionAccess: await listUserSectionAccess(accountLogin, false),
        });
      } catch (error) {
        console.error("Failed to grant host section access:", error);
        return Response.json(
          { error: "No se pudo asignar el acceso a Anfitriones." },
          { status: 500 },
        );
      }
    }

    const businessPartnersPath = url.pathname.match(/^\/api\/business-partners(?:\/(\d+))?$/);
    if (
      businessPartnersPath &&
      ["GET", "POST", "PATCH", "DELETE"].includes(request.method)
    ) {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        if (!(await hasSectionAccess(user, "recepcion"))) {
          return Response.json({ error: "No tienes permiso para administrar contratistas y proveedores." }, { status: 403 });
        }

        const partnerId = businessPartnersPath[1] ? Number(businessPartnersPath[1]) : null;
        if (partnerId !== null && !Number.isSafeInteger(partnerId)) {
          return Response.json({ error: "La empresa seleccionada no es válida." }, { status: 400 });
        }
        if (request.method === "GET") {
          if (partnerId !== null) {
            return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
          }
          return Response.json({ businessPartners: await listBusinessPartners() });
        }
        if (
          (request.method === "POST" && partnerId !== null) ||
          (request.method !== "POST" && partnerId === null)
        ) {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }
        if (request.method === "DELETE") {
          const [result] = await pool.execute<ResultSetHeader>(
            "DELETE FROM business_partners WHERE id = ?",
            [partnerId],
          );
          if (result.affectedRows === 0) {
            return Response.json({ error: "No se encontró la empresa seleccionada." }, { status: 404 });
          }
          return Response.json({ businessPartners: await listBusinessPartners() });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }
        const partner = parseBusinessPartner(body);
        if (!partner) {
          return Response.json(
            { error: "Revisa nombre, descripción, RFC, categoría, empleados, tipo y estado de la empresa." },
            { status: 400 },
          );
        }

        if (request.method === "PATCH") {
          const [result] = await pool.execute<ResultSetHeader>(
            `UPDATE business_partners
             SET name = ?, description = ?, rfc = ?, category = ?, employee_count = ?,
                 partner_type = ?, is_active = ?
             WHERE id = ?`,
            [
              partner.name, partner.description, partner.rfc, partner.category,
              partner.employeeCount, partner.type, partner.status === "Activa", partnerId,
            ],
          );
          if (result.affectedRows === 0) {
            const [matches] = await pool.execute<BusinessPartnerRow[]>(
              "SELECT id FROM business_partners WHERE id = ? LIMIT 1",
              [partnerId],
            );
            if (matches.length === 0) {
              return Response.json({ error: "No se encontró la empresa seleccionada." }, { status: 404 });
            }
          }
        } else {
          await pool.execute(
            `INSERT INTO business_partners
              (name, description, rfc, category, employee_count, partner_type, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              partner.name, partner.description, partner.rfc, partner.category,
              partner.employeeCount, partner.type, partner.status === "Activa",
            ],
          );
        }

        return Response.json(
          { businessPartners: await listBusinessPartners() },
          { status: request.method === "POST" ? 201 : 200 },
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ER_DUP_ENTRY"
        ) {
          return Response.json(
            { error: "Ya existe una empresa registrada con ese RFC." },
            { status: 409 },
          );
        }
        if (
          request.method === "DELETE" &&
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ER_ROW_IS_REFERENCED_2"
        ) {
          return Response.json(
            { error: "No se puede eliminar esta empresa porque tiene personal externo vinculado." },
            { status: 409 },
          );
        }
        console.error("Failed to modify business partner:", error);
        return Response.json(
          { error: "No se pudo guardar la empresa. Inténtalo de nuevo." },
          { status: 500 },
        );
      }
    }

    const generalVisitorsPath = url.pathname.match(/^\/api\/general-visitors(?:\/(\d+))?$/);
    if (
      generalVisitorsPath &&
      ["GET", "POST", "PATCH", "DELETE"].includes(request.method)
    ) {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        if (!(await hasSectionAccess(user, "recepcion"))) {
          return Response.json({ error: "No tienes permiso para administrar público general." }, { status: 403 });
        }

        const visitorId = generalVisitorsPath[1] ? Number(generalVisitorsPath[1]) : null;
        if (visitorId !== null && !Number.isSafeInteger(visitorId)) {
          return Response.json({ error: "La persona seleccionada no es válida." }, { status: 400 });
        }
        if (request.method === "GET") {
          if (visitorId !== null) {
            return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
          }
          return Response.json({ generalVisitors: await listGeneralVisitors() });
        }
        if (
          (request.method === "POST" && visitorId !== null) ||
          (request.method !== "POST" && visitorId === null)
        ) {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }
        if (request.method === "DELETE") {
          const [result] = await pool.execute<ResultSetHeader>(
            "DELETE FROM general_visitors WHERE id = ?",
            [visitorId],
          );
          if (result.affectedRows === 0) {
            return Response.json({ error: "No se encontró la persona seleccionada." }, { status: 404 });
          }
          return Response.json({ generalVisitors: await listGeneralVisitors() });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }
        const visitor = parseGeneralVisitor(body);
        if (!visitor) {
          return Response.json(
            { error: "Revisa nombre, CURP, teléfono y correo electrónico de la persona." },
            { status: 400 },
          );
        }
        const curp = visitor.curp || null;

        if (request.method === "PATCH") {
          const [result] = await pool.execute<ResultSetHeader>(
            `UPDATE general_visitors
             SET full_name = ?, curp = ?, phone = ?, email = ?
             WHERE id = ?`,
            [visitor.fullName, curp, visitor.phone, visitor.email, visitorId],
          );
          if (result.affectedRows === 0) {
            const [matches] = await pool.execute<GeneralVisitorRow[]>(
              "SELECT id FROM general_visitors WHERE id = ? LIMIT 1",
              [visitorId],
            );
            if (matches.length === 0) {
              return Response.json({ error: "No se encontró la persona seleccionada." }, { status: 404 });
            }
          }
        } else {
          await pool.execute(
            `INSERT INTO general_visitors (full_name, curp, phone, email)
             VALUES (?, ?, ?, ?)`,
            [visitor.fullName, curp, visitor.phone, visitor.email],
          );
        }

        return Response.json(
          { generalVisitors: await listGeneralVisitors() },
          { status: request.method === "POST" ? 201 : 200 },
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ER_DUP_ENTRY"
        ) {
          return Response.json(
            { error: "Ya existe una persona registrada con esa CURP." },
            { status: 409 },
          );
        }
        console.error("Failed to modify general visitor:", error);
        return Response.json(
          { error: "No se pudo guardar la persona. Inténtalo de nuevo." },
          { status: 500 },
        );
      }
    }

    const equipmentResponse = await handleEquipmentRequest(request, url);
    if (equipmentResponse) return equipmentResponse;

    const dailyLogPath = url.pathname.match(/^\/api\/daily-log(?:\/(\d+))?$/);
    if (dailyLogPath && ["GET", "POST", "DELETE"].includes(request.method)) {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        if (!(await hasSectionAccess(user, "recepcion"))) {
          return Response.json({ error: "No tienes permiso para consultar la bitácora." }, { status: 403 });
        }
        const entryId = dailyLogPath[1] ? Number(dailyLogPath[1]) : null;
        if (entryId !== null && (!Number.isSafeInteger(entryId) || entryId < 1)) {
          return Response.json({ error: "El movimiento seleccionado no es válido." }, { status: 400 });
        }
        if (request.method === "GET") {
          if (entryId !== null) {
            return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
          }
          const today = new Date().toISOString().slice(0, 10);
          const fromDate = url.searchParams.get("from") ?? today;
          const toDate = url.searchParams.get("to") ?? fromDate;
          const search = url.searchParams.get("q")?.trim() ?? "";
          const event = url.searchParams.get("event") ?? "";
          const category = url.searchParams.get("category") ?? "";
          const hostFilters = url.searchParams.getAll("host").map((host) => host.trim());
          const page = Number(url.searchParams.get("page") ?? 1);
          const pageSize = Number(url.searchParams.get("pageSize") ?? 50);
          const daySpan =
            (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) /
            86_400_000;
          if (
            !isValidDateString(fromDate) ||
            !isValidDateString(toDate) ||
            fromDate > toDate ||
            !Number.isInteger(daySpan) ||
            daySpan > 365 ||
            search.length > 180 ||
            hostFilters.some((host) => host.length === 0 || host.length > 180) ||
            hostFilters.length > 100 ||
            !["", "Llegada", "Ingreso", "Retiro", "Observaciones"].includes(event) ||
            !["", "Visitante", "Contratista", "Proveedor", "Sin categoría"].includes(category) ||
            !Number.isSafeInteger(page) || page < 1 ||
            !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
          ) {
            return Response.json(
              { error: "Revisa las fechas y los filtros de bitácora." },
              { status: 400 },
            );
          }
          const [{ entries, total, hosts }, summary] = await Promise.all([
            listDailyLogEntries(fromDate, toDate, search, event, category, hostFilters, page, pageSize),
            getDailyLogSummary(fromDate, toDate),
          ]);
          return Response.json({
            entries,
            summary,
            hosts,
            total,
            page,
            pageSize,
            pages: Math.max(1, Math.ceil(total / pageSize)),
          });
        }
        if (request.method === "DELETE") {
          if (entryId === null) {
            return Response.json({ error: "Indica el movimiento que deseas eliminar." }, { status: 400 });
          }
          const [entriesToDelete] = await pool.execute<RowDataPacket[]>(
            "SELECT appointment_id FROM daily_log_entries WHERE id = ? LIMIT 1",
            [entryId],
          );
          if (!entriesToDelete[0]) {
            return Response.json({ error: "No se encontró el movimiento seleccionado." }, { status: 404 });
          }
          const linkedAppointmentId =
            entriesToDelete[0].appointment_id === null
              ? null
              : Number(entriesToDelete[0].appointment_id);
          const [result] = await pool.execute<ResultSetHeader>(
            "DELETE FROM daily_log_entries WHERE id = ?",
            [entryId],
          );
          if (result.affectedRows === 0) {
            return Response.json({ error: "No se encontró el movimiento seleccionado." }, { status: 404 });
          }
          if (linkedAppointmentId !== null) {
            const [latestRows] = await pool.execute<RowDataPacket[]>(
              `SELECT event_type
               FROM daily_log_entries
               WHERE appointment_id = ?
                 AND event_type IN ('Llegada', 'Ingreso', 'Retiro')
               ORDER BY entry_date DESC, entry_time DESC, id DESC
               LIMIT 1`,
              [linkedAppointmentId],
            );
            const latestEvent = latestRows[0]?.event_type;
            const appointmentStatus = latestEvent === "Ingreso"
              ? "Dentro"
              : latestEvent === "Retiro"
                ? "Retirado"
                : latestEvent === "Llegada"
                  ? "En proceso"
                  : "Pendiente";
            await pool.execute(
              "UPDATE appointments SET status = ? WHERE id = ? AND status <> 'Cancelada'",
              [appointmentStatus, linkedAppointmentId],
            );
          }
          return Response.json({ message: "El movimiento se eliminó." });
        }
        if (entryId !== null) {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }
        const input = parseDailyLogInput(body);
        if (!input) {
          return Response.json(
            { error: "Revisa el tipo de movimiento, la fecha, la hora y la persona seleccionada." },
            { status: 400 },
          );
        }

        let personName = input.personName;
        let businessPartnerId: number | null = null;
        let externalStaffId = input.externalStaffId;
        let visitorId = input.visitorRecordId;
        if (input.appointmentId !== null) {
          const [matches] = await pool.execute<AppointmentRow[]>(
            `SELECT id, business_partner_id, visit_date, visit_time,
                    visitor_name, visitor_email, registered_by, company_name, host_name, status
             FROM appointments
             WHERE id = ?
             LIMIT 1`,
            [input.appointmentId],
          );
          const appointment = matches[0];
          if (!appointment) {
            return Response.json({ error: "La cita vinculada ya no existe." }, { status: 404 });
          }
          if (appointment.status === "Cancelada" || appointment.status === "Retirado") {
            return Response.json({ error: "No se puede registrar movimiento para una cita cancelada o finalizada." }, { status: 409 });
          }
          personName = appointment.visitor_name;
          businessPartnerId = appointment.business_partner_id === null
            ? null
            : Number(appointment.business_partner_id);
          if (visitorId === null) {
            const [visitorMatches] = await pool.execute<RowDataPacket[]>(
              "SELECT visitor_record_id FROM appointments WHERE id = ? LIMIT 1",
              [input.appointmentId],
            );
            visitorId =
              visitorMatches[0]?.visitor_record_id === null ||
              visitorMatches[0]?.visitor_record_id === undefined
                ? null
                : Number(visitorMatches[0].visitor_record_id);
          }
        }
        if (input.externalStaffId !== null) {
          const [matches] = await pool.execute<RowDataPacket[]>(
            "SELECT full_name FROM external_staff WHERE id = ? LIMIT 1",
            [input.externalStaffId],
          );
          if (!matches[0]) {
            return Response.json({ error: "La ficha de personal externo ya no existe." }, { status: 404 });
          }
          personName = String(matches[0].full_name);
        }
        if (input.visitorRecordId !== null) {
          const [matches] = await pool.execute<RowDataPacket[]>(
            "SELECT full_name FROM general_visitors WHERE id = ? LIMIT 1",
            [input.visitorRecordId],
          );
          if (!matches[0]) {
            return Response.json({ error: "La ficha del visitante ya no existe." }, { status: 404 });
          }
          personName = String(matches[0].full_name);
        }
        if (input.appointmentId !== null && businessPartnerId !== null) {
          const [matches] = await pool.execute<RowDataPacket[]>(
            `SELECT id FROM external_staff
             WHERE business_partner_id = ?
               AND LOWER(TRIM(full_name)) = LOWER(TRIM(?))
             ORDER BY id DESC
             LIMIT 1`,
            [businessPartnerId, personName],
          );
          if (matches[0]) externalStaffId = Number(matches[0].id);
        }
        if (
          (input.event === "Ingreso" || input.event === "Retiro") &&
          input.appointmentId === null &&
          input.externalStaffId === null &&
          input.visitorRecordId === null
        ) {
          return Response.json(
            { error: "Para registrar un ingreso o retiro, vincula el movimiento con una cita o ficha de persona." },
            { status: 400 },
          );
        }

        const subjectKey = externalStaffId !== null
          ? `external:${externalStaffId}`
          : visitorId !== null
            ? `visitor:${visitorId}`
            : input.appointmentId !== null && businessPartnerId !== null
              ? `external-name:${businessPartnerId}:${personName.trim().toLocaleLowerCase()}`
            : input.appointmentId !== null
              ? `appointment:${input.appointmentId}`
              : `name:${personName.trim().toLocaleLowerCase()}`;
        const [duplicateRows] = await pool.execute<RowDataPacket[]>(
          `SELECT id
           FROM daily_log_entries
           WHERE entry_date = ?
             AND entry_time = ?
             AND event_type = ?
             AND person_name = ?
             AND details <=> ?
             AND appointment_id <=> ?
             AND external_staff_id <=> ?
             AND visitor_record_id <=> ?
           LIMIT 1`,
          [
            input.date,
            input.time,
            input.event,
            personName,
            input.details || null,
            input.appointmentId,
            externalStaffId,
            visitorId,
          ],
        );
        if (duplicateRows[0]) {
          return Response.json({
            message: "Este movimiento ya estaba registrado.",
            duplicate: true,
            personName,
          });
        }

        const [latestMovementRows] = await pool.execute<RowDataPacket[]>(
          `WITH movements AS (
             SELECT d.id, d.event_type, d.entry_date, d.entry_time,
                    ${dailyLogSubjectKey} AS subject_key
             FROM daily_log_entries d
             ${dailyLogJoins}
             WHERE d.event_type IN ('Ingreso', 'Retiro')
           )
           SELECT event_type
           FROM movements
           WHERE subject_key = ?
           ORDER BY entry_date DESC, entry_time DESC, id DESC
           LIMIT 1`,
          [subjectKey],
        );
        const latestMovement = latestMovementRows[0]?.event_type;
        if (input.event === "Ingreso" && latestMovement === "Ingreso") {
          return Response.json({ error: "Esta persona ya tiene un ingreso sin retiro registrado." }, { status: 409 });
        }
        if (input.event === "Retiro" && latestMovement !== "Ingreso") {
          return Response.json({ error: "No se puede registrar el retiro: no hay un ingreso activo para esta persona." }, { status: 409 });
        }

        await pool.execute(
          `INSERT INTO daily_log_entries
             (entry_date, entry_time, event_type, person_name, details,
              appointment_id, external_staff_id, visitor_record_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.date,
            input.time,
            input.event,
            personName,
            input.details || null,
            input.appointmentId,
            externalStaffId,
            visitorId,
          ],
        );
        if (
          input.appointmentId !== null &&
          (input.event === "Llegada" || input.event === "Ingreso" || input.event === "Retiro")
        ) {
          const [latestAppointmentEvents] = await pool.execute<RowDataPacket[]>(
            `SELECT event_type
             FROM daily_log_entries
             WHERE appointment_id = ?
               AND event_type IN ('Llegada', 'Ingreso', 'Retiro')
             ORDER BY entry_date DESC, entry_time DESC, id DESC
             LIMIT 1`,
            [input.appointmentId],
          );
          const latestEvent = latestAppointmentEvents[0]?.event_type;
          const appointmentStatus = latestEvent === "Ingreso"
            ? "Dentro"
            : latestEvent === "Retiro"
              ? "Retirado"
              : "En proceso";
          await pool.execute(
            "UPDATE appointments SET status = ? WHERE id = ? AND status <> 'Cancelada'",
            [appointmentStatus, input.appointmentId],
          );
        }
        return Response.json({ message: "El movimiento se registró.", personName }, { status: 201 });
      } catch (error) {
        console.error("Failed to modify daily log:", error);
        return Response.json(
          { error: "No se pudo guardar la bitácora. Inténtalo de nuevo." },
          { status: 500 },
        );
      }
    }

    const appointmentQrPath = url.pathname.match(/^\/api\/appointments\/(\d+)\/send-qr$/);
    if (request.method === "POST" && appointmentQrPath) {
      let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;
      let smtpServerName = "el servidor SMTP configurado";
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        if (!(await hasSectionAccess(user, "recepcion"))) {
          return Response.json({ error: "No tienes permiso para enviar pases de visita." }, { status: 403 });
        }
        const appointmentId = Number(appointmentQrPath[1]);
        if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
          return Response.json({ error: "La cita seleccionada no es válida." }, { status: 400 });
        }

        const [rows] = await pool.execute<AppointmentRow[]>(
          `SELECT id, business_partner_id,
                  DATE_FORMAT(visit_date, '%Y-%m-%d') AS visit_date,
                  TIME_FORMAT(visit_time, '%H:%i') AS visit_time,
                  visitor_name, visitor_email, registered_by, company_name, host_name, status
           FROM appointments WHERE id = ? LIMIT 1`,
          [appointmentId],
        );
        const appointment = rows[0];
        if (!appointment) {
          return Response.json({ error: "No se encontró la cita seleccionada." }, { status: 404 });
        }
        if (appointment.status === "Cancelada" || appointment.status === "Retirado") {
          return Response.json({ error: "No se puede enviar el pase de una cita cancelada o finalizada." }, { status: 409 });
        }

        let recipientEmail = appointment.visitor_email.trim();
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail) &&
          appointment.business_partner_id !== null
        ) {
          const [staffRows] = await pool.execute<RowDataPacket[]>(
            `SELECT email
             FROM external_staff AS staff
             INNER JOIN business_partners AS partner
               ON partner.id = staff.business_partner_id
             WHERE (
                 staff.business_partner_id = ?
                 OR (? IS NULL AND LOWER(TRIM(partner.name)) = LOWER(TRIM(?)))
               )
               AND LOWER(TRIM(staff.full_name)) = LOWER(TRIM(?))
               AND staff.email <> ''
             ORDER BY staff.id DESC
             LIMIT 1`,
            [
              appointment.business_partner_id,
              appointment.business_partner_id,
              appointment.company_name,
              appointment.visitor_name,
            ],
          );
          const employeeEmail =
            typeof staffRows[0]?.email === "string" ? staffRows[0].email.trim() : "";
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employeeEmail)) {
            recipientEmail = employeeEmail;
            await pool.execute(
              "UPDATE appointments SET visitor_email = ? WHERE id = ?",
              [recipientEmail, appointmentId],
            );
          }
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            body = null;
          }
          const suppliedEmail =
            isRecord(body) && typeof body.email === "string" ? body.email.trim() : "";
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail) || suppliedEmail.length > 254) {
            return Response.json(
              {
                code: "VISITOR_EMAIL_REQUIRED",
                error: "No se encontró un correo válido en la ficha de esta persona.",
              },
              { status: 409 },
            );
          }
          recipientEmail = suppliedEmail;
          await pool.execute(
            "UPDATE appointments SET visitor_email = ? WHERE id = ?",
            [recipientEmail, appointmentId],
          );
        }

        const smtpHost = Bun.env.SMTP_HOST?.trim();
        smtpServerName = smtpHost || smtpServerName;
        const smtpUser = Bun.env.SMTP_USER?.trim();
        const smtpPassword = Bun.env.SMTP_PASSWORD;
        const smtpPort = Number(Bun.env.SMTP_PORT ?? 587);
        const smtpFrom = Bun.env.SMTP_FROM?.trim() || smtpUser;
        if (!smtpHost || !smtpUser || !smtpPassword || !smtpFrom || !Number.isInteger(smtpPort)) {
          return Response.json(
            { error: "El correo de salida aún no está configurado. Solicita a TI los datos SMTP de Outlook para agregarlos al backend." },
            { status: 503 },
          );
        }

        const qrPayload = JSON.stringify({
          type: "visitas-appointment",
          id: Number(appointment.id),
          visitor: appointment.visitor_name,
          company: appointment.company_name,
          host: appointment.host_name,
          date: appointment.visit_date,
          time: appointment.visit_time,
        });
        const qrDataUrl = await QRCode.toDataURL(qrPayload, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 320,
          color: { dark: "#10243a", light: "#ffffff" },
        });
        const encodedImage = qrDataUrl.split(",")[1];
        if (!encodedImage) throw new Error("Generated QR image has no image data.");
        const logoFile = Bun.file(
          new URL("../../frontend/public/images/cymez-mark-email.png", import.meta.url),
        );
        if (!(await logoFile.exists())) {
          throw new Error("The CyMEZ logo required for the appointment email was not found.");
        }
        const logoContent = Buffer.from(await logoFile.arrayBuffer());
        const safeVisitorName = escapeEmailHtml(appointment.visitor_name);
        const safeCompanyName = escapeEmailHtml(appointment.company_name);
        const safeHostName = escapeEmailHtml(appointment.host_name);
        const [visitYear, visitMonth, visitDay] = appointment.visit_date.split("-").map(Number);
        const formattedVisitDate = new Date(visitYear, visitMonth - 1, visitDay).toLocaleDateString(
          "es-MX",
          { weekday: "long", day: "numeric", month: "long", year: "numeric" },
        );
        const safeVisitDate = escapeEmailHtml(
          formattedVisitDate.charAt(0).toLocaleUpperCase("es-MX") + formattedVisitDate.slice(1),
        );
        const safeVisitTime = escapeEmailHtml(appointment.visit_time);
        const qrContentId = `visitas-qr-${appointment.id}`;
        const html = `
          <!doctype html>
          <html lang="es">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>Tu pase de visita CyMEZ</title>
              <style>
                @media only screen and (max-width: 620px) {
                  .email-shell { width:100% !important; max-width:100% !important; }
                  .email-outer { padding:10px 8px !important; }
                  .email-gutter { padding-left:12px !important; padding-right:12px !important; }
                  .email-header { padding-top:14px !important; padding-bottom:14px !important; }
                  .email-logo-cell { width:74px !important; }
                  .email-logo { width:64px !important; }
                  .email-header-title { padding-left:12px !important; font-size:11px !important; line-height:16px !important; letter-spacing:1px !important; }
                  .email-header-decoration { display:none !important; width:0 !important; }
                  .email-hero-copy { padding:22px 17px 24px !important; }
                  .email-hero-title { font-size:27px !important; line-height:32px !important; }
                  .email-hero-greeting { font-size:14px !important; line-height:21px !important; }
                  .email-hero-aside { display:none !important; }
                  .email-info-heading { padding:16px 16px 12px !important; font-size:12px !important; }
                  .email-info-column, .email-qr-column { display:block !important; width:100% !important; padding:0 14px 14px !important; }
                  .email-info-cell { display:block !important; width:100% !important; padding:10px 0 !important; border-left:0 !important; }
                  .email-info-cell-first { border-bottom:1px solid #233547 !important; }
                  .email-qr-column { padding-top:4px !important; }
                  .email-qr-card { width:100% !important; max-width:290px !important; margin:0 auto !important; }
                  .email-qr-cell { padding:12px 10px 8px !important; }
                  .email-qr-image { width:220px !important; max-width:100% !important; }
                  .email-reminder-icon { display:none !important; width:0 !important; padding:0 !important; }
                  .email-reminder-copy { padding:15px 14px !important; }
                  .email-reminder-title { font-size:13px !important; line-height:19px !important; }
                  .email-reminder-text { font-size:12px !important; line-height:18px !important; }
                  .email-footer { padding:20px 12px 16px !important; }
                  .email-footer-title { width:auto !important; padding:0 9px !important; font-size:9px !important; letter-spacing:1px !important; white-space:nowrap !important; }
                }
              </style>
            </head>
            <body style="margin:0;padding:0;background-color:#030a10;font-family:Arial,Helvetica,sans-serif;color:#f4f7fb;">
              <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Tu pase digital de visita CyMEZ está listo. Presenta el código QR en recepción.</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#030a10;">
                <tr>
                  <td class="email-outer" align="center" style="padding:20px 10px;">
                    <table role="presentation" class="email-shell" width="700" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:700px;background-color:#030a10;border:1px solid #14283a;">
                      <tr>
                        <td style="height:5px;background-color:#ef1f32;font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                      <tr>
                        <td class="email-gutter email-header" style="padding:20px 32px;background-color:#030a10;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td class="email-logo-cell" align="left" valign="middle" style="width:125px;">
                                <img class="email-logo" src="cid:cymez-logo" width="92" alt="CyMEZ" style="display:block;width:92px;max-width:100%;height:auto;border:0;">
                              </td>
                              <td class="email-header-title" valign="middle" style="border-left:1px solid #344252;padding-left:22px;font-size:14px;line-height:20px;letter-spacing:1.6px;color:#d3d9e1;">
                                CONTROL DE VISITAS
                              </td>
                              <td class="email-header-decoration" align="right" valign="middle" style="width:90px;">
                                <span style="color:#ef1f32;font-size:20px;font-weight:bold;">/</span><span style="color:#f4f7fb;font-size:20px;font-weight:bold;">/</span><span style="color:#124c8a;font-size:20px;font-weight:bold;">/</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td class="email-gutter" style="padding:0 20px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#06234a;border:1px solid #123d70;">
                            <tr>
                              <td class="email-hero-copy" valign="middle" style="padding:30px 30px 32px;border-left:5px solid #ef1f32;">
                                <p style="display:inline-block;margin:0 0 12px;padding:8px 16px;background-color:#ef1f32;border-radius:20px;font-size:11px;line-height:15px;font-weight:bold;letter-spacing:1.3px;color:#ffffff;">PASE DIGITAL&nbsp;&nbsp; #${appointment.id}</p>
                                <h1 class="email-hero-title" style="margin:0 0 14px;font-size:34px;line-height:39px;font-weight:700;color:#ffffff;">Tu visita está lista</h1>
                                <span style="display:block;width:92px;height:4px;margin:0 0 18px;background-color:#ef1f32;font-size:0;line-height:0;">&nbsp;</span>
                                <p class="email-hero-greeting" style="margin:0;font-size:16px;line-height:24px;color:#e2e9f3;">Hola <strong style="color:#ffffff;">${safeVisitorName}</strong>, aquí tienes tu pase de acceso a CyMEZ.</p>
                              </td>
                              <td class="email-hero-aside" align="center" valign="middle" style="width:190px;padding:18px 20px;">
                                <p style="margin:0 0 5px;font-size:15px;line-height:21px;letter-spacing:2px;color:#d7e4f2;">TU VISITA ES</p>
                                <p style="margin:0;font-size:19px;line-height:24px;font-weight:bold;color:#ef1f32;">IMPORTANTE</p>
                                <span style="display:block;width:58px;height:3px;margin:14px auto 0;background-color:#ef1f32;font-size:0;line-height:0;">&nbsp;</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td class="email-gutter" style="padding:24px 20px 0;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#06111b;border:1px solid #1b3043;border-radius:12px;">
                            <tr>
                              <td class="email-info-heading" colspan="2" style="padding:20px 22px 14px;font-size:14px;line-height:20px;font-weight:bold;letter-spacing:.7px;color:#f4f7fb;">
                                INFORMACIÓN DE TU VISITA
                                <span style="display:inline-block;width:78px;height:2px;margin:0 0 4px 10px;background-color:#ef1f32;font-size:0;line-height:0;">&nbsp;</span>
                              </td>
                            </tr>
                            <tr>
                              <td class="email-info-column" width="62%" valign="top" style="padding:0 8px 20px 22px;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                  <tr>
                                    <td class="email-info-cell email-info-cell-first" width="50%" valign="top" style="padding:10px 12px 14px 0;border-bottom:1px solid #233547;">
                                      <p style="margin:0 0 7px;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1px;color:#91a5bd;">FECHA</p>
                                      <p style="margin:0;font-size:14px;line-height:20px;font-weight:bold;color:#f4f7fb;">${safeVisitDate}</p>
                                    </td>
                                    <td class="email-info-cell email-info-cell-first" width="50%" valign="top" style="padding:10px 0 14px 12px;border-bottom:1px solid #233547;border-left:1px solid #233547;">
                                      <p style="margin:0 0 7px;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1px;color:#91a5bd;">HORA</p>
                                      <p style="margin:0;font-size:18px;line-height:22px;font-weight:bold;color:#f4f7fb;">${safeVisitTime}</p>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td class="email-info-cell" width="50%" valign="top" style="padding:14px 12px 4px 0;">
                                      <p style="margin:0 0 7px;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1px;color:#91a5bd;">EMPRESA</p>
                                      <p style="margin:0;font-size:14px;line-height:20px;font-weight:bold;color:#f4f7fb;">${safeCompanyName}</p>
                                    </td>
                                    <td class="email-info-cell" width="50%" valign="top" style="padding:14px 0 4px 12px;border-left:1px solid #233547;">
                                      <p style="margin:0 0 7px;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1px;color:#91a5bd;">TE RECIBE</p>
                                      <p style="margin:0;font-size:14px;line-height:20px;font-weight:bold;color:#f4f7fb;">${safeHostName}</p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                              <td class="email-qr-column" width="38%" align="center" valign="top" style="padding:0 18px 18px 10px;">
                                <table role="presentation" class="email-qr-card" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #174a7a;border-radius:12px;">
                                  <tr>
                                    <td class="email-qr-cell" align="center" style="padding:14px 12px 8px;">
                                      <img class="email-qr-image" src="cid:${qrContentId}" width="220" alt="Código QR de acceso a la visita" style="display:block;width:100%;max-width:220px;height:auto;border:8px solid #ffffff;border-radius:12px;">
                                    </td>
                                  </tr>
                                  <tr>
                                    <td align="center" style="padding:4px 12px 14px;font-size:12px;line-height:17px;color:#e2e9f3;">Muestra este código<br>en recepción al llegar.</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td class="email-gutter" style="padding:18px 20px 0;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#06234a;">
                            <tr>
                              <td class="email-reminder-icon" align="center" valign="middle" style="width:120px;padding:18px;">
                                <span style="display:inline-block;width:54px;height:54px;border:3px solid #1760a4;border-radius:50%;font-size:28px;line-height:54px;font-weight:bold;color:#ffffff;">✓</span>
                              </td>
                              <td class="email-reminder-copy" valign="middle" style="padding:18px 18px 18px 0;">
                                <p class="email-reminder-title" style="margin:0 0 7px;font-size:14px;line-height:20px;font-weight:bold;color:#f4f7fb;">También encontrarás el QR adjunto como imagen PNG.</p>
                                <p class="email-reminder-text" style="margin:0;font-size:13px;line-height:20px;color:#c6d4e5;">Te recomendamos conservar este correo y tener tu código listo al momento de ingresar.</p>
                              </td>
                              <td style="width:12px;background-color:#ef1f32;font-size:0;line-height:0;">&nbsp;</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td class="email-footer" align="center" style="padding:25px 18px 18px;">
                          <table role="presentation" width="82%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td valign="middle" style="border-top:1px solid #314255;font-size:0;line-height:0;">&nbsp;</td>
                              <td class="email-footer-title" align="center" width="230" style="padding:0 14px;font-size:11px;line-height:16px;letter-spacing:2px;color:#91a5bd;">GRACIAS POR TU VISITA</td>
                              <td valign="middle" style="border-top:1px solid #314255;font-size:0;line-height:0;">&nbsp;</td>
                            </tr>
                            <tr>
                              <td colspan="3" align="center" style="padding:8px 0 0;font-size:14px;line-height:20px;color:#d3d9e1;">CyMEZ</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr><td style="height:6px;background-color:#06234a;font-size:0;line-height:0;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>`;

        const secure = Bun.env.SMTP_SECURE === "true" || smtpPort === 465;
        transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure,
          requireTLS: !secure,
          auth: { user: smtpUser, pass: smtpPassword },
        });
        await transporter.sendMail({
          from: smtpFrom,
          to: recipientEmail,
          subject: `Pase de visita - ${appointment.visitor_name}`,
          text: [
            `Hola ${appointment.visitor_name},`,
            "",
            "Adjuntamos tu código QR para presentar en recepción.",
            `Empresa: ${appointment.company_name}`,
            `Anfitrión: ${appointment.host_name}`,
            `Fecha: ${appointment.visit_date}`,
            `Hora: ${appointment.visit_time}`,
            "",
            "El código QR también aparece en el cuerpo de este correo.",
          ].join("\n"),
          html,
          attachments: [{
            filename: `pase-visita-${appointment.id}.png`,
            content: Buffer.from(encodedImage, "base64"),
            contentType: "image/png",
            contentDisposition: "inline",
            cid: qrContentId,
          }, {
            filename: "logo-cymez.png",
            content: logoContent,
            contentType: "image/png",
            contentDisposition: "inline",
            cid: "cymez-logo",
          }],
        });
        return Response.json({ message: `El pase se envió a ${recipientEmail}.` });
      } catch (error) {
        const errorCode =
          isRecord(error) && typeof error.code === "string" ? error.code : "UNKNOWN";
        const responseCode =
          isRecord(error) && typeof error.responseCode === "number" ? error.responseCode : null;
        const smtpResponse =
          isRecord(error) && typeof error.response === "string" ? error.response : "";
        const command =
          isRecord(error) && typeof error.command === "string" ? error.command : "UNKNOWN";
        const authenticationRejected =
          errorCode === "EAUTH" ||
          responseCode === 535 ||
          /5\.7\.(?:139|3|1)/i.test(smtpResponse);
        const deliveryRejected = responseCode === 550 || errorCode === "EENVELOPE";
        const connectionFailed = ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(errorCode);
        const failureCode = authenticationRejected
          ? "SMTP_AUTH_FAILED"
          : deliveryRejected
            ? "SMTP_DELIVERY_REJECTED"
            : connectionFailed
              ? "SMTP_CONNECTION_FAILED"
              : "SMTP_SEND_FAILED";
        const message = authenticationRejected
          ? `${smtpServerName} rechazó la autenticación. Verifica el usuario y la contraseña SMTP, y confirma con TI el método de autenticación admitido por ese servidor.`
          : deliveryRejected
            ? `${smtpServerName} rechazó el remitente o el correo del visitante. Verifica que la cuenta tenga permiso para enviar desde ese remitente y que la dirección destinataria sea correcta.`
            : connectionFailed
              ? `No se pudo establecer conexión con ${smtpServerName}. Verifica la red y la configuración de host, puerto y TLS.`
              : `${smtpServerName} no pudo enviar el correo. Revisa su configuración SMTP y los registros del backend.`;
        console.error("Failed to send appointment QR email:", {
          code: errorCode,
          responseCode,
          command,
        });
        return Response.json(
          { code: failureCode, error: message },
          { status: 502 },
        );
      } finally {
        transporter?.close();
      }
    }

    const appointmentsPath = url.pathname.match(/^\/api\/appointments(?:\/(\d+))?$/);
    if (
      appointmentsPath &&
      ["GET", "POST", "PATCH", "DELETE"].includes(request.method)
    ) {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        if (!(await hasSectionAccess(user, "recepcion"))) {
          return Response.json({ error: "No tienes permiso para administrar la agenda." }, { status: 403 });
        }

        const appointmentId = appointmentsPath[1] ? Number(appointmentsPath[1]) : null;
        if (appointmentId !== null && (!Number.isSafeInteger(appointmentId) || appointmentId < 1)) {
          return Response.json({ error: "La cita seleccionada no es válida." }, { status: 400 });
        }
        if (request.method === "GET") {
          if (appointmentId !== null) {
            return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
          }
          return Response.json({ appointments: await listAppointments() });
        }
        if (
          (request.method === "POST" && appointmentId !== null) ||
          (request.method !== "POST" && appointmentId === null)
        ) {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }

        if (request.method === "DELETE") {
          const [result] = await pool.execute<ResultSetHeader>(
            "DELETE FROM appointments WHERE id = ?",
            [appointmentId],
          );
          if (result.affectedRows === 0) {
            return Response.json({ error: "No se encontró la cita seleccionada." }, { status: 404 });
          }
          return Response.json({ appointments: await listAppointments() });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }
        if (request.method === "PATCH") {
          if (!isRecord(body) || body.status !== "Cancelada") {
            return Response.json({ error: "El cambio de estado de la cita no es válido." }, { status: 400 });
          }
          const [result] = await pool.execute<ResultSetHeader>(
            `UPDATE appointments
             SET status = 'Cancelada'
             WHERE id = ? AND status NOT IN ('Cancelada', 'Retirado')`,
            [appointmentId],
          );
          if (result.affectedRows === 0) {
            const [matches] = await pool.execute<AppointmentRow[]>(
              "SELECT id, status FROM appointments WHERE id = ? LIMIT 1",
              [appointmentId],
            );
            if (matches.length === 0) {
              return Response.json({ error: "No se encontró la cita seleccionada." }, { status: 404 });
            }
            return Response.json({ error: "La cita ya no se puede cancelar." }, { status: 409 });
          }
        } else {
          const appointment = parseAppointment(body);
          if (!appointment) {
            return Response.json(
              { error: "Revisa el nombre y correo del visitante, la empresa, el anfitrión, la fecha y la hora." },
              { status: 400 },
            );
          }
          const [partners] = await pool.execute<BusinessPartnerRow[]>(
            `SELECT id, name, description, rfc, category, employee_count, partner_type, is_active
             FROM business_partners WHERE id = ? LIMIT 1`,
            [appointment.businessPartnerId],
          );
          if (partners.length === 0) {
            return Response.json({ error: "La empresa seleccionada ya no está disponible." }, { status: 400 });
          }
          await pool.execute(
            `INSERT INTO appointments
              (business_partner_id, visit_date, visit_time, visitor_name, visitor_email, registered_by,
               company_name, host_name, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente')`,
            [
              appointment.businessPartnerId,
              appointment.date,
              appointment.time,
              appointment.visitorName,
              appointment.visitorEmail,
              user.name?.trim() || user.login,
              partners[0].name,
              appointment.hostName,
            ],
          );
        }

        return Response.json({ appointments: await listAppointments() }, {
          status: request.method === "POST" ? 201 : 200,
        });
      } catch (error) {
        console.error("Failed to modify appointments:", error);
        return Response.json(
          { error: "No se pudo actualizar la agenda. Inténtalo de nuevo." },
          { status: 500 },
        );
      }
    }

    const externalStaffPath = url.pathname.match(/^\/api\/external-staff(?:\/(\d+))?$/);
    if (
      externalStaffPath &&
      ["GET", "POST", "PATCH", "DELETE"].includes(request.method)
    ) {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        if (!(await hasSectionAccess(user, "recepcion"))) {
          return Response.json({ error: "No tienes permiso para administrar personal externo." }, { status: 403 });
        }

        const staffId = externalStaffPath[1] ? Number(externalStaffPath[1]) : null;
        if (staffId !== null && (!Number.isSafeInteger(staffId) || staffId < 1)) {
          return Response.json({ error: "La persona seleccionada no es válida." }, { status: 400 });
        }
        if (request.method === "GET") {
          if (staffId !== null) {
            return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
          }
          return Response.json({ externalStaff: await listExternalStaff() });
        }
        if (
          (request.method === "POST" && staffId !== null) ||
          (request.method !== "POST" && staffId === null)
        ) {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }
        if (request.method === "DELETE") {
          const [result] = await pool.execute<ResultSetHeader>(
            "DELETE FROM external_staff WHERE id = ?",
            [staffId],
          );
          if (result.affectedRows === 0) {
            return Response.json({ error: "No se encontró la persona seleccionada." }, { status: 404 });
          }
          return Response.json({ externalStaff: await listExternalStaff() });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }
        const staff = parseExternalStaff(body);
        if (!staff) {
          return Response.json(
            { error: "Revisa nombre, teléfono, correo y empresa vinculada." },
            { status: 400 },
          );
        }
        const [partners] = await pool.execute<BusinessPartnerRow[]>(
          `SELECT id, name, description, rfc, category, employee_count, partner_type, is_active
           FROM business_partners WHERE id = ? LIMIT 1`,
          [staff.businessPartnerId],
        );
        if (partners.length === 0) {
          return Response.json({ error: "Selecciona una empresa registrada." }, { status: 400 });
        }

        if (request.method === "PATCH") {
          const [result] = await pool.execute<ResultSetHeader>(
            `UPDATE external_staff
             SET business_partner_id = ?, full_name = ?, phone = ?, email = ?
             WHERE id = ?`,
            [
              staff.businessPartnerId,
              staff.fullName,
              staff.phone,
              staff.email,
              staffId,
            ],
          );
          if (result.affectedRows === 0) {
            const [matches] = await pool.execute<RowDataPacket[]>(
              "SELECT id FROM external_staff WHERE id = ? LIMIT 1",
              [staffId],
            );
            if (matches.length === 0) {
              return Response.json({ error: "No se encontró la persona seleccionada." }, { status: 404 });
            }
          }
        } else {
          await pool.execute(
            `INSERT INTO external_staff (business_partner_id, full_name, phone, email)
             VALUES (?, ?, ?, ?)`,
            [staff.businessPartnerId, staff.fullName, staff.phone, staff.email],
          );
        }

        return Response.json(
          { externalStaff: await listExternalStaff() },
          { status: request.method === "POST" ? 201 : 200 },
        );
      } catch (error) {
        console.error("Failed to modify external staff:", error);
        return Response.json(
          { error: "No se pudo guardar el personal externo. Inténtalo de nuevo." },
          { status: 500 },
        );
      }
    }

    const departmentsPath = url.pathname.match(/^\/api\/departments(?:\/(\d+))?$/);
    if (departmentsPath && request.method === "GET" && !departmentsPath[1]) {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        const sections = await listUserSectionAccess(user.login, user.isAdmin);
        if (!sections.includes("recepcion") && !sections.includes("anfitriones")) {
          return Response.json({ error: "No tienes permiso para consultar departamentos." }, { status: 403 });
        }
        return Response.json({ departments: await listDepartments() });
      } catch (error) {
        console.error("Failed to load departments:", error);
        return Response.json(
          { error: "No se pudieron cargar los departamentos." },
          { status: 500 },
        );
      }
    }

    if (
      departmentsPath &&
      ["POST", "PATCH", "DELETE"].includes(request.method)
    ) {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        if (!user.isAdmin) {
          return Response.json({ error: "No tienes permiso para modificar departamentos." }, { status: 403 });
        }

        const departmentId = departmentsPath[1] ? Number(departmentsPath[1]) : null;
        if (departmentId !== null && !Number.isSafeInteger(departmentId)) {
          return Response.json({ error: "El departamento seleccionado no es válido." }, { status: 400 });
        }

        if (request.method === "DELETE") {
          if (departmentId === null) {
            return Response.json({ error: "Indica el departamento que deseas eliminar." }, { status: 400 });
          }
          const [matches] = await pool.execute<DepartmentRow[]>(
            "SELECT id FROM departments WHERE id = ? LIMIT 1",
            [departmentId],
          );
          if (matches.length === 0) {
            return Response.json({ error: "No se encontró el departamento seleccionado." }, { status: 404 });
          }
          await pool.execute("DELETE FROM departments WHERE id = ?", [departmentId]);
          return Response.json({ departments: await listDepartments() });
        }

        if ((request.method === "POST" && departmentId !== null) ||
            (request.method === "PATCH" && departmentId === null)) {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }
        if (
          typeof body !== "object" ||
          body === null ||
          !("name" in body) ||
          typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.trim().length > 120
        ) {
          return Response.json(
            { error: "Escribe un nombre de departamento de hasta 120 caracteres." },
            { status: 400 },
          );
        }

        if (request.method === "PATCH" && departmentId !== null) {
          const [matches] = await pool.execute<DepartmentRow[]>(
            "SELECT id FROM departments WHERE id = ? LIMIT 1",
            [departmentId],
          );
          if (matches.length === 0) {
            return Response.json({ error: "No se encontró el departamento seleccionado." }, { status: 404 });
          }
          await pool.execute<ResultSetHeader>(
            "UPDATE departments SET name = ? WHERE id = ?",
            [body.name.trim(), departmentId],
          );
        } else {
          await pool.execute<ResultSetHeader>(
            "INSERT INTO departments (name) VALUES (?)",
            [body.name.trim()],
          );
        }

        return Response.json(
          { departments: await listDepartments() },
          { status: request.method === "POST" ? 201 : 200 },
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ER_DUP_ENTRY"
        ) {
          return Response.json(
            { error: "Ya existe un departamento con ese nombre." },
            { status: 409 },
          );
        }
        console.error("Failed to modify department:", error);
        return Response.json(
          { error: "No se pudo guardar el departamento. Verifica la conexión y vuelve a intentarlo." },
          { status: 500 },
        );
      }
    }

    if (request.method === "PUT" && url.pathname.startsWith("/api/access/")) {
      try {
        const user = await getRequestUser(request);
        if (!user) {
          return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
        }
        if (!user.isAdmin) {
          return Response.json({ error: "No tienes permiso para editar accesos." }, { status: 403 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
        }
        if (
          typeof body !== "object" ||
          body === null ||
          !("sections" in body) ||
          !Array.isArray(body.sections) ||
          body.sections.length > 1 ||
          !body.sections.every(
            (section: unknown) =>
              typeof section === "string" &&
              managedAccessValues.includes(section as (typeof managedAccessValues)[number]),
          )
        ) {
          return Response.json({ error: "Selecciona secciones de acceso válidas." }, { status: 400 });
        }

        const login = decodeURIComponent(url.pathname.slice("/api/access/".length));
        if (!login || login.length > 255) {
          return Response.json({ error: "El usuario seleccionado no es válido." }, { status: 400 });
        }

        const [matches] = await pool.execute<AccessLoginRow[]>(
          `SELECT login, priv_admin,
                  EXISTS (
                    SELECT 1 FROM accesos_secciones s
                    WHERE s.login = accesos.login AND s.seccion = 'administrador'
                  ) AS section_admin
           FROM accesos WHERE login = ? LIMIT 1`,
          [login],
        );
        if (matches.length === 0) {
          return Response.json({ error: "No se encontró la cuenta seleccionada." }, { status: 404 });
        }
        const accountLogin = matches[0].login;

        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const targetIsAdmin =
            ["Y", "1"].includes(matches[0].priv_admin ?? "") ||
            Boolean(matches[0].section_admin);
          if (targetIsAdmin && !body.sections.includes("administrador")) {
            const [admins] = await connection.execute<RowDataPacket[]>(
              `SELECT a.login
               FROM accesos a
               WHERE a.active IN ('Y', '1')
                 AND (
                   a.priv_admin IN ('Y', '1')
                   OR EXISTS (
                     SELECT 1 FROM accesos_secciones s
                     WHERE s.login = a.login AND s.seccion = 'administrador'
                   )
                 )
                 AND a.login <> ?
               LIMIT 1`,
              [accountLogin],
            );
            if (admins.length === 0) {
              await connection.rollback();
              return Response.json(
                { error: "Debe permanecer al menos una cuenta activa con acceso de administrador." },
                { status: 400 },
              );
            }
          }
          await connection.execute(
            "DELETE FROM accesos_secciones WHERE login = ? AND seccion IN ('recepcion', 'administrador')",
            [accountLogin],
          );
          for (const section of new Set(body.sections as SectionAccess[])) {
            await connection.execute(
              "INSERT INTO accesos_secciones (login, seccion) VALUES (?, ?)",
              [accountLogin, section],
            );
          }
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
        const accounts = await listAccessAccounts();
        return Response.json({ accounts });
      } catch (error) {
        console.error("Failed to update access control:", error);
        return Response.json(
          { error: "No se pudo actualizar el acceso. Inténtalo de nuevo." },
          { status: 500 },
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      try {
        await pool.query("SELECT 1");
        return Response.json({ status: "ok", database: "connected" });
      } catch (error) {
        console.error("Database health check failed:", error);
        return Response.json(
          { status: "error", database: "disconnected" },
          { status: 503 },
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/api/visits") {
      try {
        const [visits] = await pool.query(
          "SELECT id, visitor_name, visited_at FROM visits ORDER BY visited_at DESC",
        );
        return Response.json(visits);
      } catch (error) {
        console.error("Failed to load visits:", error);
        return Response.json(
          { error: "No se pudieron cargar las visitas." },
          { status: 500 },
        );
      }
    }

    return Response.json({ error: "Ruta no encontrada." }, { status: 404 });
  },
});

console.log(`API disponible en http://localhost:${server.port}`);
