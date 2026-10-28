import { computed, ref, watch } from "vue";
import { useAuthStore } from "./stores/auth";
import { useDashboardStore } from "./stores/dashboard";
const props = defineProps();
const emit = defineEmits();
const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const identifier = ref("");
const password = ref("");
const showPassword = ref(false);
const loginMessage = ref("");
const loginSubmitting = ref(false);
const recoveryOpen = ref(false);
const recoveryMode = ref("request");
const recoveryEmail = ref("");
const recoveryPassword = ref("");
const recoveryConfirmation = ref("");
const recoveryMessage = ref("");
const recoveryError = ref("");
const recoverySubmitting = ref(false);
const passwordRequirements = computed(() => [
    { label: "Mínimo 12 caracteres", valid: Array.from(recoveryPassword.value).length >= 12 },
    { label: "Al menos una letra mayúscula", valid: /\p{Lu}/u.test(recoveryPassword.value) },
    { label: "Al menos una letra minúscula", valid: /\p{Ll}/u.test(recoveryPassword.value) },
    { label: "Al menos un número", valid: /\d/.test(recoveryPassword.value) },
    { label: "Al menos un carácter especial", valid: /[^\p{L}\p{N}\s]/u.test(recoveryPassword.value) },
]);
const passwordMeetsRequirements = computed(() => passwordRequirements.value.every((requirement) => requirement.valid));
const passwordsDoNotMatch = computed(() => recoveryConfirmation.value.length > 0 &&
    recoveryPassword.value !== recoveryConfirmation.value);
watch(() => props.passwordResetToken, (token) => {
    if (token) {
        recoveryMode.value = "reset";
        recoveryOpen.value = true;
        recoveryError.value = "";
        recoveryMessage.value = "";
    }
}, { immediate: true });
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
        dashboardStore.reset();
        authStore.setSession(result.user, result.accounts ?? []);
    }
    catch (error) {
        console.error("No se pudo iniciar sesión:", error);
        loginMessage.value = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
    }
    finally {
        loginSubmitting.value = false;
    }
}
function handlePasswordRecovery() {
    recoveryMode.value = "request";
    recoveryEmail.value = "";
    recoveryPassword.value = "";
    recoveryConfirmation.value = "";
    recoveryMessage.value = "";
    recoveryError.value = "";
    recoveryOpen.value = true;
}
function closeRecovery() {
    recoveryOpen.value = false;
    recoveryError.value = "";
    recoveryMessage.value = "";
}
async function requestPasswordRecovery() {
    if (recoverySubmitting.value)
        return;
    recoveryError.value = "";
    recoveryMessage.value = "";
    recoverySubmitting.value = true;
    try {
        const response = await fetch("/api/auth/password-recovery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: recoveryEmail.value }),
        });
        const result = await response.json();
        if (!response.ok) {
            recoveryError.value = result.error ?? "No se pudo procesar la solicitud. Inténtalo más tarde.";
            return;
        }
        recoveryMessage.value = result.message ??
            "Si el correo está asociado a una cuenta activa, recibirás instrucciones para recuperar tu contraseña.";
    }
    catch (error) {
        console.error("No se pudo solicitar la recuperación de contraseña:", error);
        recoveryError.value = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
    }
    finally {
        recoverySubmitting.value = false;
    }
}
async function resetPassword() {
    if (recoverySubmitting.value || !props.passwordResetToken)
        return;
    recoveryError.value = "";
    recoveryMessage.value = "";
    if (!passwordMeetsRequirements.value || Array.from(recoveryPassword.value).length > 128) {
        recoveryError.value =
            "Cumple todos los requisitos de seguridad indicados para la nueva contraseña.";
        return;
    }
    if (passwordsDoNotMatch.value || !recoveryConfirmation.value) {
        recoveryError.value = "Las contraseñas no coinciden.";
        return;
    }
    recoverySubmitting.value = true;
    try {
        const response = await fetch("/api/auth/password-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: props.passwordResetToken,
                password: recoveryPassword.value,
                confirmation: recoveryConfirmation.value,
            }),
        });
        const result = await response.json();
        if (!response.ok) {
            recoveryError.value = result.error ?? "No se pudo actualizar la contraseña.";
            return;
        }
        password.value = "";
        recoveryPassword.value = "";
        recoveryConfirmation.value = "";
        recoveryOpen.value = false;
        loginMessage.value = result.message ?? "Tu contraseña se actualizó. Ya puedes iniciar sesión.";
        emit("passwordResetComplete");
    }
    catch (error) {
        console.error("No se pudo actualizar la contraseña:", error);
        recoveryError.value = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
    }
    finally {
        recoverySubmitting.value = false;
    }
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
    src: "/images/cymez-recep-logo-v2.webp",
    alt: "CyMEZ Recep Visitantes",
    fetchpriority: "high",
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
if (__VLS_ctx.recoveryOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.closeRecovery) },
        ...{ onKeydown: (__VLS_ctx.closeRecovery) },
        ...{ class: "password-recovery-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "password-recovery-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "password-recovery-title",
        'aria-describedby': "password-recovery-description",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeRecovery) },
        ...{ class: "password-recovery-close" },
        type: "button",
        'aria-label': "Cerrar recuperación de contraseña",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "password-recovery-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "password-recovery-icon" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        fill: "none",
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M12 14v3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "password-recovery-title",
    });
    (__VLS_ctx.recoveryMode === "reset" ? "Crear nueva contraseña" : "Recuperar contraseña");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        id: "password-recovery-description",
    });
    (__VLS_ctx.recoveryMode === "reset"
        ? "Elige una contraseña segura para volver a entrar a tu cuenta."
        : "No te preocupes, te ayudaremos a restablecerla. Ingresa el correo electrónico asociado a tu cuenta.");
    if (__VLS_ctx.recoveryMode === 'request') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
            ...{ onSubmit: (__VLS_ctx.requestPasswordRecovery) },
            ...{ class: "password-recovery-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            for: "recovery-email",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "password-recovery-input" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
            x: "3",
            y: "5",
            width: "18",
            height: "14",
            rx: "2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m4 7 8 6 8-6",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            id: "recovery-email",
            type: "email",
            name: "email",
            autocomplete: "email",
            maxlength: "254",
            placeholder: "Escribe tu correo electrónico",
            'aria-describedby': "recovery-email-help",
            required: true,
        });
        (__VLS_ctx.recoveryEmail);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "password-recovery-submit" },
            type: "submit",
            disabled: (__VLS_ctx.recoverySubmitting),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "m22 2-7 20-4-9-9-4 20-7Z",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M22 2 11 13",
        });
        (__VLS_ctx.recoverySubmitting ? "Enviando…" : "Enviar enlace de recuperación");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
            id: "recovery-email-help",
            ...{ class: "password-recovery-notice" },
            'aria-label': "Información de recuperación",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "9",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M12 11v5m0-8h.01",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
            ...{ onSubmit: (__VLS_ctx.resetPassword) },
            ...{ class: "password-recovery-form" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            for: "recovery-password",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "password-recovery-input" },
            ...{ class: ({ 'has-error': __VLS_ctx.recoveryPassword.length > 0 && !__VLS_ctx.passwordMeetsRequirements }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
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
            id: "recovery-password",
            type: "password",
            name: "new-password",
            autocomplete: "new-password",
            minlength: "12",
            maxlength: "128",
            placeholder: "Al menos 12 caracteres",
            'aria-invalid': (__VLS_ctx.recoveryPassword.length > 0 && !__VLS_ctx.passwordMeetsRequirements),
            'aria-describedby': "password-requirements",
            required: true,
        });
        (__VLS_ctx.recoveryPassword);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
            id: "password-requirements",
            ...{ class: "password-requirements" },
            'aria-label': "Requisitos de la contraseña",
        });
        for (const [requirement] of __VLS_getVForSourceType((__VLS_ctx.passwordRequirements))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (requirement.label),
                ...{ class: ({ 'is-valid': requirement.valid }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                'aria-hidden': "true",
            });
            (requirement.valid ? "✓" : "○");
            (requirement.label);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            for: "recovery-confirmation",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "password-recovery-input" },
            ...{ class: ({ 'has-error': __VLS_ctx.passwordsDoNotMatch }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
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
            id: "recovery-confirmation",
            type: "password",
            name: "confirm-password",
            autocomplete: "new-password",
            minlength: "12",
            maxlength: "128",
            placeholder: "Repite la contraseña",
            'aria-invalid': (__VLS_ctx.passwordsDoNotMatch),
            'aria-describedby': (__VLS_ctx.passwordsDoNotMatch ? 'password-confirmation-error' : undefined),
            required: true,
        });
        (__VLS_ctx.recoveryConfirmation);
        if (__VLS_ctx.passwordsDoNotMatch) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                id: "password-confirmation-error",
                ...{ class: "password-confirmation-error" },
                role: "status",
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "password-recovery-submit" },
            type: "submit",
            disabled: (__VLS_ctx.recoverySubmitting),
        });
        (__VLS_ctx.recoverySubmitting ? "Actualizando…" : "Guardar nueva contraseña");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
            ...{ class: "password-recovery-notice" },
            'aria-label': "Vigencia del enlace",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            fill: "none",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "9",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M12 7v5l3 2",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
    if (__VLS_ctx.recoveryMessage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "password-recovery-message is-success" },
            role: "status",
        });
        (__VLS_ctx.recoveryMessage);
    }
    if (__VLS_ctx.recoveryError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "password-recovery-message is-error" },
            role: "alert",
        });
        (__VLS_ctx.recoveryError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeRecovery) },
        ...{ class: "password-recovery-back" },
        type: "button",
    });
}
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
/** @type {__VLS_StyleScopedClasses['password-recovery-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-close']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-form']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-input']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-form']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-input']} */ ;
/** @type {__VLS_StyleScopedClasses['has-error']} */ ;
/** @type {__VLS_StyleScopedClasses['password-requirements']} */ ;
/** @type {__VLS_StyleScopedClasses['is-valid']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-input']} */ ;
/** @type {__VLS_StyleScopedClasses['has-error']} */ ;
/** @type {__VLS_StyleScopedClasses['password-confirmation-error']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-message']} */ ;
/** @type {__VLS_StyleScopedClasses['is-success']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-message']} */ ;
/** @type {__VLS_StyleScopedClasses['is-error']} */ ;
/** @type {__VLS_StyleScopedClasses['password-recovery-back']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            identifier: identifier,
            password: password,
            showPassword: showPassword,
            loginMessage: loginMessage,
            loginSubmitting: loginSubmitting,
            recoveryOpen: recoveryOpen,
            recoveryMode: recoveryMode,
            recoveryEmail: recoveryEmail,
            recoveryPassword: recoveryPassword,
            recoveryConfirmation: recoveryConfirmation,
            recoveryMessage: recoveryMessage,
            recoveryError: recoveryError,
            recoverySubmitting: recoverySubmitting,
            passwordRequirements: passwordRequirements,
            passwordMeetsRequirements: passwordMeetsRequirements,
            passwordsDoNotMatch: passwordsDoNotMatch,
            handleLogin: handleLogin,
            handlePasswordRecovery: handlePasswordRecovery,
            closeRecovery: closeRecovery,
            requestPasswordRecovery: requestPasswordRecovery,
            resetPassword: resetPassword,
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
