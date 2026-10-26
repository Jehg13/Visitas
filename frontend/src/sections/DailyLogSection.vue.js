import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps();
const emit = defineEmits();
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
const entries = ref([]);
const summary = ref({
    movementCount: 0,
    insideNow: 0,
    pendingArrivals: 0,
    exits: 0,
});
const hosts = ref([]);
const total = ref(0);
const pages = ref(1);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const quickActionError = ref("");
const quickActionNotice = ref("");
const quickActionAppointmentId = ref(null);
const quickSearch = ref("");
const quickSearchInput = ref(null);
const selectedQuickAppointmentId = ref(null);
const quickObservation = ref("");
const quickStatusOverrides = ref({});
const dialogOpen = ref(false);
const logEvent = ref("Llegada");
const logTime = ref(getLocalTime());
const logPersonType = ref("appointment");
const logSubjectId = ref("");
const manualPerson = ref("");
const logDate = ref(today.value);
const logDetails = ref("");
let requestVersion = 0;
let searchTimer;
const selectedAppointments = computed(() => [...props.appointments]
    .filter((appointment) => appointment.status !== "Cancelada" && appointment.status !== "Retirado")
    .sort((first, second) => `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`)));
const todayAppointments = computed(() => [...props.appointments]
    .filter((appointment) => appointment.date === today.value &&
    appointment.status !== "Cancelada")
    .sort((first, second) => `${first.time} ${first.visitor}`.localeCompare(`${second.time} ${second.visitor}`, "es")));
const filteredQuickAppointments = computed(() => {
    const query = quickSearch.value.trim().toLocaleLowerCase("es");
    if (!query)
        return todayAppointments.value;
    return todayAppointments.value.filter((appointment) => [appointment.visitor, appointment.company, appointment.host, appointment.time]
        .some((value) => value.toLocaleLowerCase("es").includes(query)));
});
const selectedQuickAppointment = computed(() => todayAppointments.value.find((appointment) => appointment.id === selectedQuickAppointmentId.value) ?? null);
const selectedExternalStaff = computed(() => [...props.externalStaff].sort((first, second) => first.fullName.localeCompare(second.fullName, "es")));
const selectedVisitors = computed(() => [...props.generalVisitors].sort((first, second) => first.fullName.localeCompare(second.fullName, "es")));
const departmentOptions = computed(() => {
    const hostDepartmentIds = new Set(props.hosts.map((host) => host.departmentId));
    return props.departments
        .filter((department) => hostDepartmentIds.has(department.id))
        .sort((first, second) => first.name.localeCompare(second.name, "es"));
});
const departmentHostNames = computed(() => {
    if (!departmentFilter.value)
        return [];
    const department = departmentOptions.value.find((item) => String(item.id) === departmentFilter.value);
    if (!department)
        return [];
    return props.hosts
        .filter((host) => host.departmentId === department.id)
        .map((host) => host.name);
});
const availableHosts = computed(() => {
    if (!departmentFilter.value)
        return hosts.value;
    const names = new Set(departmentHostNames.value);
    return hosts.value.filter((host) => names.has(host));
});
const requiresLinkedPerson = computed(() => logEvent.value === "Ingreso" || logEvent.value === "Retiro");
const groupedEntries = computed(() => {
    const groups = new Map();
    for (const entry of entries.value) {
        const group = groups.get(entry.date) ?? [];
        group.push(entry);
        groups.set(entry.date, group);
    }
    return [...groups.entries()].map(([date, groupEntries]) => ({ date, entries: groupEntries }));
});
const rangeLabel = computed(() => {
    if (fromDate.value === toDate.value)
        return formatDate(fromDate.value);
    return `${formatDate(fromDate.value)} — ${formatDate(toDate.value)}`;
});
watch(() => props.appointments, (appointments) => {
    for (const appointment of appointments) {
        if (quickStatusOverrides.value[appointment.id] === appointment.status) {
            delete quickStatusOverrides.value[appointment.id];
        }
    }
});
function quickAppointmentStatus(appointment) {
    return quickStatusOverrides.value[appointment.id] ?? appointment.status;
}
function getLocalDate() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
function refreshLocalDate() {
    today.value = getLocalDate();
}
function getLocalTime() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
function formatDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(new Date(year, month - 1, day, 12));
}
function eventIcon(event) {
    if (event === "Llegada")
        return "M12 3v12m0 0 4-4m-4 4-4-4M5 21h14";
    if (event === "Ingreso")
        return "M4 12h15m0 0-5-5m5 5-5 5M4 5v14";
    if (event === "Retiro")
        return "M20 12H5m0 0 5-5m-5 5 5 5M20 5v14";
    return "M12 8v4m0 4h.01M5 4h14v16H5z";
}
function eventVerb(event) {
    if (event === "Observaciones")
        return "Observación registrada";
    if (event === "Llegada")
        return "Llegada registrada";
    if (event === "Ingreso")
        return "Entrada registrada";
    return "Retiro registrado";
}
function departmentForHost(hostName) {
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
    }
    else if (hostFilter.value) {
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
        const result = await response.json();
        if (currentRequest !== requestVersion)
            return;
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
    }
    catch (cause) {
        console.error("Failed to load daily log:", cause);
        if (currentRequest === requestVersion) {
            error.value = "No se pudo conectar con el servidor para cargar la bitácora.";
            entries.value = [];
        }
    }
    finally {
        if (currentRequest === requestVersion)
            loading.value = false;
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
function changePersonType(value) {
    logPersonType.value = value;
    logSubjectId.value = "";
    manualPerson.value = "";
}
async function submitEntry() {
    if (saving.value)
        return;
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
        const result = await response.json();
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
    }
    catch (cause) {
        console.error("Failed to save daily log movement:", cause);
        error.value = "No se pudo conectar con el servidor para guardar el movimiento.";
    }
    finally {
        saving.value = false;
    }
}
function selectQuickAppointment(appointment) {
    selectedQuickAppointmentId.value = appointment.id;
    quickActionError.value = "";
    quickActionNotice.value = "";
    quickObservation.value = "";
    quickSearch.value = appointment.visitor;
}
function movementIsAvailable(event, appointment) {
    const status = quickAppointmentStatus(appointment);
    if (status === "Cancelada" || status === "Retirado")
        return false;
    if (event === "Llegada")
        return status === "Pendiente";
    if (event === "Ingreso")
        return status === "Pendiente" || status === "En proceso";
    return status === "Dentro";
}
async function saveQuickMovement(event) {
    const appointment = selectedQuickAppointment.value;
    if (!appointment || quickActionAppointmentId.value !== null || !movementIsAvailable(event, appointment))
        return;
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
        const result = await response.json();
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
    }
    catch (cause) {
        console.error("Failed to update visit status:", cause);
        quickActionError.value = "No se pudo conectar con el servidor. Intenta de nuevo.";
    }
    finally {
        quickActionAppointmentId.value = null;
        await nextTick();
        quickSearchInput.value?.focus();
    }
}
async function handleQuickSearchEnter() {
    if (quickActionAppointmentId.value !== null)
        return;
    quickActionError.value = "";
    quickActionNotice.value = "";
    selectedQuickAppointmentId.value = null;
    refreshLocalDate();
    const value = quickSearch.value.trim();
    if (!value)
        return;
    let scannedAppointmentId = null;
    try {
        const scannedValue = JSON.parse(value);
        if (typeof scannedValue === "object" &&
            scannedValue !== null &&
            "type" in scannedValue &&
            scannedValue.type === "visitas-appointment" &&
            "id" in scannedValue &&
            typeof scannedValue.id === "number" &&
            Number.isSafeInteger(scannedValue.id)) {
            scannedAppointmentId = scannedValue.id;
        }
    }
    catch {
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
    }
    else if (filteredQuickAppointments.value.length > 1) {
        quickActionNotice.value = "Selecciona a la persona correcta de la lista.";
    }
    else {
        quickActionError.value = "No encontramos una cita de hoy con ese nombre o empresa.";
    }
}
async function removeEntry(entry) {
    if (!window.confirm(`¿Eliminar el movimiento de ${entry.person}? Esta acción no se puede deshacer.`)) {
        return;
    }
    try {
        const response = await fetch(`/api/daily-log/${entry.id}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) {
            error.value = result.error ?? "No se pudo eliminar el movimiento.";
            return;
        }
        await loadEntries();
    }
    catch (cause) {
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
    const offset = start.getTimezoneOffset() * 60000;
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
    if (searchTimer)
        clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadEntries(), 250);
});
onMounted(() => {
    void loadEntries();
    quickSearchInput.value?.focus();
});
onBeforeUnmount(() => {
    requestVersion += 1;
    if (searchTimer)
        clearTimeout(searchTimer);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "daily-log-page" },
    'aria-labelledby': "daily-log-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "daily-log-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-heading-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 3 4.5 6v5.6c0 4.5 3.2 7.8 7.5 9.4 4.3-1.6 7.5-4.9 7.5-9.4V6L12 3Z",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m9 12 2 2 4-4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "daily-log-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-header-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-date-range" },
    'aria-label': "Rango de fechas",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    type: "date",
    'aria-label': "Fecha inicial de la bitácora",
});
(__VLS_ctx.fromDate);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-date-separator" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    type: "date",
    'aria-label': "Fecha final de la bitácora",
});
(__VLS_ctx.toDate);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.showRecentHistory) },
    ...{ class: "daily-log-secondary-button" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 12a9 9 0 1 0 2.6-6.4L3 8",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 3v5h5m4-1v5l3 2",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openCreateDialog) },
    ...{ class: "daily-log-primary-button" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 5v14M5 12h14",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-summary" },
    'aria-label': "Resumen de movimientos",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "daily-log-stat daily-log-stat-events" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-stat-icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M5 4h14v17H5zM8 8h8M8 12h8M8 16h5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M8 2v4m8-4v4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.summary.movementCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
(__VLS_ctx.rangeLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "daily-log-stat daily-log-stat-inside" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-stat-icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 21V8l9-5 9 5v13M8 21v-6h8v6M8 10h.01M12 10h.01M16 10h.01",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.summary.insideNow);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "daily-log-stat daily-log-stat-pending" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-stat-icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "12",
    cy: "12",
    r: "9",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 7v5l3 2",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.summary.pendingArrivals);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "daily-log-stat daily-log-stat-exits" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-stat-icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M10 4H5v16h5m3-4 4-4-4-4m4 4H8",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.summary.exits);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "daily-log-quick-panel" },
    'aria-labelledby': "daily-log-quick-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-quick-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-panel-kicker" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    id: "daily-log-quick-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-result-count" },
});
(__VLS_ctx.todayAppointments.length);
(__VLS_ctx.todayAppointments.length === 1 ? "visita" : "visitas");
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "daily-log-quick-search" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M7 12h10",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (...[$event]) => {
            __VLS_ctx.selectedQuickAppointmentId = null;
            __VLS_ctx.quickActionError = '';
            __VLS_ctx.quickActionNotice = '';
        } },
    ...{ onKeydown: (__VLS_ctx.handleQuickSearchEnter) },
    ref: "quickSearchInput",
    type: "search",
    placeholder: "Nombre, empresa o escanea QR…",
    'aria-label': "Busca por nombre o empresa, o escanea QR",
    disabled: (__VLS_ctx.appointmentsLoading),
});
(__VLS_ctx.quickSearch);
/** @type {typeof __VLS_ctx.quickSearchInput} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
if (__VLS_ctx.quickActionNotice) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-quick-notice" },
        role: "status",
    });
    (__VLS_ctx.quickActionNotice);
}
if (__VLS_ctx.quickActionError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-quick-error" },
        role: "alert",
    });
    (__VLS_ctx.quickActionError);
}
if (__VLS_ctx.appointmentsLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-quick-empty" },
    });
}
else if (!__VLS_ctx.todayAppointments.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-quick-empty" },
    });
}
else if (__VLS_ctx.filteredQuickAppointments.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-quick-list" },
    });
    for (const [appointment] of __VLS_getVForSourceType((__VLS_ctx.filteredQuickAppointments))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.appointmentsLoading))
                        return;
                    if (!!(!__VLS_ctx.todayAppointments.length))
                        return;
                    if (!(__VLS_ctx.filteredQuickAppointments.length))
                        return;
                    __VLS_ctx.selectQuickAppointment(appointment);
                } },
            key: (appointment.id),
            ...{ class: "daily-log-quick-visitor" },
            ...{ class: ({ 'daily-log-quick-visitor-selected': __VLS_ctx.selectedQuickAppointmentId === appointment.id }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "daily-log-quick-status" },
            ...{ class: (`daily-log-quick-status-${__VLS_ctx.quickAppointmentStatus(appointment).toLowerCase().replace(' ', '-')}`) },
        });
        (__VLS_ctx.quickAppointmentStatus(appointment));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "daily-log-quick-person" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (appointment.visitor);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (appointment.time);
        if (appointment.company) {
            (appointment.company);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "daily-log-quick-select" },
        });
        (__VLS_ctx.selectedQuickAppointmentId === appointment.id ? "Seleccionada" : "Seleccionar");
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-quick-empty" },
    });
    (__VLS_ctx.quickSearch);
}
if (__VLS_ctx.selectedQuickAppointment) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-selected-person" },
        'aria-live': "polite",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-selected-person-details" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedQuickAppointment.visitor);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.selectedQuickAppointment.company || "Visitante");
    if (__VLS_ctx.selectedQuickAppointment.host) {
        (__VLS_ctx.selectedQuickAppointment.host);
    }
    (__VLS_ctx.selectedQuickAppointment.time);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "daily-log-quick-observation" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        value: (__VLS_ctx.quickObservation),
        type: "text",
        maxlength: "4000",
        placeholder: "Agrega un detalle si hace falta",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-quick-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedQuickAppointment))
                    return;
                __VLS_ctx.saveQuickMovement('Llegada');
            } },
        ...{ class: "daily-log-quick-action" },
        type: "button",
        disabled: (__VLS_ctx.quickActionAppointmentId !== null || !__VLS_ctx.movementIsAvailable('Llegada', __VLS_ctx.selectedQuickAppointment)),
    });
    (__VLS_ctx.quickActionAppointmentId === __VLS_ctx.selectedQuickAppointment.id ? "Guardando…" : "Llegada");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedQuickAppointment))
                    return;
                __VLS_ctx.saveQuickMovement('Ingreso');
            } },
        ...{ class: "daily-log-quick-action" },
        type: "button",
        disabled: (__VLS_ctx.quickActionAppointmentId !== null || !__VLS_ctx.movementIsAvailable('Ingreso', __VLS_ctx.selectedQuickAppointment)),
    });
    (__VLS_ctx.quickActionAppointmentId === __VLS_ctx.selectedQuickAppointment.id ? "Guardando…" : "Entrada");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedQuickAppointment))
                    return;
                __VLS_ctx.saveQuickMovement('Retiro');
            } },
        ...{ class: "daily-log-quick-action daily-log-quick-action-exit" },
        type: "button",
        disabled: (__VLS_ctx.quickActionAppointmentId !== null || !__VLS_ctx.movementIsAvailable('Retiro', __VLS_ctx.selectedQuickAppointment)),
    });
    (__VLS_ctx.quickActionAppointmentId === __VLS_ctx.selectedQuickAppointment.id ? "Guardando…" : "Retiro");
}
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-error" },
        role: "alert",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M12 3 2.8 20h18.4L12 3Z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M12 9v5m0 3h.01",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.error);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadEntries) },
        type: "button",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "daily-log-panel" },
    'aria-labelledby': "daily-log-activity-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-panel-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-panel-kicker" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    id: "daily-log-activity-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-result-count" },
});
(__VLS_ctx.total);
(__VLS_ctx.total === 1 ? "movimiento" : "movimientos");
__VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
    ...{ onSubmit: (...[$event]) => {
            __VLS_ctx.page = 1;
            __VLS_ctx.loadEntries();
        } },
    ...{ class: "daily-log-filters" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "daily-log-search" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "10.8",
    cy: "10.8",
    r: "6.8",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m16 16 5 5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    type: "search",
    placeholder: "Buscar persona, empresa o anfitrión",
    'aria-label': "Buscar persona, empresa o anfitrión",
});
(__VLS_ctx.search);
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "sr-only" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
    value: (__VLS_ctx.eventFilter),
    'aria-label': "Filtrar por movimiento",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Llegada",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Ingreso",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Retiro",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Observaciones",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "sr-only" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
    value: (__VLS_ctx.categoryFilter),
    'aria-label': "Filtrar por categoría",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Visitante",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Contratista",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Proveedor",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "Sin categoría",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "sr-only" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
    value: (__VLS_ctx.hostFilter),
    'aria-label': "Filtrar por anfitrión",
    disabled: (Boolean(__VLS_ctx.departmentFilter)),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "",
});
for (const [host] of __VLS_getVForSourceType((__VLS_ctx.availableHosts))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        key: (host),
        value: (host),
    });
    (host);
}
if (__VLS_ctx.departmentOptions.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sr-only" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.departmentFilter),
        'aria-label': "Filtrar por departamento",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    for (const [department] of __VLS_getVForSourceType((__VLS_ctx.departmentOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (department.id),
            value: (String(department.id)),
        });
        (department.name);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.resetFilters) },
    ...{ class: "daily-log-reset-button" },
    type: "button",
});
if (__VLS_ctx.loading && __VLS_ctx.entries.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-loading" },
        role: "status",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "daily-log-spinner" },
    });
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-loading" },
        role: "status",
    });
}
else if (!__VLS_ctx.loading && __VLS_ctx.entries.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "daily-log-empty-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 48 48",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M24 5 8 11v12c0 9 6.8 15.7 16 20 9.2-4.3 16-11 16-20V11L24 5Z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M17 24h14m-7-7v14",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
    (__VLS_ctx.total === 0 && !__VLS_ctx.search && !__VLS_ctx.eventFilter && !__VLS_ctx.categoryFilter && !__VLS_ctx.hostFilter ? "Sin movimientos registrados" : "No encontramos resultados");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.total === 0 && !__VLS_ctx.search && !__VLS_ctx.eventFilter && !__VLS_ctx.categoryFilter && !__VLS_ctx.hostFilter ? "Todavía no hay actividad registrada para este periodo." : "Prueba con otra búsqueda o limpia los filtros para consultar más movimientos.");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-empty-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openCreateDialog) },
        ...{ class: "daily-log-primary-button" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M12 5v14M5 12h14",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.resetFilters) },
        ...{ class: "daily-log-secondary-button" },
        type: "button",
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-timeline" },
    });
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.groupedEntries))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            key: (group.date),
            ...{ class: "daily-log-day-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ class: "daily-log-day-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.formatDate(group.date));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (group.entries.length);
        (group.entries.length === 1 ? "evento" : "eventos");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ol, __VLS_intrinsicElements.ol)({
            ...{ class: "daily-log-event-list" },
        });
        for (const [entry] of __VLS_getVForSourceType((group.entries))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (entry.id),
                ...{ class: "daily-log-event" },
                ...{ class: (`daily-log-event-${entry.event.toLowerCase()}`) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "daily-log-event-icon" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                viewBox: "0 0 24 24",
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: (__VLS_ctx.eventIcon(entry.event)),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.time, __VLS_intrinsicElements.time)({
                ...{ class: "daily-log-event-time" },
            });
            (entry.time);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "daily-log-event-content" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "daily-log-event-topline" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (entry.person);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "daily-log-event-type" },
            });
            (__VLS_ctx.eventVerb(entry.event));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "daily-log-event-meta" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "daily-log-category" },
                ...{ class: (`daily-log-category-${entry.category.toLowerCase().replace(' ', '-')}`) },
            });
            (entry.category);
            if (entry.company) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (entry.company);
            }
            if (entry.host) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (entry.host);
            }
            if (entry.host && __VLS_ctx.departmentForHost(entry.host)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.departmentForHost(entry.host));
            }
            if (entry.appointmentId) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "daily-log-linked" },
                });
                (entry.appointmentId);
            }
            if (entry.appointmentId === null && entry.externalStaffId === null && entry.visitorRecordId === null) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "daily-log-unlinked" },
                });
            }
            if (entry.details) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "daily-log-event-details" },
                });
                (entry.details);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                            return;
                        __VLS_ctx.removeEntry(entry);
                    } },
                ...{ class: "daily-log-delete" },
                type: "button",
                'aria-label': (`Eliminar movimiento de ${entry.person}`),
                title: "Eliminar movimiento",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                viewBox: "0 0 24 24",
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14m-7-3h4l1 3H9l1-3Z",
            });
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "daily-log-pagination" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.total === 0 ? 0 : (__VLS_ctx.page - 1) * __VLS_ctx.pageSize + 1);
    (Math.min(__VLS_ctx.page * __VLS_ctx.pageSize, __VLS_ctx.total));
    (__VLS_ctx.total);
    (__VLS_ctx.total === 1 ? "movimiento" : "movimientos");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                    return;
                if (!!(__VLS_ctx.error))
                    return;
                if (!!(!__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                    return;
                __VLS_ctx.page--;
            } },
        type: "button",
        disabled: (__VLS_ctx.page <= 1 || __VLS_ctx.loading),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "daily-log-pagination-page" },
    });
    (__VLS_ctx.page);
    (__VLS_ctx.pages);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                    return;
                if (!!(__VLS_ctx.error))
                    return;
                if (!!(!__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                    return;
                __VLS_ctx.page++;
            } },
        type: "button",
        disabled: (__VLS_ctx.page >= __VLS_ctx.pages || __VLS_ctx.loading),
    });
}
if (__VLS_ctx.dialogOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.dialogOpen))
                    return;
                !__VLS_ctx.saving && (__VLS_ctx.dialogOpen = false);
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog daily-log-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "daily-log-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.dialogOpen))
                    return;
                __VLS_ctx.dialogOpen = false;
            } },
        ...{ class: "dialog-close" },
        type: "button",
        'aria-label': "Cerrar",
        disabled: (__VLS_ctx.saving),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-close",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dialog-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-note",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "daily-log-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submitEntry) },
        ...{ class: "workspace-form daily-log-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.logEvent),
        required: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "Llegada",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "Ingreso",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "Retiro",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.dialogOpen))
                    return;
                __VLS_ctx.changePersonType($event.target.value);
            } },
        value: (__VLS_ctx.logPersonType),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "appointment",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "externalStaff",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "visitor",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "manual",
        disabled: (__VLS_ctx.requiresLinkedPerson),
    });
    if (__VLS_ctx.logPersonType !== 'manual') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        (__VLS_ctx.logPersonType === "appointment" ? "Cita / visitante" : __VLS_ctx.logPersonType === "externalStaff" ? "Personal externo" : "Visitante");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            value: (__VLS_ctx.logSubjectId),
            required: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: "",
            disabled: true,
        });
        if (__VLS_ctx.logPersonType === 'appointment') {
            for (const [appointment] of __VLS_getVForSourceType((__VLS_ctx.selectedAppointments))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                    key: (appointment.id),
                    value: (String(appointment.id)),
                });
                (appointment.visitor);
                (appointment.company || "Sin empresa");
                (appointment.date);
                (appointment.time);
            }
        }
        if (__VLS_ctx.logPersonType === 'externalStaff') {
            for (const [person] of __VLS_getVForSourceType((__VLS_ctx.selectedExternalStaff))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                    key: (person.id),
                    value: (String(person.id)),
                });
                (person.fullName);
                (person.companyName);
                (person.relationshipType.toLowerCase());
            }
        }
        if (__VLS_ctx.logPersonType === 'visitor') {
            for (const [person] of __VLS_getVForSourceType((__VLS_ctx.selectedVisitors))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                    key: (person.id),
                    value: (String(person.id)),
                });
                (person.fullName);
            }
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (__VLS_ctx.manualPerson),
            type: "text",
            maxlength: "180",
            placeholder: "Nombre de la persona",
            required: true,
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "date",
        required: true,
    });
    (__VLS_ctx.logDate);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "time",
        required: true,
    });
    (__VLS_ctx.logTime);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "daily-log-form-details" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.logDetails),
        maxlength: "4000",
        placeholder: (__VLS_ctx.logEvent === 'Observaciones' ? 'Describe la observación' : 'Detalle adicional (opcional)'),
        required: (__VLS_ctx.logEvent === 'Observaciones'),
        rows: "3",
    });
    if (__VLS_ctx.requiresLinkedPerson) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "daily-log-form-note" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "button-primary workspace-submit" },
        type: "submit",
        disabled: (__VLS_ctx.saving),
    });
    if (!__VLS_ctx.saving) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
            href: "#i-plus",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.saving ? "Guardando…" : "Guardar movimiento");
}
/** @type {__VLS_StyleScopedClasses['daily-log-page']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-header']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-heading-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-date-range']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-date-separator']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-events']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-inside']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-pending']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-exits']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-result-count']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-search']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-error']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-list']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-visitor']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-visitor-selected']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-status']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-person']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-select']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selected-person']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selected-person-details']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-observation']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-action']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-action']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-action']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-action-exit']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-error']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-result-count']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-filters']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-search']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-reset-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-empty-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-empty-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-timeline']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-day-group']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-day-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-event-list']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-event']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-event-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-event-time']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-event-content']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-event-topline']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-event-type']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-event-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-category']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-linked']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-unlinked']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-event-details']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-delete']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-pagination-page']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-form']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-form-details']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-form-note']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            fromDate: fromDate,
            toDate: toDate,
            search: search,
            eventFilter: eventFilter,
            categoryFilter: categoryFilter,
            hostFilter: hostFilter,
            departmentFilter: departmentFilter,
            page: page,
            pageSize: pageSize,
            entries: entries,
            summary: summary,
            total: total,
            pages: pages,
            loading: loading,
            saving: saving,
            error: error,
            quickActionError: quickActionError,
            quickActionNotice: quickActionNotice,
            quickActionAppointmentId: quickActionAppointmentId,
            quickSearch: quickSearch,
            quickSearchInput: quickSearchInput,
            selectedQuickAppointmentId: selectedQuickAppointmentId,
            quickObservation: quickObservation,
            dialogOpen: dialogOpen,
            logEvent: logEvent,
            logTime: logTime,
            logPersonType: logPersonType,
            logSubjectId: logSubjectId,
            manualPerson: manualPerson,
            logDate: logDate,
            logDetails: logDetails,
            selectedAppointments: selectedAppointments,
            todayAppointments: todayAppointments,
            filteredQuickAppointments: filteredQuickAppointments,
            selectedQuickAppointment: selectedQuickAppointment,
            selectedExternalStaff: selectedExternalStaff,
            selectedVisitors: selectedVisitors,
            departmentOptions: departmentOptions,
            availableHosts: availableHosts,
            requiresLinkedPerson: requiresLinkedPerson,
            groupedEntries: groupedEntries,
            rangeLabel: rangeLabel,
            quickAppointmentStatus: quickAppointmentStatus,
            formatDate: formatDate,
            eventIcon: eventIcon,
            eventVerb: eventVerb,
            departmentForHost: departmentForHost,
            loadEntries: loadEntries,
            openCreateDialog: openCreateDialog,
            changePersonType: changePersonType,
            submitEntry: submitEntry,
            selectQuickAppointment: selectQuickAppointment,
            movementIsAvailable: movementIsAvailable,
            saveQuickMovement: saveQuickMovement,
            handleQuickSearchEnter: handleQuickSearchEnter,
            removeEntry: removeEntry,
            resetFilters: resetFilters,
            showRecentHistory: showRecentHistory,
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
