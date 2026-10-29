import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { listenForAlerts } from "../notifications";
const alert = ref(null);
const dashboardTheme = ref("dark");
const closeButton = ref(null);
let removeAlertListener = null;
let dismissTimer;
const title = computed(() => {
    if (alert.value?.type === "success")
        return "Operación completada";
    if (alert.value?.type === "info")
        return "Aviso";
    return "No se pudo completar";
});
function dismiss(confirmed = false) {
    alert.value?.resolve?.(confirmed);
    alert.value = null;
    if (dismissTimer !== undefined) {
        window.clearTimeout(dismissTimer);
        dismissTimer = undefined;
    }
}
function show(nextAlert) {
    if (alert.value?.resolve)
        alert.value.resolve(false);
    const activeTheme = document.querySelector(".dashboard-app")?.dataset.theme;
    dashboardTheme.value = activeTheme === "light" || activeTheme === "dark"
        ? activeTheme
        : typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
    alert.value = nextAlert;
    if (dismissTimer !== undefined)
        window.clearTimeout(dismissTimer);
    dismissTimer = nextAlert.type === "success"
        ? window.setTimeout(dismiss, 3200)
        : undefined;
    void nextTick(() => closeButton.value?.focus());
}
function handleKeydown(event) {
    if (event.key === "Escape" && alert.value)
        dismiss();
}
onMounted(() => {
    removeAlertListener = listenForAlerts(show);
    window.addEventListener("keydown", handleKeydown);
});
onBeforeUnmount(() => {
    dismiss(false);
    removeAlertListener?.();
    window.removeEventListener("keydown", handleKeydown);
    if (dismissTimer !== undefined)
        window.clearTimeout(dismissTimer);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
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
const __VLS_4 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    name: "app-alert",
}));
const __VLS_6 = __VLS_5({
    name: "app-alert",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
if (__VLS_ctx.alert) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.alert))
                    return;
                __VLS_ctx.dismiss();
            } },
        ...{ class: "app-alert-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "app-alert-dialog" },
        ...{ class: ([`is-${__VLS_ctx.alert.type}`, `theme-${__VLS_ctx.dashboardTheme}`]) },
        role: "alertdialog",
        'aria-modal': "true",
        'aria-labelledby': "app-alert-title",
        'aria-describedby': "app-alert-message",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "app-alert-icon" },
        'aria-hidden': "true",
    });
    if (__VLS_ctx.alert.type === 'success') {
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
    else if (__VLS_ctx.alert.type === 'info') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 48 48",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "24",
            cy: "24",
            r: "20",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M24 21v12m0-20h.02",
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
            d: "m17 17 14 14m0-14L17 31",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "app-alert-title",
    });
    (__VLS_ctx.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        id: "app-alert-message",
    });
    (__VLS_ctx.alert.message);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "app-alert-actions" },
    });
    if (__VLS_ctx.alert.resolve) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.alert))
                        return;
                    if (!(__VLS_ctx.alert.resolve))
                        return;
                    __VLS_ctx.dismiss(false);
                } },
            ...{ class: "app-alert-cancel" },
            type: "button",
        });
        (__VLS_ctx.alert.cancelLabel ?? "Cancelar");
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.alert))
                    return;
                __VLS_ctx.dismiss(__VLS_ctx.alert.resolve ? true : false);
            } },
        ref: "closeButton",
        type: "button",
    });
    /** @type {typeof __VLS_ctx.closeButton} */ ;
    (__VLS_ctx.alert.resolve ? (__VLS_ctx.alert.confirmLabel ?? "Confirmar") : __VLS_ctx.alert.type === "success" ? "Continuar" : "Entendido");
}
var __VLS_7;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['app-alert-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['app-alert-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['app-alert-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['app-alert-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['app-alert-cancel']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            alert: alert,
            dashboardTheme: dashboardTheme,
            closeButton: closeButton,
            title: title,
            dismiss: dismiss,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
