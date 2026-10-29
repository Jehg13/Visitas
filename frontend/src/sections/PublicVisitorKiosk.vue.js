import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { notifyUser } from "../notifications";
const identificationTypes = [
    "INE",
    "Gafete",
    "Pasaporte",
    "Licencia de conducir",
    "Otra identificación",
];
const step = ref(0);
const sending = ref(false);
const errorMessage = ref("");
const showRestoreNotice = ref(false);
const fieldErrors = ref({});
const visitorName = ref("");
const companyName = ref("");
const visitReason = ref("");
const carriesItems = ref(null);
const items = ref([]);
const itemDraft = ref(newItem());
const editingItemIndex = ref(null);
const identificationTypesSelected = ref([]);
const declaresIdRetained = ref(null);
const informationConfirmed = ref(false);
const completed = ref(null);
const completedStatus = ref("reference");
const completedStatusError = ref("");
const pendingRegistration = ref(null);
const needsReceptionIdCheck = computed(() => declaresIdRetained.value === true);
const waitingMessage = computed(() => {
    if (completedStatus.value === "awaiting-id-check") {
        return "Esperando que recepción confirme la entrega de identificación…";
    }
    if (completedStatus.value === "awaiting-entry-authorization") {
        return "Identificación revisada. Esperando autorización de entrada…";
    }
    if (completedStatus.value === "awaiting-entry-checklist") {
        return "Entrada autorizada. Recepción debe completar el checklist de equipo…";
    }
    return "";
});
const requestIdempotencyKey = ref(crypto.randomUUID());
const draftStorageKey = "visitas:visitor-kiosk:draft:v1";
const pendingStorageKey = "visitas:visitor-kiosk:pending:v1";
let resetTimer;
let statusEventSource = null;
let statusPollingTimer;
let statusRequestInProgress = false;
const progress = computed(() => Math.min(step.value, 4));
const hasValidDraft = computed(() => itemDraft.value.description.trim().length > 0 &&
    Number.isSafeInteger(itemDraft.value.quantity) &&
    itemDraft.value.quantity >= 1 &&
    itemDraft.value.quantity <= 999);
function newItem() {
    return {
        type: "Equipo",
        description: "",
        brand: "",
        model: "",
        serialNumber: "",
        color: "",
        quantity: 1,
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isKioskItem(value) {
    if (!isRecord(value))
        return false;
    return ((value.type === "Equipo" || value.type === "Herramienta") &&
        typeof value.description === "string" &&
        value.description.length <= 180 &&
        typeof value.brand === "string" &&
        value.brand.length <= 120 &&
        typeof value.model === "string" &&
        value.model.length <= 120 &&
        typeof value.serialNumber === "string" &&
        value.serialNumber.length <= 180 &&
        typeof value.color === "string" &&
        value.color.length <= 80 &&
        Number.isSafeInteger(value.quantity) &&
        Number(value.quantity) >= 1 &&
        Number(value.quantity) <= 999);
}
function isIdempotencyKey(value) {
    return typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isIdentificationType(value) {
    return typeof value === "string" && identificationTypes.some((type) => type === value);
}
function isKioskSessionDraft(value) {
    if (!isRecord(value))
        return false;
    return (value.version === 1 &&
        Number.isInteger(value.step) &&
        Number(value.step) >= 1 &&
        Number(value.step) <= 4 &&
        isIdempotencyKey(value.requestIdempotencyKey) &&
        typeof value.visitorName === "string" &&
        value.visitorName.length <= 180 &&
        typeof value.companyName === "string" &&
        value.companyName.length <= 180 &&
        typeof value.visitReason === "string" &&
        value.visitReason.length <= 500 &&
        (typeof value.carriesItems === "boolean" || value.carriesItems === null) &&
        Array.isArray(value.items) &&
        value.items.length <= 50 &&
        value.items.every(isKioskItem) &&
        isKioskItem(value.itemDraft) &&
        (value.editingItemIndex === null ||
            (Number.isInteger(value.editingItemIndex) &&
                Number(value.editingItemIndex) >= 0 &&
                Number(value.editingItemIndex) < value.items.length)) &&
        Array.isArray(value.identificationTypesSelected) &&
        value.identificationTypesSelected.every(isIdentificationType) &&
        (typeof value.declaresIdRetained === "boolean" || value.declaresIdRetained === null) &&
        typeof value.informationConfirmed === "boolean");
}
function isPendingKioskRegistration(value) {
    if (!isRecord(value) || !isRecord(value.completed))
        return false;
    return (value.version === 1 &&
        typeof value.completed.folio === "string" &&
        /^\d{8}$/.test(value.completed.folio) &&
        typeof value.completed.visitorName === "string" &&
        value.completed.visitorName.length <= 180 &&
        isIdempotencyKey(value.requestIdempotencyKey) &&
        (typeof value.carriesItems === "boolean" || value.carriesItems === null) &&
        typeof value.declaresIdRetained === "boolean" &&
        Number.isSafeInteger(value.expiresAt));
}
function persistDraft() {
    if (step.value < 1 || step.value > 4 || completed.value) {
        sessionStorage.removeItem(draftStorageKey);
        return;
    }
    const draft = {
        version: 1,
        step: step.value,
        requestIdempotencyKey: requestIdempotencyKey.value,
        visitorName: visitorName.value,
        companyName: companyName.value,
        visitReason: visitReason.value,
        carriesItems: carriesItems.value,
        items: items.value,
        itemDraft: itemDraft.value,
        editingItemIndex: editingItemIndex.value,
        identificationTypesSelected: identificationTypesSelected.value,
        declaresIdRetained: declaresIdRetained.value,
        informationConfirmed: informationConfirmed.value,
    };
    sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
}
function scheduleKioskReset(delay) {
    if (resetTimer !== undefined)
        window.clearTimeout(resetTimer);
    if (pendingRegistration.value) {
        pendingRegistration.value.expiresAt = Date.now() + delay;
        try {
            sessionStorage.setItem(pendingStorageKey, JSON.stringify(pendingRegistration.value));
        }
        catch (error) {
            console.error("No se pudo actualizar la vigencia del folio en esta pestaña:", error);
            completedStatusError.value = "No se pudo conservar este folio al recargar la página.";
        }
    }
    resetTimer = window.setTimeout(resetKiosk, delay);
}
function resumePendingStatus() {
    if (!completed.value)
        return;
    closeStatusEventSource();
    statusEventSource = new EventSource(`/api/visitor-kiosk/events?key=${encodeURIComponent(requestIdempotencyKey.value)}`);
    statusEventSource.onopen = () => void refreshCompletedStatus();
    statusEventSource.onmessage = () => void refreshCompletedStatus();
    statusEventSource.onerror = () => {
        completedStatusError.value = "Actualización instantánea interrumpida; verificando automáticamente…";
    };
    statusPollingTimer = window.setInterval(() => void refreshCompletedStatus(), 5000);
    void refreshCompletedStatus();
}
function restoreKioskSession() {
    try {
        const savedPending = sessionStorage.getItem(pendingStorageKey);
        if (savedPending) {
            const parsed = JSON.parse(savedPending);
            if (isPendingKioskRegistration(parsed) && parsed.expiresAt > Date.now()) {
                pendingRegistration.value = parsed;
                completed.value = parsed.completed;
                carriesItems.value = parsed.carriesItems;
                declaresIdRetained.value = parsed.declaresIdRetained;
                requestIdempotencyKey.value = parsed.requestIdempotencyKey;
                step.value = 5;
                resetTimer = window.setTimeout(resetKiosk, Math.max(parsed.expiresAt - Date.now(), 0));
                resumePendingStatus();
                return;
            }
            sessionStorage.removeItem(pendingStorageKey);
        }
        const savedDraft = sessionStorage.getItem(draftStorageKey);
        if (!savedDraft)
            return;
        const parsed = JSON.parse(savedDraft);
        if (!isKioskSessionDraft(parsed)) {
            sessionStorage.removeItem(draftStorageKey);
            errorMessage.value = "El borrador guardado no es válido. Inicia un registro nuevo.";
            return;
        }
        step.value = parsed.step;
        requestIdempotencyKey.value = parsed.requestIdempotencyKey;
        visitorName.value = parsed.visitorName;
        companyName.value = parsed.companyName;
        visitReason.value = parsed.visitReason;
        carriesItems.value = parsed.carriesItems;
        items.value = parsed.items;
        itemDraft.value = parsed.itemDraft;
        editingItemIndex.value = parsed.editingItemIndex;
        identificationTypesSelected.value = parsed.identificationTypesSelected;
        declaresIdRetained.value = parsed.declaresIdRetained;
        informationConfirmed.value = parsed.informationConfirmed;
        showRestoreNotice.value = true;
    }
    catch (error) {
        console.error("No se pudo restaurar el avance del registro de visitante:", error);
        errorMessage.value = "No se pudo recuperar el registro guardado en esta pestaña.";
    }
}
async function parseResponse(response) {
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("No se pudo conectar con el servicio de registro.");
    }
    try {
        return await response.json();
    }
    catch {
        throw new Error("El servidor devolvió una respuesta inválida.");
    }
}
watch([
    step,
    visitorName,
    companyName,
    visitReason,
    carriesItems,
    items,
    itemDraft,
    editingItemIndex,
    identificationTypesSelected,
    declaresIdRetained,
    informationConfirmed,
    requestIdempotencyKey,
    completed,
], () => {
    try {
        persistDraft();
    }
    catch (error) {
        console.error("No se pudo guardar el borrador del registro de visitante:", error);
        errorMessage.value = "No se pudo guardar el avance en esta pestaña.";
    }
}, { deep: true });
onMounted(() => {
    restoreKioskSession();
});
onBeforeUnmount(() => {
    if (resetTimer !== undefined)
        window.clearTimeout(resetTimer);
    statusEventSource?.close();
});
function closeStatusEventSource() {
    statusEventSource?.close();
    statusEventSource = null;
    if (statusPollingTimer !== undefined) {
        window.clearInterval(statusPollingTimer);
        statusPollingTimer = undefined;
    }
}
function clearErrors() {
    fieldErrors.value = {};
    errorMessage.value = "";
}
function validateVisitor() {
    const errors = {};
    if (!visitorName.value.trim())
        errors.visitorName = "Escribe tu nombre completo.";
    else if (visitorName.value.trim().length > 180)
        errors.visitorName = "Usa máximo 180 caracteres.";
    if (!visitReason.value.trim())
        errors.visitReason = "Indica el asunto o motivo de tu visita.";
    else if (visitReason.value.trim().length > 500)
        errors.visitReason = "Usa máximo 500 caracteres.";
    if (!companyName.value.trim())
        errors.companyName = "Selecciona o escribe una empresa, o indica que eres público general.";
    else if (companyName.value.trim().length > 180)
        errors.companyName = "Usa máximo 180 caracteres.";
    fieldErrors.value = errors;
    return Object.keys(errors).length === 0;
}
function continueStep() {
    clearErrors();
    if (step.value === 1 && !validateVisitor())
        return;
    if (step.value === 2) {
        if (editingItemIndex.value !== null) {
            fieldErrors.value = { item: "Guarda o cancela los cambios del artículo antes de continuar." };
            return;
        }
        if (carriesItems.value === null) {
            fieldErrors.value = { carriesItems: "Selecciona una de las opciones para continuar." };
            return;
        }
        if (carriesItems.value && items.value.length === 0) {
            fieldErrors.value = { items: "Agrega al menos un equipo o herramienta, o selecciona que no llevas artículos." };
            return;
        }
    }
    if (step.value === 3) {
        const errors = {};
        if (identificationTypesSelected.value.length === 0 ||
            identificationTypesSelected.value.some((type) => !identificationTypes.includes(type))) {
            errors.identificationType = "Selecciona al menos un tipo de identificación.";
        }
        if (declaresIdRetained.value === null) {
            errors.declaresIdRetained = "Indica si declaras haber entregado tu identificación para resguardo.";
        }
        fieldErrors.value = errors;
        if (Object.keys(errors).length > 0)
            return;
    }
    step.value = Math.min(step.value + 1, 4);
}
function toggleIdentificationType(type) {
    if (!identificationTypes.includes(type))
        return;
    identificationTypesSelected.value = identificationTypesSelected.value.includes(type)
        ? identificationTypesSelected.value.filter((selectedType) => selectedType !== type)
        : [...identificationTypesSelected.value, type];
    if (identificationTypesSelected.value.length > 0)
        delete fieldErrors.value.identificationType;
}
function previousStep() {
    clearErrors();
    step.value = Math.max(step.value - 1, 0);
}
function addItem() {
    if (!hasValidDraft.value) {
        fieldErrors.value = {
            item: "Escribe la descripción del artículo y una cantidad válida (1 a 999).",
        };
        return;
    }
    const item = {
        ...itemDraft.value,
        description: itemDraft.value.description.trim(),
        brand: itemDraft.value.brand.trim(),
        model: itemDraft.value.model.trim(),
        serialNumber: itemDraft.value.serialNumber.trim(),
        color: itemDraft.value.color.trim(),
    };
    if (editingItemIndex.value === null)
        items.value.push(item);
    else
        items.value.splice(editingItemIndex.value, 1, item);
    itemDraft.value = newItem();
    editingItemIndex.value = null;
    fieldErrors.value = {};
}
function editItem(index) {
    const item = items.value[index];
    if (!item)
        return;
    itemDraft.value = { ...item };
    editingItemIndex.value = index;
    fieldErrors.value = {};
    document.querySelector(".visitor-kiosk-item-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function cancelItemEdit() {
    itemDraft.value = newItem();
    editingItemIndex.value = null;
    fieldErrors.value = {};
}
function removeItem(index) {
    items.value.splice(index, 1);
    if (editingItemIndex.value === index)
        cancelItemEdit();
    else if (editingItemIndex.value !== null && index < editingItemIndex.value)
        editingItemIndex.value -= 1;
}
function resetKiosk() {
    if (sending.value)
        return;
    if (resetTimer !== undefined) {
        window.clearTimeout(resetTimer);
        resetTimer = undefined;
    }
    closeStatusEventSource();
    try {
        sessionStorage.removeItem(draftStorageKey);
        sessionStorage.removeItem(pendingStorageKey);
    }
    catch (error) {
        console.error("No se pudo limpiar el estado guardado del registro:", error);
        notifyUser("No se pudo limpiar el avance guardado en esta pestaña.");
    }
    pendingRegistration.value = null;
    visitorName.value = "";
    companyName.value = "";
    visitReason.value = "";
    carriesItems.value = null;
    items.value = [];
    itemDraft.value = newItem();
    editingItemIndex.value = null;
    identificationTypesSelected.value = [];
    declaresIdRetained.value = null;
    informationConfirmed.value = false;
    showRestoreNotice.value = false;
    completed.value = null;
    completedStatus.value = "reference";
    completedStatusError.value = "";
    requestIdempotencyKey.value = crypto.randomUUID();
    step.value = 0;
    clearErrors();
    window.history.replaceState(null, "", "/registro");
}
async function refreshCompletedStatus() {
    if (!completed.value || statusRequestInProgress)
        return;
    statusRequestInProgress = true;
    try {
        const response = await fetch("/api/visitor-kiosk/status", {
            headers: { "Idempotency-Key": requestIdempotencyKey.value },
        });
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudo consultar la revisión de recepción.");
        if (!["Pendiente", "Autorizada", "Rechazada"].includes(String(result.authorizationStatus)) ||
            !["No aplica", "Pendiente", "Confirmada", "No confirmada"].includes(String(result.receptionIdClaimStatus)) ||
            typeof result.entryChecklistComplete !== "boolean" ||
            typeof result.entered !== "boolean") {
            throw new Error("El servidor devolvió un estado de revisión inválido.");
        }
        completedStatusError.value = "";
        if (result.authorizationStatus === "Rechazada") {
            completedStatus.value = "rejected";
        }
        else if (result.authorizationStatus === "Autorizada" && result.entered) {
            completedStatus.value = "entered";
        }
        else if (result.authorizationStatus === "Autorizada" && !result.entryChecklistComplete) {
            completedStatus.value = "awaiting-entry-checklist";
        }
        else if (result.receptionIdClaimStatus === "Confirmada" || result.receptionIdClaimStatus === "No confirmada") {
            completedStatus.value = "awaiting-entry-authorization";
        }
        else if (result.receptionIdClaimStatus === "No aplica") {
            completedStatus.value = "awaiting-entry-authorization";
        }
        else {
            completedStatus.value = "awaiting-id-check";
        }
        if (completedStatus.value === "entered" || completedStatus.value === "rejected") {
            closeStatusEventSource();
            scheduleKioskReset(30000);
        }
    }
    catch (error) {
        console.error("No se pudo actualizar el estado del autorregistro:", error);
        completedStatusError.value =
            error instanceof Error ? error.message : "No se pudo actualizar el estado de la revisión.";
    }
    finally {
        statusRequestInProgress = false;
    }
}
async function submitRegistration() {
    if (sending.value || !validateVisitor()) {
        step.value = 1;
        return;
    }
    if (identificationTypesSelected.value.length === 0 ||
        identificationTypesSelected.value.some((type) => !identificationTypes.includes(type)) ||
        declaresIdRetained.value === null) {
        fieldErrors.value = {
            identificationType: "Revisa los datos de identificación.",
        };
        step.value = 3;
        return;
    }
    if (!informationConfirmed.value) {
        fieldErrors.value = { informationConfirmed: "Confirma que los datos son correctos antes de enviar." };
        return;
    }
    sending.value = true;
    clearErrors();
    try {
        try {
            persistDraft();
        }
        catch (storageError) {
            console.error("No se pudo conservar el borrador antes del envío:", storageError);
        }
        const response = await fetch("/api/visitor-kiosk/registrations", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": requestIdempotencyKey.value,
            },
            body: JSON.stringify({
                visitorName: visitorName.value,
                companyName: companyName.value,
                visitReason: visitReason.value,
                carriesItems: carriesItems.value,
                items: carriesItems.value ? items.value : [],
                identificationTypes: identificationTypesSelected.value,
                declaresIdRetained: declaresIdRetained.value,
            }),
        });
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudo guardar el registro. Inténtalo de nuevo.");
        if (typeof result.folio !== "string" || typeof result.visitorName !== "string") {
            throw new Error("El servidor no confirmó el registro.");
        }
        pendingRegistration.value = {
            version: 1,
            completed: result,
            requestIdempotencyKey: requestIdempotencyKey.value,
            carriesItems: carriesItems.value,
            declaresIdRetained: declaresIdRetained.value,
            expiresAt: Date.now() + 120000,
        };
        try {
            sessionStorage.setItem(pendingStorageKey, JSON.stringify(pendingRegistration.value));
            sessionStorage.removeItem(draftStorageKey);
        }
        catch (storageError) {
            console.error("No se pudo conservar el folio del registro en esta pestaña:", storageError);
            notifyUser("El registro se guardó, pero no se pudo conservar el folio en esta pestaña.");
        }
        completed.value = result;
        completedStatus.value = declaresIdRetained.value ? "awaiting-id-check" : "reference";
        step.value = 5;
        resumePendingStatus();
        scheduleKioskReset(120000);
    }
    catch (error) {
        console.error("No se pudo enviar el autorregistro:", error);
        errorMessage.value = error instanceof Error
            ? error.message
            : "No se pudo guardar el registro. Inténtalo de nuevo.";
        notifyUser(errorMessage.value);
    }
    finally {
        sending.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "visitor-kiosk" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "visitor-kiosk-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
    ...{ class: "visitor-kiosk-brand" },
    href: "/registro",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
    src: "/images/cymez-visitor-logo.webp",
    alt: "CyMEZ",
    width: "160",
    height: "179",
    decoding: "async",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "visitor-kiosk-header-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M16 20v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20m7-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7.7a4 4 0 0 1 0 7.4m5 9.3v-1.6a4 4 0 0 0-3-3.9",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
if (__VLS_ctx.step === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "visitor-kiosk-welcome" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        ...{ class: "visitor-kiosk-neon-frame" },
        src: "/images/visitor-kiosk-neon-frame.webp",
        alt: "",
        width: "1527",
        height: "738",
        decoding: "async",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-welcome-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-welcome-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "visitor-kiosk-eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-welcome-mark" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        src: "/images/visitor-kiosk-access-icon.webp",
        alt: "",
        width: "128",
        height: "110",
        decoding: "async",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-welcome-accent" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "visitor-kiosk-intro" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.step === 0))
                    return;
                __VLS_ctx.step = 1;
                __VLS_ctx.clearErrors();
            } },
        ...{ class: "visitor-kiosk-primary" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm2 5 2 2 4-4",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M5 12h14m-6-6 6 6-6 6",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-welcome-visual" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        ...{ class: "visitor-kiosk-tablet" },
        src: "/images/visitor-kiosk-tablet.webp",
        srcset: "/images/visitor-kiosk-tablet-600.webp 600w, /images/visitor-kiosk-tablet-850.webp 850w, /images/visitor-kiosk-tablet.webp 1102w",
        sizes: "(max-width: 720px) 92vw, 500px",
        alt: "",
        width: "1102",
        height: "768",
        fetchpriority: "high",
        decoding: "async",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-features" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m13 2-3 8h7L8 22l3-9H5l8-11Z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m9 12 2 2 4-4",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-1-15.8a4 4 0 0 1 0 7.7",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
}
else if (__VLS_ctx.step >= 1 && __VLS_ctx.step <= 4) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "visitor-kiosk-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-progress" },
        'aria-label': "Progreso del registro",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.step);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: ({ width: `${__VLS_ctx.progress * 25}%` }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "visitor-kiosk-step-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "visitor-kiosk-eyebrow" },
    });
    (__VLS_ctx.step === 1 ? "IDENTIFICACIÓN DE VISITA" : __VLS_ctx.step === 2 ? "DECLARACIÓN DE ARTÍCULOS" : __VLS_ctx.step === 3 ? "CONTROL DE IDENTIDAD" : "ÚLTIMA REVISIÓN");
    if (__VLS_ctx.step === 1) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-step-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-step-icon" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 48 48",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M24 5 8 11v12c0 9 6.8 15.7 16 20 9.2-4.3 16-11 16-20V11L24 5Z",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "24",
            cy: "19",
            r: "5",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M14.5 34c1.7-5 5-7.5 9.5-7.5s7.8 2.5 9.5 7.5",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        (__VLS_ctx.step === 2 ? "Equipo y herramientas" : __VLS_ctx.step === 3 ? "Identificación" : "Revisa tu registro");
    }
    if (__VLS_ctx.step === 2) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "visitor-kiosk-equipment-rule" },
            role: "note",
        });
    }
    else if (__VLS_ctx.step === 3) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
    if (__VLS_ctx.showRestoreNotice) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "visitor-kiosk-save-notice" },
            role: "status",
        });
    }
    if (__VLS_ctx.step === 1) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
            ...{ onSubmit: (__VLS_ctx.continueStep) },
            ...{ class: "visitor-kiosk-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-label-title" },
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-field-control" },
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (__VLS_ctx.visitorName),
            type: "text",
            autocomplete: "name",
            maxlength: "180",
            placeholder: "Escribe tu nombre completo",
            required: true,
            'aria-invalid': (!!__VLS_ctx.fieldErrors.visitorName),
        });
        if (__VLS_ctx.fieldErrors.visitorName) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                ...{ class: "visitor-kiosk-field-error" },
            });
            (__VLS_ctx.fieldErrors.visitorName);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-label-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M3 21h18M5 21V7l7-4v18m7 0V11l-7-4",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M8 9v1m0 3v1m0 3v1m8-5v1m0 3v1",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-field-control" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M3 21h18M5 21V7l7-4v18m7 0V11l-7-4",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M8 9v1m0 3v1m0 3v1m8-5v1m0 3v1",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (__VLS_ctx.companyName),
            type: "text",
            maxlength: "180",
            placeholder: "Escribe el nombre de tu empresa",
            required: true,
            'aria-invalid': (!!__VLS_ctx.fieldErrors.companyName),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
            ...{ class: "visitor-kiosk-field-hint" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.step === 0))
                        return;
                    if (!(__VLS_ctx.step >= 1 && __VLS_ctx.step <= 4))
                        return;
                    if (!(__VLS_ctx.step === 1))
                        return;
                    __VLS_ctx.companyName = 'Público general';
                } },
            ...{ class: "visitor-kiosk-text-button" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "9",
            cy: "7",
            r: "4",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "visitor-kiosk-text-button-arrow" },
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M5 12h14m-7-7 7 7-7 7",
        });
        if (__VLS_ctx.fieldErrors.companyName) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                ...{ class: "visitor-kiosk-field-error" },
            });
            (__VLS_ctx.fieldErrors.companyName);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-label-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m11 17 2 2a2 2 0 1 0 3-3",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m14 14 2 2a2 2 0 1 0 3-3l-3.5-3.5a2 2 0 0 0-3 0L12 10a3 3 0 0 1-3 0l-.5-.5a2 2 0 0 0-3 0L2 13a2 2 0 0 0 3 3l2.5-2.5",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m7 13 3 3m4-2 2 2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-field-control is-multiline" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M8 9h8m-8 4h6",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
            value: (__VLS_ctx.visitReason),
            rows: "3",
            maxlength: "500",
            placeholder: "Describe el motivo de tu visita",
            required: true,
            'aria-invalid': (!!__VLS_ctx.fieldErrors.visitReason),
        });
        if (__VLS_ctx.fieldErrors.visitReason) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                ...{ class: "visitor-kiosk-field-error" },
            });
            (__VLS_ctx.fieldErrors.visitReason);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.previousStep) },
            ...{ class: "visitor-kiosk-secondary" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M19 12H5m7 7-7-7 7-7",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "visitor-kiosk-primary" },
            type: "submit",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M5 12h14m-7-7 7 7-7 7",
        });
    }
    else if (__VLS_ctx.step === 2) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-form" },
            ...{ class: ({ 'visitor-kiosk-equipment-form': __VLS_ctx.carriesItems }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-equipment-content" },
            ...{ class: ({ 'has-equipment-list': __VLS_ctx.carriesItems }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-choice-group" },
            role: "group",
            'aria-label': "¿Llevas equipo o herramientas?",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.step === 0))
                        return;
                    if (!(__VLS_ctx.step >= 1 && __VLS_ctx.step <= 4))
                        return;
                    if (!!(__VLS_ctx.step === 1))
                        return;
                    if (!(__VLS_ctx.step === 2))
                        return;
                    __VLS_ctx.carriesItems = true;
                    __VLS_ctx.fieldErrors = {};
                } },
            type: "button",
            ...{ class: ({ 'is-selected': __VLS_ctx.carriesItems === true }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "visitor-kiosk-choice-icon" },
            viewBox: "0 0 48 48",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M28 7a10 10 0 0 0 12 12L27 32l-7-7L33 12a10 10 0 0 0-5-5Z",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m20 25-6-6a10 10 0 0 0-7-12l6 6-1 5-5 1-6-6a10 10 0 0 0 12 12l6 6m-6-6L5 39a4 4 0 0 0 6 6l12-12",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-choice-copy" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.step === 0))
                        return;
                    if (!(__VLS_ctx.step >= 1 && __VLS_ctx.step <= 4))
                        return;
                    if (!!(__VLS_ctx.step === 1))
                        return;
                    if (!(__VLS_ctx.step === 2))
                        return;
                    __VLS_ctx.carriesItems = false;
                    __VLS_ctx.items = [];
                    __VLS_ctx.itemDraft = __VLS_ctx.newItem();
                    __VLS_ctx.editingItemIndex = null;
                    __VLS_ctx.fieldErrors = {};
                } },
            type: "button",
            ...{ class: ({ 'is-selected': __VLS_ctx.carriesItems === false }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "visitor-kiosk-choice-icon is-no" },
            viewBox: "0 0 48 48",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "24",
            cy: "24",
            r: "17",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m12 12 24 24",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-choice-copy" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        if (__VLS_ctx.fieldErrors.carriesItems || __VLS_ctx.fieldErrors.items) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                ...{ class: "visitor-kiosk-field-error" },
            });
            (__VLS_ctx.fieldErrors.carriesItems || __VLS_ctx.fieldErrors.items);
        }
        if (__VLS_ctx.carriesItems) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "visitor-kiosk-item-editor" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                value: (__VLS_ctx.itemDraft.type),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "visitor-kiosk-item-description" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "visitor-kiosk-label-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                value: (__VLS_ctx.itemDraft.description),
                type: "text",
                maxlength: "180",
                required: true,
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                type: "number",
                min: "1",
                max: "999",
                step: "1",
                required: true,
            });
            (__VLS_ctx.itemDraft.quantity);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                value: (__VLS_ctx.itemDraft.brand),
                type: "text",
                maxlength: "120",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                value: (__VLS_ctx.itemDraft.model),
                type: "text",
                maxlength: "120",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                value: (__VLS_ctx.itemDraft.serialNumber),
                type: "text",
                maxlength: "180",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                value: (__VLS_ctx.itemDraft.color),
                type: "text",
                maxlength: "80",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "visitor-kiosk-item-form-actions" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.addItem) },
                ...{ class: "visitor-kiosk-add-item" },
                type: "button",
            });
            if (__VLS_ctx.editingItemIndex === null) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    viewBox: "0 0 24 24",
                    'aria-hidden': "true",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                    d: "M12 5v14m-7-7h14",
                });
            }
            (__VLS_ctx.editingItemIndex === null ? "Agregar artículo" : "Guardar cambios");
            if (__VLS_ctx.editingItemIndex !== null) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (__VLS_ctx.cancelItemEdit) },
                    ...{ class: "visitor-kiosk-cancel-item-edit" },
                    type: "button",
                });
            }
            if (__VLS_ctx.fieldErrors.item) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                    ...{ class: "visitor-kiosk-field-error" },
                });
                (__VLS_ctx.fieldErrors.item);
            }
            if (__VLS_ctx.items.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
                    ...{ class: "visitor-kiosk-item-list" },
                });
                for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.items))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                        key: (`${index}-${item.description}`),
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (item.type);
                    (item.description);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                    (item.quantity);
                    if (item.brand) {
                        (item.brand);
                    }
                    if (item.model) {
                        (item.model);
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "visitor-kiosk-item-actions" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(__VLS_ctx.step === 0))
                                    return;
                                if (!(__VLS_ctx.step >= 1 && __VLS_ctx.step <= 4))
                                    return;
                                if (!!(__VLS_ctx.step === 1))
                                    return;
                                if (!(__VLS_ctx.step === 2))
                                    return;
                                if (!(__VLS_ctx.carriesItems))
                                    return;
                                if (!(__VLS_ctx.items.length))
                                    return;
                                __VLS_ctx.editItem(index);
                            } },
                        ...{ class: "is-edit" },
                        type: "button",
                        'aria-label': (`Editar ${item.description}`),
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(__VLS_ctx.step === 0))
                                    return;
                                if (!(__VLS_ctx.step >= 1 && __VLS_ctx.step <= 4))
                                    return;
                                if (!!(__VLS_ctx.step === 1))
                                    return;
                                if (!(__VLS_ctx.step === 2))
                                    return;
                                if (!(__VLS_ctx.carriesItems))
                                    return;
                                if (!(__VLS_ctx.items.length))
                                    return;
                                __VLS_ctx.removeItem(index);
                            } },
                        type: "button",
                        'aria-label': (`Eliminar ${item.description}`),
                    });
                }
            }
        }
        else if (__VLS_ctx.carriesItems === false) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "visitor-kiosk-empty-choice" },
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
                d: "m8 12 2.5 2.5L16 9",
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.previousStep) },
            ...{ class: "visitor-kiosk-secondary" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.continueStep) },
            ...{ class: "visitor-kiosk-primary" },
            type: "button",
        });
    }
    else if (__VLS_ctx.step === 3) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-identification-field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-label-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-identification-options" },
            role: "group",
            'aria-label': "Tipos de identificación; puedes elegir varias",
        });
        for (const [type, index] of __VLS_getVForSourceType((__VLS_ctx.identificationTypes))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.step === 0))
                            return;
                        if (!(__VLS_ctx.step >= 1 && __VLS_ctx.step <= 4))
                            return;
                        if (!!(__VLS_ctx.step === 1))
                            return;
                        if (!!(__VLS_ctx.step === 2))
                            return;
                        if (!(__VLS_ctx.step === 3))
                            return;
                        __VLS_ctx.toggleIdentificationType(type);
                    } },
                key: (type),
                ...{ class: "visitor-kiosk-identification-option" },
                ...{ class: ({ 'is-selected': __VLS_ctx.identificationTypesSelected.includes(type) }) },
                type: "button",
                'aria-pressed': (__VLS_ctx.identificationTypesSelected.includes(type)),
            });
            if (index === 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    viewBox: "0 0 32 32",
                    'aria-hidden': "true",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
                    x: "3.5",
                    y: "6",
                    width: "25",
                    height: "20",
                    rx: "3",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
                    cx: "11",
                    cy: "14",
                    r: "3",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                    d: "M6.5 22a5 5 0 0 1 9 0m4-8h5m-5 5h5",
                });
            }
            else if (index === 1) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    viewBox: "0 0 32 32",
                    'aria-hidden': "true",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                    d: "M16 3 27 7v8c0 7-4.7 11.6-11 14-6.3-2.4-11-7-11-14V7l11-4Z",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
                    cx: "16",
                    cy: "13",
                    r: "3",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                    d: "M10 22a6 6 0 0 1 12 0",
                });
            }
            else if (index === 2) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    viewBox: "0 0 32 32",
                    'aria-hidden': "true",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
                    x: "6",
                    y: "4",
                    width: "20",
                    height: "24",
                    rx: "3",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                    d: "M11 4v5h10V4m-10 11h10m-10 5h7",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
                    cx: "21.5",
                    cy: "23",
                    r: "1",
                });
            }
            else if (index === 3) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    viewBox: "0 0 32 32",
                    'aria-hidden': "true",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
                    x: "4",
                    y: "7",
                    width: "24",
                    height: "18",
                    rx: "4",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
                    cx: "12",
                    cy: "15",
                    r: "3",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                    d: "M7.5 22a5 5 0 0 1 9 0m3-9h7m-7 5h7m-7 4h5",
                });
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    viewBox: "0 0 32 32",
                    'aria-hidden': "true",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                    d: "M16 3 27 7v8c0 7-4.7 11.6-11 14-6.3-2.4-11-7-11-14V7l11-4Z",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                    d: "M16 10v12m-5-6h10",
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (type);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                ...{ class: "visitor-kiosk-identification-check" },
                viewBox: "0 0 24 24",
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "m5 12 4 4L19 6",
            });
        }
        if (__VLS_ctx.fieldErrors.identificationType) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                ...{ class: "visitor-kiosk-field-error" },
            });
            (__VLS_ctx.fieldErrors.identificationType);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.fieldset, __VLS_intrinsicElements.fieldset)({
            ...{ class: "visitor-kiosk-id-question" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.legend, __VLS_intrinsicElements.legend)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "radio",
            value: (true),
        });
        (__VLS_ctx.declaresIdRetained);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "radio",
            value: (false),
        });
        (__VLS_ctx.declaresIdRetained);
        if (__VLS_ctx.fieldErrors.declaresIdRetained) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                ...{ class: "visitor-kiosk-field-error" },
            });
            (__VLS_ctx.fieldErrors.declaresIdRetained);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.previousStep) },
            ...{ class: "visitor-kiosk-secondary" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.continueStep) },
            ...{ class: "visitor-kiosk-primary" },
            type: "button",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dl, __VLS_intrinsicElements.dl)({
            ...{ class: "visitor-kiosk-summary" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
        (__VLS_ctx.visitorName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
        (__VLS_ctx.companyName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
        (__VLS_ctx.visitReason);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
        (__VLS_ctx.carriesItems ? __VLS_ctx.items.map((item) => `${item.type}: ${item.description} (cantidad ${item.quantity})`).join("; ") : "No lleva artículos");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
        (__VLS_ctx.identificationTypesSelected.join(", "));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
        (__VLS_ctx.declaresIdRetained ? "Declara que las entregó para resguardo" : "Declara que solo las presentó para verificación");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "visitor-kiosk-confirmation" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "checkbox",
        });
        (__VLS_ctx.informationConfirmed);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-confirmation-copy" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        if (__VLS_ctx.fieldErrors.informationConfirmed) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                ...{ class: "visitor-kiosk-field-error" },
            });
            (__VLS_ctx.fieldErrors.informationConfirmed);
        }
        if (__VLS_ctx.errorMessage) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "visitor-kiosk-error" },
                role: "alert",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "visitor-kiosk-error-copy" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.errorMessage);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.submitRegistration) },
                type: "button",
                disabled: (__VLS_ctx.sending),
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.previousStep) },
            ...{ class: "visitor-kiosk-secondary" },
            type: "button",
            disabled: (__VLS_ctx.sending),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.submitRegistration) },
            ...{ class: "visitor-kiosk-primary" },
            type: "button",
            disabled: (__VLS_ctx.sending),
        });
        (__VLS_ctx.sending ? "Enviando registro…" : "Enviar registro");
    }
}
else if (__VLS_ctx.step === 5 && __VLS_ctx.completed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "visitor-kiosk-welcome visitor-kiosk-success" },
        role: "status",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        ...{ class: "visitor-kiosk-neon-frame" },
        src: "/images/visitor-kiosk-neon-frame.webp",
        alt: "",
        width: "1527",
        height: "738",
        decoding: "async",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-success-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-success-mark" },
        ...{ class: (`is-${__VLS_ctx.completedStatus}`) },
        'aria-hidden': "true",
    });
    if (__VLS_ctx.completedStatus === 'entered') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 48 48",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "24",
            cy: "24",
            r: "20",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m14 24 7 7 14-15",
        });
    }
    else if (__VLS_ctx.completedStatus === 'rejected') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 48 48",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "24",
            cy: "24",
            r: "20",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m17 17 14 14m0-14L17 31",
        });
    }
    else if (__VLS_ctx.completedStatus === 'reference') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 48 48",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "24",
            cy: "24",
            r: "20",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M17 13h10l6 6v16H17z",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M27 13v7h6m-12 5h8m-8 5h8",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 48 48",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "24",
            cy: "24",
            r: "20",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M24 13v12l8 5",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "visitor-kiosk-eyebrow" },
    });
    (__VLS_ctx.completedStatus === "entered"
        ? "REVISIÓN COMPLETADA"
        : __VLS_ctx.completedStatus === "rejected"
            ? "REVISIÓN RECHAZADA"
            : __VLS_ctx.completedStatus === "reference"
                ? "REGISTRO RECIBIDO"
                : __VLS_ctx.completedStatus === "awaiting-id-check"
                    ? "VALIDACIÓN DE IDENTIFICACIÓN"
                    : "AUTORIZACIÓN EN PROCESO");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    (__VLS_ctx.completedStatus === "entered"
        ? "Tu ingreso fue registrado"
        : __VLS_ctx.completedStatus === "rejected"
            ? "Acude con recepción"
            : __VLS_ctx.completedStatus === "reference"
                ? "Tu código de referencia"
                : __VLS_ctx.completedStatus === "awaiting-id-check"
                    ? "Recepción verificará tu identificación"
                    : __VLS_ctx.completedStatus === "awaiting-entry-checklist"
                        ? "Completa la revisión de equipo"
                        : "Esperando autorización de entrada");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-success-accent" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-folio" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.completed.folio);
    if (__VLS_ctx.completedStatus !== 'reference') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "visitor-kiosk-success-name" },
        });
        (__VLS_ctx.completed.visitorName);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "visitor-kiosk-intro" },
    });
    (__VLS_ctx.completedStatus === "entered"
        ? "Recepción completó el checklist de entrada y registró tu ingreso en la bitácora."
        : __VLS_ctx.completedStatus === "rejected"
            ? "Recepción no autorizó el registro. Solicita asistencia antes de ingresar."
            : __VLS_ctx.completedStatus === "reference"
                ? "Presenta este folio a recepción para continuar con la autorización de entrada."
                : __VLS_ctx.completedStatus === "awaiting-id-check"
                    ? "Tu llegada está registrada. Recepción debe confirmar primero que recibió tu identificación para resguardo."
                    : __VLS_ctx.completedStatus === "awaiting-entry-checklist"
                        ? "Recepción autorizó tu entrada. El checklist de equipo debe completarse antes de registrar el ingreso."
                        : __VLS_ctx.completedStatus === "awaiting-entry-authorization"
                            ? "La declaración de resguardo ya fue revisada. Espera la decisión de recepción sobre tu entrada."
                            : __VLS_ctx.carriesItems
                                ? "Tu llegada quedó anotada. Espera mientras recepción revisa el checklist de equipos y autoriza el ingreso."
                                : "Tu llegada quedó anotada. Espera mientras recepción revisa y autoriza el ingreso.");
    if (__VLS_ctx.waitingMessage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-waiting" },
            role: "status",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-waiting-indicator" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.waitingMessage);
    }
    if (__VLS_ctx.completedStatusError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "visitor-kiosk-status-error" },
            role: "status",
        });
        (__VLS_ctx.completedStatusError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.resetKiosk) },
        ...{ class: "visitor-kiosk-secondary" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "visitor-kiosk-home-arrow" },
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M5 12h14m-6-6 6 6-6 6",
    });
}
/** @type {__VLS_StyleScopedClasses['visitor-kiosk']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-header']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-header-label']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-welcome']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-neon-frame']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-welcome-main']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-welcome-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-welcome-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-welcome-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-welcome-visual']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-tablet']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-features']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-card']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-step-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-step-title']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-step-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-equipment-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-save-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-form']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-label-title']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-label-title']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-text-button']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-text-button-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-label-title']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['is-multiline']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-form']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-equipment-form']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-equipment-content']} */ ;
/** @type {__VLS_StyleScopedClasses['has-equipment-list']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-choice-group']} */ ;
/** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-choice-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-choice-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-choice-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['is-no']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-choice-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-item-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-item-description']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-label-title']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-item-form-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-add-item']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-cancel-item-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-item-list']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-item-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['is-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-empty-choice']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-form']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-identification-field']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-label-title']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-identification-options']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-identification-option']} */ ;
/** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-identification-check']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-id-question']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-form']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-confirmation']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-confirmation-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-error-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-welcome']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-success']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-neon-frame']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-success-content']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-success-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-success-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-folio']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-success-name']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-waiting']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-waiting-indicator']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-status-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-home-arrow']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            identificationTypes: identificationTypes,
            step: step,
            sending: sending,
            errorMessage: errorMessage,
            showRestoreNotice: showRestoreNotice,
            fieldErrors: fieldErrors,
            visitorName: visitorName,
            companyName: companyName,
            visitReason: visitReason,
            carriesItems: carriesItems,
            items: items,
            itemDraft: itemDraft,
            editingItemIndex: editingItemIndex,
            identificationTypesSelected: identificationTypesSelected,
            declaresIdRetained: declaresIdRetained,
            informationConfirmed: informationConfirmed,
            completed: completed,
            completedStatus: completedStatus,
            completedStatusError: completedStatusError,
            waitingMessage: waitingMessage,
            progress: progress,
            newItem: newItem,
            clearErrors: clearErrors,
            continueStep: continueStep,
            toggleIdentificationType: toggleIdentificationType,
            previousStep: previousStep,
            addItem: addItem,
            editItem: editItem,
            cancelItemEdit: cancelItemEdit,
            removeItem: removeItem,
            resetKiosk: resetKiosk,
            submitRegistration: submitRegistration,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
