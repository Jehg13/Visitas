import { onMounted, ref } from "vue";
const token = new URLSearchParams(window.location.hash.slice(1)).get("equipo") ?? "";
const declaration = ref(null);
const items = ref([]);
const newItem = ref(emptyItem());
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const submitted = ref(false);
const confirmedReview = ref(false);
const editingItemIndex = ref(null);
function emptyItem() {
    return {
        itemType: "Equipo",
        quantity: 1,
        product: "",
        brand: "",
        model: "",
        serialNumber: "",
        color: "",
        notes: "",
    };
}
async function parseResponse(response) {
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("No se pudo conectar con el servidor de declaraciones.");
    }
    try {
        return await response.json();
    }
    catch {
        throw new Error("El servidor devolvió una declaración con formato inválido.");
    }
}
onMounted(async () => {
    if (!token) {
        errorMessage.value = "El enlace de declaración no es válido.";
        loading.value = false;
        return;
    }
    try {
        const response = await fetch(`/api/equipment/public/${encodeURIComponent(token)}`);
        const result = await parseResponse(response);
        if (!response.ok || !result.declaration) {
            throw new Error(result.error ?? "No se pudo abrir la declaración.");
        }
        declaration.value = result.declaration;
        submitted.value = result.declaration.status === "Enviada";
        items.value = result.declaration.items;
    }
    catch (error) {
        console.error("No se pudo cargar la declaración pública de equipo:", error);
        errorMessage.value = error instanceof Error ? error.message : "No se pudo abrir la declaración.";
    }
    finally {
        loading.value = false;
    }
});
function addItem() {
    if ((editingItemIndex.value === null && items.value.length >= 50) || !newItem.value.product.trim())
        return;
    if (!Number.isSafeInteger(newItem.value.quantity) || newItem.value.quantity < 1 || newItem.value.quantity > 100000) {
        errorMessage.value = "La cantidad debe ser un número entero entre 1 y 100,000.";
        return;
    }
    const item = {
        ...newItem.value,
        product: newItem.value.product.trim(),
        brand: newItem.value.brand.trim(),
        model: newItem.value.model.trim(),
        serialNumber: newItem.value.serialNumber.trim(),
        color: newItem.value.color.trim(),
        notes: newItem.value.notes.trim(),
    };
    if (!item.brand || !item.model || !item.color) {
        errorMessage.value = "Completa tipo, cantidad, artículo, marca, modelo y color. La serie y las observaciones son opcionales.";
        return;
    }
    if (editingItemIndex.value === null)
        items.value.push(item);
    else
        items.value.splice(editingItemIndex.value, 1, item);
    newItem.value = emptyItem();
    editingItemIndex.value = null;
    errorMessage.value = "";
}
function editItem(index) {
    const item = items.value[index];
    if (!item)
        return;
    newItem.value = { ...item };
    editingItemIndex.value = index;
    errorMessage.value = "";
    document.querySelector("#equipment-item-form-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function cancelEdit() {
    newItem.value = emptyItem();
    editingItemIndex.value = null;
    errorMessage.value = "";
}
function removeItem(index) {
    items.value.splice(index, 1);
    if (editingItemIndex.value === index)
        cancelEdit();
    else if (editingItemIndex.value !== null && index < editingItemIndex.value)
        editingItemIndex.value -= 1;
}
async function submitDeclaration() {
    if (saving.value ||
        !declaration.value ||
        items.value.length === 0 ||
        !confirmedReview.value)
        return;
    saving.value = true;
    errorMessage.value = "";
    try {
        const response = await fetch(`/api/equipment/public/${encodeURIComponent(token)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: items.value }),
        });
        const result = await parseResponse(response);
        if (!response.ok)
            throw new Error(result.error ?? "No se pudo enviar la declaración.");
        declaration.value.items = [...items.value];
        declaration.value.status = "Enviada";
        submitted.value = true;
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    catch (error) {
        console.error("No se pudo enviar la declaración de equipo:", error);
        errorMessage.value = error instanceof Error ? error.message : "No se pudo enviar la declaración.";
    }
    finally {
        saving.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "public-equipment-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "public-equipment-card" },
    'aria-labelledby': "public-equipment-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "public-equipment-brand" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "public-equipment-mark" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "public-equipment-eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    id: "public-equipment-title",
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "public-equipment-message" },
        role: "status",
    });
}
else if (__VLS_ctx.errorMessage && !__VLS_ctx.declaration) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "public-equipment-error" },
        role: "alert",
    });
    (__VLS_ctx.errorMessage);
}
else if (__VLS_ctx.declaration) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "public-equipment-visitor" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.declaration.personName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.declaration.companyName);
    if (__VLS_ctx.declaration.visitDate) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.declaration.visitDate);
        (__VLS_ctx.declaration.visitTime);
    }
    if (__VLS_ctx.submitted) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "public-equipment-success" },
            role: "status",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "public-equipment-success-icon" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "public-equipment-submitted-table-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
            ...{ class: "public-equipment-table" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
        for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.declaration.items))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                key: (item.id ?? index),
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
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "public-equipment-warning" },
            role: "note",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "public-equipment-entry" },
            'aria-labelledby': "equipment-item-form-title",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
            id: "equipment-item-form-title",
        });
        (__VLS_ctx.editingItemIndex === null ? "Agregar artículo a la lista" : "Editar artículo");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "public-equipment-form-hint" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
            ...{ onSubmit: (__VLS_ctx.addItem) },
            ...{ class: "public-equipment-entry-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            value: (__VLS_ctx.newItem.itemType),
            required: true,
            disabled: (__VLS_ctx.saving),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: "Equipo",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: "Herramienta",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "number",
            min: "1",
            max: "100000",
            step: "1",
            required: true,
            disabled: (__VLS_ctx.saving),
        });
        (__VLS_ctx.newItem.quantity);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "public-entry-product" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            maxlength: "180",
            pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
            placeholder: "Ej. Laptop o taladro",
            required: true,
            disabled: (__VLS_ctx.saving),
        });
        (__VLS_ctx.newItem.product);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            maxlength: "120",
            pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
            required: true,
            disabled: (__VLS_ctx.saving),
        });
        (__VLS_ctx.newItem.brand);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            maxlength: "120",
            pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
            required: true,
            disabled: (__VLS_ctx.saving),
        });
        (__VLS_ctx.newItem.model);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            maxlength: "180",
            disabled: (__VLS_ctx.saving),
        });
        (__VLS_ctx.newItem.serialNumber);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            maxlength: "80",
            pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
            required: true,
            disabled: (__VLS_ctx.saving),
        });
        (__VLS_ctx.newItem.color);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "public-entry-notes" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
            value: (__VLS_ctx.newItem.notes),
            maxlength: "1000",
            rows: "2",
            disabled: (__VLS_ctx.saving),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "public-equipment-form-actions" },
        });
        if (__VLS_ctx.editingItemIndex !== null) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.cancelEdit) },
                ...{ class: "public-equipment-cancel-edit" },
                type: "button",
                disabled: (__VLS_ctx.saving),
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "public-equipment-add-button" },
            type: "submit",
            disabled: (__VLS_ctx.saving || (__VLS_ctx.editingItemIndex === null && __VLS_ctx.items.length >= 50)),
        });
        (__VLS_ctx.editingItemIndex !== null ? "Guardar cambios" : __VLS_ctx.items.length >= 50 ? "Máximo de artículos alcanzado" : "+ Agregar a la lista");
        if (__VLS_ctx.errorMessage) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "public-equipment-error public-equipment-form-error" },
                role: "alert",
            });
            (__VLS_ctx.errorMessage);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "sr-only" },
            'aria-live': "polite",
        });
        (__VLS_ctx.editingItemIndex === null ? "" : `Editando artículo ${__VLS_ctx.editingItemIndex + 1}`);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "public-equipment-list" },
            'aria-labelledby': "equipment-list-title",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "public-equipment-list-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
            id: "equipment-list-title",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.items.length);
        if (__VLS_ctx.items.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "public-equipment-table-wrap" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
                ...{ class: "public-equipment-table" },
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
            for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.items))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                    key: (item.id ?? index),
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
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ class: "public-equipment-actions-cell" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                return;
                            if (!!(__VLS_ctx.errorMessage && !__VLS_ctx.declaration))
                                return;
                            if (!(__VLS_ctx.declaration))
                                return;
                            if (!!(__VLS_ctx.submitted))
                                return;
                            if (!(__VLS_ctx.items.length))
                                return;
                            __VLS_ctx.editItem(index);
                        } },
                    ...{ class: "public-equipment-edit" },
                    type: "button",
                    'aria-label': (`Editar ${item.product}`),
                    disabled: (__VLS_ctx.saving),
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                return;
                            if (!!(__VLS_ctx.errorMessage && !__VLS_ctx.declaration))
                                return;
                            if (!(__VLS_ctx.declaration))
                                return;
                            if (!!(__VLS_ctx.submitted))
                                return;
                            if (!(__VLS_ctx.items.length))
                                return;
                            __VLS_ctx.removeItem(index);
                        } },
                    ...{ class: "public-equipment-remove" },
                    type: "button",
                    'aria-label': (`Eliminar ${item.product}`),
                    disabled: (__VLS_ctx.saving),
                });
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "public-equipment-empty" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
            ...{ onSubmit: (__VLS_ctx.submitDeclaration) },
            ...{ class: "public-equipment-submit-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "public-equipment-confirm" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "checkbox",
            required: true,
        });
        (__VLS_ctx.confirmedReview);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        if (__VLS_ctx.errorMessage) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "public-equipment-error" },
                role: "alert",
            });
            (__VLS_ctx.errorMessage);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "public-equipment-submit" },
            type: "submit",
            disabled: (__VLS_ctx.saving || !__VLS_ctx.items.length || !__VLS_ctx.confirmedReview),
        });
        (__VLS_ctx.saving ? "Enviando y cerrando enlace…" : "Enviar declaración definitiva");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "public-equipment-footnote" },
        });
    }
}
/** @type {__VLS_StyleScopedClasses['public-equipment-page']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-card']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-message']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-error']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-visitor']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-success']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-success-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-submitted-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-table']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-warning']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-form-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-entry-form']} */ ;
/** @type {__VLS_StyleScopedClasses['public-entry-product']} */ ;
/** @type {__VLS_StyleScopedClasses['public-entry-notes']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-form-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-cancel-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-add-button']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-error']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-form-error']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-list']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-list-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-actions-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-edit']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-submit-form']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-confirm']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-error']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['public-equipment-footnote']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            declaration: declaration,
            items: items,
            newItem: newItem,
            loading: loading,
            saving: saving,
            errorMessage: errorMessage,
            submitted: submitted,
            confirmedReview: confirmedReview,
            editingItemIndex: editingItemIndex,
            addItem: addItem,
            editItem: editItem,
            cancelEdit: cancelEdit,
            removeItem: removeItem,
            submitDeclaration: submitDeclaration,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
