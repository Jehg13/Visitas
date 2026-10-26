import { onMounted, ref } from "vue";
import DashboardView from "./DashboardView.vue";
import LoginView from "./LoginView.vue";
import PublicEquipmentDeclaration from "./sections/PublicEquipmentDeclaration.vue";
const sessionChecking = ref(true);
const publicEquipmentToken = new URLSearchParams(window.location.hash.slice(1)).get("equipo");
const user = ref(null);
const accounts = ref([]);
function acceptLogin(result) {
    user.value = result.user;
    accounts.value = result.accounts;
}
onMounted(async () => {
    if (publicEquipmentToken) {
        sessionChecking.value = false;
        return;
    }
    try {
        const response = await fetch("/api/auth/session");
        if (response.ok) {
            const result = await response.json();
            user.value = result.user;
            accounts.value = result.accounts ?? [];
        }
    }
    catch (error) {
        console.error("No se pudo restaurar la sesión:", error);
    }
    finally {
        sessionChecking.value = false;
    }
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
    var __VLS_3 = {};
    var __VLS_2;
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
    const __VLS_4 = __VLS_asFunctionalComponent(LoginView, new LoginView({
        ...{ 'onAuthenticated': {} },
    }));
    const __VLS_5 = __VLS_4({
        ...{ 'onAuthenticated': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    let __VLS_7;
    let __VLS_8;
    let __VLS_9;
    const __VLS_10 = {
        onAuthenticated: (__VLS_ctx.acceptLogin)
    };
    var __VLS_11 = {};
    var __VLS_6;
}
else {
    /** @type {[typeof DashboardView, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(DashboardView, new DashboardView({
        user: (__VLS_ctx.user),
        accounts: (__VLS_ctx.accounts),
    }));
    const __VLS_13 = __VLS_12({
        user: (__VLS_ctx.user),
        accounts: (__VLS_ctx.accounts),
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    var __VLS_15 = {};
    var __VLS_14;
}
/** @type {__VLS_StyleScopedClasses['session-loading']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            DashboardView: DashboardView,
            LoginView: LoginView,
            PublicEquipmentDeclaration: PublicEquipmentDeclaration,
            sessionChecking: sessionChecking,
            publicEquipmentToken: publicEquipmentToken,
            user: user,
            accounts: accounts,
            acceptLogin: acceptLogin,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
