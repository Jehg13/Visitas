import { computed, onBeforeUnmount, onMounted, ref } from "vue";
const props = defineProps();
const emit = defineEmits();
const today = getLocalDate();
const dashboardSummary = ref({ insideNow: 0, pendingArrivals: 0 });
const recentEntries = ref([]);
const weekActivity = ref([]);
const equipmentDeclarationCount = ref(null);
const dashboardError = ref("");
const trendSeries = [
    { key: "arrivals", label: "Llegadas", color: "#3eb99d" },
    { key: "entries", label: "Entradas", color: "#4396df" },
    { key: "exits", label: "Salidas", color: "#d36b75" },
];
const todayAppointments = computed(() => props.appointments
    .filter((appointment) => appointment.date === today && appointment.status !== "Cancelada")
    .sort((first, second) => first.time.localeCompare(second.time)));
const activities = computed(() => recentEntries.value.slice(0, 6).map((entry) => ({
    id: entry.id,
    date: entry.date,
    time: entry.time,
    title: entry.event,
    visitor: entry.person,
    company: entry.company,
    detail: entry.details || (entry.host ? `Anfitrión: ${entry.host}` : "Movimiento registrado en recepción."),
    icon: entry.event === "Llegada" ? "arrival" : entry.event === "Ingreso" ? "entry" : entry.event === "Retiro" ? "exit" : "note",
    tone: entry.event === "Llegada" ? "green" : entry.event === "Ingreso" ? "blue" : entry.event === "Retiro" ? "red" : "slate",
})));
const weekActivityTotals = computed(() => weekActivity.value.reduce((totals, day) => ({
    arrivals: totals.arrivals + day.arrivals,
    entries: totals.entries + day.entries,
    exits: totals.exits + day.exits,
    observations: totals.observations + day.observations,
}), { arrivals: 0, entries: 0, exits: 0, observations: 0 }));
const weeklyMovementTotal = computed(() => weekActivityTotals.value.arrivals +
    weekActivityTotals.value.entries +
    weekActivityTotals.value.exits +
    weekActivityTotals.value.observations);
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
const maxTrendValue = computed(() => Math.max(1, ...weekActivity.value.flatMap((day) => trendSeries.map((series) => day[series.key]))));
function trendPoints(key) {
    return weekActivity.value
        .map((day, index) => {
        const x = 30 + index * 60;
        const y = 136 - day[key] / maxTrendValue.value * 104;
        return `${x},${y}`;
    })
        .join(" ");
}
function dayLabel(date) {
    return new Intl.DateTimeFormat("es-MX", { weekday: "short" })
        .format(new Date(`${date}T12:00:00`))
        .replace(".", "");
}
const formattedToday = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
}).format(new Date(`${today}T12:00:00`));
let dashboardRefreshTimer;
let dashboardRequestInProgress = false;
function getLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function getDateOffset(offset) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return getLocalDate(date);
}
async function loadDashboardData() {
    if (dashboardRequestInProgress)
        return;
    dashboardRequestInProgress = true;
    dashboardError.value = "";
    try {
        const [recentResponse, statsResponse, equipmentResponse] = await Promise.all([
            fetch(`/api/daily-log?from=${today}&to=${today}&page=1&pageSize=6`),
            fetch(`/api/daily-log/stats?from=${getDateOffset(-6)}&to=${today}`),
            fetch("/api/equipment/declarations?page=1"),
        ]);
        const [recentResult, statsResult, equipmentResult] = await Promise.all([
            recentResponse.json(),
            statsResponse.json(),
            equipmentResponse.json(),
        ]);
        if (!recentResponse.ok)
            throw new Error(recentResult.error ?? "No se pudo cargar la actividad reciente.");
        if (!Array.isArray(recentResult.entries) || !recentResult.summary) {
            throw new Error("La actividad reciente tiene un formato inesperado.");
        }
        if (!statsResponse.ok)
            throw new Error(statsResult.error ?? "No se pudo cargar el resumen semanal.");
        if (!Array.isArray(statsResult.stats)) {
            throw new Error("El resumen semanal tiene un formato inesperado.");
        }
        if (!equipmentResponse.ok)
            throw new Error(equipmentResult.error ?? "No se pudo cargar el total de declaraciones de equipo.");
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
    }
    catch (error) {
        console.error("No se pudo cargar el panel de control:", error);
        dashboardError.value = error instanceof Error ? error.message : "No se pudieron cargar los datos del panel.";
    }
    finally {
        dashboardRequestInProgress = false;
    }
}
onMounted(() => {
    void loadDashboardData();
    dashboardRefreshTimer = window.setInterval(() => {
        if (document.visibilityState === "visible")
            void loadDashboardData();
    }, 30000);
});
onBeforeUnmount(() => {
    if (dashboardRefreshTimer !== undefined)
        window.clearInterval(dashboardRefreshTimer);
});
function openFirstTodayQr() {
    const appointment = todayAppointments.value.find((candidate) => candidate.status === "Pendiente" || candidate.status === "En proceso");
    if (!appointment) {
        emit("showToast", "No hay citas pendientes hoy para enviar su QR.");
        return;
    }
    emit("openQr", appointment);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "metric-grid" },
    'aria-label': "Resumen de hoy",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('openAppointments');
        } },
    ...{ class: "metric-card" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "metric-icon metric-red" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-calendar",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "metric-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.todayAppointments.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon metric-arrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-chevron",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('openLog');
        } },
    ...{ class: "metric-card" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "metric-icon metric-blue" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-user",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "metric-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.dashboardSummary.insideNow);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon metric-arrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-chevron",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('openLog');
        } },
    ...{ class: "metric-card" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "metric-icon metric-red" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-qr",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "metric-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.dashboardSummary.pendingArrivals);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon metric-arrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-chevron",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('openEquipment');
        } },
    ...{ class: "metric-card" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "metric-icon metric-blue" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-briefcase",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "metric-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.equipmentDeclarationCount ?? "—");
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon metric-arrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-chevron",
});
if (__VLS_ctx.dashboardError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dashboard-data-error" },
        role: "alert",
    });
    (__VLS_ctx.dashboardError);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "home-analytics-grid" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "panel home-composition-chart" },
    'aria-labelledby': "home-composition-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "panel-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-chart",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "home-composition-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('openLog');
        } },
    ...{ class: "history-link" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "home-donut-layout" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "home-donut-wrap" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "home-donut" },
    viewBox: "0 0 120 120",
    role: "img",
    'aria-label': (`${__VLS_ctx.weeklyMovementTotal} movimientos en los últimos 7 días`),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    ...{ class: "home-donut-track" },
    cx: "60",
    cy: "60",
    r: "43",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.g, __VLS_intrinsicElements.g)({
    transform: "rotate(-90 60 60)",
});
for (const [segment] of __VLS_getVForSourceType((__VLS_ctx.donutSegments))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        key: (segment.key),
        ...{ class: "home-donut-segment" },
        ...{ style: ({ color: segment.color }) },
        cx: "60",
        cy: "60",
        r: "43",
        'stroke-dasharray': (segment.dashArray),
        'stroke-dashoffset': (segment.dashOffset),
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    ...{ class: "home-donut-total" },
    x: "60",
    y: "58",
});
(__VLS_ctx.weeklyMovementTotal);
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    ...{ class: "home-donut-label" },
    x: "60",
    y: "73",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "home-donut-legend" },
    'aria-label': "Movimientos por tipo",
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.movementBreakdown))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (item.key),
        ...{ class: "home-donut-legend-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "home-donut-key" },
        ...{ style: ({ backgroundColor: item.color }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (item.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (item.value);
}
if (__VLS_ctx.weeklyMovementTotal === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "home-chart-empty" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "home-chart-caption" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "panel home-trend-chart" },
    'aria-labelledby': "home-trend-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "panel-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-chart",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "home-trend-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "home-chart-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.weeklyMovementTotal);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "home-trend-legend" },
    'aria-label': "Series de la gráfica",
});
for (const [series] of __VLS_getVForSourceType((__VLS_ctx.trendSeries))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        key: (series.key),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ style: ({ backgroundColor: series.color }) },
    });
    (series.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "home-trend-svg" },
    viewBox: "0 0 420 166",
    role: "img",
    'aria-label': "Gráfica de líneas de llegadas, entradas y salidas por día",
});
for (const [y] of __VLS_getVForSourceType(([32, 84, 136]))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        key: (y),
        x1: "30",
        y1: (y),
        x2: "390",
        y2: (y),
        ...{ class: "home-trend-gridline" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    x: "24",
    y: "35",
    ...{ class: "home-trend-axis" },
});
(__VLS_ctx.maxTrendValue);
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    x: "24",
    y: "87",
    ...{ class: "home-trend-axis" },
});
(Math.ceil(__VLS_ctx.maxTrendValue / 2));
__VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
    x: "24",
    y: "139",
    ...{ class: "home-trend-axis" },
});
for (const [series] of __VLS_getVForSourceType((__VLS_ctx.trendSeries))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.g, __VLS_intrinsicElements.g)({
        key: (series.key),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline)({
        points: (__VLS_ctx.trendPoints(series.key)),
        fill: "none",
        stroke: (series.color),
        ...{ class: "home-trend-line" },
    });
    for (const [day, index] of __VLS_getVForSourceType((__VLS_ctx.weekActivity))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle, __VLS_intrinsicElements.circle)({
            key: (`${series.key}-${day.date}`),
            cx: (30 + index * 60),
            cy: (136 - day[series.key] / __VLS_ctx.maxTrendValue * 104),
            r: "3.5",
            fill: (series.color),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.title, __VLS_intrinsicElements.title)({});
        (__VLS_ctx.dayLabel(day.date));
        (series.label);
        (day[series.key]);
    }
}
for (const [day, index] of __VLS_getVForSourceType((__VLS_ctx.weekActivity))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
        key: (day.date),
        x: (30 + index * 60),
        y: "158",
        ...{ class: "home-trend-day" },
    });
    (__VLS_ctx.dayLabel(day.date));
}
if (__VLS_ctx.weeklyMovementTotal === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "home-chart-empty" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "dashboard-panels" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "panel agenda-panel" },
    'aria-labelledby': "agenda-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "panel-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-calendar",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "agenda-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('createAppointment');
        } },
    ...{ class: "button-primary" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-plus",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openFirstTodayQr) },
    ...{ class: "button-secondary" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-qr",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "table-scroll" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "appointment-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
for (const [appointment] of __VLS_getVForSourceType((__VLS_ctx.todayAppointments))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (appointment.id),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "appointment-time" },
    });
    (appointment.time);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (appointment.visitor);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (appointment.registeredBy);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (appointment.company);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (appointment.host);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "status-pill" },
        ...{ class: (`status-${appointment.status.replace(' ', '-').toLowerCase()}`) },
    });
    (appointment.status);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.emit('openQr', appointment);
            } },
        ...{ class: "qr-button" },
        type: "button",
        'aria-label': (`Ver QR de ${appointment.visitor}`),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-qr",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
if (__VLS_ctx.todayAppointments.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "home-empty-state" },
        colspan: "6",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "panel activity-panel" },
    'aria-labelledby': "activity-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "panel-heading activity-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-clock",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "activity-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('openLog');
        } },
    ...{ class: "history-link" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-arrow",
});
if (__VLS_ctx.activities.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "activity-list" },
    });
    for (const [activity] of __VLS_getVForSourceType((__VLS_ctx.activities))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (activity.id),
            ...{ class: "activity-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "activity-marker" },
            ...{ class: (`tone-${activity.tone}`) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
            href: (`#i-${activity.icon}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.time, __VLS_intrinsicElements.time)({
            datetime: (`${activity.date}T${activity.time}`),
        });
        (activity.time);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "activity-copy" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
            ...{ class: (`text-${activity.tone}`) },
        });
        (activity.title);
        if (activity.company) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
            (activity.visitor);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (activity.company);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
            (activity.visitor);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (activity.detail);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "icon activity-arrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
            href: "#i-chevron",
        });
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "home-empty-state activity-empty-state" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
    ...{ class: "dashboard-summary" },
    'aria-label': "Funciones del sistema",
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.summaryItems))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        key: (item.title),
        ...{ class: "summary-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: (`#i-${item.icon}`),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (item.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (item.detail);
}
/** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-red']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-blue']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-red']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-blue']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-data-error']} */ ;
/** @type {__VLS_StyleScopedClasses['home-analytics-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['home-composition-chart']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['history-link']} */ ;
/** @type {__VLS_StyleScopedClasses['home-donut-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['home-donut-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['home-donut']} */ ;
/** @type {__VLS_StyleScopedClasses['home-donut-track']} */ ;
/** @type {__VLS_StyleScopedClasses['home-donut-segment']} */ ;
/** @type {__VLS_StyleScopedClasses['home-donut-total']} */ ;
/** @type {__VLS_StyleScopedClasses['home-donut-label']} */ ;
/** @type {__VLS_StyleScopedClasses['home-donut-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['home-donut-legend-item']} */ ;
/** @type {__VLS_StyleScopedClasses['home-donut-key']} */ ;
/** @type {__VLS_StyleScopedClasses['home-chart-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['home-chart-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['home-trend-chart']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['home-chart-total']} */ ;
/** @type {__VLS_StyleScopedClasses['home-trend-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['home-trend-svg']} */ ;
/** @type {__VLS_StyleScopedClasses['home-trend-gridline']} */ ;
/** @type {__VLS_StyleScopedClasses['home-trend-axis']} */ ;
/** @type {__VLS_StyleScopedClasses['home-trend-axis']} */ ;
/** @type {__VLS_StyleScopedClasses['home-trend-axis']} */ ;
/** @type {__VLS_StyleScopedClasses['home-trend-line']} */ ;
/** @type {__VLS_StyleScopedClasses['home-trend-day']} */ ;
/** @type {__VLS_StyleScopedClasses['home-chart-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-panels']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['agenda-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['appointment-table']} */ ;
/** @type {__VLS_StyleScopedClasses['appointment-time']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-button']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['home-empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['history-link']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-list']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-item']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-marker']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['home-empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['activity-empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-item']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            dashboardSummary: dashboardSummary,
            weekActivity: weekActivity,
            equipmentDeclarationCount: equipmentDeclarationCount,
            dashboardError: dashboardError,
            trendSeries: trendSeries,
            todayAppointments: todayAppointments,
            activities: activities,
            weeklyMovementTotal: weeklyMovementTotal,
            movementBreakdown: movementBreakdown,
            donutSegments: donutSegments,
            maxTrendValue: maxTrendValue,
            trendPoints: trendPoints,
            dayLabel: dayLabel,
            openFirstTodayQr: openFirstTodayQr,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
