import { ref } from "vue";
const emit = defineEmits();
const identifier = ref("");
const password = ref("");
const showPassword = ref(false);
const loginMessage = ref("");
const loginSubmitting = ref(false);
async function handleLogin() {
    loginMessage.value = "";
    loginSubmitting.value = true;
    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: identifier.value, password: password.value }),
        });
        const result = await response.json();
        if (!response.ok || !result.user) {
            loginMessage.value = result.error ?? "No se pudo iniciar sesión.";
            return;
        }
        password.value = "";
        emit("authenticated", { user: result.user, accounts: result.accounts ?? [] });
    }
    catch {
        loginMessage.value = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
    }
    finally {
        loginSubmitting.value = false;
    }
}
function handlePasswordRecovery() {
    loginMessage.value = "La recuperación de contraseña todavía no está disponible.";
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "login-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "image-panel" },
    'aria-label': "CyMEZ Recep Visitantes",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
    ...{ class: "brand-image" },
    src: "/images/cymez-recep-logo.png",
    alt: "CyMEZ Recep Visitantes",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "login-panel" },
    'aria-labelledby': "welcome-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-pattern" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login-content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "welcome-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    id: "welcome-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "login-card" },
    'aria-labelledby': "login-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "card-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    id: "login-title",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "card-heading-mark" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    fill: "none",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6L12 3Z",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m9 12 2 2 4-4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
    ...{ onSubmit: (__VLS_ctx.handleLogin) },
    ...{ class: "login-form" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    for: "identifier",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "input-wrap" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "input-icon" },
    viewBox: "0 0 24 24",
    fill: "none",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "12",
    cy: "8",
    r: "3.5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M5 20v-1.5a7 7 0 0 1 14 0V20H5Z",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    id: "identifier",
    value: (__VLS_ctx.identifier),
    name: "identifier",
    type: "text",
    autocomplete: "username",
    placeholder: "Escribe tu usuario o correo",
    required: true,
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "password-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    for: "password",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handlePasswordRecovery) },
    ...{ class: "recovery-link" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "input-wrap" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "input-icon" },
    viewBox: "0 0 24 24",
    fill: "none",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
    x: "5",
    y: "10",
    width: "14",
    height: "11",
    rx: "2",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M8 10V7a4 4 0 0 1 8 0v3",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    id: "password",
    name: "password",
    type: (__VLS_ctx.showPassword ? 'text' : 'password'),
    autocomplete: "current-password",
    placeholder: "Escribe tu contraseña",
    required: true,
});
(__VLS_ctx.password);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.showPassword = !__VLS_ctx.showPassword;
        } },
    ...{ class: "password-toggle" },
    type: "button",
    'aria-label': (__VLS_ctx.showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'),
    'aria-pressed': (__VLS_ctx.showPassword),
});
if (!__VLS_ctx.showPassword) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        fill: "none",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "12",
        cy: "12",
        r: "2.5",
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        fill: "none",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15 15 0 0 1-3 3.5M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.4 6 9.5 6c1 0 1.9-.2 2.7-.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M9.9 9.9a3 3 0 0 0 4.2 4.2",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "submit-button" },
    type: "submit",
    disabled: (__VLS_ctx.loginSubmitting),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.loginSubmitting ? "Validando..." : "Iniciar sesión");
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 20 20",
    fill: "none",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M4 10h12m-5-5 5 5-5 5",
});
if (__VLS_ctx.loginMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "form-message" },
        role: "status",
    });
    (__VLS_ctx.loginMessage);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "corporate-access" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "access-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "access-notice" },
    'aria-label': "Acceso exclusivo",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "access-notice-icon" },
    viewBox: "0 0 32 36",
    fill: "none",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M16 1 2 6v10c0 9.1 5.7 15.4 14 19 8.3-3.6 14-9.9 14-19V6L16 1Z",
    fill: "currentColor",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m10 17 4 4 8-8",
    stroke: "#151922",
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
    'stroke-width': "2.5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "access-notice-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['image-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-image']} */ ;
/** @type {__VLS_StyleScopedClasses['login-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-pattern']} */ ;
/** @type {__VLS_StyleScopedClasses['login-content']} */ ;
/** @type {__VLS_StyleScopedClasses['welcome-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['login-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['card-heading-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['login-form']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['input-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['input-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['password-label']} */ ;
/** @type {__VLS_StyleScopedClasses['recovery-link']} */ ;
/** @type {__VLS_StyleScopedClasses['input-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['input-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['password-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['submit-button']} */ ;
/** @type {__VLS_StyleScopedClasses['form-message']} */ ;
/** @type {__VLS_StyleScopedClasses['corporate-access']} */ ;
/** @type {__VLS_StyleScopedClasses['access-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['access-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['access-notice-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['access-notice-copy']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            identifier: identifier,
            password: password,
            showPassword: showPassword,
            loginMessage: loginMessage,
            loginSubmitting: loginSubmitting,
            handleLogin: handleLogin,
            handlePasswordRecovery: handlePasswordRecovery,
        };
    },
    __typeEmits: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
});
; /* PartiallyEnd: #4569/main.vue */
