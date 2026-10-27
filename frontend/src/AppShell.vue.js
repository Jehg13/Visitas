import { storeToRefs } from "pinia";
import { onBeforeUnmount, onMounted, ref } from "vue";
import DashboardView from "./DashboardView.vue";
import AppAlert from "./components/AppAlert.vue";
import LoginView from "./LoginView.vue";
import PublicEquipmentDeclaration from "./sections/PublicEquipmentDeclaration.vue";
import { useAuthStore } from "./stores/auth";
import { useDashboardStore } from "./stores/dashboard";
const sessionChecking = ref(true);
const publicEquipmentToken = new URLSearchParams(window.location.hash.slice(1)).get("equipo");
const passwordResetToken = ref(new URLSearchParams(window.location.hash.slice(1)).get("restablecer") ?? "");
const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const { user } = storeToRefs(authStore);
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
if (__VLS_ctx.publicEquipmentToken) {
    /** @type {[typeof PublicEquipmentDeclaration, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PublicEquipmentDeclaration, new PublicEquipmentDeclaration({}));
    const __VLS_1 = __VLS_0({}, ...__VLS_functionalComponentArgsRest(__VLS_0));
}
else if (__VLS_ctx.passwordResetToken) {
    /** @type {[typeof LoginView, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(LoginView, new LoginView({
        ...{ 'onPasswordResetComplete': {} },
        passwordResetToken: (__VLS_ctx.passwordResetToken),
    }));
    const __VLS_4 = __VLS_3({
        ...{ 'onPasswordResetComplete': {} },
        passwordResetToken: (__VLS_ctx.passwordResetToken),
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    let __VLS_6;
    let __VLS_7;
    let __VLS_8;
    const __VLS_9 = {
        onPasswordResetComplete: (__VLS_ctx.finishPasswordReset)
    };
    var __VLS_5;
}
else if (__VLS_ctx.sessionChecking) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "session-loading" },
        'aria-label': "Restaurando sesión",
    });
}
else if (!__VLS_ctx.user) {
    /** @type {[typeof LoginView, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(LoginView, new LoginView({
        ...{ 'onPasswordResetComplete': {} },
        passwordResetToken: (__VLS_ctx.passwordResetToken),
    }));
    const __VLS_11 = __VLS_10({
        ...{ 'onPasswordResetComplete': {} },
        passwordResetToken: (__VLS_ctx.passwordResetToken),
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    let __VLS_13;
    let __VLS_14;
    let __VLS_15;
    const __VLS_16 = {
        onPasswordResetComplete: (__VLS_ctx.finishPasswordReset)
    };
    var __VLS_12;
}
else {
    /** @type {[typeof DashboardView, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(DashboardView, new DashboardView({
        ...{ 'onLogout': {} },
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onLogout': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onLogout: (__VLS_ctx.closeSession)
    };
    var __VLS_19;
}
/** @type {[typeof AppAlert, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(AppAlert, new AppAlert({}));
const __VLS_25 = __VLS_24({}, ...__VLS_functionalComponentArgsRest(__VLS_24));
/** @type {__VLS_StyleScopedClasses['session-loading']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            DashboardView: DashboardView,
            AppAlert: AppAlert,
            LoginView: LoginView,
            PublicEquipmentDeclaration: PublicEquipmentDeclaration,
            sessionChecking: sessionChecking,
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
