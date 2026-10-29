import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { confirmUser, notifyUser } from "../notifications";
const props = defineProps();
const emit = defineEmits();
const registrations = ref([]);
const loading = ref(true);
const errorMessage = ref("");
const savingRegistrationId = ref(null);
const registrationDetails = ref(null);
const inspectionRegistration = ref(null);
const inspectionPhase = ref(null);
const inspectionDraft = ref([]);
const entryPolicyConfirmed = ref(false);
let registrationRequestInProgress = false;
const selectedRegistration = computed(() => registrations.value.find((registration) => registration.visitorRecordId === props.selectedVisitorRecordId) ?? null);
const checkedInspectionItems = computed(() => inspectionDraft.value.filter((item) => item.checked).length);
async function parseResponse(response) {
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("No se pudo conectar con el módulo de autorregistro.");
    }
    try {
        return await response.json();
    }
    catch {
        throw new Error("El servidor devolvió una respuesta de autorregistro inválida.");
    }
}
async function loadRegistrations(silent = false) {
    if (registrationRequestInProgress)
        return;
    registrationRequestInProgress = true;
    try {
        const response = await fetch("/api/visitor-kiosk/registrations");
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudieron cargar los autorregistros.");
        if (!Array.isArray(result.registrations)) {
            throw new Error("El servidor devolvió una lista de autorregistros inválida.");
        }
        registrations.value = result.registrations;
        errorMessage.value = "";
        if (registrationDetails.value) {
            registrationDetails.value =
                result.registrations.find((registration) => registration.id === registrationDetails.value?.id) ?? null;
        }
        if (inspectionRegistration.value) {
            inspectionRegistration.value =
                result.registrations.find((registration) => registration.id === inspectionRegistration.value?.id) ?? null;
            if (!inspectionRegistration.value)
                inspectionPhase.value = null;
        }
    }
    catch (error) {
        console.error("No se pudieron cargar los registros del kiosco:", error);
        if (!silent) {
            errorMessage.value = error instanceof Error ? error.message : "No se pudieron cargar los autorregistros.";
        }
    }
    finally {
        loading.value = false;
        registrationRequestInProgress = false;
    }
}
function refreshRegistrationsAfterRealtimeUpdate() {
    if (document.visibilityState === "visible")
        void loadRegistrations(true);
}
onMounted(() => {
    void loadRegistrations();
    window.addEventListener("visitas:data-changed", refreshRegistrationsAfterRealtimeUpdate);
});
onBeforeUnmount(() => {
    window.removeEventListener("visitas:data-changed", refreshRegistrationsAfterRealtimeUpdate);
});
async function processRegistration(registration, action) {
    if (savingRegistrationId.value !== null)
        return;
    const actionMessage = {
        authorize: "autorizar esta visita",
        reject: "rechazar esta visita",
        "receive-identification": "confirmar la recepción física de esta identificación",
        "deny-identification": "registrar que recepción no pudo confirmar el resguardo de esta identificación",
        "return-identification": "registrar la devolución de esta identificación",
    }[action];
    if (!await confirmUser(`¿Deseas ${actionMessage}?`, action === "deny-identification" ? "Registrar no confirmado" : "Confirmar acción"))
        return;
    savingRegistrationId.value = registration.id;
    try {
        const response = await fetch(`/api/visitor-kiosk/registrations/${registration.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
        });
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudo procesar el registro.");
        await loadRegistrations();
        emit("movementSaved");
        notifyUser("La acción se registró correctamente.", "success");
    }
    catch (error) {
        console.error("No se pudo procesar el autorregistro:", error);
        notifyUser(error instanceof Error ? error.message : "No se pudo procesar el registro.");
    }
    finally {
        savingRegistrationId.value = null;
    }
}
function openChecklist(registration, phase) {
    inspectionRegistration.value = registration;
    inspectionPhase.value = phase;
    entryPolicyConfirmed.value = false;
    inspectionDraft.value = registration.items.map((item) => ({
        itemId: item.id,
        result: "",
        notes: "",
        checked: false,
        incident: false,
    }));
}
function closeChecklist() {
    inspectionPhase.value = null;
    inspectionRegistration.value = null;
    inspectionDraft.value = [];
    entryPolicyConfirmed.value = false;
}
function checklistItem(itemId) {
    return inspectionRegistration.value?.items.find((item) => item.id === itemId);
}
async function completeChecklist(registration) {
    const phase = inspectionPhase.value;
    if (!phase || savingRegistrationId.value !== null)
        return;
    const uncheckedItem = inspectionDraft.value.find((item) => !item.checked);
    if (uncheckedItem) {
        notifyUser("Marca la verificación física de todos los artículos antes de completar el checklist.");
        return;
    }
    const incompleteIncident = inspectionDraft.value.find((item) => item.incident && (!item.result || !item.notes.trim()));
    if (incompleteIncident) {
        notifyUser("Selecciona el tipo de incidencia y agrega observaciones antes de completar el checklist.");
        return;
    }
    if (phase === "Entrada" && !entryPolicyConfirmed.value) {
        notifyUser("Confirma que no ingresará equipo ni herramientas que no estén registrados.");
        return;
    }
    savingRegistrationId.value = registration.id;
    try {
        const response = await fetch(`/api/visitor-kiosk/registrations/${registration.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: phase === "Entrada" ? "complete-entry-checklist" : "complete-exit-checklist",
                items: inspectionDraft.value.map((item) => ({
                    itemId: item.itemId,
                    result: item.incident ? item.result : "Coincide",
                    notes: item.notes,
                })),
            }),
        });
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudo completar el checklist.");
        closeChecklist();
        await loadRegistrations();
        emit("movementSaved");
        notifyUser(result.message ?? `Checklist de ${phase.toLowerCase()} completado.`, "success");
    }
    catch (error) {
        console.error("No se pudo guardar el checklist del visitante:", error);
        notifyUser(error instanceof Error ? error.message : "No se pudo completar el checklist.");
    }
    finally {
        savingRegistrationId.value = null;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
if (__VLS_ctx.selectedRegistration) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "daily-log-panel visitor-kiosk-inbox" },
        'aria-labelledby': "visitor-kiosk-inbox-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-panel-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-inbox-title-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-inbox-meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "daily-log-panel-kicker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-inbox-folio" },
    });
    (__VLS_ctx.selectedRegistration.folio);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "visitor-kiosk-inbox-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedRegistration))
                    return;
                __VLS_ctx.loadRegistrations();
            } },
        ...{ class: "daily-log-secondary-button visitor-kiosk-inbox-refresh" },
        type: "button",
        disabled: (__VLS_ctx.loading),
    });
    if (__VLS_ctx.errorMessage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "equipment-alert" },
            role: "alert",
        });
        (__VLS_ctx.errorMessage);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedRegistration))
                        return;
                    if (!(__VLS_ctx.errorMessage))
                        return;
                    __VLS_ctx.loadRegistrations();
                } },
            type: "button",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-reception-summary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-reception-overview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-reception-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "daily-log-table-status" },
        ...{ class: (`is-${__VLS_ctx.selectedRegistration.authorizationStatus === 'Pendiente' ? 'pendiente' : __VLS_ctx.selectedRegistration.authorizationStatus === 'Autorizada' ? 'dentro' : 'retirado'}`) },
    });
    (__VLS_ctx.selectedRegistration.authorizationStatus);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-reception-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedRegistration.companyName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-reception-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedRegistration.visitReason);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-reception-identification" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-reception-icon" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "3",
        y: "5",
        width: "18",
        height: "14",
        rx: "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "9",
        cy: "11",
        r: "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M6 16a3 3 0 0 1 6 0m3-5h3m-3 3h3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-reception-identification-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-reception-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedRegistration.identificationType);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained
        ? __VLS_ctx.selectedRegistration.receptionIdClaimStatus === "Pendiente"
            ? "Pendiente de confirmar por recepción."
            : __VLS_ctx.selectedRegistration.receptionIdClaimStatus === "No confirmada"
                ? "Recepción no confirmó el resguardo; la visita sigue pendiente de autorización."
                : `Recibida por ${__VLS_ctx.selectedRegistration.receptionReceivedIdBy}${__VLS_ctx.selectedRegistration.idReturnedAt ? ` · Devuelta por ${__VLS_ctx.selectedRegistration.idReturnedBy}` : ""}`
        : "Presentada solo para verificación.");
    if ((__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained && __VLS_ctx.selectedRegistration.receptionIdClaimStatus === 'Pendiente') ||
        (__VLS_ctx.selectedRegistration.receptionReceivedIdAt && !__VLS_ctx.selectedRegistration.idReturnedAt)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-reception-identification-actions" },
        });
        if (__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained && __VLS_ctx.selectedRegistration.receptionIdClaimStatus === 'Pendiente') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedRegistration))
                            return;
                        if (!((__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained && __VLS_ctx.selectedRegistration.receptionIdClaimStatus === 'Pendiente') ||
                            (__VLS_ctx.selectedRegistration.receptionReceivedIdAt && !__VLS_ctx.selectedRegistration.idReturnedAt)))
                            return;
                        if (!(__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained && __VLS_ctx.selectedRegistration.receptionIdClaimStatus === 'Pendiente'))
                            return;
                        __VLS_ctx.processRegistration(__VLS_ctx.selectedRegistration, 'receive-identification');
                    } },
                ...{ class: "visitor-kiosk-reception-button is-identification" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === __VLS_ctx.selectedRegistration.id),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                viewBox: "0 0 24 24",
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M5 12.5 9.5 17 19 7",
            });
        }
        if (__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained && __VLS_ctx.selectedRegistration.receptionIdClaimStatus === 'Pendiente') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedRegistration))
                            return;
                        if (!((__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained && __VLS_ctx.selectedRegistration.receptionIdClaimStatus === 'Pendiente') ||
                            (__VLS_ctx.selectedRegistration.receptionReceivedIdAt && !__VLS_ctx.selectedRegistration.idReturnedAt)))
                            return;
                        if (!(__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained && __VLS_ctx.selectedRegistration.receptionIdClaimStatus === 'Pendiente'))
                            return;
                        __VLS_ctx.processRegistration(__VLS_ctx.selectedRegistration, 'deny-identification');
                    } },
                ...{ class: "visitor-kiosk-reception-button is-reject" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === __VLS_ctx.selectedRegistration.id),
            });
        }
        if (__VLS_ctx.selectedRegistration.receptionReceivedIdAt && !__VLS_ctx.selectedRegistration.idReturnedAt) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedRegistration))
                            return;
                        if (!((__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained && __VLS_ctx.selectedRegistration.receptionIdClaimStatus === 'Pendiente') ||
                            (__VLS_ctx.selectedRegistration.receptionReceivedIdAt && !__VLS_ctx.selectedRegistration.idReturnedAt)))
                            return;
                        if (!(__VLS_ctx.selectedRegistration.receptionReceivedIdAt && !__VLS_ctx.selectedRegistration.idReturnedAt))
                            return;
                        __VLS_ctx.processRegistration(__VLS_ctx.selectedRegistration, 'return-identification');
                    } },
                ...{ class: "visitor-kiosk-reception-button is-identification" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === __VLS_ctx.selectedRegistration.id),
            });
        }
    }
    if (__VLS_ctx.selectedRegistration.authorizationStatus === 'Pendiente' &&
        (!__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained || __VLS_ctx.selectedRegistration.receptionIdClaimStatus !== 'Pendiente')) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-reception-authorization" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-reception-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-reception-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedRegistration))
                        return;
                    if (!(__VLS_ctx.selectedRegistration.authorizationStatus === 'Pendiente' &&
                        (!__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained || __VLS_ctx.selectedRegistration.receptionIdClaimStatus !== 'Pendiente')))
                        return;
                    __VLS_ctx.processRegistration(__VLS_ctx.selectedRegistration, 'authorize');
                } },
            ...{ class: "visitor-kiosk-reception-button is-authorize" },
            type: "button",
            disabled: (__VLS_ctx.savingRegistrationId === __VLS_ctx.selectedRegistration.id),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m5 12 4 4L19 6",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedRegistration))
                        return;
                    if (!(__VLS_ctx.selectedRegistration.authorizationStatus === 'Pendiente' &&
                        (!__VLS_ctx.selectedRegistration.visitorDeclaredIdRetained || __VLS_ctx.selectedRegistration.receptionIdClaimStatus !== 'Pendiente')))
                        return;
                    __VLS_ctx.processRegistration(__VLS_ctx.selectedRegistration, 'reject');
                } },
            ...{ class: "visitor-kiosk-reception-button is-reject" },
            type: "button",
            disabled: (__VLS_ctx.savingRegistrationId === __VLS_ctx.selectedRegistration.id),
        });
    }
    if (__VLS_ctx.selectedRegistration.items.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-reception-equipment" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-reception-equipment-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (__VLS_ctx.selectedRegistration.items.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedRegistration))
                        return;
                    if (!(__VLS_ctx.selectedRegistration.items.length > 0))
                        return;
                    __VLS_ctx.registrationDetails = __VLS_ctx.selectedRegistration;
                } },
            ...{ class: "daily-log-secondary-button" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({});
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.selectedRegistration.items))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (item.id),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.type);
            (item.description);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (item.quantity);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "daily-log-selection-action-group" },
        });
        if (__VLS_ctx.selectedRegistration.authorizationStatus === 'Autorizada' && !__VLS_ctx.selectedRegistration.entryChecklistComplete) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedRegistration))
                            return;
                        if (!(__VLS_ctx.selectedRegistration.items.length > 0))
                            return;
                        if (!(__VLS_ctx.selectedRegistration.authorizationStatus === 'Autorizada' && !__VLS_ctx.selectedRegistration.entryChecklistComplete))
                            return;
                        __VLS_ctx.openChecklist(__VLS_ctx.selectedRegistration, 'Entrada');
                    } },
                ...{ class: "daily-log-selection-action" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === __VLS_ctx.selectedRegistration.id),
            });
        }
        else if (__VLS_ctx.selectedRegistration.authorizationStatus === 'Pendiente') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
        else if (__VLS_ctx.selectedRegistration.authorizationStatus === 'Autorizada' && !__VLS_ctx.selectedRegistration.exitChecklistComplete) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedRegistration))
                            return;
                        if (!(__VLS_ctx.selectedRegistration.items.length > 0))
                            return;
                        if (!!(__VLS_ctx.selectedRegistration.authorizationStatus === 'Autorizada' && !__VLS_ctx.selectedRegistration.entryChecklistComplete))
                            return;
                        if (!!(__VLS_ctx.selectedRegistration.authorizationStatus === 'Pendiente'))
                            return;
                        if (!(__VLS_ctx.selectedRegistration.authorizationStatus === 'Autorizada' && !__VLS_ctx.selectedRegistration.exitChecklistComplete))
                            return;
                        __VLS_ctx.openChecklist(__VLS_ctx.selectedRegistration, 'Salida');
                    } },
                ...{ class: "daily-log-selection-action is-exit" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === __VLS_ctx.selectedRegistration.id),
            });
        }
        else if (__VLS_ctx.selectedRegistration.exitChecklistComplete) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
    }
}
else if (__VLS_ctx.selectedVisitorRecordId !== null && __VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "daily-log-loading" },
        role: "status",
    });
}
else if (__VLS_ctx.selectedVisitorRecordId !== null && __VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "equipment-alert" },
        role: "alert",
    });
    (__VLS_ctx.errorMessage);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.selectedRegistration))
                    return;
                if (!!(__VLS_ctx.selectedVisitorRecordId !== null && __VLS_ctx.loading))
                    return;
                if (!(__VLS_ctx.selectedVisitorRecordId !== null && __VLS_ctx.errorMessage))
                    return;
                __VLS_ctx.loadRegistrations();
            } },
        type: "button",
    });
}
if (__VLS_ctx.registrationDetails) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.registrationDetails))
                    return;
                __VLS_ctx.registrationDetails = null;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog workspace-dialog visitor-kiosk-detail" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "visitor-kiosk-detail-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.registrationDetails))
                    return;
                __VLS_ctx.registrationDetails = null;
            } },
        ...{ class: "dialog-close" },
        type: "button",
        'aria-label': "Cerrar",
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
        href: "#i-tool",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "visitor-kiosk-detail-title",
    });
    (__VLS_ctx.registrationDetails.folio);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    (__VLS_ctx.registrationDetails.visitorName);
    (__VLS_ctx.registrationDetails.companyName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-table-scroll" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "workspace-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.registrationDetails.items))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (`${index}-${item.description}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (item.type);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (item.description);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (item.quantity);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        ([item.brand, item.model, item.serialNumber, item.color].filter(Boolean).join(" · ") || "—");
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    if (__VLS_ctx.registrationDetails.inspections.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "dialog-description" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
            ...{ class: "visitor-kiosk-audit-list" },
        });
        for (const [inspection] of __VLS_getVForSourceType((__VLS_ctx.registrationDetails.inspections))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (inspection.id),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (inspection.phase.toLowerCase());
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (inspection.inspectorName);
            (inspection.completedAt);
            if (inspection.items.length === 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
                    ...{ class: "visitor-kiosk-inspection-results" },
                });
                for (const [item, index] of __VLS_getVForSourceType((inspection.items))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                        key: (`${inspection.id}-${index}`),
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (item.description);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (item.result);
                    if (item.notes) {
                        (item.notes);
                    }
                }
            }
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "visitor-kiosk-audit-list" },
    });
    for (const [event, index] of __VLS_getVForSourceType((__VLS_ctx.registrationDetails.audit))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            key: (`${event.created_at}-${index}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (event.action);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (event.actor_name);
        (event.created_at);
        if (event.details) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (event.details);
        }
    }
}
if (__VLS_ctx.inspectionPhase && __VLS_ctx.inspectionRegistration) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.inspectionPhase && __VLS_ctx.inspectionRegistration))
                    return;
                __VLS_ctx.savingRegistrationId === null && __VLS_ctx.closeChecklist();
            } },
        ...{ class: "modal-backdrop visitor-kiosk-checklist-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog workspace-dialog visitor-kiosk-detail visitor-kiosk-checklist-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "visitor-kiosk-checklist-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeChecklist) },
        ...{ class: "dialog-close" },
        type: "button",
        'aria-label': "Cerrar",
        disabled: (__VLS_ctx.savingRegistrationId !== null),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-close",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "visitor-kiosk-checklist-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dialog-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-tool",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-checklist-title-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-checklist-eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "visitor-kiosk-checklist-title",
    });
    (__VLS_ctx.inspectionPhase.toLowerCase());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-checklist-visitor" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.inspectionRegistration.visitorName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.inspectionRegistration.folio);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (...[$event]) => {
                if (!(__VLS_ctx.inspectionPhase && __VLS_ctx.inspectionRegistration))
                    return;
                __VLS_ctx.completeChecklist(__VLS_ctx.inspectionRegistration);
            } },
        ...{ class: "equipment-inspection-form visitor-kiosk-inspection-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "equipment-checklist-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "visitor-kiosk-checklist-section-icon" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m5 12 4 4L19 6",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    (__VLS_ctx.inspectionPhase.toLowerCase());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "equipment-checklist-progress" },
    });
    (__VLS_ctx.checkedInspectionItems);
    (__VLS_ctx.inspectionDraft.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "visitor-kiosk-checklist-notice" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "equipment-checklist-progress-track" },
        role: "progressbar",
        'aria-valuenow': (__VLS_ctx.checkedInspectionItems),
        'aria-valuemin': (0),
        'aria-valuemax': (__VLS_ctx.inspectionDraft.length),
        'aria-label': (`${__VLS_ctx.checkedInspectionItems} de ${__VLS_ctx.inspectionDraft.length} artículos verificados`),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: ({ width: `${__VLS_ctx.inspectionDraft.length ? __VLS_ctx.checkedInspectionItems / __VLS_ctx.inspectionDraft.length * 100 : 0}%` }) },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.inspectionDraft))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (item.itemId),
            ...{ class: "equipment-check-item" },
            ...{ class: ({ 'is-checked': item.checked }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
        (__VLS_ctx.checklistItem(item.itemId)?.type);
        (__VLS_ctx.checklistItem(item.itemId)?.description);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "equipment-check-readonly-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.checklistItem(item.itemId)?.type);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.checklistItem(item.itemId)?.quantity);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.checklistItem(item.itemId)?.description);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.checklistItem(item.itemId)?.brand || "—");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.checklistItem(item.itemId)?.model || "—");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.checklistItem(item.itemId)?.serialNumber || "—");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.checklistItem(item.itemId)?.color || "—");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "equipment-incident-toggle" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onChange: (...[$event]) => {
                    if (!(__VLS_ctx.inspectionPhase && __VLS_ctx.inspectionRegistration))
                        return;
                    !item.incident && (item.result = '');
                } },
            type: "checkbox",
        });
        (item.incident);
        if (item.incident) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "visitor-kiosk-incident-result" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                value: (item.result),
                required: true,
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "",
                disabled: true,
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "Faltante",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "Dañado",
            });
        }
        if (item.incident) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "equipment-notes-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
                value: (item.notes),
                maxlength: "1000",
                rows: "2",
                required: true,
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "equipment-checked-toggle" },
            ...{ class: ({ 'is-checked': item.checked }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "checkbox",
        });
        (item.checked);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (item.checked ? "Artículo revisado físicamente" : "Marcar como revisado");
    }
    if (__VLS_ctx.inspectionPhase === 'Entrada') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "equipment-checked-toggle" },
            ...{ class: ({ 'is-checked': __VLS_ctx.entryPolicyConfirmed }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "checkbox",
        });
        (__VLS_ctx.entryPolicyConfirmed);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "equipment-inspection-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeChecklist) },
        ...{ class: "button-secondary" },
        type: "button",
        disabled: (__VLS_ctx.savingRegistrationId !== null),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "button-primary" },
        type: "submit",
        disabled: (__VLS_ctx.savingRegistrationId !== null || __VLS_ctx.checkedInspectionItems !== __VLS_ctx.inspectionDraft.length || (__VLS_ctx.inspectionPhase === 'Entrada' && !__VLS_ctx.entryPolicyConfirmed)),
    });
    (__VLS_ctx.savingRegistrationId !== null ? "Guardando checklist…" : `Completar checklist (${__VLS_ctx.checkedInspectionItems}/${__VLS_ctx.inspectionDraft.length})`);
}
/** @type {__VLS_StyleScopedClasses['daily-log-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-inbox']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-inbox-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-inbox-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-inbox-folio']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-inbox-refresh']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-label']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-status']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-label']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-label']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-identification']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-identification-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-label']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-identification-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-identification']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-reject']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-identification']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-authorization']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-label']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-authorize']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-reject']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-equipment']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-reception-equipment-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-action-group']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-action']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-action']} */ ;
/** @type {__VLS_StyleScopedClasses['is-exit']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-audit-list']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-inspection-results']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-audit-list']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-checklist-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-checklist-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-checklist-header']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-checklist-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-checklist-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-checklist-visitor']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-form']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-inspection-form']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-checklist-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-checklist-section-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-checklist-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-checklist-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-checklist-progress-track']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['is-checked']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-check-readonly-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-incident-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-incident-result']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-notes-label']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-checked-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['is-checked']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-checked-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['is-checked']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            loading: loading,
            errorMessage: errorMessage,
            savingRegistrationId: savingRegistrationId,
            registrationDetails: registrationDetails,
            inspectionRegistration: inspectionRegistration,
            inspectionPhase: inspectionPhase,
            inspectionDraft: inspectionDraft,
            entryPolicyConfirmed: entryPolicyConfirmed,
            selectedRegistration: selectedRegistration,
            checkedInspectionItems: checkedInspectionItems,
            loadRegistrations: loadRegistrations,
            processRegistration: processRegistration,
            openChecklist: openChecklist,
            closeChecklist: closeChecklist,
            checklistItem: checklistItem,
            completeChecklist: completeChecklist,
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
