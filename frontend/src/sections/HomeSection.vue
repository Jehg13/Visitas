<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

type AppointmentStatus = "Dentro" | "En proceso" | "Pendiente" | "Retirado" | "Cancelada";
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
  host: string;
  status: AppointmentStatus;
};
type Activity = {
  id: number;
  date: string;
  time: string;
  title: string;
  visitor: string;
  company?: string;
  detail: string;
  icon: string;
  tone: string;
};
type SummaryItem = {
  title: string;
  detail: string;
  icon: string;
};
type LogEntry = {
  id: number;
  date: string;
  time: string;
  event: "Llegada" | "Ingreso" | "Retiro" | "Observaciones";
  person: string;
  details: string;
  company: string;
  host: string;
};
type DailyActivity = {
  date: string;
  arrivals: number;
  entries: number;
  exits: number;
  observations: number;
};
type MovementKey = "arrivals" | "entries" | "exits" | "observations";
type TrendSeries = { key: MovementKey; label: string; color: string };
type AppointmentHistoryItem = {
  id: number;
  appointmentId: number;
  action: "Creada" | "Actualizada" | "Cancelada" | "Eliminada";
  actorName: string;
  date: string;
  time: string;
  appointmentDate: string;
  appointmentTime: string;
  visitor: string;
  company: string;
  host: string;
  status: string;
  details: string;
};

const props = defineProps<{
  appointments: Appointment[];
  summaryItems: SummaryItem[];
  canManageAppointments: boolean;
}>();

const emit = defineEmits<{
  createAppointment: [date: string];
  openQr: [appointment: Appointment];
  showToast: [message: string];
  editAppointment: [appointment: Appointment];
  cancelAppointment: [appointment: Appointment];
  deleteAppointment: [appointment: Appointment];
  openLog: [fromDate: string, toDate: string];
  openAppointments: [];
  openEquipment: [];
}>();

const today = getLocalDate();
const selectedAgendaDate = ref(today);
const historyFromDate = ref(getDateOffset(-6));
const historyToDate = ref(today);
const customDateRange = ref(false);
const dashboardSummary = ref({ insideNow: 0, pendingArrivals: 0 });
const recentEntries = ref<LogEntry[]>([]);
const appointmentHistory = ref<AppointmentHistoryItem[]>([]);
const periodActivity = ref<DailyActivity[]>([]);
const equipmentDeclarationCount = ref<number | null>(null);
const dashboardError = ref("");
const dashboardLoading = ref(false);
let dashboardRequestVersion = 0;
const trendSeries: TrendSeries[] = [
  { key: "arrivals", label: "Llegadas", color: "#3eb99d" },
  { key: "entries", label: "Entradas", color: "#4396df" },
  { key: "exits", label: "Salidas", color: "#d36b75" },
];
const selectedAgendaAppointments = computed(() =>
  props.appointments
    .filter((appointment) => appointment.date === (selectedAgendaDate.value || today))
    .sort((first, second) => first.time.localeCompare(second.time)),
);
const todayAppointments = computed(() =>
  props.appointments
    .filter((appointment) => appointment.date === today)
    .sort((first, second) => first.time.localeCompare(second.time)),
);
const selectedAgendaDateLabel = computed(() => {
  if (!selectedAgendaDate.value) return "fecha seleccionada";
  const [year, month, day] = selectedAgendaDate.value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
});
const activities = computed<Activity[]>(() =>
  recentEntries.value.slice(0, 6).map((entry) => ({
    id: entry.id,
    date: entry.date,
    time: entry.time,
    title: entry.event,
    visitor: entry.person,
    company: entry.company,
    detail: entry.details || (entry.host ? `Anfitrión: ${entry.host}` : "Movimiento registrado en recepción."),
    icon: entry.event === "Llegada" ? "arrival" : entry.event === "Ingreso" ? "entry" : entry.event === "Retiro" ? "exit" : "note",
    tone: entry.event === "Llegada" ? "green" : entry.event === "Ingreso" ? "blue" : entry.event === "Retiro" ? "red" : "slate",
  })),
);
const periodActivityTotals = computed(() =>
  periodActivity.value.reduce(
    (totals, day) => ({
      arrivals: totals.arrivals + day.arrivals,
      entries: totals.entries + day.entries,
      exits: totals.exits + day.exits,
      observations: totals.observations + day.observations,
    }),
    { arrivals: 0, entries: 0, exits: 0, observations: 0 },
  ),
);
const periodMovementTotal = computed(
  () =>
    periodActivityTotals.value.arrivals +
    periodActivityTotals.value.entries +
    periodActivityTotals.value.exits +
    periodActivityTotals.value.observations,
);
const historyRangeLabel = computed(() => {
  const from = formatRangeDate(historyFromDate.value);
  const to = formatRangeDate(historyToDate.value);
  return historyFromDate.value === historyToDate.value ? from : `${from} – ${to}`;
});
const movementBreakdown = computed(() => [
  { key: "arrivals", label: "Llegadas", value: periodActivityTotals.value.arrivals, color: "#3eb99d" },
  { key: "entries", label: "Entradas", value: periodActivityTotals.value.entries, color: "#4396df" },
  { key: "exits", label: "Salidas", value: periodActivityTotals.value.exits, color: "#d36b75" },
  { key: "observations", label: "Observaciones", value: periodActivityTotals.value.observations, color: "#8b9caf" },
]);
const donutSegments = computed(() => {
  const circumference = 2 * Math.PI * 43;
  let offset = 0;
  return movementBreakdown.value
    .filter((segment) => segment.value > 0 && periodMovementTotal.value > 0)
    .map((segment) => {
      const length = segment.value / periodMovementTotal.value * circumference;
      const current = { ...segment, dashArray: `${length} ${circumference - length}`, dashOffset: -offset };
      offset += length;
      return current;
    });
});
const maxTrendValue = computed(() =>
  Math.max(1, ...periodActivity.value.flatMap((day) => trendSeries.map((series) => day[series.key]))),
);
const trendDateLabels = computed(() => {
  const labelInterval = Math.max(1, Math.ceil(periodActivity.value.length / 6));
  return periodActivity.value
    .map((day, index) => ({ day, index }))
    .filter(({ index }) =>
      index === 0 ||
      index === periodActivity.value.length - 1 ||
      index % labelInterval === 0,
    );
});

function trendPoints(key: MovementKey) {
  return periodActivity.value
    .map((day, index) => {
      const x = periodActivity.value.length < 2
        ? 210
        : 30 + index * 360 / (periodActivity.value.length - 1);
      const y = 136 - day[key] / maxTrendValue.value * 104;
      return `${x},${y}`;
    })
    .join(" ");
}

function dayLabel(date: string) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" })
    .format(new Date(`${date}T12:00:00`))
    .replace(".", "");
}

function formatRangeDate(date: string) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00`))
    .replace(".", "");
}

let dashboardRefreshTimer: number | undefined;

function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateOffset(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return getLocalDate(date);
}

function addDateOffset(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return getLocalDate(date);
}

function setHistoryPreset(days: 7 | 30) {
  customDateRange.value = false;
  historyFromDate.value = addDateOffset(today, 1 - days);
  historyToDate.value = today;
}

function openHistoryLog() {
  emit("openLog", historyFromDate.value, historyToDate.value);
}

function openTodayLog() {
  emit("openLog", today, today);
}

function openNewAppointment() {
  emit("createAppointment", selectedAgendaDate.value || today);
}

async function loadDashboardData() {
  const requestVersion = ++dashboardRequestVersion;
  const fromDate = historyFromDate.value;
  const toDate = historyToDate.value;
  const daySpan =
    (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) /
    86_400_000;
  if (!fromDate || !toDate || fromDate > toDate || !Number.isInteger(daySpan) || daySpan > 365) {
    dashboardError.value = "Selecciona un rango válido de hasta 365 días.";
    recentEntries.value = [];
    periodActivity.value = [];
    dashboardLoading.value = false;
    return;
  }
  dashboardLoading.value = true;
  dashboardError.value = "";
  try {
    const [historyResponse, todayResponse, statsResponse, equipmentResponse, appointmentHistoryResponse] = await Promise.all([
      fetch(`/api/daily-log?from=${fromDate}&to=${toDate}&page=1&pageSize=6`),
      fetch(`/api/daily-log?from=${today}&to=${today}&page=1&pageSize=1`),
      fetch(`/api/daily-log/stats?from=${fromDate}&to=${toDate}`),
      fetch("/api/equipment/declarations?page=1"),
      fetch("/api/appointments/history"),
    ]);
    const [historyResult, todayResult, statsResult, equipmentResult, appointmentHistoryResult] = await Promise.all([
      historyResponse.json() as Promise<{
        entries?: LogEntry[];
        error?: string;
      }>,
      todayResponse.json() as Promise<{
        summary?: { insideNow?: number; pendingArrivals?: number };
        error?: string;
      }>,
      statsResponse.json() as Promise<{ stats?: DailyActivity[]; error?: string }>,
      equipmentResponse.json() as Promise<{ total?: number; error?: string }>,
      appointmentHistoryResponse.json() as Promise<{ history?: AppointmentHistoryItem[]; error?: string }>,
    ]);

    if (requestVersion !== dashboardRequestVersion) return;
    if (!historyResponse.ok) throw new Error(historyResult.error ?? "No se pudieron cargar los registros del periodo.");
    if (!Array.isArray(historyResult.entries)) {
      throw new Error("Los registros del periodo tienen un formato inesperado.");
    }
    if (!todayResponse.ok) throw new Error(todayResult.error ?? "No se pudo cargar el resumen de hoy.");
    if (!todayResult.summary) {
      throw new Error("El resumen de hoy tiene un formato inesperado.");
    }
    if (!statsResponse.ok) throw new Error(statsResult.error ?? "No se pudo cargar el resumen de movimientos.");
    if (!Array.isArray(statsResult.stats)) {
      throw new Error("El resumen de movimientos tiene un formato inesperado.");
    }
    if (!equipmentResponse.ok) throw new Error(equipmentResult.error ?? "No se pudo cargar el total de declaraciones de equipo.");
    if (typeof equipmentResult.total !== "number" || !Number.isSafeInteger(equipmentResult.total)) {
      throw new Error("El total de declaraciones de equipo tiene un formato inesperado.");
    }
    if (!appointmentHistoryResponse.ok) {
      throw new Error(appointmentHistoryResult.error ?? "No se pudo cargar el historial de citas.");
    }
    if (!Array.isArray(appointmentHistoryResult.history)) {
      throw new Error("El historial de citas tiene un formato inesperado.");
    }

    recentEntries.value = historyResult.entries;
    dashboardSummary.value = {
      insideNow: todayResult.summary.insideNow ?? 0,
      pendingArrivals: todayResult.summary.pendingArrivals ?? 0,
    };
    const byDate = new Map(statsResult.stats.map((day) => [day.date, day]));
    periodActivity.value = Array.from({ length: daySpan + 1 }, (_, index) => {
      const date = addDateOffset(fromDate, index);
      return byDate.get(date) ?? { date, arrivals: 0, entries: 0, exits: 0, observations: 0 };
    });
    equipmentDeclarationCount.value = equipmentResult.total;
    appointmentHistory.value = appointmentHistoryResult.history;
  } catch (error) {
    console.error("No se pudo cargar el panel de control:", error);
    if (requestVersion === dashboardRequestVersion) {
      dashboardError.value = error instanceof Error ? error.message : "No se pudieron cargar los datos del panel.";
    }
  } finally {
    if (requestVersion === dashboardRequestVersion) dashboardLoading.value = false;
  }
}

watch([historyFromDate, historyToDate], () => void loadDashboardData());
watch(() => props.appointments, () => void loadDashboardData());

onMounted(() => {
  void loadDashboardData();
  dashboardRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") void loadDashboardData();
  }, 30000);
});

onBeforeUnmount(() => {
  dashboardRequestVersion += 1;
  if (dashboardRefreshTimer !== undefined) window.clearInterval(dashboardRefreshTimer);
});

function openFirstSelectedDateQr() {
  const appointment = selectedAgendaAppointments.value.find((candidate) =>
    candidate.status === "Pendiente" || candidate.status === "En proceso",
  );
  if (!appointment) {
    emit("showToast", "No hay citas pendientes en la fecha seleccionada para enviar su QR.");
    return;
  }
  emit("openQr", appointment);
}
</script>

<template>
  <section class="metric-grid" aria-label="Resumen de hoy">
    <button class="metric-card" type="button" @click="emit('openAppointments')">
      <span class="metric-icon metric-red"><svg class="icon"><use href="#i-calendar" /></svg></span>
      <div class="metric-copy"><p>Citas de hoy</p><strong>{{ todayAppointments.length }}</strong><small>Agenda programada</small></div>
      <svg class="icon metric-arrow"><use href="#i-chevron" /></svg>
    </button>
    <button class="metric-card" type="button" @click="openTodayLog">
      <span class="metric-icon metric-blue"><svg class="icon"><use href="#i-user" /></svg></span>
      <div class="metric-copy"><p>Visitantes dentro</p><strong>{{ dashboardSummary.insideNow }}</strong><small>Según el último movimiento</small></div>
      <svg class="icon metric-arrow"><use href="#i-chevron" /></svg>
    </button>
    <button class="metric-card" type="button" @click="openTodayLog">
      <span class="metric-icon metric-red"><svg class="icon"><use href="#i-qr" /></svg></span>
      <div class="metric-copy"><p>Llegadas pendientes</p><strong>{{ dashboardSummary.pendingArrivals }}</strong><small>Citas sin ingreso completado</small></div>
      <svg class="icon metric-arrow"><use href="#i-chevron" /></svg>
    </button>
    <button class="metric-card" type="button" @click="emit('openEquipment')">
      <span class="metric-icon metric-blue"><svg class="icon"><use href="#i-briefcase" /></svg></span>
      <div class="metric-copy"><p>Declaraciones de equipo</p><strong>{{ equipmentDeclarationCount ?? "—" }}</strong><small>Registros en el módulo de equipo</small></div>
      <svg class="icon metric-arrow"><use href="#i-chevron" /></svg>
    </button>
  </section>

  <section class="home-history-controls" aria-label="Consultar registros anteriores">
    <div class="home-history-heading">
      <strong>Historial de movimientos</strong>
      <span>Consulta registros anteriores y actualiza las gráficas por periodo.</span>
    </div>
    <div class="home-history-filters">
      <div class="home-history-presets" role="group" aria-label="Periodo del historial">
        <button
          type="button"
          :class="{ 'is-active': !customDateRange && historyFromDate === addDateOffset(today, -6) }"
          :aria-pressed="!customDateRange && historyFromDate === addDateOffset(today, -6)"
          @click="setHistoryPreset(7)"
        >7 días</button>
        <button
          type="button"
          :class="{ 'is-active': !customDateRange && historyFromDate === addDateOffset(today, -29) }"
          :aria-pressed="!customDateRange && historyFromDate === addDateOffset(today, -29)"
          @click="setHistoryPreset(30)"
        >30 días</button>
        <button
          type="button"
          :class="{ 'is-active': customDateRange }"
          :aria-pressed="customDateRange"
          @click="customDateRange = true"
        >Personalizado</button>
      </div>
      <div v-if="customDateRange" class="home-history-dates">
        <label>
          Desde
          <input v-model="historyFromDate" type="date" :max="historyToDate || undefined" />
        </label>
        <label>
          Hasta
          <input v-model="historyToDate" type="date" :min="historyFromDate || undefined" :max="today" />
        </label>
      </div>
      <span class="home-history-range">{{ historyRangeLabel }}</span>
    </div>
  </section>

  <p v-if="dashboardError" class="dashboard-data-error" role="alert">{{ dashboardError }}</p>

  <div class="home-analytics-grid">
    <section class="panel home-composition-chart" aria-labelledby="home-composition-title">
      <header class="panel-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-chart" /></svg>
          <div>
            <h2 id="home-composition-title">Composición de movimientos</h2>
            <p>Distribución · {{ historyRangeLabel }}</p>
          </div>
        </div>
        <button class="history-link" type="button" @click="openHistoryLog">Ver bitácora</button>
      </header>
      <div class="home-donut-layout">
        <div class="home-donut-wrap">
          <svg class="home-donut" viewBox="0 0 120 120" role="img" :aria-label="`${periodMovementTotal} movimientos del ${historyRangeLabel}`">
            <circle class="home-donut-track" cx="60" cy="60" r="43" />
            <g transform="rotate(-90 60 60)">
              <circle
                v-for="segment in donutSegments"
                :key="segment.key"
                class="home-donut-segment"
                :style="{ color: segment.color }"
                cx="60"
                cy="60"
                r="43"
                :stroke-dasharray="segment.dashArray"
                :stroke-dashoffset="segment.dashOffset"
              />
            </g>
            <text class="home-donut-total" x="60" y="58">{{ periodMovementTotal }}</text>
            <text class="home-donut-label" x="60" y="73">movimientos</text>
          </svg>
        </div>
        <div class="home-donut-legend" aria-label="Movimientos por tipo">
          <div v-for="item in movementBreakdown" :key="item.key" class="home-donut-legend-item">
            <span class="home-donut-key" :style="{ backgroundColor: item.color }"></span>
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
          <p v-if="periodMovementTotal === 0" class="home-chart-empty">Sin movimientos en este periodo.</p>
        </div>
      </div>
      <p class="home-chart-caption">Conteo real de los registros de la bitácora.</p>
    </section>

    <section class="panel home-trend-chart" aria-labelledby="home-trend-title">
      <header class="panel-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-chart" /></svg>
          <div>
            <h2 id="home-trend-title">Tendencia diaria</h2>
            <p>Volumen diario · {{ historyRangeLabel }}</p>
          </div>
        </div>
        <span class="home-chart-total"><strong>{{ periodMovementTotal }}</strong> total</span>
      </header>
      <div class="home-trend-legend" aria-label="Series de la gráfica">
        <span v-for="series in trendSeries" :key="series.key">
          <i :style="{ backgroundColor: series.color }"></i>{{ series.label }}
        </span>
      </div>
      <svg class="home-trend-svg" viewBox="0 0 420 166" role="img" aria-label="Gráfica de líneas de llegadas, entradas y salidas por día">
        <line v-for="y in [32, 84, 136]" :key="y" x1="30" :y1="y" x2="390" :y2="y" class="home-trend-gridline" />
        <text x="24" y="35" class="home-trend-axis">{{ maxTrendValue }}</text>
        <text x="24" y="87" class="home-trend-axis">{{ Math.ceil(maxTrendValue / 2) }}</text>
        <text x="24" y="139" class="home-trend-axis">0</text>
        <g v-for="series in trendSeries" :key="series.key">
          <polyline :points="trendPoints(series.key)" fill="none" :stroke="series.color" class="home-trend-line" />
          <circle
            v-for="(day, index) in periodActivity"
            :key="`${series.key}-${day.date}`"
            :cx="periodActivity.length < 2 ? 210 : 30 + index * 360 / (periodActivity.length - 1)"
            :cy="136 - day[series.key] / maxTrendValue * 104"
            r="3.5"
            :fill="series.color"
          >
            <title>{{ dayLabel(day.date) }} · {{ series.label }}: {{ day[series.key] }}</title>
          </circle>
        </g>
        <text
          v-for="item in trendDateLabels"
          :key="item.day.date"
          :x="periodActivity.length < 2 ? 210 : 30 + item.index * 360 / (periodActivity.length - 1)"
          y="158"
          class="home-trend-day"
        >{{ dayLabel(item.day.date) }}</text>
      </svg>
      <p v-if="dashboardLoading" class="home-chart-empty">Actualizando gráficas...</p>
      <p v-else-if="periodMovementTotal === 0" class="home-chart-empty">Sin actividad suficiente para mostrar una tendencia.</p>
    </section>
  </div>

  <div class="dashboard-panels">
    <section class="panel agenda-panel" aria-labelledby="agenda-title">
      <header class="panel-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-calendar" /></svg>
          <h2 id="agenda-title">
            {{ selectedAgendaDate === today ? "Agenda de citas de hoy" : `Agenda · ${selectedAgendaDateLabel}` }}
          </h2>
        </div>
        <div class="panel-actions">
          <label class="date-selector date-filter home-agenda-date">
            <svg class="icon"><use href="#i-calendar" /></svg>
            <span class="sr-only">Consultar citas de otra fecha</span>
            <input
              v-model="selectedAgendaDate"
              type="date"
              aria-label="Consultar citas de otra fecha"
            />
          </label>
          <button
            v-if="selectedAgendaDate !== today"
            class="button-secondary home-agenda-today"
            type="button"
            @click="selectedAgendaDate = today"
          >Hoy</button>
          <button class="button-primary" type="button" @click="openNewAppointment">
            <svg class="icon"><use href="#i-plus" /></svg><span>Nueva cita</span>
          </button>
          <button class="button-secondary" type="button" @click="openFirstSelectedDateQr">
            <svg class="icon"><use href="#i-qr" /></svg><span>Enviar QR</span>
          </button>
        </div>
      </header>

      <div class="table-scroll">
        <table class="appointment-table">
          <thead>
            <tr>
              <th>Hora</th><th>Visitante</th><th>Empresa</th><th>Anfitrión</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="appointment in selectedAgendaAppointments" :key="appointment.id">
              <td class="appointment-time">{{ appointment.time }}</td>
              <td><strong>{{ appointment.visitor }}</strong><small>{{ appointment.registeredBy }}</small></td>
              <td>{{ appointment.company }}</td>
              <td>{{ appointment.host }}</td>
              <td><span class="status-pill" :class="`status-${appointment.status.replace(' ', '-').toLowerCase()}`">{{ appointment.status }}</span></td>
              <td>
                <div class="agenda-actions home-agenda-actions">
                  <button
                    v-if="canManageAppointments && appointment.status !== 'Cancelada' && appointment.status !== 'Retirado'"
                    class="staff-edit-button"
                    type="button"
                    @click="emit('editAppointment', appointment)"
                  >Editar</button>
                  <button
                    v-if="canManageAppointments"
                    class="workspace-remove"
                    type="button"
                    :disabled="appointment.status === 'Cancelada' || appointment.status === 'Retirado'"
                    @click="emit('cancelAppointment', appointment)"
                  >Cancelar</button>
                  <button
                    class="qr-button"
                    type="button"
                    :aria-label="`Ver QR de ${appointment.visitor}`"
                    :disabled="appointment.status === 'Cancelada'"
                    @click="emit('openQr', appointment)"
                  ><svg class="icon"><use href="#i-qr" /></svg><span>Ver QR</span></button>
                  <button
                    v-if="canManageAppointments"
                    class="workspace-remove agenda-delete-action"
                    type="button"
                    :aria-label="`Eliminar cita de ${appointment.visitor}`"
                    :title="appointment.status === 'Cancelada' ? 'Eliminar cita cancelada' : 'Primero cancela la cita para poder eliminarla'"
                    :disabled="appointment.status !== 'Cancelada'"
                    @click="emit('deleteAppointment', appointment)"
                  >Eliminar</button>
                </div>
              </td>
            </tr>
            <tr v-if="selectedAgendaAppointments.length === 0">
              <td class="home-empty-state" colspan="6">
                No hay citas programadas {{ selectedAgendaDate === today ? "para hoy." : `para el ${selectedAgendaDateLabel}.` }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel activity-panel" aria-labelledby="activity-title">
      <header class="panel-heading activity-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-clock" /></svg>
          <h2 id="activity-title">Registros del periodo</h2>
        </div>
        <button class="history-link" type="button" @click="openHistoryLog">
          Ver toda la bitácora <svg class="icon"><use href="#i-arrow" /></svg>
        </button>
      </header>

      <div v-if="activities.length" class="activity-list">
        <article v-for="activity in activities" :key="activity.id" class="activity-item">
          <span class="activity-marker" :class="`tone-${activity.tone}`"><svg class="icon"><use :href="`#i-${activity.icon}`" /></svg></span>
          <time :datetime="`${activity.date}T${activity.time}`">
            <span>{{ dayLabel(activity.date) }}</span>
            <strong>{{ activity.time }}</strong>
          </time>
          <div class="activity-copy">
            <strong :class="`text-${activity.tone}`">{{ activity.title }}</strong>
            <p v-if="activity.company"><b>{{ activity.visitor }}</b><span>•</span>{{ activity.company }}</p>
            <p v-else><b>{{ activity.visitor }}</b></p>
            <small>{{ activity.detail }}</small>
          </div>
          <svg class="icon activity-arrow"><use href="#i-chevron" /></svg>
        </article>
      </div>
      <p v-else class="home-empty-state activity-empty-state">
        {{ dashboardLoading ? "Cargando registros..." : "No hay movimientos en el periodo seleccionado." }}
      </p>

    </section>

  </div>

  <section class="panel home-appointment-history" aria-labelledby="home-appointment-history-title">
    <header class="panel-heading">
      <div class="panel-title">
        <svg class="icon"><use href="#i-clock" /></svg>
        <div>
          <h2 id="home-appointment-history-title">Historial de citas</h2>
          <p>Creaciones, actualizaciones, cancelaciones y eliminaciones recientes</p>
        </div>
      </div>
      <span class="workspace-count">{{ appointmentHistory.length }} registros</span>
    </header>
    <div v-if="appointmentHistory.length > 0" class="home-appointment-history-list">
      <article
        v-for="item in appointmentHistory"
        :key="item.id"
        class="home-appointment-history-item"
      >
        <span class="home-history-action" :class="`history-action-${item.action.toLocaleLowerCase()}`">
          {{ item.action }}
        </span>
        <div class="home-appointment-history-copy">
          <strong>{{ item.visitor }} <span>·</span> {{ item.company }}</strong>
          <p>{{ item.details }} Cita: {{ formatRangeDate(item.appointmentDate) }} · {{ item.appointmentTime }} · Anfitrión: {{ item.host }}</p>
          <small>Por {{ item.actorName }} · {{ formatRangeDate(item.date) }} · {{ item.time }}</small>
        </div>
      </article>
    </div>
    <p v-else class="home-empty-state home-history-empty">
      {{ dashboardLoading ? "Cargando historial..." : "Aún no hay cambios registrados en las citas." }}
    </p>
  </section>

  <footer class="dashboard-summary" aria-label="Funciones del sistema">
    <article v-for="item in summaryItems" :key="item.title" class="summary-item">
      <svg class="icon"><use :href="`#i-${item.icon}`" /></svg>
      <div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p></div>
    </article>
  </footer>
</template>
