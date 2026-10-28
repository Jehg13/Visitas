import { onBeforeUnmount, onMounted, ref } from "vue";
import { notifyUser } from "../notifications";
const registrations = ref([]);
const loading = ref(true);
const errorMessage = ref("");
const savingRegistrationId = ref(null);
const selectedRegistration = ref(null);
const inspectionRegistration = ref(null);
const inspectionPhase = ref(null);
const inspectionDraft = ref([]);
const extraItemDescription = ref("");
const extraItems = ref([]);
let refreshTimer;
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
        if (selectedRegistration.value) {
            selectedRegistration.value =
                result.registrations.find((registration) => registration.id === selectedRegistration.value?.id) ?? null;
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
    }
}
onMounted(() => {
    void loadRegistrations();
    refreshTimer = window.setInterval(() => {
        if (document.visibilityState === "visible")
            void loadRegistrations(true);
    }, 30000);
});
onBeforeUnmount(() => {
    if (refreshTimer !== undefined)
        window.clearInterval(refreshTimer);
});
async function processRegistration(registration, action) {
    if (savingRegistrationId.value !== null)
        return;
    const actionMessage = {
        authorize: "autorizar esta visita",
        reject: "rechazar esta visita",
        "receive-identification": "confirmar la recepción física de esta identificación",
        "return-identification": "registrar la devolución de esta identificación",
    }[action];
    if (!window.confirm(`¿Deseas ${actionMessage}?`))
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
    extraItemDescription.value = "";
    extraItems.value = [];
    inspectionDraft.value = registration.items.map((item) => ({
        itemId: item.id,
        result: "",
        notes: "",
    }));
}
function addExtraItem() {
    const description = extraItemDescription.value.trim();
    if (!description) {
        notifyUser("Describe el artículo extra antes de agregarlo.");
        return;
    }
    if (inspectionDraft.value.length + extraItems.value.length >= 100) {
        notifyUser("El checklist permite revisar hasta 100 artículos entre declarados y adicionales.");
        return;
    }
    if (description.length > 1000) {
        notifyUser("La descripción del artículo extra no debe superar 1000 caracteres.");
        return;
    }
    extraItems.value.push(description);
    extraItemDescription.value = "";
}
function closeChecklist() {
    inspectionPhase.value = null;
    inspectionRegistration.value = null;
    inspectionDraft.value = [];
    extraItems.value = [];
    extraItemDescription.value = "";
}
function checklistItem(itemId) {
    return inspectionRegistration.value?.items.find((item) => item.id === itemId);
}
async function completeChecklist(registration) {
    const phase = inspectionPhase.value;
    if (!phase || savingRegistrationId.value !== null)
        return;
    const uncheckedItem = inspectionDraft.value.find((item) => !item.result);
    if (uncheckedItem) {
        notifyUser("Revisa todos los artículos antes de completar el checklist.");
        return;
    }
    if (extraItemDescription.value.trim()) {
        notifyUser("Agrega o elimina el artículo extra escrito antes de completar el checklist.");
        return;
    }
    savingRegistrationId.value = registration.id;
    try {
        const response = await fetch(`/api/visitor-kiosk/registrations/${registration.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: phase === "Entrada" ? "complete-entry-checklist" : "complete-exit-checklist",
                items: [
                    ...inspectionDraft.value.map((item) => ({
                        itemId: item.itemId,
                        result: item.result,
                        notes: item.notes,
                    })),
                    ...extraItems.value.map((description) => ({
                        itemId: null,
                        result: "Extra",
                        notes: description,
                    })),
                ],
            }),
        });
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudo completar el checklist.");
        closeChecklist();
        await loadRegistrations();
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "daily-log-panel visitor-kiosk-inbox" },
    'aria-labelledby': "visitor-kiosk-inbox-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "daily-log-panel-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "daily-log-panel-kicker" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    id: "visitor-kiosk-inbox-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.loadRegistrations();
        } },
    ...{ class: "daily-log-secondary-button" },
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
                if (!(__VLS_ctx.errorMessage))
                    return;
                __VLS_ctx.loadRegistrations();
            } },
        type: "button",
    });
}
if (__VLS_ctx.loading && __VLS_ctx.registrations.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-loading" },
        role: "status",
    });
}
else if (__VLS_ctx.registrations.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "daily-log-table-scroll" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "daily-log-table visitor-kiosk-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sr-only" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [registration] of __VLS_getVForSourceType((__VLS_ctx.registrations))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (registration.id),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (registration.folio);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
            ...{ class: "daily-log-table-date" },
        });
        (registration.createdAt);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (registration.visitorName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (registration.companyName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
            ...{ class: "daily-log-table-date" },
        });
        (registration.visitReason);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading && __VLS_ctx.registrations.length === 0))
                        return;
                    if (!!(__VLS_ctx.registrations.length === 0))
                        return;
                    __VLS_ctx.selectedRegistration = registration;
                } },
            ...{ class: "equipment-open-button" },
            type: "button",
        });
        (registration.items.length ? `Ver ${registration.items.length} artículo(s)` : "Ver revisión");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (registration.identificationType);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
            ...{ class: "daily-log-table-date" },
        });
        (registration.visitorDeclaredIdRetained ? "Visitante declara resguardo" : "Solo verificación");
        if (registration.visitorDeclaredIdRetained && !registration.receptionReceivedIdAt) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && __VLS_ctx.registrations.length === 0))
                            return;
                        if (!!(__VLS_ctx.registrations.length === 0))
                            return;
                        if (!(registration.visitorDeclaredIdRetained && !registration.receptionReceivedIdAt))
                            return;
                        __VLS_ctx.processRegistration(registration, 'receive-identification');
                    } },
                ...{ class: "equipment-open-button" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === registration.id),
            });
        }
        else if (registration.receptionReceivedIdAt) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                ...{ class: "daily-log-table-date" },
            });
            (registration.receptionReceivedIdBy);
            if (registration.idReturnedAt) {
                (registration.idReturnedBy);
            }
        }
        if (registration.receptionReceivedIdAt && !registration.idReturnedAt) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && __VLS_ctx.registrations.length === 0))
                            return;
                        if (!!(__VLS_ctx.registrations.length === 0))
                            return;
                        if (!(registration.receptionReceivedIdAt && !registration.idReturnedAt))
                            return;
                        __VLS_ctx.processRegistration(registration, 'return-identification');
                    } },
                ...{ class: "equipment-open-button" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === registration.id),
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "daily-log-table-status" },
            ...{ class: (`is-${registration.authorizationStatus === 'Pendiente' ? 'pendiente' : registration.authorizationStatus === 'Autorizada' ? 'dentro' : 'retirado'}`) },
        });
        (registration.authorizationStatus);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
            ...{ class: "daily-log-table-date" },
        });
        (registration.entryChecklistComplete ? "Checklist completo" : "Pendiente de revisión");
        (registration.exitChecklistComplete ? "Checklist completo" : "Pendiente");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "visitor-kiosk-actions-cell" },
        });
        if (registration.authorizationStatus === 'Pendiente') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && __VLS_ctx.registrations.length === 0))
                            return;
                        if (!!(__VLS_ctx.registrations.length === 0))
                            return;
                        if (!(registration.authorizationStatus === 'Pendiente'))
                            return;
                        __VLS_ctx.processRegistration(registration, 'authorize');
                    } },
                ...{ class: "daily-log-selection-action" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === registration.id),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && __VLS_ctx.registrations.length === 0))
                            return;
                        if (!!(__VLS_ctx.registrations.length === 0))
                            return;
                        if (!(registration.authorizationStatus === 'Pendiente'))
                            return;
                        __VLS_ctx.processRegistration(registration, 'reject');
                    } },
                ...{ class: "daily-log-delete" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === registration.id),
            });
        }
        if (registration.authorizationStatus !== 'Rechazada' && !registration.entryChecklistComplete) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && __VLS_ctx.registrations.length === 0))
                            return;
                        if (!!(__VLS_ctx.registrations.length === 0))
                            return;
                        if (!(registration.authorizationStatus !== 'Rechazada' && !registration.entryChecklistComplete))
                            return;
                        __VLS_ctx.openChecklist(registration, 'Entrada');
                    } },
                ...{ class: "daily-log-selection-action" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === registration.id),
            });
        }
        else if (registration.authorizationStatus === 'Autorizada' && !registration.exitChecklistComplete) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading && __VLS_ctx.registrations.length === 0))
                            return;
                        if (!!(__VLS_ctx.registrations.length === 0))
                            return;
                        if (!!(registration.authorizationStatus !== 'Rechazada' && !registration.entryChecklistComplete))
                            return;
                        if (!(registration.authorizationStatus === 'Autorizada' && !registration.exitChecklistComplete))
                            return;
                        __VLS_ctx.openChecklist(registration, 'Salida');
                    } },
                ...{ class: "daily-log-selection-action" },
                type: "button",
                disabled: (__VLS_ctx.savingRegistrationId === registration.id),
            });
        }
        else if (registration.exitChecklistComplete) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
    }
}
if (__VLS_ctx.selectedRegistration) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedRegistration))
                    return;
                __VLS_ctx.selectedRegistration = null;
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
                if (!(__VLS_ctx.selectedRegistration))
                    return;
                __VLS_ctx.selectedRegistration = null;
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
    (__VLS_ctx.selectedRegistration.folio);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    (__VLS_ctx.selectedRegistration.visitorName);
    (__VLS_ctx.selectedRegistration.companyName);
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
    for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.selectedRegistration.items))) {
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
    if (__VLS_ctx.selectedRegistration.inspections.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "dialog-description" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
            ...{ class: "visitor-kiosk-audit-list" },
        });
        for (const [inspection] of __VLS_getVForSourceType((__VLS_ctx.selectedRegistration.inspections))) {
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
    for (const [event, index] of __VLS_getVForSourceType((__VLS_ctx.selectedRegistration.audit))) {
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
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog workspace-dialog visitor-kiosk-detail" },
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
        id: "visitor-kiosk-checklist-title",
    });
    (__VLS_ctx.inspectionPhase.toLowerCase());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    (__VLS_ctx.inspectionPhase === "Entrada" ? "el ingreso" : "la salida");
    if (__VLS_ctx.inspectionDraft.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "daily-log-empty" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-checklist-list" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.inspectionDraft))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (item.itemId),
                ...{ class: "visitor-kiosk-checklist-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.checklistItem(item.itemId)?.description);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.checklistItem(item.itemId)?.type);
            (__VLS_ctx.checklistItem(item.itemId)?.quantity);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                value: (item.result),
                required: true,
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "",
                disabled: true,
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "Coincide",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "Faltante",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "Dañado",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "directory-form-full" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
                value: (item.notes),
                maxlength: "1000",
                rows: "2",
            });
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-extra-items" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onKeydown: (__VLS_ctx.addExtraItem) },
        value: (__VLS_ctx.extraItemDescription),
        type: "text",
        maxlength: "1000",
        placeholder: "Describe el equipo o herramienta extra",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.addExtraItem) },
        ...{ class: "button-secondary" },
        type: "button",
    });
    if (__VLS_ctx.extraItems.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({});
        for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.extraItems))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (`${index}-${item}`),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.inspectionPhase && __VLS_ctx.inspectionRegistration))
                            return;
                        if (!(__VLS_ctx.extraItems.length))
                            return;
                        __VLS_ctx.extraItems.splice(index, 1);
                    } },
                type: "button",
                'aria-label': (`Quitar artículo extra ${item}`),
            });
        }
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
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.inspectionPhase && __VLS_ctx.inspectionRegistration))
                    return;
                __VLS_ctx.inspectionRegistration && __VLS_ctx.completeChecklist(__VLS_ctx.inspectionRegistration);
            } },
        ...{ class: "button-primary" },
        type: "button",
        disabled: (__VLS_ctx.savingRegistrationId !== null),
    });
    (__VLS_ctx.savingRegistrationId !== null ? "Guardando checklist…" : "Completar checklist");
}
/** @type {__VLS_StyleScopedClasses['daily-log-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-inbox']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-panel-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-secondary-button']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-date']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-date']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-open-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-date']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-open-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-date']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-open-button']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-status']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-table-date']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-actions-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-action']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-delete']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-action']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-selection-action']} */ ;
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
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['daily-log-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-checklist-list']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-checklist-item']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-form-full']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-extra-items']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            registrations: registrations,
            loading: loading,
            errorMessage: errorMessage,
            savingRegistrationId: savingRegistrationId,
            selectedRegistration: selectedRegistration,
            inspectionRegistration: inspectionRegistration,
            inspectionPhase: inspectionPhase,
            inspectionDraft: inspectionDraft,
            extraItemDescription: extraItemDescription,
            extraItems: extraItems,
            loadRegistrations: loadRegistrations,
            processRegistration: processRegistration,
            openChecklist: openChecklist,
            addExtraItem: addExtraItem,
            closeChecklist: closeChecklist,
            checklistItem: checklistItem,
            completeChecklist: completeChecklist,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
