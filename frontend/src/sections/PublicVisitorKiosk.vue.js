import { computed, onBeforeUnmount, onMounted, ref } from "vue";
const identificationTypes = [
    "INE",
    "Gafete",
    "Pasaporte",
    "Licencia de conducir",
    "Otra identificación",
];
const existingCompanies = ref([]);
const step = ref(0);
const sending = ref(false);
const errorMessage = ref("");
const fieldErrors = ref({});
const visitorName = ref("");
const companyName = ref("");
const visitReason = ref("");
const carriesItems = ref(null);
const items = ref([]);
const itemDraft = ref(newItem());
const identificationType = ref("");
const declaresIdRetained = ref(null);
const informationConfirmed = ref(false);
const completed = ref(null);
const completedStatus = ref("waiting");
const completedStatusError = ref("");
const requestIdempotencyKey = ref(crypto.randomUUID());
let resetTimer;
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
onMounted(async () => {
    try {
        const response = await fetch("/api/visitor-kiosk/options");
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudieron cargar las empresas.");
        if (!Array.isArray(result.companies) || !result.companies.every((company) => typeof company === "string")) {
            throw new Error("La lista de empresas recibida no es válida.");
        }
        existingCompanies.value = result.companies;
    }
    catch (error) {
        console.error("No se pudieron cargar las opciones públicas del kiosco:", error);
        errorMessage.value = error instanceof Error
            ? error.message
            : "No se pudieron cargar las empresas. Puedes continuar como público general.";
    }
});
onBeforeUnmount(() => {
    if (resetTimer !== undefined)
        window.clearTimeout(resetTimer);
    if (statusPollingTimer !== undefined)
        window.clearInterval(statusPollingTimer);
});
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
        if (!identificationTypes.includes(identificationType.value)) {
            errors.identificationType = "Selecciona el tipo de identificación presentada.";
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
    items.value.push({
        ...itemDraft.value,
        description: itemDraft.value.description.trim(),
        brand: itemDraft.value.brand.trim(),
        model: itemDraft.value.model.trim(),
        serialNumber: itemDraft.value.serialNumber.trim(),
        color: itemDraft.value.color.trim(),
    });
    itemDraft.value = newItem();
    fieldErrors.value = {};
}
function removeItem(index) {
    items.value.splice(index, 1);
}
function resetKiosk() {
    if (sending.value)
        return;
    if (resetTimer !== undefined) {
        window.clearTimeout(resetTimer);
        resetTimer = undefined;
    }
    if (statusPollingTimer !== undefined) {
        window.clearInterval(statusPollingTimer);
        statusPollingTimer = undefined;
    }
    visitorName.value = "";
    companyName.value = "";
    visitReason.value = "";
    carriesItems.value = null;
    items.value = [];
    itemDraft.value = newItem();
    identificationType.value = "";
    declaresIdRetained.value = null;
    informationConfirmed.value = false;
    completed.value = null;
    completedStatus.value = "waiting";
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
            typeof result.entryChecklistComplete !== "boolean" ||
            typeof result.entered !== "boolean") {
            throw new Error("El servidor devolvió un estado de revisión inválido.");
        }
        completedStatusError.value = "";
        if (result.authorizationStatus === "Rechazada") {
            completedStatus.value = "rejected";
        }
        else if (result.authorizationStatus === "Autorizada" && result.entryChecklistComplete && result.entered) {
            completedStatus.value = "entered";
        }
        if (completedStatus.value !== "waiting") {
            if (statusPollingTimer !== undefined) {
                window.clearInterval(statusPollingTimer);
                statusPollingTimer = undefined;
            }
            if (resetTimer !== undefined)
                window.clearTimeout(resetTimer);
            resetTimer = window.setTimeout(resetKiosk, 30000);
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
    if (!identificationTypes.includes(identificationType.value) || declaresIdRetained.value === null) {
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
                identificationType: identificationType.value,
                declaresIdRetained: declaresIdRetained.value,
            }),
        });
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudo guardar el registro. Inténtalo de nuevo.");
        if (typeof result.folio !== "string" || typeof result.visitorName !== "string") {
            throw new Error("El servidor no confirmó el registro.");
        }
        completed.value = result;
        completedStatus.value = "waiting";
        step.value = 5;
        void refreshCompletedStatus();
        statusPollingTimer = window.setInterval(() => void refreshCompletedStatus(), 3000);
        resetTimer = window.setTimeout(resetKiosk, 120000);
    }
    catch (error) {
        console.error("No se pudo enviar el autorregistro:", error);
        errorMessage.value = error instanceof Error
            ? error.message
            : "No se pudo guardar el registro. Inténtalo de nuevo.";
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
    'aria-label': "CyMEZ Recep, registro de visitantes",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
    src: "/images/cymez-visitor-logo.png",
    alt: "CyMEZ",
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
        src: "/images/visitor-kiosk-neon-frame.png",
        alt: "",
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 48 48",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M24 5 8 11v12c0 9 6.8 15.7 16 20 9.2-4.3 16-11 16-20V11L24 5Z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m17 24 5 5 10-11",
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
        src: "/images/visitor-kiosk-tablet.png",
        alt: "",
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    (__VLS_ctx.step === 1 ? "Datos del visitante" : __VLS_ctx.step === 2 ? "Equipo y herramientas" : __VLS_ctx.step === 3 ? "Identificación" : "Revisa tu registro");
    if (__VLS_ctx.step === 2) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
    else if (__VLS_ctx.step === 3) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (__VLS_ctx.companyName),
            type: "text",
            list: "visitor-kiosk-company-list",
            maxlength: "180",
            placeholder: "Escribe o selecciona una empresa",
            required: true,
            'aria-invalid': (!!__VLS_ctx.fieldErrors.companyName),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.datalist, __VLS_intrinsicElements.datalist)({
            id: "visitor-kiosk-company-list",
        });
        for (const [company] of __VLS_getVForSourceType((__VLS_ctx.existingCompanies))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option)({
                key: (company),
                value: (company),
            });
        }
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "visitor-kiosk-primary" },
            type: "submit",
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
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
                    __VLS_ctx.fieldErrors = {};
                } },
            type: "button",
            ...{ class: ({ 'is-selected': __VLS_ctx.carriesItems === false }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
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
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                type: "number",
                min: "1",
                max: "999",
                step: "1",
                required: true,
            });
            (__VLS_ctx.itemDraft.quantity);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                value: (__VLS_ctx.itemDraft.brand),
                type: "text",
                maxlength: "120",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                value: (__VLS_ctx.itemDraft.model),
                type: "text",
                maxlength: "120",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                value: (__VLS_ctx.itemDraft.serialNumber),
                type: "text",
                maxlength: "180",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                value: (__VLS_ctx.itemDraft.color),
                type: "text",
                maxlength: "80",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.addItem) },
                ...{ class: "visitor-kiosk-add-item" },
                type: "button",
            });
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-label-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            value: (__VLS_ctx.identificationType),
            'aria-invalid': (!!__VLS_ctx.fieldErrors.identificationType),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: "",
            disabled: true,
        });
        for (const [type] of __VLS_getVForSourceType((__VLS_ctx.identificationTypes))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                key: (type),
            });
            (type);
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "visitor-kiosk-notice" },
        });
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
        (__VLS_ctx.identificationType);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
        (__VLS_ctx.declaresIdRetained ? "Declara que la entregó para resguardo" : "Declara que solo la presentó para verificación");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "visitor-kiosk-confirmation" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "checkbox",
        });
        (__VLS_ctx.informationConfirmed);
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-welcome-mark" },
        'aria-hidden': "true",
    });
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "visitor-kiosk-eyebrow" },
    });
    (__VLS_ctx.completedStatus === "entered" ? "REVISIÓN COMPLETADA" : __VLS_ctx.completedStatus === "rejected" ? "REVISIÓN RECHAZADA" : "REGISTRO RECIBIDO");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    (__VLS_ctx.completedStatus === "entered" ? "Tu ingreso fue registrado" : __VLS_ctx.completedStatus === "rejected" ? "Acude con recepción" : "Esperando revisión de recepción");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "visitor-kiosk-folio" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.completed.folio);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "visitor-kiosk-success-name" },
    });
    (__VLS_ctx.completed.visitorName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "visitor-kiosk-intro" },
    });
    (__VLS_ctx.completedStatus === "entered"
        ? "Recepción completó el checklist de entrada y registró tu ingreso en la bitácora."
        : __VLS_ctx.completedStatus === "rejected"
            ? "Recepción no autorizó el registro. Solicita asistencia antes de ingresar."
            : "Tu llegada ya quedó anotada. Espera mientras recepción revisa el checklist de equipos y autoriza el ingreso.");
    if (__VLS_ctx.completedStatus === 'waiting') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "visitor-kiosk-waiting" },
            role: "status",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "visitor-kiosk-waiting-indicator" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    if (__VLS_ctx.completedStatusError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "visitor-kiosk-status-error" },
            role: "alert",
        });
        (__VLS_ctx.completedStatusError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.resetKiosk) },
        ...{ class: "visitor-kiosk-secondary" },
        type: "button",
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
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-form']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-label-title']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-label-title']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-text-button']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-label-title']} */ ;
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
/** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-item-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-item-description']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-label-title']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-add-item']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-item-list']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-empty-choice']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-form']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-label-title']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-id-question']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-form']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-confirmation']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-error-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-welcome']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-success']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-welcome-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-folio']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-success-name']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-waiting']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-waiting-indicator']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-status-error']} */ ;
/** @type {__VLS_StyleScopedClasses['visitor-kiosk-secondary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            identificationTypes: identificationTypes,
            existingCompanies: existingCompanies,
            step: step,
            sending: sending,
            errorMessage: errorMessage,
            fieldErrors: fieldErrors,
            visitorName: visitorName,
            companyName: companyName,
            visitReason: visitReason,
            carriesItems: carriesItems,
            items: items,
            itemDraft: itemDraft,
            identificationType: identificationType,
            declaresIdRetained: declaresIdRetained,
            informationConfirmed: informationConfirmed,
            completed: completed,
            completedStatus: completedStatus,
            completedStatusError: completedStatusError,
            progress: progress,
            clearErrors: clearErrors,
            continueStep: continueStep,
            previousStep: previousStep,
            addItem: addItem,
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
