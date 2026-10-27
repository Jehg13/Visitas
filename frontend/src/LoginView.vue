<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAuthStore } from "./stores/auth";
import { useDashboardStore } from "./stores/dashboard";
import type { AccessAccount, AuthenticatedUser } from "./stores/types";

const props = defineProps<{
  passwordResetToken?: string;
}>();

const emit = defineEmits<{
  passwordResetComplete: [];
}>();

const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const identifier = ref("");
const password = ref("");
const showPassword = ref(false);
const loginMessage = ref("");
const loginSubmitting = ref(false);
const recoveryOpen = ref(false);
const recoveryMode = ref<"request" | "reset">("request");
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
const passwordMeetsRequirements = computed(() =>
  passwordRequirements.value.every((requirement) => requirement.valid),
);
const passwordsDoNotMatch = computed(() =>
  recoveryConfirmation.value.length > 0 &&
  recoveryPassword.value !== recoveryConfirmation.value,
);

watch(
  () => props.passwordResetToken,
  (token) => {
    if (token) {
      recoveryMode.value = "reset";
      recoveryOpen.value = true;
      recoveryError.value = "";
      recoveryMessage.value = "";
    }
  },
  { immediate: true },
);

async function handleLogin() {
  loginMessage.value = "";
  loginSubmitting.value = true;

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: identifier.value, password: password.value }),
    });

    const result = await response.json() as {
      user?: AuthenticatedUser;
      accounts?: AccessAccount[];
      error?: string;
    };
    if (!response.ok || !result.user) {
      loginMessage.value = result.error ?? "No se pudo iniciar sesión.";
      return;
    }

    password.value = "";
    dashboardStore.reset();
    authStore.setSession(result.user, result.accounts ?? []);
  } catch (error) {
    console.error("No se pudo iniciar sesión:", error);
    loginMessage.value = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
  } finally {
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
  if (recoverySubmitting.value) return;
  recoveryError.value = "";
  recoveryMessage.value = "";
  recoverySubmitting.value = true;
  try {
    const response = await fetch("/api/auth/password-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: recoveryEmail.value }),
    });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) {
      recoveryError.value = result.error ?? "No se pudo procesar la solicitud. Inténtalo más tarde.";
      return;
    }
    recoveryMessage.value = result.message ??
      "Si el correo está asociado a una cuenta activa, recibirás instrucciones para recuperar tu contraseña.";
  } catch (error) {
    console.error("No se pudo solicitar la recuperación de contraseña:", error);
    recoveryError.value = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
  } finally {
    recoverySubmitting.value = false;
  }
}

async function resetPassword() {
  if (recoverySubmitting.value || !props.passwordResetToken) return;
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
    const result = await response.json() as { message?: string; error?: string };
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
  } catch (error) {
    console.error("No se pudo actualizar la contraseña:", error);
    recoveryError.value = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
  } finally {
    recoverySubmitting.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="image-panel" aria-label="CyMEZ Recep Visitantes">
      <img class="brand-image" src="/images/cymez-recep-logo.png" alt="CyMEZ Recep Visitantes" />
    </section>

    <section class="login-panel" aria-labelledby="welcome-title">
      <div class="panel-pattern" aria-hidden="true"></div>
      <div class="login-content">
        <header class="welcome-heading">
          <h1 id="welcome-title">Bienvenido de nuevo</h1>
          <p>Inicia sesión para continuar</p>
        </header>

        <section class="login-card" aria-labelledby="login-title">
          <header class="card-heading">
            <h2 id="login-title">Iniciar sesión</h2>
            <span class="card-heading-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
          </header>

          <form class="login-form" @submit.prevent="handleLogin">
            <div class="field-label">
              <label for="identifier">Usuario o correo electrónico</label>
            </div>
            <div class="input-wrap">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20v-1.5a7 7 0 0 1 14 0V20H5Z" />
              </svg>
              <input
                id="identifier"
                v-model.trim="identifier"
                name="identifier"
                type="text"
                autocomplete="username"
                placeholder="Escribe tu usuario o correo"
                required
              />
            </div>

            <div class="password-label">
              <label for="password">Contraseña</label>
              <button class="recovery-link" type="button" @click="handlePasswordRecovery">
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <div class="input-wrap">
              <svg class="input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="5" y="10" width="14" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                id="password"
                v-model="password"
                name="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="Escribe tu contraseña"
                required
              />
              <button
                class="password-toggle"
                type="button"
                :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15 15 0 0 1-3 3.5M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.4 6 9.5 6c1 0 1.9-.2 2.7-.5" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              </button>
            </div>

            <button class="submit-button" type="submit" :disabled="loginSubmitting">
              <span>{{ loginSubmitting ? "Validando..." : "Iniciar sesión" }}</span>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10h12m-5-5 5 5-5 5" />
              </svg>
            </button>
            <p v-if="loginMessage" class="form-message" role="status">{{ loginMessage }}</p>
          </form>
        </section>

        <div class="corporate-access">
          <div class="access-divider" aria-hidden="true">
            <span></span>
            <p>Acceso corporativo</p>
            <span></span>
          </div>
          <aside class="access-notice" aria-label="Acceso exclusivo">
            <svg class="access-notice-icon" viewBox="0 0 32 36" fill="none" aria-hidden="true">
              <path d="M16 1 2 6v10c0 9.1 5.7 15.4 14 19 8.3-3.6 14-9.9 14-19V6L16 1Z" fill="currentColor" />
              <path d="m10 17 4 4 8-8" stroke="#151922" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" />
            </svg>
            <div class="access-notice-copy">
              <h2>Acceso exclusivo</h2>
              <p>Esta plataforma es de uso exclusivo para personal autorizado en la empresa.</p>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <div
      v-if="recoveryOpen"
      class="password-recovery-backdrop"
      @click.self="closeRecovery"
      @keydown.esc="closeRecovery"
    >
      <section
        class="password-recovery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-recovery-title"
        aria-describedby="password-recovery-description"
      >
        <button
          class="password-recovery-close"
          type="button"
          aria-label="Cerrar recuperación de contraseña"
          @click="closeRecovery"
        >×</button>
        <header class="password-recovery-heading">
          <span class="password-recovery-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              <path d="M12 14v3" />
            </svg>
          </span>
          <div>
            <h2 id="password-recovery-title">
              {{ recoveryMode === "reset" ? "Crear nueva contraseña" : "Recuperar contraseña" }}
            </h2>
            <p id="password-recovery-description">
              {{ recoveryMode === "reset"
                ? "Elige una contraseña segura para volver a entrar a tu cuenta."
                : "No te preocupes, te ayudaremos a restablecerla. Ingresa el correo electrónico asociado a tu cuenta." }}
            </p>
          </div>
        </header>

        <form
          v-if="recoveryMode === 'request'"
          class="password-recovery-form"
          @submit.prevent="requestPasswordRecovery"
        >
          <label for="recovery-email">Correo electrónico</label>
          <div class="password-recovery-input">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m4 7 8 6 8-6" />
            </svg>
            <input
              id="recovery-email"
              v-model.trim="recoveryEmail"
              type="email"
              name="email"
              autocomplete="email"
              maxlength="254"
              placeholder="Escribe tu correo electrónico"
              aria-describedby="recovery-email-help"
              required
            />
          </div>
          <button class="password-recovery-submit" type="submit" :disabled="recoverySubmitting">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m22 2-7 20-4-9-9-4 20-7Z" />
              <path d="M22 2 11 13" />
            </svg>
            {{ recoverySubmitting ? "Enviando…" : "Enviar enlace de recuperación" }}
          </button>
          <aside id="recovery-email-help" class="password-recovery-notice" aria-label="Información de recuperación">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5m0-8h.01" />
            </svg>
            <p>Si el correo está asociado a una cuenta activa, recibirás un enlace válido por 10 minutos. Puedes solicitar uno nuevo cada 2 minutos, con un máximo de 3 solicitudes por hora.</p>
          </aside>
        </form>

        <form
          v-else
          class="password-recovery-form"
          @submit.prevent="resetPassword"
        >
          <label for="recovery-password">Nueva contraseña</label>
          <div
            class="password-recovery-input"
            :class="{ 'has-error': recoveryPassword.length > 0 && !passwordMeetsRequirements }"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              id="recovery-password"
              v-model="recoveryPassword"
              type="password"
              name="new-password"
              autocomplete="new-password"
              minlength="12"
              maxlength="128"
              placeholder="Al menos 12 caracteres"
              :aria-invalid="recoveryPassword.length > 0 && !passwordMeetsRequirements"
              aria-describedby="password-requirements"
              required
            />
          </div>
          <ul id="password-requirements" class="password-requirements" aria-label="Requisitos de la contraseña">
            <li
              v-for="requirement in passwordRequirements"
              :key="requirement.label"
              :class="{ 'is-valid': requirement.valid }"
            >
              <span aria-hidden="true">{{ requirement.valid ? "✓" : "○" }}</span>
              {{ requirement.label }}
            </li>
          </ul>
          <label for="recovery-confirmation">Confirmar contraseña</label>
          <div
            class="password-recovery-input"
            :class="{ 'has-error': passwordsDoNotMatch }"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              id="recovery-confirmation"
              v-model="recoveryConfirmation"
              type="password"
              name="confirm-password"
              autocomplete="new-password"
              minlength="12"
              maxlength="128"
              placeholder="Repite la contraseña"
              :aria-invalid="passwordsDoNotMatch"
              :aria-describedby="passwordsDoNotMatch ? 'password-confirmation-error' : undefined"
              required
            />
          </div>
          <p v-if="passwordsDoNotMatch" id="password-confirmation-error" class="password-confirmation-error" role="status">
            Las contraseñas no coinciden.
          </p>
          <button class="password-recovery-submit" type="submit" :disabled="recoverySubmitting">
            {{ recoverySubmitting ? "Actualizando…" : "Guardar nueva contraseña" }}
          </button>
          <aside class="password-recovery-notice" aria-label="Vigencia del enlace">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <p>El enlace es de un solo uso y vence 10 minutos después de solicitarlo.</p>
          </aside>
        </form>

        <p v-if="recoveryMessage" class="password-recovery-message is-success" role="status">
          {{ recoveryMessage }}
        </p>
        <p v-if="recoveryError" class="password-recovery-message is-error" role="alert">
          {{ recoveryError }}
        </p>
        <button class="password-recovery-back" type="button" @click="closeRecovery">
          Volver al inicio de sesión
        </button>
      </section>
    </div>
  </main>
</template>
