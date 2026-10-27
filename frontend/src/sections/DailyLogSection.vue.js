import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { notifyUser } from "../notifications";
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
const exporting = ref(false);
const exportMessage = ref("");
const error = ref("");
const quickActionError = ref("");
const quickActionNotice = ref("");
const quickActionAppointmentId = ref(null);
const quickActionEntryId = ref(null);
const quickSearch = ref("");
const quickSearchInput = ref(null);
const referenceCodeOpen = ref(false);
const referenceCodeInputValue = ref("");
const referenceCodeInput = ref(null);
const scannerOpen = ref(false);
const scannerError = ref("");
const scannerVideo = ref(null);
let scannerControls = null;
const selectedQuickAppointmentId = ref(null);
const selectedEntryId = ref(null);
const quickObservation = ref("");
const quickStatusOverrides = ref({});
const dialogOpen = ref(false);
const logPersonType = ref("appointment");
const logSubjectId = ref("");
const manualPerson = ref("");
const logDetails = ref("");
let requestVersion = 0;
let searchTimer;
let refreshTimer;
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
const selectedEntry = computed(() => entries.value.find((entry) => entry.id === selectedEntryId.value) ?? null);
const selectedEntryAppointment = computed(() => {
    if (!selectedEntry.value?.appointmentId)
        return null;
    return props.appointments.find((appointment) => appointment.id === selectedEntry.value?.appointmentId) ?? null;
});
const selectedPerson = computed(() => selectedQuickAppointment.value ?? selectedEntry.value);
const selectedAppointment = computed(() => selectedQuickAppointment.value ?? selectedEntryAppointment.value);
const equipmentEntryChecklistPending = computed(() => Boolean(selectedAppointment.value?.equipmentChecklistRequired &&
    !selectedAppointment.value.equipmentEntryChecklistComplete));
const selectedEntryStatus = computed(() => {
    return selectedEntry.value ? entryStatus(selectedEntry.value) : "";
});
const selectedPersonStatus = computed(() => {
    if (selectedQuickAppointment.value)
        return quickAppointmentStatus(selectedQuickAppointment.value);
    return selectedEntryAppointment.value
        ? quickAppointmentStatus(selectedEntryAppointment.value)
        : selectedEntryStatus.value;
});
const selectedPersonName = computed(() => selectedQuickAppointment.value?.visitor ?? selectedEntry.value?.person ?? "");
const selectedPersonCompany = computed(() => selectedQuickAppointment.value?.company ?? selectedEntry.value?.company ?? "");
const selectedPersonHost = computed(() => selectedQuickAppointment.value?.host ?? selectedEntry.value?.host ?? "");
const selectedPersonDateTime = computed(() => selectedQuickAppointment.value
    ? `${selectedQuickAppointment.value.date} · ${selectedQuickAppointment.value.time}`
    : selectedEntry.value
        ? `${selectedEntry.value.date} · ${selectedEntry.value.time}`
        : "");
const selectedAvailableMovements = computed(() => {
    if (selectedEntry.value && selectedEntry.value.date !== getLocalDate())
        return [];
    if (selectedPersonStatus.value === "Pendiente")
        return ["Llegada"];
    if (selectedPersonStatus.value === "En proceso")
        return ["Ingreso", "Retiro"];
    if (selectedPersonStatus.value === "Dentro")
        return ["Retiro"];
    return [];
});
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
const groupedEntries = computed(() => {
    const groups = new Map();
    for (const entry of entries.value) {
        const group = groups.get(entry.date) ?? [];
        group.push(entry);
        groups.set(entry.date, group);
    }
    return [...groups.entries()].map(([date, groupEntries]) => ({ date, entries: groupEntries }));
});
const recentEntries = computed(() => entries.value.slice(0, 6));
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
function entryStatus(entry) {
    const appointment = appointmentForEntry(entry);
    if (appointment)
        return quickAppointmentStatus(appointment);
    const samePerson = (candidate) => {
        if (entry.appointmentId !== null)
            return candidate.appointmentId === entry.appointmentId;
        if (entry.externalStaffId !== null)
            return candidate.externalStaffId === entry.externalStaffId;
        if (entry.visitorRecordId !== null)
            return candidate.visitorRecordId === entry.visitorRecordId;
        return candidate.appointmentId === null &&
            candidate.externalStaffId === null &&
            candidate.visitorRecordId === null &&
            candidate.person.trim().toLocaleLowerCase("es") === entry.person.trim().toLocaleLowerCase("es");
    };
    const latestMovement = entries.value
        .filter((candidate) => samePerson(candidate) &&
        (candidate.event === "Llegada" || candidate.event === "Ingreso" || candidate.event === "Retiro"))
        .sort((first, second) => `${second.date} ${second.time} ${second.id}`.localeCompare(`${first.date} ${first.time} ${first.id}`))[0];
    if (latestMovement?.event === "Ingreso")
        return "Dentro";
    if (latestMovement?.event === "Retiro")
        return "Retirado";
    if (latestMovement?.event === "Llegada")
        return "En proceso";
    return "Pendiente";
}
function appointmentForEntry(entry) {
    if (entry.appointmentId === null)
        return null;
    return props.appointments.find((appointment) => appointment.id === entry.appointmentId) ?? null;
}
function openEntryQr(entry) {
    const appointment = appointmentForEntry(entry);
    if (appointment)
        emit("openQr", appointment);
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
function csvCell(value) {
    const text = value === null ? "" : String(value);
    const safeText = /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
}
async function exportLog() {
    if (exporting.value)
        return;
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
        const firstResult = await firstResponse.json();
        if (!firstResponse.ok)
            throw new Error(firstResult.error ?? "No se pudo exportar la bitácora.");
        if (!Array.isArray(firstResult.entries) || !Number.isSafeInteger(firstResult.pages) || !firstResult.pages) {
            throw new Error("El servidor devolvió datos incompletos para exportar la bitácora.");
        }
        const exportEntries = [...firstResult.entries];
        for (let exportPage = 2; exportPage <= firstResult.pages; exportPage += 1) {
            exportUrl.searchParams.set("page", String(exportPage));
            const response = await fetch(exportUrl);
            const result = await response.json();
            if (!response.ok)
                throw new Error(result.error ?? `No se pudo cargar la página ${exportPage} de la bitácora.`);
            if (!Array.isArray(result.entries)) {
                throw new Error(`El servidor devolvió datos incompletos en la página ${exportPage}.`);
            }
            exportEntries.push(...result.entries);
        }
        if (exportEntries.length === 0) {
            notifyUser("No hay movimientos en el rango y filtros seleccionados.", "info");
            return;
        }
        const columns = [
            "date", "time", "event", "person", "company", "host", "category", "details",
            ...(props.isAdmin ? ["actorName"] : []),
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
    }
    catch (cause) {
        console.error("Failed to export daily log:", cause);
        notifyUser(cause instanceof Error ? cause.message : "No se pudo exportar la bitácora.");
    }
    finally {
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
    logPersonType.value = props.generalVisitors.length > 0 ? "visitor" : "manual";
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
        notifyUser("Escribe el nombre de la persona.");
        return;
    }
    if (logPersonType.value !== "manual" && !logSubjectId.value) {
        notifyUser("Selecciona la cita o ficha de la persona.");
        return;
    }
    const selectedId = Number(logSubjectId.value);
    const payload = {
        event: "Llegada",
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
        const result = await response.json();
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
        const savedEntry = entries.value.find((entry) => entry.event === "Llegada" &&
            entry.date === payload.date &&
            entry.person.trim().toLocaleLowerCase("es") === savedPersonName);
        if (savedEntry)
            selectedEntryId.value = savedEntry.id;
        emit("movementSaved");
        logSubjectId.value = "";
        manualPerson.value = "";
        logDetails.value = "";
        await nextTick();
        quickSearchInput.value?.focus();
    }
    catch (cause) {
        console.error("Failed to save daily log movement:", cause);
        notifyUser("No se pudo conectar con el servidor para guardar el movimiento.");
    }
    finally {
        saving.value = false;
    }
}
function selectQuickAppointment(appointment) {
    selectedQuickAppointmentId.value = appointment.id;
    selectedEntryId.value = null;
    quickActionError.value = "";
    quickActionNotice.value = "";
    quickObservation.value = "";
    quickSearch.value = appointment.visitor;
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
    const appointment = todayAppointments.value.find((candidate) => candidate.referenceCode === referenceCode);
    if (!appointment) {
        notifyUser("No encontramos una cita de hoy con ese código de referencia.");
        return;
    }
    selectQuickAppointment(appointment);
    referenceCodeOpen.value = false;
    referenceCodeInputValue.value = "";
}
async function openQrScanner() {
    if (scannerOpen.value)
        return;
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
        const controls = await qrReader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video, (result, _decodeError, callbackControls) => {
            if (!result || !scannerOpen.value)
                return;
            const decodedText = result.getText();
            callbackControls.stop();
            scannerControls = null;
            scannerOpen.value = false;
            quickSearch.value = decodedText;
            void handleQuickSearchEnter();
        });
        scannerControls = controls;
        if (!scannerOpen.value) {
            controls.stop();
            scannerControls = null;
        }
    }
    catch (cause) {
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
function movementIsAvailable(event, appointment) {
    const status = quickAppointmentStatus(appointment);
    if (status === "Cancelada" || status === "Retirado")
        return false;
    if (event === "Llegada")
        return status === "Pendiente";
    if (event === "Ingreso") {
        return ((status === "Pendiente" || status === "En proceso") &&
            (!appointment.equipmentChecklistRequired || appointment.equipmentEntryChecklistComplete));
    }
    return status === "Dentro" || status === "En proceso";
}
async function saveQuickMovement(event, appointment = selectedQuickAppointment.value ?? selectedEntryAppointment.value) {
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
                personName: "",
                appointmentId: appointment.id,
                details: quickObservation.value.trim(),
            }),
        });
        const result = await response.json();
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
        notifyUser(`${appointment.visitor}: ${event === "Llegada" ? "llegada registrada" : event === "Ingreso" ? "entrada registrada" : "retiro registrado"}.`, "success");
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
        notifyUser("No se pudo conectar con el servidor. Intenta de nuevo.");
    }
    finally {
        quickActionAppointmentId.value = null;
        await nextTick();
        quickSearchInput.value?.focus();
    }
}
function selectEntry(entry) {
    selectedEntryId.value = entry.id;
    selectedQuickAppointmentId.value = null;
    quickActionError.value = "";
    quickActionNotice.value = "";
    quickObservation.value = "";
}
async function saveSelectedEntryMovement(event) {
    const entry = selectedEntry.value;
    if (!entry || quickActionEntryId.value !== null || !selectedAvailableMovements.value.includes(event))
        return;
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
        const result = await response.json();
        if (!response.ok) {
            notifyUser(result.error ?? "No se pudo actualizar el estado de la visita.");
            return;
        }
        quickObservation.value = "";
        notifyUser(`${entry.person}: ${event === "Llegada" ? "llegada registrada" : event === "Ingreso" ? "entrada registrada" : "retiro registrado"}.`, "success");
        fromDate.value = operationDate;
        toDate.value = operationDate;
        search.value = "";
        eventFilter.value = "";
        categoryFilter.value = "";
        hostFilter.value = "";
        departmentFilter.value = "";
        page.value = 1;
        await loadEntries();
        const refreshedEntry = entries.value.find((candidate) => candidate.person.trim().toLocaleLowerCase("es") === entry.person.trim().toLocaleLowerCase("es") &&
            candidate.event === event);
        if (refreshedEntry)
            selectedEntryId.value = refreshedEntry.id;
        emit("movementSaved");
    }
    catch (cause) {
        console.error("Failed to update selected visit status:", cause);
        notifyUser("No se pudo conectar con el servidor. Intenta de nuevo.");
    }
    finally {
        quickActionEntryId.value = null;
    }
}
async function handleQuickSearchEnter() {
    if (quickActionAppointmentId.value !== null || quickActionEntryId.value !== null)
        return;
    quickActionError.value = "";
    quickActionNotice.value = "";
    selectedQuickAppointmentId.value = null;
    selectedEntryId.value = null;
    refreshLocalDate();
    const value = quickSearch.value.trim();
    if (!value)
        return;
    let scannedAppointmentId = null;
    let scannedReferenceCode = "";
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
        if (typeof scannedValue === "object" &&
            scannedValue !== null &&
            "type" in scannedValue &&
            scannedValue.type === "visitas-appointment" &&
            "referenceCode" in scannedValue &&
            typeof scannedValue.referenceCode === "string") {
            scannedReferenceCode = scannedValue.referenceCode;
        }
    }
    catch {
        // Non-JSON input is treated as a name search.
    }
    if (scannedAppointmentId !== null || scannedReferenceCode) {
        const appointment = todayAppointments.value.find((item) => (scannedAppointmentId !== null && item.id === scannedAppointmentId) ||
            (scannedReferenceCode !== "" && item.referenceCode === scannedReferenceCode));
        if (!appointment) {
            notifyUser("Este QR no corresponde a una cita de hoy o la visita está cancelada.");
            return;
        }
        selectQuickAppointment(appointment);
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
    }
    else if (filteredQuickAppointments.value.length > 1) {
        quickActionNotice.value = "Selecciona a la persona correcta de la lista.";
    }
    else {
        notifyUser("No encontramos una cita de hoy con ese nombre o empresa.");
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
            notifyUser(result.error ?? "No se pudo eliminar el movimiento.");
            return;
        }
        notifyUser(result.message ?? "El movimiento se eliminó correctamente.", "success");
        await loadEntries();
    }
    catch (cause) {
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
    refreshTimer = window.setInterval(() => {
        if (document.visibilityState === "visible" &&
            !loading.value &&
            fromDate.value &&
            toDate.value &&
            fromDate.value <= toDate.value) {
            void loadEntries();
        }
    }, 30000);
});
onBeforeUnmount(() => {
    requestVersion += 1;
    if (searchTimer)
        clearTimeout(searchTimer);
    if (refreshTimer !== undefined)
        window.clearInterval(refreshTimer);
    closeQrScanner();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "daily-log-page" },
    'aria-label': "Bitácora de movimientos",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "daily-log-header" },
});
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
    ...{ onClick: (__VLS_ctx.exportLog) },
    ...{ class: "daily-log-secondary-button daily-log-export-button" },
    type: "button",
    disabled: (__VLS_ctx.exporting),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 3v12m0 0 4-4m-4 4-4-4M5 17v4h14v-4",
});
(__VLS_ctx.exporting ? "Exportando..." : "Exportar CSV");
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
if (__VLS_ctx.exportMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-export-message" },
        role: (__VLS_ctx.exportMessage.startsWith('Se exportaron') ? 'status' : 'alert'),
    });
    (__VLS_ctx.exportMessage);
}
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-workspace" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-main-column" },
});
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-quick-heading-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openReferenceCodeEntry) },
    ...{ class: "daily-log-secondary-button" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openQrScanner) },
    ...{ class: "daily-log-secondary-button daily-log-mobile-scan-button" },
    type: "button",
    disabled: (__VLS_ctx.scannerOpen),
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
if (__VLS_ctx.referenceCodeOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submitReferenceCode) },
        ...{ class: "daily-log-reference-code-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "daily-log-reference-code",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        id: "daily-log-reference-code",
        ref: "referenceCodeInput",
        value: (__VLS_ctx.referenceCodeInputValue),
        type: "text",
        inputmode: "numeric",
        autocomplete: "off",
        maxlength: "8",
        pattern: "[0-9]{8}",
        placeholder: "00000000",
        'aria-describedby': "daily-log-reference-code-help",
        required: true,
    });
    /** @type {typeof __VLS_ctx.referenceCodeInput} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "daily-log-secondary-button" },
        type: "submit",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
        id: "daily-log-reference-code-help",
    });
}
if (__VLS_ctx.scannerOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-qr-scanner" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.video, __VLS_intrinsicElements.video)({
        ref: "scannerVideo",
        autoplay: true,
        muted: true,
        playsinline: true,
        'aria-label': "Vista de la cámara para escanear el QR",
    });
    /** @type {typeof __VLS_ctx.scannerVideo} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeQrScanner) },
        ...{ class: "daily-log-secondary-button" },
        type: "button",
    });
}
if (__VLS_ctx.scannerError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-quick-error" },
        role: "alert",
    });
    (__VLS_ctx.scannerError);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "daily-log-quick-search" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 12h10",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (...[$event]) => {
            __VLS_ctx.selectedQuickAppointmentId = null;
            __VLS_ctx.selectedEntryId = null;
            __VLS_ctx.quickActionError = '';
            __VLS_ctx.quickActionNotice = '';
        } },
    ...{ onKeydown: (__VLS_ctx.handleQuickSearchEnter) },
    ref: "quickSearchInput",
    type: "search",
    placeholder: "Buscar por nombre o empresa, o escanear QR…",
    'aria-label': "Buscar cita o escanear QR",
    disabled: (__VLS_ctx.appointmentsLoading),
});
(__VLS_ctx.quickSearch);
/** @type {typeof __VLS_ctx.quickSearchInput} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
if (__VLS_ctx.quickSearch.trim() && __VLS_ctx.filteredQuickAppointments.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-quick-list" },
    });
    for (const [appointment] of __VLS_getVForSourceType((__VLS_ctx.filteredQuickAppointments))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.quickSearch.trim() && __VLS_ctx.filteredQuickAppointments.length))
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
else if (__VLS_ctx.quickSearch.trim() && !__VLS_ctx.appointmentsLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-quick-empty" },
    });
    (__VLS_ctx.quickSearch);
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-quick-empty" },
    });
    (__VLS_ctx.appointmentsLoading ? "Cargando citas…" : `${__VLS_ctx.todayAppointments.length} citas programadas para hoy`);
}
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
(__VLS_ctx.total === 1 ? "registro" : "registros");
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
    placeholder: "Buscar por nombre, empresa o teléfono…",
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
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-table-scroll" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "daily-log-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    if (__VLS_ctx.isAdmin) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sr-only" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [entry] of __VLS_getVForSourceType((__VLS_ctx.entries))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                        return;
                    __VLS_ctx.selectEntry(entry);
                } },
            ...{ onKeydown: (...[$event]) => {
                    if (!!(__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                        return;
                    __VLS_ctx.selectEntry(entry);
                } },
            ...{ onKeydown: (...[$event]) => {
                    if (!!(__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                        return;
                    __VLS_ctx.selectEntry(entry);
                } },
            key: (entry.id),
            ...{ class: ({ 'is-selected': __VLS_ctx.selectedEntryId === entry.id }) },
            'aria-selected': (__VLS_ctx.selectedEntryId === entry.id),
            tabindex: "0",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "daily-log-table-time" },
        });
        (entry.time);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "daily-log-table-event" },
            ...{ class: (`is-${entry.event.toLowerCase()}`) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: (__VLS_ctx.eventIcon(entry.event)),
        });
        (entry.event === "Ingreso" ? "Entrada" : entry.event === "Retiro" ? "Salida" : entry.event);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
            ...{ class: "daily-log-table-person" },
        });
        (entry.person);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
            ...{ class: "daily-log-table-date" },
        });
        (__VLS_ctx.formatDate(entry.date));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "daily-log-table-company" },
        });
        (entry.company || "N/A");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (entry.host || "N/A");
        if (__VLS_ctx.isAdmin) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                ...{ class: "daily-log-table-actor" },
            });
            (entry.actorName || "Sin registro");
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "daily-log-table-status" },
            ...{ class: (`is-${__VLS_ctx.entryStatus(entry).toLowerCase().replace(' ', '-')}`) },
        });
        (__VLS_ctx.entryStatus(entry));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        if (__VLS_ctx.appointmentForEntry(entry)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.loading && __VLS_ctx.entries.length === 0))
                            return;
                        if (!(__VLS_ctx.appointmentForEntry(entry)))
                            return;
                        __VLS_ctx.openEntryQr(entry);
                    } },
                ...{ class: "daily-log-table-qr" },
                type: "button",
                'aria-label': (`Ver QR de ${entry.person}`),
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "daily-log-table-no-qr" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
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
(__VLS_ctx.total === 1 ? "registro" : "registros");
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
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
            __VLS_ctx.page++;
        } },
    type: "button",
    disabled: (__VLS_ctx.page >= __VLS_ctx.pages || __VLS_ctx.loading),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "daily-log-side-column" },
    'aria-label': "Detalle y actividad reciente",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "daily-log-selection-card" },
    'aria-labelledby': "daily-log-selection-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-selection-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-selection-icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "12",
    cy: "8",
    r: "4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M4 21a8 8 0 0 1 16 0",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-panel-kicker" },
});
(__VLS_ctx.selectedAppointment ? "REGISTRO CON CITA" : "VISITA SELECCIONADA");
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    id: "daily-log-selection-title",
});
(__VLS_ctx.selectedPersonName || "Selecciona un registro");
if (__VLS_ctx.selectedPerson) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-selection-meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedPersonCompany || "N/A");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedPersonHost || "N/A");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedPersonDateTime);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
        ...{ class: "daily-log-selection-state" },
        ...{ class: (`is-${__VLS_ctx.selectedPersonStatus.replace(' ', '-').toLocaleLowerCase()}`) },
    });
    (__VLS_ctx.selectedPersonStatus);
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
    if (__VLS_ctx.selectedAvailableMovements.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "daily-log-selection-action-group" },
        });
        for (const [movement] of __VLS_getVForSourceType((__VLS_ctx.selectedAvailableMovements))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedPerson))
                            return;
                        if (!(__VLS_ctx.selectedAvailableMovements.length))
                            return;
                        __VLS_ctx.selectedQuickAppointment ? __VLS_ctx.saveQuickMovement(movement) : __VLS_ctx.saveSelectedEntryMovement(movement);
                    } },
                key: (movement),
                ...{ class: "daily-log-selection-action" },
                ...{ class: ({ 'is-exit': movement === 'Retiro' }) },
                type: "button",
                disabled: (__VLS_ctx.quickActionAppointmentId !== null ||
                    __VLS_ctx.quickActionEntryId !== null ||
                    (movement === 'Ingreso' && __VLS_ctx.equipmentEntryChecklistPending)),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                viewBox: "0 0 24 24",
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: (__VLS_ctx.eventIcon(movement)),
            });
            (__VLS_ctx.quickActionAppointmentId !== null || __VLS_ctx.quickActionEntryId !== null ? "Guardando…" : movement === "Llegada" ? "Registrar llegada" : movement === "Ingreso" ? "Registrar entrada" : "Registrar salida");
        }
        if (__VLS_ctx.selectedAvailableMovements.includes('Ingreso') && __VLS_ctx.equipmentEntryChecklistPending) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "daily-log-selection-complete" },
                role: "status",
            });
        }
    }
    else if (__VLS_ctx.selectedEntry && __VLS_ctx.selectedEntry.date !== __VLS_ctx.today) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "daily-log-selection-complete" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "daily-log-selection-complete" },
        });
    }
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
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-selection-hint" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "daily-log-recent-panel" },
    'aria-labelledby': "daily-log-recent-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-panel-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-panel-kicker" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    id: "daily-log-recent-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.showRecentHistory) },
    ...{ class: "daily-log-recent-link" },
    type: "button",
});
for (const [entry] of __VLS_getVForSourceType((__VLS_ctx.recentEntries))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectEntry(entry);
            } },
        key: (`recent-${entry.id}`),
        ...{ class: "daily-log-recent-entry" },
        ...{ class: ({ 'is-selected': __VLS_ctx.selectedEntryId === entry.id }) },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "daily-log-recent-time" },
    });
    (entry.time);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "daily-log-recent-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (entry.event === "Ingreso" ? "Entrada" : entry.event === "Retiro" ? "Salida" : entry.event);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (entry.person);
    if (entry.company) {
        (entry.company);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (entry.details || __VLS_ctx.eventVerb(entry.event));
}
if (__VLS_ctx.recentEntries.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-quick-empty" },
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
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.dialogOpen))
                    return;
                __VLS_ctx.changePersonType($event.target.value);
            } },
        value: (__VLS_ctx.logPersonType),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "externalStaff",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "visitor",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "manual",
    });
    if (__VLS_ctx.logPersonType !== 'manual') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        (__VLS_ctx.logPersonType === "externalStaff" ? "Personal externo" : "Visitante");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            value: (__VLS_ctx.logSubjectId),
            required: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: "",
            disabled: true,
        });
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
            pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
            placeholder: "Nombre de la persona",
            required: true,
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "daily-log-form-details" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.logDetails),
        maxlength: "4000",
        placeholder: "Detalle adicional (opcional)",
        rows: "3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-form-note" },
    });
    (__VLS_ctx.logPersonType === "externalStaff" ? "La empresa se conservará desde su ficha; el anfitrión se mostrará como N/A." : "Empresa y anfitrión se mostrarán como N/A para esta visita.");
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
    (__VLS_ctx.saving ? "Guardando…" : "Registrar llegada");
}
/** @type {__VLS_StyleScopedClasses['daily-log-page']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-header']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-date-range']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-date-separator']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-export-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-export-message']} */ ;
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
/** @type {__VLS_StyleScopedClasses['daily-log-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-main-column']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-heading-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-mobile-scan-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-primary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-reference-code-form']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-qr-scanner']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-error']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-search']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-list']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-visitor']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-visitor-selected']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-status']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-person']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-select']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-error']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-error']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-result-count']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-filters']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-search']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-reset-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-empty-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-time']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-event']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-person']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-date']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-company']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-actor']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-status']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-qr']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-no-qr']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-delete']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-pagination-page']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-side-column']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-card']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-state']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-observation']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-action-group']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-action']} */ ;
/** @type {__VLS_StyleScopedClasses['is-exit']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-complete']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-complete']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-complete']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-error']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-recent-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-recent-link']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-recent-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-recent-time']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-recent-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-quick-empty']} */ ;
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
            today: today,
            fromDate: fromDate,
            toDate: toDate,
            search: search,
            eventFilter: eventFilter,
            categoryFilter: categoryFilter,
            hostFilter: hostFilter,
            page: page,
            pageSize: pageSize,
            entries: entries,
            summary: summary,
            total: total,
            pages: pages,
            loading: loading,
            saving: saving,
            exporting: exporting,
            exportMessage: exportMessage,
            error: error,
            quickActionError: quickActionError,
            quickActionNotice: quickActionNotice,
            quickActionAppointmentId: quickActionAppointmentId,
            quickActionEntryId: quickActionEntryId,
            quickSearch: quickSearch,
            quickSearchInput: quickSearchInput,
            referenceCodeOpen: referenceCodeOpen,
            referenceCodeInputValue: referenceCodeInputValue,
            referenceCodeInput: referenceCodeInput,
            scannerOpen: scannerOpen,
            scannerError: scannerError,
            scannerVideo: scannerVideo,
            selectedQuickAppointmentId: selectedQuickAppointmentId,
            selectedEntryId: selectedEntryId,
            quickObservation: quickObservation,
            dialogOpen: dialogOpen,
            logPersonType: logPersonType,
            logSubjectId: logSubjectId,
            manualPerson: manualPerson,
            logDetails: logDetails,
            todayAppointments: todayAppointments,
            filteredQuickAppointments: filteredQuickAppointments,
            selectedQuickAppointment: selectedQuickAppointment,
            selectedEntry: selectedEntry,
            selectedPerson: selectedPerson,
            selectedAppointment: selectedAppointment,
            equipmentEntryChecklistPending: equipmentEntryChecklistPending,
            selectedPersonStatus: selectedPersonStatus,
            selectedPersonName: selectedPersonName,
            selectedPersonCompany: selectedPersonCompany,
            selectedPersonHost: selectedPersonHost,
            selectedPersonDateTime: selectedPersonDateTime,
            selectedAvailableMovements: selectedAvailableMovements,
            selectedExternalStaff: selectedExternalStaff,
            selectedVisitors: selectedVisitors,
            recentEntries: recentEntries,
            rangeLabel: rangeLabel,
            quickAppointmentStatus: quickAppointmentStatus,
            entryStatus: entryStatus,
            appointmentForEntry: appointmentForEntry,
            openEntryQr: openEntryQr,
            formatDate: formatDate,
            eventIcon: eventIcon,
            eventVerb: eventVerb,
            exportLog: exportLog,
            loadEntries: loadEntries,
            openCreateDialog: openCreateDialog,
            changePersonType: changePersonType,
            submitEntry: submitEntry,
            selectQuickAppointment: selectQuickAppointment,
            openReferenceCodeEntry: openReferenceCodeEntry,
            submitReferenceCode: submitReferenceCode,
            openQrScanner: openQrScanner,
            closeQrScanner: closeQrScanner,
            saveQuickMovement: saveQuickMovement,
            selectEntry: selectEntry,
            saveSelectedEntryMovement: saveSelectedEntryMovement,
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
