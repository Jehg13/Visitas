<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type AppointmentStatus = "Dentro" | "En proceso" | "Pendiente" | "Retirado" | "Cancelada";
type Appointment = {
  id: number;
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

const props = defineProps<{
  appointments: Appointment[];
  summaryItems: SummaryItem[];
}>();

const emit = defineEmits<{
  createAppointment: [];
  openQr: [appointment: Appointment];
  showToast: [message: string];
  openLog: [];
  openAppointments: [];
  openEquipment: [];
}>();

const today = getLocalDate();
const dashboardSummary = ref({ insideNow: 0, pendingArrivals: 0 });
const recentEntries = ref<LogEntry[]>([]);
const weekActivity = ref<DailyActivity[]>([]);
const equipmentDeclarationCount = ref<number | null>(null);
const dashboardError = ref("");
const trendSeries: TrendSeries[] = [
  { key: "arrivals", label: "Llegadas", color: "#3eb99d" },
  { key: "entries", label: "Entradas", color: "#4396df" },
  { key: "exits", label: "Salidas", color: "#d36b75" },
];
const todayAppointments = computed(() =>
  props.appointments
    .filter((appointment) => appointment.date === today && appointment.status !== "Cancelada")
    .sort((first, second) => first.time.localeCompare(second.time)),
);
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
const weekActivityTotals = computed(() =>
  weekActivity.value.reduce(
    (totals, day) => ({
      arrivals: totals.arrivals + day.arrivals,
      entries: totals.entries + day.entries,
      exits: totals.exits + day.exits,
      observations: totals.observations + day.observations,
    }),
    { arrivals: 0, entries: 0, exits: 0, observations: 0 },
  ),
);
const weeklyMovementTotal = computed(
  () =>
    weekActivityTotals.value.arrivals +
    weekActivityTotals.value.entries +
    weekActivityTotals.value.exits +
    weekActivityTotals.value.observations,
);
const movementBreakdown = computed(() => [
  { key: "arrivals", label: "Llegadas", value: weekActivityTotals.value.arrivals, color: "#3eb99d" },
  { key: "entries", label: "Entradas", value: weekActivityTotals.value.entries, color: "#4396df" },
  { key: "exits", label: "Salidas", value: weekActivityTotals.value.exits, color: "#d36b75" },
  { key: "observations", label: "Observaciones", value: weekActivityTotals.value.observations, color: "#8b9caf" },
]);
const donutSegments = computed(() => {
  const circumference = 2 * Math.PI * 43;
  let offset = 0;
  return movementBreakdown.value
    .filter((segment) => segment.value > 0 && weeklyMovementTotal.value > 0)
    .map((segment) => {
      const length = segment.value / weeklyMovementTotal.value * circumference;
      const current = { ...segment, dashArray: `${length} ${circumference - length}`, dashOffset: -offset };
      offset += length;
      return current;
    });
});
const maxTrendValue = computed(() =>
  Math.max(1, ...weekActivity.value.flatMap((day) => trendSeries.map((series) => day[series.key]))),
);

function trendPoints(key: MovementKey) {
  return weekActivity.value
    .map((day, index) => {
      const x = 30 + index * 60;
      const y = 136 - day[key] / maxTrendValue.value * 104;
      return `${x},${y}`;
    })
    .join(" ");
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("es-MX", { weekday: "short" })
    .format(new Date(`${date}T12:00:00`))
    .replace(".", "");
}

const formattedToday = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date(`${today}T12:00:00`));

let dashboardRefreshTimer: number | undefined;
let dashboardRequestInProgress = false;

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

async function loadDashboardData() {
  if (dashboardRequestInProgress) return;
  dashboardRequestInProgress = true;
  dashboardError.value = "";
  try {
    const [recentResponse, statsResponse, equipmentResponse] = await Promise.all([
      fetch(`/api/daily-log?from=${today}&to=${today}&page=1&pageSize=6`),
      fetch(`/api/daily-log/stats?from=${getDateOffset(-6)}&to=${today}`),
      fetch("/api/equipment/declarations?page=1"),
    ]);
    const [recentResult, statsResult, equipmentResult] = await Promise.all([
      recentResponse.json() as Promise<{
        entries?: LogEntry[];
        summary?: { insideNow?: number; pendingArrivals?: number };
        error?: string;
      }>,
      statsResponse.json() as Promise<{ stats?: DailyActivity[]; error?: string }>,
      equipmentResponse.json() as Promise<{ total?: number; error?: string }>,
    ]);

    if (!recentResponse.ok) throw new Error(recentResult.error ?? "No se pudo cargar la actividad reciente.");
    if (!Array.isArray(recentResult.entries) || !recentResult.summary) {
      throw new Error("La actividad reciente tiene un formato inesperado.");
    }
    if (!statsResponse.ok) throw new Error(statsResult.error ?? "No se pudo cargar el resumen semanal.");
    if (!Array.isArray(statsResult.stats)) {
      throw new Error("El resumen semanal tiene un formato inesperado.");
    }
    if (!equipmentResponse.ok) throw new Error(equipmentResult.error ?? "No se pudo cargar el total de declaraciones de equipo.");
    if (typeof equipmentResult.total !== "number" || !Number.isSafeInteger(equipmentResult.total)) {
      throw new Error("El total de declaraciones de equipo tiene un formato inesperado.");
    }

    recentEntries.value = recentResult.entries;
    dashboardSummary.value = {
      insideNow: recentResult.summary.insideNow ?? 0,
      pendingArrivals: recentResult.summary.pendingArrivals ?? 0,
    };
    const byDate = new Map(statsResult.stats.map((day) => [day.date, day]));
    weekActivity.value = Array.from({ length: 7 }, (_, index) => {
      const date = getDateOffset(index - 6);
      return byDate.get(date) ?? { date, arrivals: 0, entries: 0, exits: 0, observations: 0 };
    });
    equipmentDeclarationCount.value = equipmentResult.total;
  } catch (error) {
    console.error("No se pudo cargar el panel de control:", error);
    dashboardError.value = error instanceof Error ? error.message : "No se pudieron cargar los datos del panel.";
  } finally {
    dashboardRequestInProgress = false;
  }
}

onMounted(() => {
  void loadDashboardData();
  dashboardRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") void loadDashboardData();
  }, 30000);
});

onBeforeUnmount(() => {
  if (dashboardRefreshTimer !== undefined) window.clearInterval(dashboardRefreshTimer);
});

function openFirstTodayQr() {
  const appointment = todayAppointments.value.find((candidate) =>
    candidate.status === "Pendiente" || candidate.status === "En proceso",
  );
  if (!appointment) {
    emit("showToast", "No hay citas pendientes hoy para enviar su QR.");
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
    <button class="metric-card" type="button" @click="emit('openLog')">
      <span class="metric-icon metric-blue"><svg class="icon"><use href="#i-user" /></svg></span>
      <div class="metric-copy"><p>Visitantes dentro</p><strong>{{ dashboardSummary.insideNow }}</strong><small>Según el último movimiento</small></div>
      <svg class="icon metric-arrow"><use href="#i-chevron" /></svg>
    </button>
    <button class="metric-card" type="button" @click="emit('openLog')">
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

  <p v-if="dashboardError" class="dashboard-data-error" role="alert">{{ dashboardError }}</p>

  <div class="home-analytics-grid">
    <section class="panel home-composition-chart" aria-labelledby="home-composition-title">
      <header class="panel-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-chart" /></svg>
          <div>
            <h2 id="home-composition-title">Composición de movimientos</h2>
            <p>Distribución de los últimos 7 días</p>
          </div>
        </div>
        <button class="history-link" type="button" @click="emit('openLog')">Ver bitácora</button>
      </header>
      <div class="home-donut-layout">
        <div class="home-donut-wrap">
          <svg class="home-donut" viewBox="0 0 120 120" role="img" :aria-label="`${weeklyMovementTotal} movimientos en los últimos 7 días`">
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
            <text class="home-donut-total" x="60" y="58">{{ weeklyMovementTotal }}</text>
            <text class="home-donut-label" x="60" y="73">movimientos</text>
          </svg>
        </div>
        <div class="home-donut-legend" aria-label="Movimientos por tipo">
          <div v-for="item in movementBreakdown" :key="item.key" class="home-donut-legend-item">
            <span class="home-donut-key" :style="{ backgroundColor: item.color }"></span>
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
          <p v-if="weeklyMovementTotal === 0" class="home-chart-empty">Sin movimientos en este periodo.</p>
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
            <p>Volumen por tipo de movimiento · últimos 7 días</p>
          </div>
        </div>
        <span class="home-chart-total"><strong>{{ weeklyMovementTotal }}</strong> total</span>
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
            v-for="(day, index) in weekActivity"
            :key="`${series.key}-${day.date}`"
            :cx="30 + index * 60"
            :cy="136 - day[series.key] / maxTrendValue * 104"
            r="3.5"
            :fill="series.color"
          >
            <title>{{ dayLabel(day.date) }} · {{ series.label }}: {{ day[series.key] }}</title>
          </circle>
        </g>
        <text
          v-for="(day, index) in weekActivity"
          :key="day.date"
          :x="30 + index * 60"
          y="158"
          class="home-trend-day"
        >{{ dayLabel(day.date) }}</text>
      </svg>
      <p v-if="weeklyMovementTotal === 0" class="home-chart-empty">Sin actividad suficiente para mostrar una tendencia.</p>
    </section>
  </div>

  <div class="dashboard-panels">
    <section class="panel agenda-panel" aria-labelledby="agenda-title">
      <header class="panel-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-calendar" /></svg>
          <h2 id="agenda-title">Agenda de citas de hoy</h2>
        </div>
        <div class="panel-actions">
          <button class="button-primary" type="button" @click="emit('createAppointment')">
            <svg class="icon"><use href="#i-plus" /></svg><span>Nueva cita</span>
          </button>
          <button class="button-secondary" type="button" @click="openFirstTodayQr">
            <svg class="icon"><use href="#i-qr" /></svg><span>Enviar QR</span>
          </button>
        </div>
      </header>

      <div class="table-scroll">
        <table class="appointment-table">
          <thead>
            <tr>
              <th>Hora</th><th>Visitante</th><th>Empresa</th><th>Anfitrión</th><th>Estado</th><th>QR</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="appointment in todayAppointments" :key="appointment.id">
              <td class="appointment-time">{{ appointment.time }}</td>
              <td><strong>{{ appointment.visitor }}</strong><small>{{ appointment.registeredBy }}</small></td>
              <td>{{ appointment.company }}</td>
              <td>{{ appointment.host }}</td>
              <td><span class="status-pill" :class="`status-${appointment.status.replace(' ', '-').toLowerCase()}`">{{ appointment.status }}</span></td>
              <td>
                <button class="qr-button" type="button" :aria-label="`Ver QR de ${appointment.visitor}`" @click="emit('openQr', appointment)">
                  <svg class="icon"><use href="#i-qr" /></svg><span>Ver QR</span>
                </button>
              </td>
            </tr>
            <tr v-if="todayAppointments.length === 0">
              <td class="home-empty-state" colspan="6">No hay citas programadas para hoy.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel activity-panel" aria-labelledby="activity-title">
      <header class="panel-heading activity-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-clock" /></svg>
          <h2 id="activity-title">Actividad reciente</h2>
        </div>
        <button class="history-link" type="button" @click="emit('openLog')">
          Ver toda la bitácora <svg class="icon"><use href="#i-arrow" /></svg>
        </button>
      </header>

      <div v-if="activities.length" class="activity-list">
        <article v-for="activity in activities" :key="activity.id" class="activity-item">
          <span class="activity-marker" :class="`tone-${activity.tone}`"><svg class="icon"><use :href="`#i-${activity.icon}`" /></svg></span>
          <time :datetime="`${activity.date}T${activity.time}`">{{ activity.time }}</time>
          <div class="activity-copy">
            <strong :class="`text-${activity.tone}`">{{ activity.title }}</strong>
            <p v-if="activity.company"><b>{{ activity.visitor }}</b><span>•</span>{{ activity.company }}</p>
            <p v-else><b>{{ activity.visitor }}</b></p>
            <small>{{ activity.detail }}</small>
          </div>
          <svg class="icon activity-arrow"><use href="#i-chevron" /></svg>
        </article>
      </div>
      <p v-else class="home-empty-state activity-empty-state">Todavía no hay movimientos registrados hoy.</p>

    </section>

  </div>

  <footer class="dashboard-summary" aria-label="Funciones del sistema">
    <article v-for="item in summaryItems" :key="item.title" class="summary-item">
      <svg class="icon"><use :href="`#i-${item.icon}`" /></svg>
      <div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p></div>
    </article>
  </footer>
</template>
