import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { notifyUser } from "../notifications";
const props = defineProps();
const declarations = ref([]);
const partners = ref([]);
const staff = ref([]);
const appointments = ref([]);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const search = ref("");
const createOpen = ref(false);
const businessPartnerId = ref(null);
const externalStaffId = ref(null);
const appointmentId = ref(null);
const personName = ref("");
const createError = ref("");
const generatedLink = ref("");
const selectedDeclaration = ref(null);
const detailLoading = ref(false);
const inspectionPhase = ref(null);
const inspectionItems = ref([]);
const linkMessage = ref("");
let searchTimer;
let declarationRefreshInProgress = false;
const matchingStaff = computed(() => staff.value.filter((person) => person.businessPartnerId === businessPartnerId.value));
const matchingAppointments = computed(() => appointments.value.filter((appointment) => appointment.businessPartnerId === businessPartnerId.value));
const inspectionLabel = computed(() => inspectionPhase.value === "entrada" ? "entrada" : "salida");
const checkedInspectionItems = computed(() => inspectionItems.value.filter((item) => item.checked).length);
function setNotice(message) {
    notifyUser(message, "success");
}
async function parseResponse(response) {
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("No se pudo conectar con el servidor del módulo de equipo.");
    }
    try {
        return await response.json();
    }
    catch {
        throw new Error("El servidor devolvió una respuesta de equipo inválida.");
    }
}
async function loadOptions() {
    const response = await fetch("/api/equipment/options");
    const result = await parseResponse(response);
    if (!response.ok)
        throw new Error(result.error ?? "No se pudieron cargar las opciones.");
    if (!Array.isArray(result.partners) || !Array.isArray(result.staff) || !Array.isArray(result.appointments)) {
        throw new Error("El servidor devolvió opciones de equipo con formato inválido.");
    }
    partners.value = result.partners;
    staff.value = result.staff;
    appointments.value = result.appointments;
}
async function loadDeclarations() {
    const params = new URLSearchParams();
    if (search.value.trim())
        params.set("q", search.value.trim());
    const response = await fetch(`/api/equipment/declarations?${params}`);
    const result = await parseResponse(response);
    if (!response.ok)
        throw new Error(result.error ?? "No se pudo cargar el historial.");
    if (!Array.isArray(result.declarations)) {
        throw new Error("El servidor devolvió declaraciones con formato inválido.");
    }
    declarations.value = result.declarations;
}
async function refreshDeclarations(silent = false) {
    if (declarationRefreshInProgress)
        return;
    declarationRefreshInProgress = true;
    try {
        await loadDeclarations();
        errorMessage.value = "";
    }
    catch (error) {
        console.error("No se pudo actualizar el historial de equipo:", error);
        errorMessage.value = "";
        if (!silent)
            notifyUser(error instanceof Error ? error.message : "No se pudo actualizar el historial.");
    }
    finally {
        declarationRefreshInProgress = false;
    }
}
function refreshEquipmentAfterRealtimeUpdate() {
    if (document.visibilityState !== "visible")
        return;
    void refreshDeclarations(true);
    void loadOptions().catch((error) => {
        console.error("No se pudieron actualizar las opciones de equipo:", error);
    });
}
onMounted(async () => {
    window.addEventListener("visitas:data-changed", refreshEquipmentAfterRealtimeUpdate);
    try {
        await Promise.all([loadOptions(), loadDeclarations()]);
    }
    catch (error) {
        console.error("No se pudo cargar el módulo de equipo:", error);
        errorMessage.value = "";
        notifyUser(error instanceof Error ? error.message : "No se pudo cargar el módulo de equipo.");
    }
    finally {
        loading.value = false;
    }
});
onBeforeUnmount(() => {
    if (searchTimer)
        clearTimeout(searchTimer);
    window.removeEventListener("visitas:data-changed", refreshEquipmentAfterRealtimeUpdate);
});
watch(search, () => {
    if (searchTimer)
        clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void refreshDeclarations(), 250);
});
watch(businessPartnerId, (nextPartnerId, previousPartnerId) => {
    if (nextPartnerId !== previousPartnerId) {
        if (staff.value.find((person) => person.id === externalStaffId.value)?.businessPartnerId !== nextPartnerId) {
            externalStaffId.value = null;
        }
        const appointment = appointments.value.find((item) => item.id === appointmentId.value);
        if (appointment && appointment.businessPartnerId !== nextPartnerId) {
            appointmentId.value = null;
        }
        else if (!appointment) {
            personName.value = "";
        }
    }
});
watch(appointmentId, (nextAppointmentId) => {
    const appointment = appointments.value.find((item) => item.id === nextAppointmentId);
    if (!appointment)
        return;
    businessPartnerId.value = appointment.businessPartnerId;
    personName.value = appointment.visitorName;
    externalStaffId.value = null;
});
function openCreate() {
    businessPartnerId.value = null;
    externalStaffId.value = null;
    appointmentId.value = null;
    personName.value = "";
    generatedLink.value = "";
    createError.value = "";
    createOpen.value = true;
}
function selectAllOnFocus(event) {
    if (event.currentTarget instanceof HTMLInputElement)
        event.currentTarget.select();
}
async function createDeclaration() {
    if (saving.value)
        return;
    saving.value = true;
    createError.value = "";
    try {
        const response = await fetch("/api/equipment/declarations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                businessPartnerId: businessPartnerId.value,
                externalStaffId: externalStaffId.value,
                appointmentId: appointmentId.value,
                personName: personName.value.trim(),
            }),
        });
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudo crear la declaración.");
        if (typeof result.token !== "string")
            throw new Error("El servidor no devolvió el enlace de declaración.");
        generatedLink.value = `${window.location.origin}/#equipo=${encodeURIComponent(result.token)}`;
        await loadDeclarations();
        setNotice("Declaración creada. Comparte el enlace con la persona externa.");
    }
    catch (error) {
        console.error("No se pudo crear la declaración de equipo:", error);
        createError.value = "";
        notifyUser(error instanceof Error ? error.message : "No se pudo crear la declaración.");
    }
    finally {
        saving.value = false;
    }
}
async function copyLink(link) {
    try {
        await navigator.clipboard.writeText(link);
        linkMessage.value = "";
        notifyUser("Enlace copiado.", "success");
    }
    catch (error) {
        console.error("No se pudo copiar el enlace de equipo:", error);
        linkMessage.value = "";
        notifyUser("No se pudo copiar. Selecciona y copia el enlace manualmente.");
    }
}
async function openDetails(id) {
    detailLoading.value = true;
    errorMessage.value = "";
    try {
        const response = await fetch(`/api/equipment/declarations/${id}`);
        const result = await parseResponse(response);
        if (!response.ok || !result.declaration) {
            throw new Error(result.error ?? "No se pudo abrir la declaración.");
        }
        selectedDeclaration.value = result.declaration;
        linkMessage.value = "";
    }
    catch (error) {
        console.error("No se pudo consultar la declaración:", error);
        errorMessage.value = "";
        notifyUser(error instanceof Error ? error.message : "No se pudo abrir la declaración.");
    }
    finally {
        detailLoading.value = false;
    }
}
function getInspection(phase) {
    return selectedDeclaration.value?.inspections?.find((inspection) => inspection.phase === phase);
}
function startInspection(phase) {
    const declaration = selectedDeclaration.value;
    if (!declaration?.items?.length)
        return;
    const entryItems = getInspection("Entrada")?.items ?? [];
    inspectionItems.value = declaration.items.map((item) => {
        const entryItem = entryItems.find((checked) => checked.declarationItemId === item.id);
        return {
            declarationItemId: item.id,
            itemType: item.itemType,
            checked: false,
            quantity: phase === "salida" && entryItem ? entryItem.checkedQuantity : item.quantity,
            product: phase === "salida" && entryItem ? entryItem.checkedProduct : item.product,
            brand: phase === "salida" && entryItem ? entryItem.checkedBrand : item.brand,
            model: phase === "salida" && entryItem ? entryItem.checkedModel : item.model,
            serialNumber: phase === "salida" && entryItem ? entryItem.checkedSerialNumber : item.serialNumber,
            color: phase === "salida" && entryItem ? entryItem.checkedColor : item.color,
            notes: "",
            incident: false,
        };
    });
    inspectionPhase.value = phase;
}
function inspectionNeedsNote(item) {
    const declaration = selectedDeclaration.value?.items?.find((declared) => declared.id === item.declarationItemId);
    const entry = getInspection("Entrada")?.items.find((checked) => checked.declarationItemId === item.declarationItemId);
    const expected = inspectionPhase.value === "salida" && entry
        ? {
            quantity: entry.checkedQuantity,
            product: entry.checkedProduct,
            brand: entry.checkedBrand,
            model: entry.checkedModel,
            serialNumber: entry.checkedSerialNumber,
            color: entry.checkedColor,
        }
        : declaration;
    return Boolean(item.incident ||
        (expected && (item.quantity !== expected.quantity ||
            item.product.trim().toLocaleLowerCase() !== expected.product.trim().toLocaleLowerCase() ||
            item.brand.trim().toLocaleLowerCase() !== expected.brand.trim().toLocaleLowerCase() ||
            item.model.trim().toLocaleLowerCase() !== expected.model.trim().toLocaleLowerCase() ||
            item.serialNumber.trim().toLocaleLowerCase() !== expected.serialNumber.trim().toLocaleLowerCase() ||
            item.color.trim().toLocaleLowerCase() !== expected.color.trim().toLocaleLowerCase())));
}
async function saveInspection() {
    if (!selectedDeclaration.value || !inspectionPhase.value || saving.value)
        return;
    const uncheckedItem = inspectionItems.value.find((item) => !item.checked);
    if (uncheckedItem) {
        const declared = selectedDeclaration.value.items?.find((item) => item.id === uncheckedItem.declarationItemId);
        notifyUser(`Marca la verificación física de “${declared?.product ?? "cada artículo"}” antes de completar la revisión.`);
        return;
    }
    const missingNote = inspectionItems.value.find((item) => inspectionNeedsNote(item) && !item.notes.trim());
    if (missingNote) {
        notifyUser("Describe la incidencia antes de guardar la revisión.");
        return;
    }
    saving.value = true;
    errorMessage.value = "";
    try {
        const response = await fetch(`/api/equipment/declarations/${selectedDeclaration.value.id}/inspections/${inspectionPhase.value}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: inspectionItems.value }),
        });
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudo guardar la revisión.");
        inspectionPhase.value = null;
        await Promise.all([openDetails(selectedDeclaration.value.id), loadDeclarations()]);
        setNotice(result.message ?? "Verificación guardada.");
    }
    catch (error) {
        console.error("No se pudo guardar la verificación de equipo:", error);
        errorMessage.value = "";
        notifyUser(error instanceof Error ? error.message : "No se pudo guardar la revisión.");
    }
    finally {
        saving.value = false;
    }
}
async function refreshLink(declarationId) {
    linkMessage.value = "";
    try {
        const response = await fetch(`/api/equipment/declarations/${declarationId}/link`, { method: "POST" });
        const result = await parseResponse(response);
        if (!response.ok || typeof result.token !== "string") {
            throw new Error(result.error ?? "No se pudo generar el enlace.");
        }
        linkMessage.value = `${window.location.origin}/#equipo=${encodeURIComponent(result.token)}`;
        notifyUser("Se generó un nuevo enlace de declaración.", "success");
    }
    catch (error) {
        console.error("No se pudo renovar el enlace de equipo:", error);
        linkMessage.value = "";
        notifyUser(error instanceof Error ? error.message : "No se pudo generar el enlace.");
    }
}
async function revokeLink(declarationId) {
    if (!window.confirm("¿Revocar el enlace pendiente? La persona ya no podrá abrirlo."))
        return;
    try {
        const response = await fetch(`/api/equipment/declarations/${declarationId}/revoke`, { method: "POST" });
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudo revocar el enlace.");
        linkMessage.value = "";
        setNotice("Enlace revocado.");
    }
    catch (error) {
        console.error("No se pudo revocar el enlace de equipo:", error);
        linkMessage.value = "";
        notifyUser(error instanceof Error ? error.message : "No se pudo revocar el enlace.");
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workspace-grid equipment-workspace" },
    'aria-labelledby': "equipment-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "panel workspace-panel equipment-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "panel-heading workspace-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-tool",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "equipment-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "equipment-subtitle" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-heading-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "workspace-count" },
});
(__VLS_ctx.declarations.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openCreate) },
    ...{ class: "button-primary" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-plus",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "equipment-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "equipment-search" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "sr-only" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-search",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    type: "search",
    placeholder: "Buscar persona o empresa",
    autocomplete: "off",
});
(__VLS_ctx.search);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.refreshDeclarations();
        } },
    ...{ class: "button-secondary equipment-refresh" },
    type: "button",
    disabled: (__VLS_ctx.loading),
});
if (__VLS_ctx.errorMessage && !__VLS_ctx.createOpen && !__VLS_ctx.selectedDeclaration) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "equipment-alert" },
        role: "alert",
    });
    (__VLS_ctx.errorMessage);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-table-scroll equipment-history" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "workspace-table equipment-history-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
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
for (const [declaration] of __VLS_getVForSourceType((__VLS_ctx.declarations))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (declaration.id),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (declaration.personName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "equipment-company" },
    });
    (declaration.companyName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (declaration.visitDate ? `${declaration.visitDate} ${declaration.visitTime ?? ""}` : "Sin cita vinculada");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "equipment-status" },
        ...{ class: (declaration.status === 'Enviada' ? 'is-complete' : 'is-pending') },
    });
    (declaration.status);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "equipment-company" },
    });
    (declaration.itemCount ?? 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (declaration.entryStatus ?? "Pendiente");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    (declaration.exitStatus ?? "Pendiente");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openDetails(declaration.id);
            } },
        ...{ class: "equipment-open-button" },
        type: "button",
    });
}
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        colspan: "6",
        ...{ class: "workspace-empty" },
    });
}
else if (__VLS_ctx.declarations.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        colspan: "6",
        ...{ class: "workspace-empty" },
    });
}
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.createOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.createOpen))
                    return;
                __VLS_ctx.createOpen = false;
            } },
        ...{ class: "dashboard-app modal-backdrop equipment-create-backdrop" },
        'data-theme': (props.theme),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog workspace-dialog equipment-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "equipment-create-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.createOpen))
                    return;
                __VLS_ctx.createOpen = false;
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
        id: "equipment-create-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    if (!__VLS_ctx.generatedLink) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
            ...{ onSubmit: (__VLS_ctx.createDeclaration) },
            ...{ class: "workspace-form modal-workspace-form equipment-create-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "equipment-form-wide" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            value: (__VLS_ctx.businessPartnerId),
            required: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: (null),
            disabled: true,
        });
        for (const [partner] of __VLS_getVForSourceType((__VLS_ctx.partners))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                key: (partner.id),
                value: (partner.id),
            });
            (partner.name);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "equipment-form-wide" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "optional-field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            value: (__VLS_ctx.appointmentId),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: (null),
        });
        for (const [appointment] of __VLS_getVForSourceType((__VLS_ctx.matchingAppointments))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                key: (appointment.id),
                value: (appointment.id),
            });
            (appointment.visitorName);
            (appointment.date);
            (appointment.time);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "equipment-form-wide" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "optional-field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            value: (__VLS_ctx.externalStaffId),
            disabled: (!__VLS_ctx.businessPartnerId || __VLS_ctx.appointmentId !== null),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: (null),
        });
        for (const [person] of __VLS_getVForSourceType((__VLS_ctx.matchingStaff))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                key: (person.id),
                value: (person.id),
            });
            (person.fullName);
        }
        if (__VLS_ctx.externalStaffId === null) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "equipment-form-wide" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                maxlength: "180",
                pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
                autocomplete: "name",
                required: true,
            });
            (__VLS_ctx.personName);
        }
        if (__VLS_ctx.createError) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "equipment-alert equipment-form-wide" },
                role: "alert",
            });
            (__VLS_ctx.createError);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "button-primary workspace-submit" },
            type: "submit",
            disabled: (__VLS_ctx.saving || !__VLS_ctx.partners.length),
        });
        (__VLS_ctx.saving ? "Creando…" : "Crear enlace de declaración");
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "equipment-link-result" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onFocus: (__VLS_ctx.selectAllOnFocus) },
            value: (__VLS_ctx.generatedLink),
            readonly: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.createOpen))
                        return;
                    if (!!(!__VLS_ctx.generatedLink))
                        return;
                    __VLS_ctx.copyLink(__VLS_ctx.generatedLink);
                } },
            ...{ class: "button-primary" },
            type: "button",
        });
        if (__VLS_ctx.linkMessage) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "equipment-link-message" },
                role: "status",
            });
            (__VLS_ctx.linkMessage);
        }
    }
}
var __VLS_3;
const __VLS_4 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    to: "body",
}));
const __VLS_6 = __VLS_5({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
if (__VLS_ctx.selectedDeclaration) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedDeclaration))
                    return;
                __VLS_ctx.selectedDeclaration = null;
            } },
        ...{ class: "dashboard-app modal-backdrop equipment-detail-backdrop" },
        'data-theme': (props.theme),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog workspace-dialog equipment-detail-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "equipment-detail-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedDeclaration))
                    return;
                __VLS_ctx.selectedDeclaration = null;
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
        href: "#i-briefcase",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "equipment-detail-title",
    });
    (__VLS_ctx.selectedDeclaration.personName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    (__VLS_ctx.selectedDeclaration.companyName);
    if (__VLS_ctx.selectedDeclaration.visitDate) {
        (__VLS_ctx.selectedDeclaration.visitDate);
        (__VLS_ctx.selectedDeclaration.visitTime);
    }
    if (__VLS_ctx.errorMessage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "equipment-alert" },
            role: "alert",
        });
        (__VLS_ctx.errorMessage);
    }
    if (__VLS_ctx.detailLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "equipment-loading" },
        });
    }
    if (__VLS_ctx.selectedDeclaration.status === 'Pendiente') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "equipment-detail-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "equipment-hint" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedDeclaration))
                        return;
                    if (!(__VLS_ctx.selectedDeclaration.status === 'Pendiente'))
                        return;
                    __VLS_ctx.refreshLink(__VLS_ctx.selectedDeclaration.id);
                } },
            ...{ class: "button-secondary" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedDeclaration))
                        return;
                    if (!(__VLS_ctx.selectedDeclaration.status === 'Pendiente'))
                        return;
                    __VLS_ctx.revokeLink(__VLS_ctx.selectedDeclaration.id);
                } },
            ...{ class: "equipment-revoke-button" },
            type: "button",
        });
        if (__VLS_ctx.linkMessage) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "equipment-link-message" },
                role: "status",
            });
            if (__VLS_ctx.linkMessage.startsWith('http')) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                    ...{ onFocus: (__VLS_ctx.selectAllOnFocus) },
                    value: (__VLS_ctx.linkMessage),
                    readonly: true,
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.selectedDeclaration))
                                return;
                            if (!(__VLS_ctx.selectedDeclaration.status === 'Pendiente'))
                                return;
                            if (!(__VLS_ctx.linkMessage))
                                return;
                            if (!(__VLS_ctx.linkMessage.startsWith('http')))
                                return;
                            __VLS_ctx.copyLink(__VLS_ctx.linkMessage);
                        } },
                    ...{ class: "button-secondary" },
                    type: "button",
                });
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.linkMessage);
            }
        }
    }
    if (__VLS_ctx.selectedDeclaration.status === 'Enviada') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "equipment-detail-actions" },
        });
        if (!__VLS_ctx.getInspection('Entrada')) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedDeclaration))
                            return;
                        if (!(__VLS_ctx.selectedDeclaration.status === 'Enviada'))
                            return;
                        if (!(!__VLS_ctx.getInspection('Entrada')))
                            return;
                        __VLS_ctx.startInspection('entrada');
                    } },
                ...{ class: "button-primary" },
                type: "button",
                disabled: (!__VLS_ctx.selectedDeclaration.items?.length),
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "equipment-status is-complete" },
            });
            (__VLS_ctx.getInspection('Entrada')?.completedAt);
        }
        if (__VLS_ctx.getInspection('Entrada') && !__VLS_ctx.getInspection('Salida')) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedDeclaration))
                            return;
                        if (!(__VLS_ctx.selectedDeclaration.status === 'Enviada'))
                            return;
                        if (!(__VLS_ctx.getInspection('Entrada') && !__VLS_ctx.getInspection('Salida')))
                            return;
                        __VLS_ctx.startInspection('salida');
                    } },
                ...{ class: "button-secondary" },
                type: "button",
            });
        }
        else if (__VLS_ctx.getInspection('Salida')) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "equipment-status is-complete" },
            });
            (__VLS_ctx.getInspection('Salida')?.completedAt);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "workspace-table-scroll equipment-items-scroll" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
            ...{ class: "workspace-table equipment-detail-table" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.selectedDeclaration.items))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                key: (item.id),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            (item.itemType);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            (item.quantity);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            (item.product);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            ([item.brand, item.model, item.serialNumber, item.color].filter(Boolean).join(" · ") || "—");
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            (item.notes || "—");
        }
        for (const [inspection] of __VLS_getVForSourceType((__VLS_ctx.selectedDeclaration.inspections))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (inspection.phase),
                ...{ class: "equipment-inspection-history" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
                ...{ class: "equipment-inspection-history-heading" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "equipment-inspection-history-icon" },
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            (inspection.phase.toLowerCase());
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (inspection.inspectorName);
            (inspection.completedAt);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "equipment-inspection-history-count" },
                ...{ class: ({ 'has-incidents': inspection.items.some((item) => item.result === 'Incidencia') }) },
            });
            (inspection.items.filter((item) => item.result === "Incidencia").length);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "equipment-inspection-history-list" },
            });
            for (const [item] of __VLS_getVForSourceType((inspection.items))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (item.declarationItemId),
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "equipment-inspection-history-item-copy" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (item.declaredItemType);
                (item.checkedQuantity);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (item.checkedProduct);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                ([item.checkedBrand, item.checkedModel, item.checkedSerialNumber, item.checkedColor].filter(Boolean).join(" · ") || "Sin identificación adicional");
                if (item.notes) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
                    (item.notes);
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "equipment-inspection-result" },
                    ...{ class: (item.result === 'Conforme' ? 'is-complete' : 'has-incident') },
                });
                (item.result);
            }
        }
    }
    if (__VLS_ctx.inspectionPhase) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
            ...{ onSubmit: (__VLS_ctx.saveInspection) },
            ...{ class: "equipment-inspection-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "equipment-checklist-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        (__VLS_ctx.inspectionLabel);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "equipment-checklist-progress" },
        });
        (__VLS_ctx.checkedInspectionItems);
        (__VLS_ctx.inspectionItems.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "equipment-checklist-progress-track" },
            role: "progressbar",
            'aria-valuenow': (__VLS_ctx.checkedInspectionItems),
            'aria-valuemin': (0),
            'aria-valuemax': (__VLS_ctx.inspectionItems.length),
            'aria-label': (`${__VLS_ctx.checkedInspectionItems} de ${__VLS_ctx.inspectionItems.length} artículos verificados`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: ({ width: `${__VLS_ctx.inspectionItems.length ? __VLS_ctx.checkedInspectionItems / __VLS_ctx.inspectionItems.length * 100 : 0}%` }) },
        });
        for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.inspectionItems))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (item.declarationItemId),
                ...{ class: "equipment-check-item" },
                ...{ class: ({ 'is-checked': item.checked }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
            (item.itemType);
            (__VLS_ctx.selectedDeclaration.items?.find((declared) => declared.id === item.declarationItemId)?.product);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "equipment-check-readonly-grid" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (item.itemType);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (item.quantity);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (item.product);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (item.brand || "—");
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (item.model || "—");
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (item.serialNumber || "—");
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (item.color || "—");
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "equipment-notes-label" },
            });
            (item.incident ? " (obligatorias por incidencia)" : " (opcional)");
            __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
                value: (item.notes),
                maxlength: "1000",
                rows: "2",
                required: (item.incident),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "equipment-incident-toggle" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                type: "checkbox",
            });
            (item.incident);
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "equipment-inspection-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedDeclaration))
                        return;
                    if (!(__VLS_ctx.inspectionPhase))
                        return;
                    __VLS_ctx.inspectionPhase = null;
                } },
            ...{ class: "button-secondary" },
            type: "button",
            disabled: (__VLS_ctx.saving),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "button-primary" },
            type: "submit",
            disabled: (__VLS_ctx.saving || __VLS_ctx.checkedInspectionItems !== __VLS_ctx.inspectionItems.length),
        });
        (__VLS_ctx.saving ? "Guardando…" : `Completar checklist (${__VLS_ctx.checkedInspectionItems}/${__VLS_ctx.inspectionItems.length})`);
    }
}
var __VLS_7;
/** @type {__VLS_StyleScopedClasses['workspace-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-heading-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-count']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-search']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-refresh']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-history']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-history-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-company']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-status']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-company']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-open-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-app']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-create-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-create-form']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-form-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-form-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['optional-field']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-form-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['optional-field']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-form-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-form-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-link-result']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-link-message']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-app']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-detail-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-detail-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-detail-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-revoke-button']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-link-message']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-detail-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-status']} */ ;
/** @type {__VLS_StyleScopedClasses['is-complete']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-status']} */ ;
/** @type {__VLS_StyleScopedClasses['is-complete']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-items-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-history']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-history-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-history-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-history-count']} */ ;
/** @type {__VLS_StyleScopedClasses['has-incidents']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-history-list']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-history-item-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-result']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-form']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-checklist-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-checklist-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-checklist-progress-track']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['is-checked']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-check-readonly-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-notes-label']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-incident-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-checked-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['is-checked']} */ ;
/** @type {__VLS_StyleScopedClasses['equipment-inspection-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            declarations: declarations,
            partners: partners,
            loading: loading,
            saving: saving,
            errorMessage: errorMessage,
            search: search,
            createOpen: createOpen,
            businessPartnerId: businessPartnerId,
            externalStaffId: externalStaffId,
            appointmentId: appointmentId,
            personName: personName,
            createError: createError,
            generatedLink: generatedLink,
            selectedDeclaration: selectedDeclaration,
            detailLoading: detailLoading,
            inspectionPhase: inspectionPhase,
            inspectionItems: inspectionItems,
            linkMessage: linkMessage,
            matchingStaff: matchingStaff,
            matchingAppointments: matchingAppointments,
            inspectionLabel: inspectionLabel,
            checkedInspectionItems: checkedInspectionItems,
            refreshDeclarations: refreshDeclarations,
            openCreate: openCreate,
            selectAllOnFocus: selectAllOnFocus,
            createDeclaration: createDeclaration,
            copyLink: copyLink,
            openDetails: openDetails,
            getInspection: getInspection,
            startInspection: startInspection,
            saveInspection: saveInspection,
            refreshLink: refreshLink,
            revokeLink: revokeLink,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
