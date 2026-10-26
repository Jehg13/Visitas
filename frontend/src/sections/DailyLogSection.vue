<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

type LogEventType = "Llegada" | "Ingreso" | "Retiro" | "Observaciones";
type LogCategory = "Visitante" | "Contratista" | "Proveedor" | "Sin categoría";
type LogEntry = {
  id: number;
  date: string;
  time: string;
  event: LogEventType;
  person: string;
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
  date: string;
  time: string;
  visitor: string;
  company: string;
  host: string;
  status: "Dentro" | "En proceso" | "Pendiente" | "Retirado" | "Cancelada";
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
  appointments: Appointment[];
  appointmentsLoading: boolean;
  externalStaff: ExternalStaff[];
  generalVisitors: GeneralVisitor[];
  hosts: Host[];
  departments: Department[];
}>();
const emit = defineEmits<{ movementSaved: [] }>();

const today = ref(getLocalDate());
const fromDate = ref(today.value);
const toDate = ref(today.value);
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
const error = ref("");
const quickActionError = ref("");
const quickActionNotice = ref("");
const quickActionAppointmentId = ref<number | null>(null);
const quickSearch = ref("");
const quickSearchInput = ref<HTMLInputElement | null>(null);
const selectedQuickAppointmentId = ref<number | null>(null);
const quickObservation = ref("");
const quickStatusOverrides = ref<Record<number, Appointment["status"]>>({});
const dialogOpen = ref(false);
const logEvent = ref<LogEventType>("Llegada");
const logTime = ref(getLocalTime());
const logPersonType = ref<SubjectType>("appointment");
const logSubjectId = ref("");
const manualPerson = ref("");
const logDate = ref(today.value);
const logDetails = ref("");
let requestVersion = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const selectedAppointments = computed(() =>
  [...props.appointments]
    .filter((appointment) => appointment.status !== "Cancelada" && appointment.status !== "Retirado")
    .sort((first, second) =>
      `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`),
    ),
);
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
const requiresLinkedPerson = computed(() => logEvent.value === "Ingreso" || logEvent.value === "Retiro");
const groupedEntries = computed(() => {
  const groups = new Map<string, LogEntry[]>();
  for (const entry of entries.value) {
    const group = groups.get(entry.date) ?? [];
    group.push(entry);
    groups.set(entry.date, group);
  }
  return [...groups.entries()].map(([date, groupEntries]) => ({ date, entries: groupEntries }));
});
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
  logEvent.value = "Llegada";
  logTime.value = getLocalTime();
  logDate.value = today.value;
  logPersonType.value = "appointment";
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
    error.value = "Escribe el nombre de la persona.";
    return;
  }
  if (logPersonType.value !== "manual" && !logSubjectId.value) {
    error.value = "Selecciona la cita o ficha de la persona.";
    return;
  }
  if (requiresLinkedPerson.value && logPersonType.value === "manual") {
    error.value = "Para un ingreso o retiro se necesita vincular una cita o ficha registrada.";
    return;
  }

  const selectedId = Number(logSubjectId.value);
  const payload = {
    event: logEvent.value,
    date: logDate.value,
    time: logTime.value,
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
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) {
      error.value = result.error ?? "No se pudo guardar el movimiento.";
      return;
    }
    dialogOpen.value = false;
    fromDate.value = logDate.value;
    toDate.value = logDate.value;
    page.value = 1;
    await loadEntries();
    emit("movementSaved");
  } catch (cause) {
    console.error("Failed to save daily log movement:", cause);
    error.value = "No se pudo conectar con el servidor para guardar el movimiento.";
  } finally {
    saving.value = false;
  }
}

function selectQuickAppointment(appointment: Appointment) {
  selectedQuickAppointmentId.value = appointment.id;
  quickActionError.value = "";
  quickActionNotice.value = "";
  quickObservation.value = "";
  quickSearch.value = appointment.visitor;
}

function movementIsAvailable(event: "Llegada" | "Ingreso" | "Retiro", appointment: Appointment) {
  const status = quickAppointmentStatus(appointment);
  if (status === "Cancelada" || status === "Retirado") return false;
  if (event === "Llegada") return status === "Pendiente";
  if (event === "Ingreso") return status === "Pendiente" || status === "En proceso";
  return status === "Dentro";
}

async function saveQuickMovement(event: "Llegada" | "Ingreso" | "Retiro") {
  const appointment = selectedQuickAppointment.value;
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
        appointmentId: appointment.id,
        details: quickObservation.value.trim(),
      }),
    });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) {
      quickActionError.value = result.error ?? "No se pudo actualizar el estado de la visita.";
      return;
    }
    quickStatusOverrides.value[appointment.id] = event === "Ingreso"
      ? "Dentro"
      : event === "Retiro"
        ? "Retirado"
        : "En proceso";
    selectedQuickAppointmentId.value = null;
    quickSearch.value = "";
    quickObservation.value = "";
    quickActionNotice.value = `${appointment.visitor}: ${event === "Llegada" ? "llegada registrada" : event === "Ingreso" ? "entrada registrada" : "retiro registrado"}.`;
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
    quickActionError.value = "No se pudo conectar con el servidor. Intenta de nuevo.";
  } finally {
    quickActionAppointmentId.value = null;
    await nextTick();
    quickSearchInput.value?.focus();
  }
}

async function handleQuickSearchEnter() {
  if (quickActionAppointmentId.value !== null) return;
  quickActionError.value = "";
  quickActionNotice.value = "";
  selectedQuickAppointmentId.value = null;
  refreshLocalDate();
  const value = quickSearch.value.trim();
  if (!value) return;

  let scannedAppointmentId: number | null = null;
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
  } catch {
    // Non-JSON input is treated as a name search.
  }

  if (scannedAppointmentId !== null) {
    const appointment = todayAppointments.value.find((item) => item.id === scannedAppointmentId);
    if (!appointment) {
      quickActionError.value = "Este QR no corresponde a una cita de hoy o la visita está cancelada.";
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
    quickActionError.value = "No encontramos una cita de hoy con ese nombre o empresa.";
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
      error.value = result.error ?? "No se pudo eliminar el movimiento.";
      return;
    }
    await loadEntries();
  } catch (cause) {
    console.error("Failed to delete daily log movement:", cause);
    error.value = "No se pudo conectar con el servidor para eliminar el movimiento.";
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
});
onBeforeUnmount(() => {
  requestVersion += 1;
  if (searchTimer) clearTimeout(searchTimer);
});
</script>

<template>
  <section class="daily-log-page" aria-labelledby="daily-log-title">
    <header class="daily-log-header">
      <div class="daily-log-heading-copy">
        <span class="daily-log-eyebrow">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.6c0 4.5 3.2 7.8 7.5 9.4 4.3-1.6 7.5-4.9 7.5-9.4V6L12 3Z" /><path d="m9 12 2 2 4-4" /></svg>
          CONTROL DE ACCESOS
        </span>
        <h2 id="daily-log-title">Bitácora de movimientos</h2>
        <p>Control y seguimiento de movimientos de acceso</p>
      </div>
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
        <button class="daily-log-primary-button" type="button" @click="openCreateDialog">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Registrar movimiento
        </button>
      </div>
    </header>

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

    <section class="daily-log-quick-panel" aria-labelledby="daily-log-quick-title">
      <div class="daily-log-quick-heading">
        <div>
          <span class="daily-log-panel-kicker">ACCESO RÁPIDO</span>
          <h3 id="daily-log-quick-title">Registro rápido</h3>
          <p>Busca por nombre o empresa, o escanea el QR de la cita.</p>
        </div>
        <span class="daily-log-result-count">{{ todayAppointments.length }} {{ todayAppointments.length === 1 ? "visita" : "visitas" }}</span>
      </div>
      <label class="daily-log-quick-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3" /><path d="M7 12h10" /></svg>
        <input
          ref="quickSearchInput"
          v-model="quickSearch"
          type="search"
          placeholder="Nombre, empresa o escanea QR…"
          aria-label="Busca por nombre o empresa, o escanea QR"
          :disabled="appointmentsLoading"
          @input="selectedQuickAppointmentId = null; quickActionError = ''; quickActionNotice = ''"
          @keydown.enter.prevent="handleQuickSearchEnter"
        />
        <span>Enter</span>
      </label>
      <p v-if="quickActionNotice" class="daily-log-quick-notice" role="status">{{ quickActionNotice }}</p>
      <p v-if="quickActionError" class="daily-log-quick-error" role="alert">{{ quickActionError }}</p>
      <p v-if="appointmentsLoading" class="daily-log-quick-empty">Cargando visitas de hoy…</p>
      <p v-else-if="!todayAppointments.length" class="daily-log-quick-empty">No hay visitas agendadas para hoy.</p>
      <div v-else-if="filteredQuickAppointments.length" class="daily-log-quick-list">
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
      <p v-else class="daily-log-quick-empty">No encontramos coincidencias para “{{ quickSearch }}”.</p>
      <div v-if="selectedQuickAppointment" class="daily-log-selected-person" aria-live="polite">
        <div class="daily-log-selected-person-details">
          <strong>{{ selectedQuickAppointment.visitor }}</strong>
          <span>
            {{ selectedQuickAppointment.company || "Visitante" }}
            <template v-if="selectedQuickAppointment.host"> · Recibe: {{ selectedQuickAppointment.host }}</template>
            · Cita {{ selectedQuickAppointment.time }}
          </span>
        </div>
        <label class="daily-log-quick-observation">
          <span>Observaciones (opcional)</span>
          <input v-model.trim="quickObservation" type="text" maxlength="4000" placeholder="Agrega un detalle si hace falta" />
        </label>
        <div class="daily-log-quick-actions">
          <button
            class="daily-log-quick-action"
            type="button"
            :disabled="quickActionAppointmentId !== null || !movementIsAvailable('Llegada', selectedQuickAppointment)"
            @click="saveQuickMovement('Llegada')"
          >{{ quickActionAppointmentId === selectedQuickAppointment.id ? "Guardando…" : "Llegada" }}</button>
          <button
            class="daily-log-quick-action"
            type="button"
            :disabled="quickActionAppointmentId !== null || !movementIsAvailable('Ingreso', selectedQuickAppointment)"
            @click="saveQuickMovement('Ingreso')"
          >{{ quickActionAppointmentId === selectedQuickAppointment.id ? "Guardando…" : "Entrada" }}</button>
          <button
            class="daily-log-quick-action daily-log-quick-action-exit"
            type="button"
            :disabled="quickActionAppointmentId !== null || !movementIsAvailable('Retiro', selectedQuickAppointment)"
            @click="saveQuickMovement('Retiro')"
          >{{ quickActionAppointmentId === selectedQuickAppointment.id ? "Guardando…" : "Retiro" }}</button>
        </div>
      </div>
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
          <h3 id="daily-log-activity-title">Actividad cronológica</h3>
        </div>
        <span class="daily-log-result-count">{{ total }} {{ total === 1 ? "movimiento" : "movimientos" }}</span>
      </div>

      <form class="daily-log-filters" @submit.prevent="page = 1; loadEntries()">
        <label class="daily-log-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
          <input v-model.trim="search" type="search" placeholder="Buscar persona, empresa o anfitrión" aria-label="Buscar persona, empresa o anfitrión" />
        </label>
        <label>
          <span class="sr-only">Filtrar por movimiento</span>
          <select v-model="eventFilter" aria-label="Filtrar por movimiento">
            <option value="">Todos los movimientos</option>
            <option value="Llegada">Llegadas</option>
            <option value="Ingreso">Entradas</option>
            <option value="Retiro">Retiros</option>
            <option value="Observaciones">Observaciones</option>
          </select>
        </label>
        <label>
          <span class="sr-only">Filtrar por categoría</span>
          <select v-model="categoryFilter" aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            <option value="Visitante">Visitantes</option>
            <option value="Contratista">Contratistas</option>
            <option value="Proveedor">Proveedores</option>
            <option value="Sin categoría">Sin categoría</option>
          </select>
        </label>
        <label>
          <span class="sr-only">Filtrar por anfitrión</span>
          <select v-model="hostFilter" aria-label="Filtrar por anfitrión" :disabled="Boolean(departmentFilter)">
            <option value="">Todos los anfitriones</option>
            <option v-for="host in availableHosts" :key="host" :value="host">{{ host }}</option>
          </select>
        </label>
        <label v-if="departmentOptions.length">
          <span class="sr-only">Filtrar por departamento</span>
          <select v-model="departmentFilter" aria-label="Filtrar por departamento">
            <option value="">Todos los departamentos</option>
            <option v-for="department in departmentOptions" :key="department.id" :value="String(department.id)">{{ department.name }}</option>
          </select>
        </label>
        <button class="daily-log-reset-button" type="button" @click="resetFilters">
          Limpiar
        </button>
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
        <div class="daily-log-empty-actions">
          <button class="daily-log-primary-button" type="button" @click="openCreateDialog">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Registrar movimiento
          </button>
          <button class="daily-log-secondary-button" type="button" @click="resetFilters">Consultar hoy</button>
        </div>
      </div>
      <template v-else>
        <div class="daily-log-timeline">
          <section v-for="group in groupedEntries" :key="group.date" class="daily-log-day-group">
            <h4 class="daily-log-day-heading">
              <span>{{ formatDate(group.date) }}</span>
              <small>{{ group.entries.length }} {{ group.entries.length === 1 ? "evento" : "eventos" }}</small>
            </h4>
            <ol class="daily-log-event-list">
              <li
                v-for="entry in group.entries"
                :key="entry.id"
                class="daily-log-event"
                :class="`daily-log-event-${entry.event.toLowerCase()}`"
              >
                <span class="daily-log-event-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="eventIcon(entry.event)" /></svg>
                </span>
                <time class="daily-log-event-time">{{ entry.time }}</time>
                <div class="daily-log-event-content">
                  <div class="daily-log-event-topline">
                    <strong>{{ entry.person }}</strong>
                    <span class="daily-log-event-type">{{ eventVerb(entry.event) }}</span>
                  </div>
                  <div class="daily-log-event-meta">
                    <span class="daily-log-category" :class="`daily-log-category-${entry.category.toLowerCase().replace(' ', '-')}`">{{ entry.category }}</span>
                    <span v-if="entry.company">{{ entry.company }}</span>
                    <span v-if="entry.host">Anfitrión: {{ entry.host }}</span>
                    <span v-if="entry.host && departmentForHost(entry.host)">Departamento: {{ departmentForHost(entry.host) }}</span>
                    <span v-if="entry.appointmentId" class="daily-log-linked">Cita #{{ entry.appointmentId }}</span>
                    <span v-if="entry.appointmentId === null && entry.externalStaffId === null && entry.visitorRecordId === null" class="daily-log-unlinked">Registro manual</span>
                  </div>
                  <p v-if="entry.details" class="daily-log-event-details">{{ entry.details }}</p>
                </div>
                <button
                  class="daily-log-delete"
                  type="button"
                  :aria-label="`Eliminar movimiento de ${entry.person}`"
                  title="Eliminar movimiento"
                  @click="removeEntry(entry)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14m-7-3h4l1 3H9l1-3Z" /></svg>
                </button>
              </li>
            </ol>
          </section>
        </div>
        <footer class="daily-log-pagination">
          <span>
            Mostrando {{ total === 0 ? 0 : (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }}
            de {{ total }} {{ total === 1 ? "movimiento" : "movimientos" }}
          </span>
          <div>
            <button type="button" :disabled="page <= 1 || loading" @click="page--">Anterior</button>
            <span class="daily-log-pagination-page">Página {{ page }} de {{ pages }}</span>
            <button type="button" :disabled="page >= pages || loading" @click="page++">Siguiente</button>
          </div>
        </footer>
      </template>
    </section>

    <div v-if="dialogOpen" class="modal-backdrop" @click.self="!saving && (dialogOpen = false)">
      <section class="dialog daily-log-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-log-dialog-title">
        <button class="dialog-close" type="button" aria-label="Cerrar" :disabled="saving" @click="dialogOpen = false">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-note" /></svg></span>
        <h2 id="daily-log-dialog-title">Registrar movimiento</h2>
        <p class="dialog-description">El movimiento se guardará en el historial y conservará su relación con la ficha seleccionada.</p>
        <form class="workspace-form daily-log-form" @submit.prevent="submitEntry">
          <label>
            Tipo de movimiento
            <select v-model="logEvent" required>
              <option value="Llegada">Llegada</option>
              <option value="Ingreso">Entrada</option>
              <option value="Retiro">Retiro</option>
            </select>
          </label>
          <label>
            Persona registrada como
            <select :value="logPersonType" @change="changePersonType(($event.target as HTMLSelectElement).value as SubjectType)">
              <option value="appointment">Cita agendada</option>
              <option value="externalStaff">Personal externo</option>
              <option value="visitor">Visitante registrado</option>
              <option value="manual" :disabled="requiresLinkedPerson">Captura manual</option>
            </select>
          </label>
          <label v-if="logPersonType !== 'manual'">
            {{ logPersonType === "appointment" ? "Cita / visitante" : logPersonType === "externalStaff" ? "Personal externo" : "Visitante" }}
            <select v-model="logSubjectId" required>
              <option value="" disabled>Selecciona un registro</option>
              <option v-if="logPersonType === 'appointment'" v-for="appointment in selectedAppointments" :key="appointment.id" :value="String(appointment.id)">
                {{ appointment.visitor }} · {{ appointment.company || "Sin empresa" }} · {{ appointment.date }} {{ appointment.time }}
              </option>
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
            <input v-model.trim="manualPerson" type="text" maxlength="180" placeholder="Nombre de la persona" required />
          </label>
          <label>
            Fecha
            <input v-model="logDate" type="date" required />
          </label>
          <label>
            Hora
            <input v-model="logTime" type="time" required />
          </label>
          <label class="daily-log-form-details">
            Observaciones
            <textarea
              v-model.trim="logDetails"
              maxlength="4000"
              :placeholder="logEvent === 'Observaciones' ? 'Describe la observación' : 'Detalle adicional (opcional)'"
              :required="logEvent === 'Observaciones'"
              rows="3"
            ></textarea>
          </label>
          <p v-if="requiresLinkedPerson" class="daily-log-form-note">
            Para controlar correctamente quién está dentro, vincula ingresos y retiros a una cita o ficha existente.
          </p>
          <button class="button-primary workspace-submit" type="submit" :disabled="saving">
            <svg v-if="!saving" class="icon"><use href="#i-plus" /></svg>
            <span>{{ saving ? "Guardando…" : "Guardar movimiento" }}</span>
          </button>
        </form>
      </section>
    </div>
  </section>
</template>
