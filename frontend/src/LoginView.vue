<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { apiFetch as fetch } from "./api";
import { useAuthStore } from "./stores/auth";
import { useDashboardStore } from "./stores/dashboard";
import type { AccessAccount, AuthenticatedUser } from "./stores/types";

const props = defineProps<{
  passwordResetToken?: string;
}>();

const tabletLandingQuery = window.matchMedia(
  "(orientation: landscape) and (min-width: 768px) and (any-pointer: coarse)",
);
const tabletLanding = ref(tabletLandingQuery.matches && !props.passwordResetToken);

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

function updateTabletLanding() {
  tabletLanding.value = tabletLandingQuery.matches && !props.passwordResetToken;
}

onMounted(() => {
  tabletLandingQuery.addEventListener("change", updateTabletLanding);
  updateTabletLanding();
});

onBeforeUnmount(() => {
  tabletLandingQuery.removeEventListener("change", updateTabletLanding);
});

watch(() => props.passwordResetToken, updateTabletLanding);

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
  <main class="login-page" :class="{ 'is-tablet-visitor-landing': tabletLanding }">
    <section class="image-panel" role="img" aria-label="Recepción de visitantes CyMEZ" :inert="tabletLanding">
      <div class="login-brand-group" aria-hidden="true">
        <div class="login-brand"></div>
        <p class="login-brand-tagline">Controla. Registra. <span>Accede.</span></p>
      </div>
    </section>

    <section class="login-panel" aria-labelledby="login-title" :inert="tabletLanding">
      <div class="panel-pattern" aria-hidden="true"></div>
      <div class="login-content">
        <section class="login-card" aria-labelledby="login-title">
          <header class="welcome-heading">
            <h1 id="login-title">Bienvenido de <span>nuevo</span></h1>
            <p>Inicia sesión para continuar</p>
          </header>

          <form class="login-form" @submit.prevent="handleLogin">
            <label class="login-visually-hidden" for="identifier">Usuario o correo electrónico</label>
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
                maxlength="255"
                required
              />
            </div>

            <div class="password-label">
              <label class="login-visually-hidden" for="password">Contraseña</label>
              <button class="recovery-link" type="button" @click="handlePasswordRecovery">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M6.7 6.1a1.4 1.4 0 1 1 2.4 1c-.7.7-1.1.9-1.1 1.9M8 11.4v.1" />
                </svg>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <div class="input-wrap password-input-wrap">
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
                maxlength="1024"
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
              <svg class="submit-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M13 5h6v14h-6" />
                <path d="M3 12h12m-4-4 4 4-4 4" />
              </svg>
              <span>{{ loginSubmitting ? "Validando..." : "Iniciar sesión" }}</span>
              <svg class="submit-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 10h13m-5-5 5 5-5 5" />
              </svg>
            </button>
            <p v-if="loginMessage" class="form-message" role="status">{{ loginMessage }}</p>
          </form>

          <div class="corporate-access">
            <div class="access-divider" aria-hidden="true">
              <span></span>
              <p>Registro de visitantes</p>
              <span></span>
            </div>
            <RouterLink class="access-notice access-notice-button" to="/registro">
              <svg class="access-notice-icon" viewBox="0 0 32 36" fill="none" aria-hidden="true">
                <path d="M16 3 4 8v9c0 7.7 4.7 13.1 12 16 7.3-2.9 12-8.3 12-16V8L16 3Z" />
                <path d="M16 11v12m-6-6h12" />
              </svg>
              <div class="access-notice-copy">
                <h2>Visitas sin cita</h2>
                <p>Registra tu visita sin iniciar sesión.</p>
              </div>
              <svg class="access-notice-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10h12m-5-5 5 5-5 5" />
              </svg>
            </RouterLink>
          </div>
        </section>
      </div>
    </section>

    <section class="tablet-visitor-landing" aria-label="Registro de visitas sin cita">
      <img
        class="tablet-visitor-landing-background"
        src="/images/visitor-tablet-landing-v3.webp"
        alt="CyMEZ Recep Visitantes"
        fetchpriority="high"
        decoding="async"
      />
      <RouterLink class="tablet-visitor-landing-button" to="/registro">
        <span class="tablet-visitor-landing-icon" aria-hidden="true">
          <img src="/images/visitor-exit-icon.webp" alt="" width="777" height="768" />
        </span>
        <span class="tablet-visitor-landing-copy">
          <strong>Visitas sin cita</strong>
          <small>Registra tu visita aquí</small>
        </span>
        <span class="tablet-visitor-landing-arrow" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="m12 6 10 10-10 10" />
          </svg>
        </span>
      </RouterLink>
      <footer class="tablet-visitor-landing-footer">
        <span></span>
        <p>CyMEZ RECEP <i aria-hidden="true"></i> CONTROL DE VISITAS</p>
        <span></span>
      </footer>
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
