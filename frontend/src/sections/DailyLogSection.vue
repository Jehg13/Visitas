<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { notifyUser } from "../notifications";
import VisitorKioskReceptionSection from "./VisitorKioskReceptionSection.vue";

type LogEventType = "Llegada" | "Ingreso" | "Retiro" | "Observaciones";
type LogCategory = "Visitante" | "Contratista" | "Proveedor" | "Sin categoría";
type LogEntry = {
  id: number;
  date: string;
  time: string;
  event: LogEventType;
  person: string;
  actorName: string | null;
  details: string;
  appointmentId: number | null;
  externalStaffId: number | null;
  visitorRecordId: number | null;
  company: string;
  host: string;
  category: LogCategory;
};
type LogSummary = {
  movementCount: number;
  insideNow: number;
  pendingArrivals: number;
  exits: number;
};
type Appointment = {
  id: number;
  businessPartnerId?: number | null;
  date: string;
  time: string;
  visitor: string;
  email: string;
  referenceCode: string;
  registeredBy: string;
  company: string;
  partnerType?: "Contratista" | "Proveedor" | "Visitante";
  host: string;
  status: "Dentro" | "En proceso" | "Pendiente" | "Retirado" | "Cancelada";
  equipmentChecklistRequired?: boolean;
  equipmentEntryChecklistComplete?: boolean;
};
type AppointmentEmployeeStatus = "Pendiente" | "En proceso" | "Dentro" | "Retirado";
type AppointmentEmployee = {
  id: number;
  fullName: string;
  status: AppointmentEmployeeStatus;
};
type ExternalStaff = {
  id: number;
  fullName: string;
  companyName: string;
  relationshipType: "Contratista" | "Proveedor";
};
type GeneralVisitor = {
  id: number;
  fullName: string;
};
type Host = {
  name: string;
  departmentId: number;
};
type Department = {
  id: number;
  name: string;
};
type SubjectType = "appointment" | "externalStaff" | "visitor" | "manual";
type LogResponse = {
  entries?: LogEntry[];
  summary?: LogSummary;
  hosts?: string[];
  total?: number;
  page?: number;
  pageSize?: number;
  pages?: number;
  error?: string;
};

const props = defineProps<{
  isAdmin: boolean;
  appointments: Appointment[];
  appointmentsLoading: boolean;
  externalStaff: ExternalStaff[];
  generalVisitors: GeneralVisitor[];
  hosts: Host[];
  departments: Department[];
  initialRange: { from: string; to: string } | null;
}>();
const emit = defineEmits<{
  movementSaved: [];
  openQr: [appointment: Appointment];
}>();

const today = ref(getLocalDate());
const fromDate = ref(props.initialRange?.from ?? today.value);
const toDate = ref(props.initialRange?.to ?? today.value);
const search = ref("");
const eventFilter = ref("");
const categoryFilter = ref("");
const hostFilter = ref("");
const departmentFilter = ref("");
const page = ref(1);
const pageSize = 10;
const entries = ref<LogEntry[]>([]);
const summary = ref<LogSummary>({
  movementCount: 0,
  insideNow: 0,
  pendingArrivals: 0,
  exits: 0,
});
const hosts = ref<string[]>([]);
const total = ref(0);
const pages = ref(1);
const loading = ref(false);
const saving = ref(false);
const exporting = ref(false);
const exportMessage = ref("");
const error = ref("");
const quickActionError = ref("");
const quickActionNotice = ref("");
const quickActionAppointmentId = ref<number | null>(null);
const quickActionEntryId = ref<number | null>(null);
const quickSearch = ref("");
const quickSearchInput = ref<HTMLInputElement | null>(null);
const referenceCodeOpen = ref(false);
const referenceCodeInputValue = ref("");
const referenceCodeInput = ref<HTMLInputElement | null>(null);
const scannerOpen = ref(false);
const scannerError = ref("");
const scannerVideo = ref<HTMLVideoElement | null>(null);
let scannerControls: { stop: () => void } | null = null;
const selectedQuickAppointmentId = ref<number | null>(null);
const selectedQuickExternalStaffId = ref<number | null>(null);
const selectedEntryId = ref<number | null>(null);
const quickObservation = ref("");
const quickStatusOverrides = ref<Record<number, Appointment["status"]>>({});
const appointmentEmployees = ref<AppointmentEmployee[]>([]);
const employeeRosterOpen = ref(false);
const employeeRosterLoading = ref(false);
const employeeRosterError = ref("");
const employeeRosterAppointmentId = ref<number | null>(null);
const employeeMovementId = ref<number | null>(null);
const dialogOpen = ref(false);
const logPersonType = ref<SubjectType>("appointment");
const logSubjectId = ref("");
const manualPerson = ref("");
const logDetails = ref("");
let requestVersion = 0;
let employeeRosterRequestVersion = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: number | undefined;

const todayAppointments = computed(() =>
  [...props.appointments]
    .filter((appointment) =>
      appointment.date === today.value &&
      appointment.status !== "Cancelada",
    )
    .sort((first, second) => `${first.time} ${first.visitor}`.localeCompare(`${second.time} ${second.visitor}`, "es")),
);
const filteredQuickAppointments = computed(() => {
  const query = quickSearch.value.trim().toLocaleLowerCase("es");
  if (!query) return todayAppointments.value;
  return todayAppointments.value.filter((appointment) =>
    [appointment.visitor, appointment.company, appointment.host, appointment.time]
      .some((value) => value.toLocaleLowerCase("es").includes(query)),
  );
});
const selectedQuickAppointment = computed(() =>
  todayAppointments.value.find((appointment) => appointment.id === selectedQuickAppointmentId.value) ?? null,
);
const selectedEntry = computed(() =>
  entries.value.find((entry) => entry.id === selectedEntryId.value) ?? null,
);
const selectedEntryAppointment = computed(() => {
  if (!selectedEntry.value?.appointmentId) return null;
  return props.appointments.find((appointment) => appointment.id === selectedEntry.value?.appointmentId) ?? null;
});
const selectedPerson = computed(() => selectedQuickAppointment.value ?? selectedEntry.value);
const selectedAppointment = computed(() => selectedQuickAppointment.value ?? selectedEntryAppointment.value);
const equipmentEntryChecklistPending = computed(() =>
  Boolean(
    selectedAppointment.value?.equipmentChecklistRequired &&
    !selectedAppointment.value.equipmentEntryChecklistComplete,
  ),
);
const selectedEntryStatus = computed(() => {
  return selectedEntry.value ? entryStatus(selectedEntry.value) : "";
});
const selectedPersonStatus = computed(() => {
  if (selectedQuickAppointment.value) return quickAppointmentStatus(selectedQuickAppointment.value);
  return selectedEntryAppointment.value
    ? quickAppointmentStatus(selectedEntryAppointment.value)
    : selectedEntryStatus.value;
});
const selectedPersonName = computed(() =>
  selectedQuickAppointment.value?.visitor ?? selectedEntry.value?.person ?? "",
);
const selectedPersonCompany = computed(() =>
  selectedQuickAppointment.value?.company ?? selectedEntry.value?.company ?? "",
);
const selectedPersonHost = computed(() =>
  selectedQuickAppointment.value?.host ?? selectedEntry.value?.host ?? "",
);
const selectedPersonDateTime = computed(() =>
  selectedQuickAppointment.value
    ? `${selectedQuickAppointment.value.date} · ${selectedQuickAppointment.value.time}`
    : selectedEntry.value
      ? `${selectedEntry.value.date} · ${selectedEntry.value.time}`
      : "",
);
const selectedAvailableMovements = computed<("Llegada" | "Ingreso" | "Retiro")[]>(() => {
  if (selectedEntry.value && selectedEntry.value.date !== getLocalDate()) return [];
  if (selectedPersonStatus.value === "Pendiente") return ["Llegada"];
  if (selectedPersonStatus.value === "En proceso") return ["Ingreso", "Retiro"];
  if (selectedPersonStatus.value === "Dentro") return ["Retiro"];
  return [];
});
const selectedExternalStaff = computed(() =>
  [...props.externalStaff].sort((first, second) => first.fullName.localeCompare(second.fullName, "es")),
);
const selectedVisitors = computed(() =>
  [...props.generalVisitors].sort((first, second) => first.fullName.localeCompare(second.fullName, "es")),
);
const departmentOptions = computed(() => {
  const hostDepartmentIds = new Set(props.hosts.map((host) => host.departmentId));
  return props.departments
    .filter((department) => hostDepartmentIds.has(department.id))
    .sort((first, second) => first.name.localeCompare(second.name, "es"));
});
const departmentHostNames = computed(() => {
  if (!departmentFilter.value) return [];
  const department = departmentOptions.value.find((item) => String(item.id) === departmentFilter.value);
  if (!department) return [];
  return props.hosts
    .filter((host) => host.departmentId === department.id)
    .map((host) => host.name);
});
const availableHosts = computed(() => {
  if (!departmentFilter.value) return hosts.value;
  const names = new Set(departmentHostNames.value);
  return hosts.value.filter((host) => names.has(host));
});
const groupedEntries = computed(() => {
  const groups = new Map<string, LogEntry[]>();
  for (const entry of entries.value) {
    const group = groups.get(entry.date) ?? [];
    group.push(entry);
    groups.set(entry.date, group);
  }
  return [...groups.entries()].map(([date, groupEntries]) => ({ date, entries: groupEntries }));
});
const recentEntries = computed(() => entries.value.slice(0, 6));
const rangeLabel = computed(() => {
  if (fromDate.value === toDate.value) return formatDate(fromDate.value);
  return `${formatDate(fromDate.value)} — ${formatDate(toDate.value)}`;
});

watch(
  () => props.appointments,
  (appointments) => {
    for (const appointment of appointments) {
      if (quickStatusOverrides.value[appointment.id] === appointment.status) {
        delete quickStatusOverrides.value[appointment.id];
      }
    }
  },
);

function quickAppointmentStatus(appointment: Appointment) {
  return quickStatusOverrides.value[appointment.id] ?? appointment.status;
}

function entryStatus(entry: LogEntry) {
  const samePerson = (candidate: LogEntry) => {
    if (candidate.appointmentId !== entry.appointmentId) return false;
    if (entry.externalStaffId !== null) return candidate.externalStaffId === entry.externalStaffId;
    if (entry.visitorRecordId !== null) return candidate.visitorRecordId === entry.visitorRecordId;
    return candidate.externalStaffId === null &&
      candidate.visitorRecordId === null &&
      candidate.person.trim().toLocaleLowerCase("es") === entry.person.trim().toLocaleLowerCase("es");
  };
  const movement = entry.event === "Observaciones"
    ? entries.value
      .filter((candidate) =>
        samePerson(candidate) &&
        (candidate.event === "Llegada" || candidate.event === "Ingreso" || candidate.event === "Retiro"),
      )
      .sort((first, second) =>
        `${second.date} ${second.time} ${second.id}`.localeCompare(`${first.date} ${first.time} ${first.id}`),
      )[0]?.event
    : entry.event;
  if (movement === "Ingreso") return "Dentro";
  if (movement === "Retiro") return "Retirado";
  if (movement === "Llegada") return "En proceso";
  if (entry.event === "Observaciones") {
    const appointment = appointmentForEntry(entry);
    if (appointment) return quickAppointmentStatus(appointment);
  }
  return "Pendiente";
}

function appointmentForEntry(entry: LogEntry) {
  if (entry.appointmentId === null) return null;
  return props.appointments.find((appointment) => appointment.id === entry.appointmentId) ?? null;
}

function openEntryQr(entry: LogEntry) {
  const appointment = appointmentForEntry(entry);
  if (appointment) emit("openQr", appointment);
}

function getLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function refreshLocalDate() {
  today.value = getLocalDate();
}

function getLocalTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

function eventIcon(event: LogEventType) {
  if (event === "Llegada") return "M12 3v12m0 0 4-4m-4 4-4-4M5 21h14";
  if (event === "Ingreso") return "M4 12h15m0 0-5-5m5 5-5 5M4 5v14";
  if (event === "Retiro") return "M20 12H5m0 0 5-5m-5 5 5 5M20 5v14";
  return "M12 8v4m0 4h.01M5 4h14v16H5z";
}

function eventVerb(event: LogEventType) {
  if (event === "Observaciones") return "Observación registrada";
  if (event === "Llegada") return "Llegada registrada";
  if (event === "Ingreso") return "Entrada registrada";
  return "Retiro registrado";
}

function departmentForHost(hostName: string) {
  const host = props.hosts.find((candidate) => candidate.name === hostName);
  return props.departments.find((department) => department.id === host?.departmentId)?.name ?? "";
}

function requestUrl() {
  const query = new URLSearchParams({
    from: fromDate.value,
    to: toDate.value,
    q: search.value.trim(),
    event: eventFilter.value,
    category: categoryFilter.value,
    page: String(page.value),
    pageSize: String(pageSize),
  });
  if (departmentFilter.value) {
    const matchingHosts = hostFilter.value && departmentHostNames.value.includes(hostFilter.value)
      ? [hostFilter.value]
      : departmentHostNames.value;
    for (const host of matchingHosts.length > 0 ? matchingHosts : ["__no_department_match__"]) {
      query.append("host", host);
    }
  } else if (hostFilter.value) {
    query.append("host", hostFilter.value);
  }
  return `/api/daily-log?${query.toString()}`;
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  const safeText = /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

async function exportLog() {
  if (exporting.value) return;
  if (!fromDate.value || !toDate.value || fromDate.value > toDate.value) {
    notifyUser("Selecciona un rango de fechas válido para exportar.");
    return;
  }
  exporting.value = true;
  exportMessage.value = "";
  try {
    const exportUrl = new URL(requestUrl(), window.location.origin);
    exportUrl.searchParams.set("page", "1");
    exportUrl.searchParams.set("pageSize", "100");
    const firstResponse = await fetch(exportUrl);
    const firstResult = await firstResponse.json() as LogResponse;
    if (!firstResponse.ok) throw new Error(firstResult.error ?? "No se pudo exportar la bitácora.");
    if (!Array.isArray(firstResult.entries) || !Number.isSafeInteger(firstResult.pages) || !firstResult.pages) {
      throw new Error("El servidor devolvió datos incompletos para exportar la bitácora.");
    }

    const exportEntries = [...firstResult.entries];
    for (let exportPage = 2; exportPage <= firstResult.pages; exportPage += 1) {
      exportUrl.searchParams.set("page", String(exportPage));
      const response = await fetch(exportUrl);
      const result = await response.json() as LogResponse;
      if (!response.ok) throw new Error(result.error ?? `No se pudo cargar la página ${exportPage} de la bitácora.`);
      if (!Array.isArray(result.entries)) {
        throw new Error(`El servidor devolvió datos incompletos en la página ${exportPage}.`);
      }
      exportEntries.push(...result.entries);
    }
    if (exportEntries.length === 0) {
      notifyUser("No hay movimientos en el rango y filtros seleccionados.", "info");
      return;
    }

    const columns: Array<keyof LogEntry> = [
      "date", "time", "event", "person", "company", "host", "category", "details",
      ...(props.isAdmin ? ["actorName" as const] : []),
    ];
    const headings = [
      "Fecha", "Hora", "Movimiento", "Persona", "Empresa", "Anfitrión", "Categoría", "Detalles",
      ...(props.isAdmin ? ["Registró / autorizó"] : []),
    ];
    const csvRows = [
      headings.map(csvCell).join(","),
      ...exportEntries.map((entry) => columns.map((column) => csvCell(entry[column])).join(",")),
    ];
    const blob = new Blob(["\uFEFF", csvRows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `bitacora-${fromDate.value}-${toDate.value}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    notifyUser(`Se exportaron ${exportEntries.length} movimientos.`, "success");
  } catch (cause) {
    console.error("Failed to export daily log:", cause);
    notifyUser(cause instanceof Error ? cause.message : "No se pudo exportar la bitácora.");
  } finally {
    exporting.value = false;
  }
}

async function loadEntries() {
  if (!fromDate.value || !toDate.value || fromDate.value > toDate.value) {
    error.value = "Selecciona un rango de fechas válido.";
    entries.value = [];
    return;
  }
  const currentRequest = ++requestVersion;
  loading.value = true;
  error.value = "";
  try {
    const response = await fetch(requestUrl());
    const result = await response.json() as LogResponse;
    if (currentRequest !== requestVersion) return;
    if (!response.ok) {
      error.value = result.error ?? "No se pudo cargar la bitácora.";
      entries.value = [];
      return;
    }
    if (!Array.isArray(result.entries) || !result.summary || !Array.isArray(result.hosts)) {
      console.error("La API devolvió una bitácora con formato inválido.");
      error.value = "El servidor devolvió datos de bitácora incompletos.";
      entries.value = [];
      return;
    }
    entries.value = result.entries;
    summary.value = result.summary;
    hosts.value = result.hosts;
    total.value = result.total ?? result.entries.length;
    pages.value = result.pages ?? 1;
  } catch (cause) {
    console.error("Failed to load daily log:", cause);
    if (currentRequest === requestVersion) {
      error.value = "No se pudo conectar con el servidor para cargar la bitácora.";
      entries.value = [];
    }
  } finally {
    if (currentRequest === requestVersion) loading.value = false;
  }
}

function openCreateDialog() {
  logPersonType.value = props.generalVisitors.length > 0 ? "visitor" : "manual";
  logSubjectId.value = "";
  manualPerson.value = "";
  logDetails.value = "";
  dialogOpen.value = true;
}

function changePersonType(value: SubjectType) {
  logPersonType.value = value;
  logSubjectId.value = "";
  manualPerson.value = "";
}

async function submitEntry() {
  if (saving.value) return;
  if (logPersonType.value === "manual" && !manualPerson.value.trim()) {
    notifyUser("Escribe el nombre de la persona.");
    return;
  }
  if (logPersonType.value !== "manual" && !logSubjectId.value) {
    notifyUser("Selecciona la cita o ficha de la persona.");
    return;
  }
  const selectedId = Number(logSubjectId.value);
  const payload = {
    event: "Llegada" as const,
    date: getLocalDate(),
    time: getLocalTime(),
    personName: logPersonType.value === "manual" ? manualPerson.value.trim() : "",
    details: logDetails.value.trim(),
    appointmentId: logPersonType.value === "appointment" ? selectedId : null,
    externalStaffId: logPersonType.value === "externalStaff" ? selectedId : null,
    visitorRecordId: logPersonType.value === "visitor" ? selectedId : null,
  };
  saving.value = true;
  error.value = "";
  try {
    const response = await fetch("/api/daily-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json() as {
      message?: string;
      error?: string;
      personName?: string;
      duplicate?: boolean;
    };
    if (!response.ok) {
      notifyUser(result.error ?? "No se pudo guardar el movimiento.");
      return;
    }
    dialogOpen.value = false;
    selectedQuickAppointmentId.value = null;
    selectedEntryId.value = null;
    quickSearch.value = "";
    quickObservation.value = "";
    const successMessage = result.duplicate
      ? `${result.personName ?? "La persona"} ya tenía su llegada registrada.`
      : `Llegada registrada para ${result.personName ?? "la persona"}.`;
    notifyUser(successMessage, result.duplicate ? "info" : "success");
    fromDate.value = payload.date;
    toDate.value = payload.date;
    page.value = 1;
    await loadEntries();
    const savedPersonName = result.personName?.trim().toLocaleLowerCase("es");
    const savedEntry = entries.value.find((entry) =>
      entry.event === "Llegada" &&
      entry.date === payload.date &&
      entry.person.trim().toLocaleLowerCase("es") === savedPersonName,
    );
    if (savedEntry) selectedEntryId.value = savedEntry.id;
    emit("movementSaved");
    logSubjectId.value = "";
    manualPerson.value = "";
    logDetails.value = "";
    await nextTick();
    quickSearchInput.value?.focus();
  } catch (cause) {
    console.error("Failed to save daily log movement:", cause);
    notifyUser("No se pudo conectar con el servidor para guardar el movimiento.");
  } finally {
    saving.value = false;
  }
}

function selectQuickAppointment(appointment: Appointment) {
  selectedQuickAppointmentId.value = appointment.id;
  selectedQuickExternalStaffId.value = null;
  selectedEntryId.value = null;
  clearAppointmentEmployees();
  quickActionError.value = "";
  quickActionNotice.value = "";
  quickObservation.value = "";
  quickSearch.value = appointment.visitor;
}

function clearAppointmentEmployees() {
  employeeRosterRequestVersion += 1;
  employeeRosterOpen.value = false;
  employeeRosterLoading.value = false;
  appointmentEmployees.value = [];
  employeeRosterAppointmentId.value = null;
  employeeRosterError.value = "";
}

async function openReferenceCodeEntry() {
  referenceCodeOpen.value = true;
  referenceCodeInputValue.value = "";
  quickActionError.value = "";
  quickActionNotice.value = "";
  await nextTick();
  referenceCodeInput.value?.focus();
}

function submitReferenceCode() {
  const referenceCode = referenceCodeInputValue.value.trim();
  if (!/^\d{8}$/.test(referenceCode)) {
    notifyUser("El código de referencia debe contener 8 dígitos.");
    return;
  }
  const appointment = todayAppointments.value.find(
    (candidate) => candidate.referenceCode === referenceCode,
  );
  if (!appointment) {
    notifyUser("No encontramos una cita de hoy con ese código de referencia.");
    return;
  }
  selectQuickAppointment(appointment);
  referenceCodeOpen.value = false;
  referenceCodeInputValue.value = "";
}

async function openQrScanner() {
  if (scannerOpen.value) return;
  scannerOpen.value = true;
  scannerError.value = "";
  quickActionError.value = "";
  await nextTick();
  const video = scannerVideo.value;
  if (!video) {
    scannerOpen.value = false;
    notifyUser("No se pudo iniciar la vista de la cámara.");
    return;
  }
  try {
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const qrReader = new BrowserQRCodeReader();
    const controls = await qrReader.decodeFromConstraints(
      { video: { facingMode: { ideal: "environment" } } },
      video,
      (result, _decodeError, callbackControls) => {
        if (!result || !scannerOpen.value) return;
        const decodedText = result.getText();
        callbackControls.stop();
        scannerControls = null;
        scannerOpen.value = false;
        quickSearch.value = decodedText;
        void handleQuickSearchEnter();
      },
    );
    scannerControls = controls;
    if (!scannerOpen.value) {
      controls.stop();
      scannerControls = null;
    }
  } catch (cause) {
    console.error("Failed to start the appointment QR camera scanner:", cause);
    const message = cause instanceof Error && cause.name === "NotAllowedError"
      ? "No se concedió permiso para usar la cámara. Puedes introducir el código manualmente."
      : "No se pudo acceder a la cámara. Verifica los permisos y que la página use HTTPS.";
    notifyUser(message);
    scannerOpen.value = false;
  }
}

function closeQrScanner() {
  scannerOpen.value = false;
  scannerControls?.stop();
  scannerControls = null;
}

function movementIsAvailable(event: "Llegada" | "Ingreso" | "Retiro", appointment: Appointment) {
  const status = quickAppointmentStatus(appointment);
  if (status === "Cancelada" || status === "Retirado") return false;
  if (event === "Llegada") return status === "Pendiente";
  if (event === "Ingreso") {
    return (
      (status === "Pendiente" || status === "En proceso") &&
      (!appointment.equipmentChecklistRequired || appointment.equipmentEntryChecklistComplete)
    );
  }
  return status === "Dentro" || status === "En proceso";
}

async function saveQuickMovement(
  event: "Llegada" | "Ingreso" | "Retiro",
  appointment = selectedQuickAppointment.value ?? selectedEntryAppointment.value,
) {
  if (!appointment || quickActionAppointmentId.value !== null || !movementIsAvailable(event, appointment)) return;
  const operationDate = getLocalDate();
  today.value = operationDate;
  quickActionAppointmentId.value = appointment.id;
  quickActionError.value = "";
  quickActionNotice.value = "";
  try {
    const response = await fetch("/api/daily-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        date: operationDate,
        time: getLocalTime(),
        personName: "",
        appointmentId: appointment.id,
        details: quickObservation.value.trim(),
      }),
    });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) {
      notifyUser(result.error ?? "No se pudo actualizar el estado de la visita.");
      return;
    }
    quickStatusOverrides.value[appointment.id] = event === "Ingreso"
      ? "Dentro"
      : event === "Retiro"
        ? "Retirado"
        : "En proceso";
    selectedQuickAppointmentId.value = appointment.id;
    selectedEntryId.value = null;
    quickSearch.value = appointment.visitor;
    quickObservation.value = "";
    notifyUser(
      `${appointment.visitor}: ${event === "Llegada" ? "llegada registrada" : event === "Ingreso" ? "entrada registrada" : "retiro registrado"}.`,
      "success",
    );
    fromDate.value = operationDate;
    toDate.value = operationDate;
    search.value = "";
    eventFilter.value = "";
    categoryFilter.value = "";
    hostFilter.value = "";
    departmentFilter.value = "";
    page.value = 1;
    await loadEntries();
    emit("movementSaved");
  } catch (cause) {
    console.error("Failed to update visit status:", cause);
    notifyUser("No se pudo conectar con el servidor. Intenta de nuevo.");
  } finally {
    quickActionAppointmentId.value = null;
    await nextTick();
    quickSearchInput.value?.focus();
  }
}

function selectEntry(entry: LogEntry) {
  selectedEntryId.value = entry.id;
  selectedQuickAppointmentId.value = null;
  clearAppointmentEmployees();
  quickActionError.value = "";
  quickActionNotice.value = "";
  quickObservation.value = "";
}

async function saveSelectedEntryMovement(event: "Llegada" | "Ingreso" | "Retiro") {
  const entry = selectedEntry.value;
  if (!entry || quickActionEntryId.value !== null || !selectedAvailableMovements.value.includes(event)) return;
  if (selectedEntryAppointment.value) {
    await saveQuickMovement(event, selectedEntryAppointment.value);
    return;
  }

  const operationDate = getLocalDate();
  today.value = operationDate;
  quickActionEntryId.value = entry.id;
  quickActionError.value = "";
  quickActionNotice.value = "";
  try {
    const response = await fetch("/api/daily-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        date: operationDate,
        time: getLocalTime(),
        personName: entry.person,
        details: quickObservation.value.trim(),
        appointmentId: entry.appointmentId,
        externalStaffId: entry.externalStaffId,
        visitorRecordId: entry.visitorRecordId,
      }),
    });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) {
      notifyUser(result.error ?? "No se pudo actualizar el estado de la visita.");
      return;
    }

    quickObservation.value = "";
    notifyUser(
      `${entry.person}: ${event === "Llegada" ? "llegada registrada" : event === "Ingreso" ? "entrada registrada" : "retiro registrado"}.`,
      "success",
    );
    fromDate.value = operationDate;
    toDate.value = operationDate;
    search.value = "";
    eventFilter.value = "";
    categoryFilter.value = "";
    hostFilter.value = "";
    departmentFilter.value = "";
    page.value = 1;
    await loadEntries();
    const refreshedEntry = entries.value.find((candidate) =>
      candidate.person.trim().toLocaleLowerCase("es") === entry.person.trim().toLocaleLowerCase("es") &&
      candidate.event === event,
    );
    if (refreshedEntry) selectedEntryId.value = refreshedEntry.id;
    emit("movementSaved");
  } catch (cause) {
    console.error("Failed to update selected visit status:", cause);
    notifyUser("No se pudo conectar con el servidor. Intenta de nuevo.");
  } finally {
    quickActionEntryId.value = null;
  }
}

function employeeMovements(employee: AppointmentEmployee): ("Llegada" | "Ingreso" | "Retiro")[] {
  if (employee.status === "Pendiente") return ["Llegada"];
  if (employee.status === "En proceso") return ["Ingreso", "Retiro"];
  if (employee.status === "Dentro") return ["Retiro"];
  return [];
}

async function loadAppointmentEmployees(appointment: Appointment) {
  const currentRequest = ++employeeRosterRequestVersion;
  employeeRosterLoading.value = true;
  employeeRosterError.value = "";
  try {
    const response = await fetch(`/api/appointments/${appointment.id}/employees`);
    const result = await response.json() as {
      employees?: Array<{ id: number; fullName: string; status: AppointmentEmployeeStatus }>;
      error?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "No se pudo cargar el personal de la empresa.");
    if (
      !Array.isArray(result.employees) ||
      result.employees.some((employee) =>
        !Number.isSafeInteger(employee.id) ||
        typeof employee.fullName !== "string" ||
        !["Pendiente", "En proceso", "Dentro", "Retirado"].includes(employee.status),
      )
    ) {
      throw new Error("El servidor devolvió una lista de empleados inválida.");
    }
    if (currentRequest !== employeeRosterRequestVersion || selectedAppointment.value?.id !== appointment.id) return;
    appointmentEmployees.value = result.employees;
    employeeRosterAppointmentId.value = appointment.id;
  } catch (cause) {
    console.error("Failed to load appointment employees:", cause);
    if (currentRequest === employeeRosterRequestVersion && selectedAppointment.value?.id === appointment.id) {
      employeeRosterError.value =
        cause instanceof Error ? cause.message : "No se pudo cargar el personal de la empresa.";
    }
  } finally {
    if (currentRequest === employeeRosterRequestVersion) employeeRosterLoading.value = false;
  }
}

async function toggleAppointmentEmployees() {
  const appointment = selectedAppointment.value;
  if (
    !appointment ||
    appointment.businessPartnerId == null ||
    (appointment.partnerType !== "Contratista" && appointment.partnerType !== "Proveedor")
  ) return;
  if (employeeRosterOpen.value && employeeRosterAppointmentId.value === appointment.id) {
    employeeRosterOpen.value = false;
    return;
  }
  employeeRosterOpen.value = true;
  await loadAppointmentEmployees(appointment);
}

async function saveEmployeeMovement(
  appointment: Appointment,
  employee: AppointmentEmployee,
  event: "Llegada" | "Ingreso" | "Retiro",
) {
  if (
    employeeMovementId.value !== null ||
    quickActionAppointmentId.value !== null ||
    quickActionEntryId.value !== null ||
    !employeeMovements(employee).includes(event)
  ) return;
  const operationDate = getLocalDate();
  employeeMovementId.value = employee.id;
  employeeRosterError.value = "";
  try {
    const response = await fetch("/api/daily-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        date: operationDate,
        time: getLocalTime(),
        personName: "",
        details: quickObservation.value.trim(),
        appointmentId: appointment.id,
        externalStaffId: employee.id,
      }),
    });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? "No se pudo registrar el movimiento del empleado.");
    quickObservation.value = "";
    notifyUser(
      `${employee.fullName}: ${event === "Llegada" ? "llegada registrada" : event === "Ingreso" ? "entrada registrada" : "salida registrada"}.`,
      "success",
    );
    fromDate.value = operationDate;
    toDate.value = operationDate;
    page.value = 1;
    await loadEntries();
    await loadAppointmentEmployees(appointment);
    emit("movementSaved");
  } catch (cause) {
    console.error("Failed to save appointment employee movement:", cause);
    notifyUser(cause instanceof Error ? cause.message : "No se pudo registrar el movimiento del empleado.");
  } finally {
    employeeMovementId.value = null;
  }
}

async function handleQuickSearchEnter() {
  if (quickActionAppointmentId.value !== null || quickActionEntryId.value !== null) return;
  quickActionError.value = "";
  quickActionNotice.value = "";
  selectedQuickAppointmentId.value = null;
  selectedEntryId.value = null;
  refreshLocalDate();
  const value = quickSearch.value.trim();
  if (!value) return;

  let scannedAppointmentId: number | null = null;
  let scannedExternalStaffId: number | null = null;
  let scannedReferenceCode = "";
  try {
    const scannedValue: unknown = JSON.parse(value);
    if (
      typeof scannedValue === "object" &&
      scannedValue !== null &&
      "type" in scannedValue &&
      scannedValue.type === "visitas-appointment" &&
      "id" in scannedValue &&
      typeof scannedValue.id === "number" &&
      Number.isSafeInteger(scannedValue.id)
    ) {
      scannedAppointmentId = scannedValue.id;
    }
    if (
      typeof scannedValue === "object" &&
      scannedValue !== null &&
      "type" in scannedValue &&
      scannedValue.type === "visitas-appointment" &&
      "externalStaffId" in scannedValue &&
      typeof scannedValue.externalStaffId === "number" &&
      Number.isSafeInteger(scannedValue.externalStaffId) &&
      scannedValue.externalStaffId > 0
    ) {
      scannedExternalStaffId = scannedValue.externalStaffId;
    }
    if (
      typeof scannedValue === "object" &&
      scannedValue !== null &&
      "type" in scannedValue &&
      scannedValue.type === "visitas-appointment" &&
      "referenceCode" in scannedValue &&
      typeof scannedValue.referenceCode === "string"
    ) {
      scannedReferenceCode = scannedValue.referenceCode;
    }
  } catch {
    // Non-JSON input is treated as a name search.
  }

  if (scannedAppointmentId !== null || scannedReferenceCode) {
    const appointment = todayAppointments.value.find((item) =>
      (scannedAppointmentId !== null && item.id === scannedAppointmentId) ||
      (scannedReferenceCode !== "" && item.referenceCode === scannedReferenceCode),
    );
    if (!appointment) {
      notifyUser("Este QR no corresponde a una cita de hoy o la visita está cancelada.");
      return;
    }
    selectQuickAppointment(appointment);
    if (scannedExternalStaffId !== null) {
      selectedQuickExternalStaffId.value = scannedExternalStaffId;
      employeeRosterOpen.value = true;
      await loadAppointmentEmployees(appointment);
      if (
        !employeeRosterError.value &&
        !appointmentEmployees.value.some((employee) => employee.id === scannedExternalStaffId)
      ) {
        selectedQuickExternalStaffId.value = null;
        notifyUser("El QR identifica un empleado que ya no está registrado en esta empresa.");
      }
    }
    return;
  }

  if (/^\d{8}$/.test(value)) {
    const appointment = todayAppointments.value.find((item) => item.referenceCode === value);
    if (!appointment) {
      notifyUser("No encontramos una cita de hoy con ese código de referencia.");
      return;
    }
    selectQuickAppointment(appointment);
    return;
  }

  if (filteredQuickAppointments.value.length === 1) {
    selectQuickAppointment(filteredQuickAppointments.value[0]);
  } else if (filteredQuickAppointments.value.length > 1) {
    quickActionNotice.value = "Selecciona a la persona correcta de la lista.";
  } else {
    notifyUser("No encontramos una cita de hoy con ese nombre o empresa.");
  }
}

async function removeEntry(entry: LogEntry) {
  if (!window.confirm(`¿Eliminar el movimiento de ${entry.person}? Esta acción no se puede deshacer.`)) {
    return;
  }
  try {
    const response = await fetch(`/api/daily-log/${entry.id}`, { method: "DELETE" });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) {
      notifyUser(result.error ?? "No se pudo eliminar el movimiento.");
      return;
    }
    notifyUser(result.message ?? "El movimiento se eliminó correctamente.", "success");
    await loadEntries();
  } catch (cause) {
    console.error("Failed to delete daily log movement:", cause);
    notifyUser("No se pudo conectar con el servidor para eliminar el movimiento.");
  }
}

function resetFilters() {
  fromDate.value = today.value;
  toDate.value = today.value;
  search.value = "";
  eventFilter.value = "";
  categoryFilter.value = "";
  hostFilter.value = "";
  departmentFilter.value = "";
  page.value = 1;
}

function showRecentHistory() {
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const offset = start.getTimezoneOffset() * 60_000;
  fromDate.value = new Date(start.getTime() - offset).toISOString().slice(0, 10);
  toDate.value = today.value;
  page.value = 1;
}

watch([fromDate, toDate, eventFilter, categoryFilter, hostFilter, departmentFilter], () => {
  page.value = 1;
  void loadEntries();
});
watch(page, () => void loadEntries());
watch(search, () => {
  page.value = 1;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadEntries(), 250);
});
onMounted(() => {
  void loadEntries();
  quickSearchInput.value?.focus();
  refreshTimer = window.setInterval(() => {
    if (
      document.visibilityState === "visible" &&
      !loading.value &&
      fromDate.value &&
      toDate.value &&
      fromDate.value <= toDate.value
    ) {
      void loadEntries();
    }
  }, 30000);
});

onBeforeUnmount(() => {
  requestVersion += 1;
  if (searchTimer) clearTimeout(searchTimer);
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
  closeQrScanner();
});
</script>

<template>
  <section class="daily-log-page" aria-label="Bitácora de movimientos">
    <VisitorKioskReceptionSection />
    <header class="daily-log-header">
      <div class="daily-log-header-actions">
        <div class="daily-log-date-range" aria-label="Rango de fechas">
          <label>
            <span>Desde</span>
            <input v-model="fromDate" type="date" aria-label="Fecha inicial de la bitácora" />
          </label>
          <span class="daily-log-date-separator" aria-hidden="true">—</span>
          <label>
            <span>Hasta</span>
            <input v-model="toDate" type="date" aria-label="Fecha final de la bitácora" />
          </label>
        </div>
        <button class="daily-log-secondary-button" type="button" @click="showRecentHistory">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5m4-1v5l3 2" /></svg>
          Historial
        </button>
        <button class="daily-log-secondary-button daily-log-export-button" type="button" :disabled="exporting" @click="exportLog">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v4h14v-4" /></svg>
          {{ exporting ? "Exportando..." : "Exportar CSV" }}
        </button>
        <button class="daily-log-primary-button" type="button" @click="openCreateDialog">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Registrar movimiento
        </button>
      </div>
    </header>
    <p v-if="exportMessage" class="daily-log-export-message" :role="exportMessage.startsWith('Se exportaron') ? 'status' : 'alert'">
      {{ exportMessage }}
    </p>

    <div class="daily-log-summary" aria-label="Resumen de movimientos">
      <article class="daily-log-stat daily-log-stat-events">
        <span class="daily-log-stat-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v17H5zM8 8h8M8 12h8M8 16h5" /><path d="M8 2v4m8-4v4" /></svg>
        </span>
        <div>
          <span class="daily-log-stat-label">Movimientos del periodo</span>
          <strong>{{ summary.movementCount }}</strong>
          <small>{{ rangeLabel }}</small>
        </div>
      </article>
      <article class="daily-log-stat daily-log-stat-inside">
        <span class="daily-log-stat-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V8l9-5 9 5v13M8 21v-6h8v6M8 10h.01M12 10h.01M16 10h.01" /></svg>
        </span>
        <div>
          <span class="daily-log-stat-label">Personas dentro ahora</span>
          <strong>{{ summary.insideNow }}</strong>
          <small>Ingresos vigentes, sin retiro posterior</small>
        </div>
      </article>
      <article class="daily-log-stat daily-log-stat-pending">
        <span class="daily-log-stat-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        </span>
        <div>
          <span class="daily-log-stat-label">Llegadas pendientes</span>
          <strong>{{ summary.pendingArrivals }}</strong>
          <small>Citas sin ingreso completado</small>
        </div>
      </article>
      <article class="daily-log-stat daily-log-stat-exits">
        <span class="daily-log-stat-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5m3-4 4-4-4-4m4 4H8" /></svg>
        </span>
        <div>
          <span class="daily-log-stat-label">Retiros registrados</span>
          <strong>{{ summary.exits }}</strong>
          <small>En el periodo seleccionado</small>
        </div>
      </article>
    </div>

    <div class="daily-log-workspace">
      <div class="daily-log-main-column">
        <section class="daily-log-quick-panel" aria-labelledby="daily-log-quick-title">
          <div class="daily-log-quick-heading">
            <div>
              <span class="daily-log-panel-kicker">ACCESO RÁPIDO</span>
              <h3 id="daily-log-quick-title">Registro rápido</h3>
              <p>Escanea el QR de la cita con el lector o busca por nombre o empresa.</p>
            </div>
            <div class="daily-log-quick-heading-actions">
              <button class="daily-log-secondary-button" type="button" @click="openReferenceCodeEntry">
                Introducir código
              </button>
              <button
                class="daily-log-secondary-button daily-log-mobile-scan-button"
                type="button"
                :disabled="scannerOpen"
                @click="openQrScanner"
              >
                Escanear QR
              </button>
              <button class="daily-log-primary-button" type="button" @click="openCreateDialog">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Nuevo registro
              </button>
            </div>
          </div>
          <form
            v-if="referenceCodeOpen"
            class="daily-log-reference-code-form"
            @submit.prevent="submitReferenceCode"
          >
            <label for="daily-log-reference-code">Código de referencia de la cita</label>
            <div>
              <input
                id="daily-log-reference-code"
                ref="referenceCodeInput"
                v-model.trim="referenceCodeInputValue"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                maxlength="8"
                pattern="[0-9]{8}"
                placeholder="00000000"
                aria-describedby="daily-log-reference-code-help"
                required
              />
              <button class="daily-log-secondary-button" type="submit">Buscar código</button>
            </div>
            <small id="daily-log-reference-code-help">Introduce los 8 dígitos que aparecen en el pase de visita.</small>
          </form>
          <div v-if="scannerOpen" class="daily-log-qr-scanner">
            <video ref="scannerVideo" autoplay muted playsinline aria-label="Vista de la cámara para escanear el QR"></video>
            <p>Centra el código QR de la cita dentro del recuadro.</p>
            <button class="daily-log-secondary-button" type="button" @click="closeQrScanner">Cerrar cámara</button>
          </div>
          <p v-if="scannerError" class="daily-log-quick-error" role="alert">{{ scannerError }}</p>
          <label class="daily-log-quick-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 12h10" /></svg>
            <input
              ref="quickSearchInput"
              v-model="quickSearch"
              type="search"
              placeholder="Buscar por nombre o empresa, o escanear QR…"
              aria-label="Buscar cita o escanear QR"
              :disabled="appointmentsLoading"
              @input="selectedQuickAppointmentId = null; selectedEntryId = null; quickActionError = ''; quickActionNotice = ''"
              @keydown.enter.prevent="handleQuickSearchEnter"
            />
            <span>Enter</span>
          </label>
          <div v-if="quickSearch.trim() && filteredQuickAppointments.length" class="daily-log-quick-list">
            <button
              v-for="appointment in filteredQuickAppointments"
              :key="appointment.id"
              class="daily-log-quick-visitor"
              :class="{ 'daily-log-quick-visitor-selected': selectedQuickAppointmentId === appointment.id }"
              type="button"
              @click="selectQuickAppointment(appointment)"
            >
              <span class="daily-log-quick-status" :class="`daily-log-quick-status-${quickAppointmentStatus(appointment).toLowerCase().replace(' ', '-')}`">
                {{ quickAppointmentStatus(appointment) }}
              </span>
              <span class="daily-log-quick-person">
                <strong>{{ appointment.visitor }}</strong>
                <span>{{ appointment.time }}<template v-if="appointment.company"> · {{ appointment.company }}</template></span>
              </span>
              <span class="daily-log-quick-select">{{ selectedQuickAppointmentId === appointment.id ? "Seleccionada" : "Seleccionar" }}</span>
            </button>
          </div>
          <p v-else-if="quickSearch.trim() && !appointmentsLoading" class="daily-log-quick-empty">
            No encontramos una cita con “{{ quickSearch }}”. Para visitas sin cita usa Nuevo registro.
          </p>
          <p v-else class="daily-log-quick-empty">
            {{ appointmentsLoading ? "Cargando citas…" : `${todayAppointments.length} citas programadas para hoy` }}
          </p>
          <p v-if="quickActionNotice" class="daily-log-quick-notice" role="status">{{ quickActionNotice }}</p>
          <p v-if="quickActionError" class="daily-log-quick-error" role="alert">{{ quickActionError }}</p>
        </section>

        <div v-if="error" class="daily-log-error" role="alert">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5m0 3h.01" /></svg>
          <span>{{ error }}</span>
          <button type="button" @click="loadEntries">Reintentar</button>
        </div>

        <section class="daily-log-panel" aria-labelledby="daily-log-activity-title">
          <div class="daily-log-panel-heading">
            <div>
              <span class="daily-log-panel-kicker">REGISTRO OPERATIVO</span>
              <h3 id="daily-log-activity-title">Movimientos del periodo</h3>
            </div>
            <span class="daily-log-result-count">{{ total }} {{ total === 1 ? "registro" : "registros" }}</span>
          </div>

          <form class="daily-log-filters" @submit.prevent="page = 1; loadEntries()">
            <label class="daily-log-search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
              <input v-model.trim="search" type="search" placeholder="Buscar por nombre, empresa o teléfono…" aria-label="Buscar persona, empresa o anfitrión" />
            </label>
            <label>
              <span class="sr-only">Filtrar por movimiento</span>
              <select v-model="eventFilter" aria-label="Filtrar por movimiento">
                <option value="">Todos los tipos</option>
                <option value="Llegada">Llegadas</option>
                <option value="Ingreso">Entradas</option>
                <option value="Retiro">Salidas</option>
                <option value="Observaciones">Observaciones</option>
              </select>
            </label>
            <button class="daily-log-reset-button" type="button" @click="resetFilters">Limpiar filtros</button>
          </form>

          <div v-if="loading && entries.length === 0" class="daily-log-loading" role="status">
            <span class="daily-log-spinner"></span>
            Cargando movimientos guardados…
          </div>
          <div v-else-if="error" class="daily-log-loading" role="status">
            Revisa el mensaje anterior para volver a cargar el registro.
          </div>
          <div v-else-if="!loading && entries.length === 0" class="daily-log-empty">
            <span class="daily-log-empty-icon">
              <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5 8 11v12c0 9 6.8 15.7 16 20 9.2-4.3 16-11 16-20V11L24 5Z" /><path d="M17 24h14m-7-7v14" /></svg>
            </span>
            <h4>{{ total === 0 && !search && !eventFilter && !categoryFilter && !hostFilter ? "Sin movimientos registrados" : "No encontramos resultados" }}</h4>
            <p>{{ total === 0 && !search && !eventFilter && !categoryFilter && !hostFilter ? "Todavía no hay actividad registrada para este periodo." : "Prueba con otra búsqueda o limpia los filtros para consultar más movimientos." }}</p>
          </div>
          <div v-else class="daily-log-table-scroll">
            <table class="daily-log-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Visitante</th>
                  <th>Empresa / área</th>
                  <th>Anfitrión</th>
                  <th v-if="isAdmin">Registró / autorizó</th>
                  <th>Estado</th>
                  <th>QR</th>
                  <th><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in entries"
                  :key="entry.id"
                  :class="{ 'is-selected': selectedEntryId === entry.id }"
                  :aria-selected="selectedEntryId === entry.id"
                  tabindex="0"
                  @click="selectEntry(entry)"
                  @keydown.enter.prevent="selectEntry(entry)"
                  @keydown.space.prevent="selectEntry(entry)"
                >
                  <td class="daily-log-table-time">{{ entry.time }}</td>
                  <td>
                    <span class="daily-log-table-event" :class="`is-${entry.event.toLowerCase()}`">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="eventIcon(entry.event)" /></svg>
                      {{ entry.event === "Ingreso" ? "Entrada" : entry.event === "Retiro" ? "Salida" : entry.event }}
                    </span>
                  </td>
                  <td>
                    <strong class="daily-log-table-person">{{ entry.person }}</strong>
                    <small class="daily-log-table-date">{{ formatDate(entry.date) }}</small>
                  </td>
                  <td class="daily-log-table-company">{{ entry.company || "N/A" }}</td>
                  <td>{{ entry.host || "N/A" }}</td>
                  <td v-if="isAdmin" class="daily-log-table-actor">
                    {{ entry.actorName || "Sin registro" }}
                  </td>
                  <td>
                    <span class="daily-log-table-status" :class="`is-${entryStatus(entry).toLowerCase().replace(' ', '-')}`">
                      {{ entryStatus(entry) }}
                    </span>
                  </td>
                  <td>
                    <button
                      v-if="appointmentForEntry(entry)"
                      class="daily-log-table-qr"
                      type="button"
                      :aria-label="`Ver QR de ${entry.person}`"
                      @click.stop="openEntryQr(entry)"
                    >QR</button>
                    <span v-else class="daily-log-table-no-qr">N/A</span>
                  </td>
                  <td>
                    <button
                      class="daily-log-delete"
                      type="button"
                      :aria-label="`Eliminar movimiento de ${entry.person}`"
                      title="Eliminar movimiento"
                      @click.stop="removeEntry(entry)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14m-7-3h4l1 3H9l1-3Z" /></svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <footer class="daily-log-pagination">
            <span>
              Mostrando {{ total === 0 ? 0 : (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }}
              de {{ total }} {{ total === 1 ? "registro" : "registros" }}
            </span>
            <div>
              <button type="button" :disabled="page <= 1 || loading" @click="page--">Anterior</button>
              <span class="daily-log-pagination-page">Página {{ page }} de {{ pages }}</span>
              <button type="button" :disabled="page >= pages || loading" @click="page++">Siguiente</button>
            </div>
          </footer>
        </section>
      </div>

      <aside class="daily-log-side-column" aria-label="Detalle y actividad reciente">
        <section class="daily-log-selection-card" aria-labelledby="daily-log-selection-title">
          <div class="daily-log-selection-heading">
            <span class="daily-log-selection-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
            </span>
            <div>
              <span class="daily-log-panel-kicker">{{ selectedAppointment ? "REGISTRO CON CITA" : "VISITA SELECCIONADA" }}</span>
              <h3 id="daily-log-selection-title">{{ selectedPersonName || "Selecciona un registro" }}</h3>
            </div>
          </div>
          <template v-if="selectedPerson">
            <div class="daily-log-selection-meta">
              <p><span>Empresa</span><strong>{{ selectedPersonCompany || "N/A" }}</strong></p>
              <p><span>Anfitrión</span><strong>{{ selectedPersonHost || "N/A" }}</strong></p>
              <p><span>Fecha y hora</span><strong>{{ selectedPersonDateTime }}</strong></p>
              <p>
                <span>Estado</span>
                <strong
                  class="daily-log-selection-state"
                  :class="`is-${selectedPersonStatus.replace(' ', '-').toLocaleLowerCase()}`"
                >{{ selectedPersonStatus }}</strong>
              </p>
            </div>
            <div
              v-if="selectedAppointment && selectedAppointment.businessPartnerId != null &&
                (selectedAppointment.partnerType === 'Contratista' || selectedAppointment.partnerType === 'Proveedor')"
              class="daily-log-employee-roster"
            >
              <button
                class="daily-log-secondary-button"
                type="button"
                :disabled="employeeRosterLoading"
                @click="toggleAppointmentEmployees"
              >
                {{ employeeRosterLoading ? "Cargando empleados…" : employeeRosterOpen ? "Ocultar empleados" : "Ver empleados" }}
              </button>
              <div v-if="employeeRosterOpen" class="daily-log-employee-list">
                <p v-if="employeeRosterError" class="daily-log-quick-error" role="alert">
                  {{ employeeRosterError }}
                  <button
                    v-if="selectedAppointment"
                    type="button"
                    @click="loadAppointmentEmployees(selectedAppointment)"
                  >Reintentar</button>
                </p>
                <p v-else-if="employeeRosterLoading" class="daily-log-quick-empty" role="status">
                  Cargando personal de la empresa…
                </p>
                <p v-else-if="appointmentEmployees.length === 0" class="daily-log-quick-empty">
                  No hay empleados externos registrados para esta empresa.
                </p>
                <article
                  v-for="employee in appointmentEmployees"
                  :key="employee.id"
                  class="daily-log-employee"
                  :class="{ 'is-qr-match': selectedQuickExternalStaffId === employee.id }"
                >
                  <div class="daily-log-employee-heading">
                    <strong>{{ employee.fullName }}</strong>
                    <span class="daily-log-table-status" :class="`is-${employee.status.toLowerCase().replace(' ', '-')}`">
                      {{ employee.status }}
                    </span>
                  </div>
                  <div v-if="employeeMovements(employee).length" class="daily-log-employee-actions">
                    <button
                      v-for="movement in employeeMovements(employee)"
                      :key="movement"
                      class="daily-log-selection-action"
                      :class="{ 'is-exit': movement === 'Retiro' }"
                      type="button"
                      :disabled="
                        employeeMovementId !== null ||
                        quickActionAppointmentId !== null ||
                        quickActionEntryId !== null
                      "
                      @click="selectedAppointment && saveEmployeeMovement(selectedAppointment, employee, movement)"
                    >
                      {{ employeeMovementId === employee.id ? "Guardando…" : movement === "Llegada" ? "Registrar llegada" : movement === "Ingreso" ? "Registrar entrada" : "Registrar salida" }}
                    </button>
                  </div>
                  <p v-else class="daily-log-selection-complete">La visita de este empleado ya está finalizada.</p>
                </article>
              </div>
            </div>
            <label class="daily-log-quick-observation">
              <span>Observaciones (opcional)</span>
              <input v-model.trim="quickObservation" type="text" maxlength="4000" placeholder="Agrega un detalle si hace falta" />
            </label>
            <div v-if="selectedAvailableMovements.length" class="daily-log-selection-action-group">
              <button
                v-for="movement in selectedAvailableMovements"
                :key="movement"
                class="daily-log-selection-action"
                :class="{ 'is-exit': movement === 'Retiro' }"
                type="button"
                :disabled="
                  quickActionAppointmentId !== null ||
                  quickActionEntryId !== null ||
                  employeeMovementId !== null ||
                  (movement === 'Ingreso' && equipmentEntryChecklistPending)
                "
                @click="selectedQuickAppointment ? saveQuickMovement(movement) : saveSelectedEntryMovement(movement)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="eventIcon(movement)" /></svg>
                {{ quickActionAppointmentId !== null || quickActionEntryId !== null ? "Guardando…" : movement === "Llegada" ? "Registrar llegada" : movement === "Ingreso" ? "Registrar entrada" : "Registrar salida" }}
              </button>
              <p v-if="selectedAvailableMovements.includes('Ingreso') && equipmentEntryChecklistPending" class="daily-log-selection-complete" role="status">
                Completa primero el checklist de entrada del equipo y las herramientas de esta cita.
              </p>
            </div>
            <div
              v-else-if="selectedEntry && selectedEntry.date !== today"
              class="daily-log-readonly-notice"
              role="status"
            >
              <span class="daily-log-readonly-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </span>
              <span class="daily-log-readonly-copy">
                <strong>Historial en modo lectura</strong>
                <span>Solo puedes registrar movimientos del día actual.</span>
              </span>
            </div>
            <p v-else class="daily-log-selection-complete">La visita ya está finalizada.</p>
            <p v-if="quickActionNotice" class="daily-log-quick-notice" role="status">{{ quickActionNotice }}</p>
            <p v-if="quickActionError" class="daily-log-quick-error" role="alert">{{ quickActionError }}</p>
          </template>
          <p v-else class="daily-log-selection-hint">
            Escanea el QR de una cita o selecciona un movimiento de la tabla para consultar los datos y registrar el siguiente paso.
          </p>
        </section>

        <section class="daily-log-recent-panel" aria-labelledby="daily-log-recent-title">
          <div class="daily-log-panel-heading">
            <div>
              <span class="daily-log-panel-kicker">EN TIEMPO REAL</span>
              <h3 id="daily-log-recent-title">Actividad reciente</h3>
            </div>
            <button class="daily-log-recent-link" type="button" @click="showRecentHistory">Historial</button>
          </div>
          <button
            v-for="entry in recentEntries"
            :key="`recent-${entry.id}`"
            class="daily-log-recent-entry"
            :class="[`is-${entry.event.toLocaleLowerCase('es')}`, { 'is-selected': selectedEntryId === entry.id }]"
            type="button"
            @click="selectEntry(entry)"
          >
            <span class="daily-log-recent-marker" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path :d="eventIcon(entry.event)" /></svg>
            </span>
            <span class="daily-log-recent-time">{{ entry.time }}</span>
            <span class="daily-log-recent-copy">
              <strong>{{ entry.event === "Ingreso" ? "Entrada" : entry.event === "Retiro" ? "Salida" : entry.event }}</strong>
              <span>{{ entry.person }}<template v-if="entry.company"> · {{ entry.company }}</template></span>
              <small>{{ entry.details || eventVerb(entry.event) }}</small>
            </span>
          </button>
          <div v-if="recentEntries.length === 0" class="daily-log-recent-empty" role="status">
            <span class="daily-log-recent-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 8v4l2.5 1.5" /><circle cx="12" cy="12" r="9" /></svg>
            </span>
            <strong>Aún no hay movimientos</strong>
            <p>Los movimientos recientes aparecerán aquí cuando registres una llegada, entrada o salida.</p>
          </div>
        </section>
      </aside>
    </div>

    <div v-if="dialogOpen" class="modal-backdrop" @click.self="!saving && (dialogOpen = false)">
      <section class="dialog daily-log-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-log-dialog-title">
        <button class="dialog-close" type="button" aria-label="Cerrar" :disabled="saving" @click="dialogOpen = false">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-note" /></svg></span>
        <h2 id="daily-log-dialog-title">Registrar nueva visita</h2>
        <p class="dialog-description">Registra la llegada inicial. La fecha y hora se tomarán automáticamente al guardar.</p>
        <form class="workspace-form daily-log-form" @submit.prevent="submitEntry">
          <label>
            Persona registrada como
            <select :value="logPersonType" @change="changePersonType(($event.target as HTMLSelectElement).value as SubjectType)">
              <option value="externalStaff">Personal externo</option>
              <option value="visitor">Visitante registrado</option>
              <option value="manual">Captura manual</option>
            </select>
          </label>
          <label v-if="logPersonType !== 'manual'">
            {{ logPersonType === "externalStaff" ? "Personal externo" : "Visitante" }}
            <select v-model="logSubjectId" required>
              <option value="" disabled>Selecciona un registro</option>
              <option v-if="logPersonType === 'externalStaff'" v-for="person in selectedExternalStaff" :key="person.id" :value="String(person.id)">
                {{ person.fullName }} · {{ person.companyName }} ({{ person.relationshipType.toLowerCase() }})
              </option>
              <option v-if="logPersonType === 'visitor'" v-for="person in selectedVisitors" :key="person.id" :value="String(person.id)">
                {{ person.fullName }}
              </option>
            </select>
          </label>
          <label v-else>
            Nombre completo
            <input v-model.trim="manualPerson" type="text" maxlength="180" pattern=".*\S.*" placeholder="Nombre de la persona" required />
          </label>
          <label class="daily-log-form-details">
            Observaciones
            <textarea
              v-model.trim="logDetails"
              maxlength="4000"
              placeholder="Detalle adicional (opcional)"
              rows="3"
            ></textarea>
          </label>
          <p class="daily-log-form-note">
            {{ logPersonType === "externalStaff" ? "La empresa se conservará desde su ficha; el anfitrión se mostrará como N/A." : "Empresa y anfitrión se mostrarán como N/A para esta visita." }}
          </p>
          <button class="button-primary workspace-submit" type="submit" :disabled="saving">
            <svg v-if="!saving" class="icon"><use href="#i-plus" /></svg>
            <span>{{ saving ? "Guardando…" : "Registrar llegada" }}</span>
          </button>
        </form>
      </section>
    </div>
  </section>
</template>
