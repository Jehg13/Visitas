import { computed, defineAsyncComponent, watch } from "vue";
import { storeToRefs } from "pinia";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import AppAlert from "./components/AppAlert.vue";
import { useAuthStore } from "./stores/auth";
import { useDashboardStore } from "./stores/dashboard";
const DashboardView = defineAsyncComponent(() => import("./DashboardView.vue"));
const LoginView = defineAsyncComponent(() => import("./LoginView.vue"));
const PublicEquipmentDeclaration = defineAsyncComponent(() => import("./sections/PublicEquipmentDeclaration.vue"));
const PublicVisitorKiosk = defineAsyncComponent(() => import("./sections/PublicVisitorKiosk.vue"));
const sessionChecking = ref(true);
const route = useRoute();
const visitorKioskRoute = computed(() => route.path === "/registro");
const publicEquipmentToken = new URLSearchParams(window.location.hash.slice(1)).get("equipo");
const passwordResetToken = ref(new URLSearchParams(window.location.hash.slice(1)).get("restablecer") ?? "");
const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const { user } = storeToRefs(authStore);
const pageMetadata = computed(() => {
    if (visitorKioskRoute.value) {
        return {
            title: "Registro de visitantes sin cita | CyMEZ Recep",
            description: "Registra manualmente tu visita a las instalaciones de CyMEZ y declara el equipo que ingresas.",
        };
    }
    if (publicEquipmentToken) {
        return {
            title: "Declaración de equipo | CyMEZ Recep",
            description: "Completa la declaración de equipo y herramientas para tu visita a las instalaciones de CyMEZ.",
        };
    }
    if (passwordResetToken.value) {
        return {
            title: "Recuperar acceso | CyMEZ Recep",
            description: "Restablece de forma segura tu acceso a CyME Recep.",
        };
    }
    if (user.value) {
        return {
            title: "Control de visitantes | CyMEZ Recep",
            description: "Plataforma interna de gestión de visitas y control de acceso de CyME.",
        };
    }
    return {
        title: "Iniciar sesión | CyMEZ Recep",
        description: "Acceso al sistema interno de control de visitantes de CyME.",
    };
});
watch(pageMetadata, (metadata) => {
    document.title = metadata.title;
    const description = document.querySelector('meta[name="description"]');
    if (description)
        description.content = metadata.description;
    const robots = document.querySelector('meta[name="robots"]');
    if (robots)
        robots.content = user.value || publicEquipmentToken || passwordResetToken.value
            ? "noindex, nofollow"
            : "index, follow";
}, { immediate: true });
function syncPasswordResetToken() {
    passwordResetToken.value =
        new URLSearchParams(window.location.hash.slice(1)).get("restablecer") ?? "";
}
function finishPasswordReset() {
    passwordResetToken.value = "";
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}
function closeSession() {
    authStore.clearSession();
    dashboardStore.reset();
}
onMounted(async () => {
    window.addEventListener("hashchange", syncPasswordResetToken);
    if (visitorKioskRoute.value) {
        sessionChecking.value = false;
        return;
    }
    if (passwordResetToken.value) {
        sessionChecking.value = false;
        return;
    }
    if (publicEquipmentToken) {
        sessionChecking.value = false;
        return;
    }
    try {
        const response = await fetch("/api/auth/session");
        if (response.ok) {
            const result = await response.json();
            if (result.user)
                authStore.setSession(result.user, result.accounts ?? []);
        }
    }
    catch (error) {
        console.error("No se pudo restaurar la sesión:", error);
    }
    finally {
        sessionChecking.value = false;
    }
});
onBeforeUnmount(() => {
    window.removeEventListener("hashchange", syncPasswordResetToken);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
if (__VLS_ctx.visitorKioskRoute) {
    const __VLS_0 = {}.PublicVisitorKiosk;
    /** @type {[typeof __VLS_components.PublicVisitorKiosk, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
else if (__VLS_ctx.publicEquipmentToken) {
    const __VLS_4 = {}.PublicEquipmentDeclaration;
    /** @type {[typeof __VLS_components.PublicEquipmentDeclaration, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
    const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
else if (__VLS_ctx.passwordResetToken) {
    const __VLS_8 = {}.LoginView;
    /** @type {[typeof __VLS_components.LoginView, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onPasswordResetComplete': {} },
        passwordResetToken: (__VLS_ctx.passwordResetToken),
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onPasswordResetComplete': {} },
        passwordResetToken: (__VLS_ctx.passwordResetToken),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onPasswordResetComplete: (__VLS_ctx.finishPasswordReset)
    };
    var __VLS_11;
}
else if (__VLS_ctx.sessionChecking) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "session-loading" },
        'aria-label': "Restaurando sesión",
    });
}
else if (!__VLS_ctx.user) {
    const __VLS_16 = {}.LoginView;
    /** @type {[typeof __VLS_components.LoginView, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        ...{ 'onPasswordResetComplete': {} },
        passwordResetToken: (__VLS_ctx.passwordResetToken),
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onPasswordResetComplete': {} },
        passwordResetToken: (__VLS_ctx.passwordResetToken),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onPasswordResetComplete: (__VLS_ctx.finishPasswordReset)
    };
    var __VLS_19;
}
else {
    const __VLS_24 = {}.DashboardView;
    /** @type {[typeof __VLS_components.DashboardView, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onLogout': {} },
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onLogout': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onLogout: (__VLS_ctx.closeSession)
    };
    var __VLS_27;
}
/** @type {[typeof AppAlert, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(AppAlert, new AppAlert({}));
const __VLS_33 = __VLS_32({}, ...__VLS_functionalComponentArgsRest(__VLS_32));
/** @type {__VLS_StyleScopedClasses['session-loading']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AppAlert: AppAlert,
            DashboardView: DashboardView,
            LoginView: LoginView,
            PublicEquipmentDeclaration: PublicEquipmentDeclaration,
            PublicVisitorKiosk: PublicVisitorKiosk,
            sessionChecking: sessionChecking,
            visitorKioskRoute: visitorKioskRoute,
            publicEquipmentToken: publicEquipmentToken,
            passwordResetToken: passwordResetToken,
            user: user,
            finishPasswordReset: finishPasswordReset,
            closeSession: closeSession,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
