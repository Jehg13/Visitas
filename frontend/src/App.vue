<script setup lang="ts">
import { ref } from "vue";

const identifier = ref("");
const password = ref("");
const showPassword = ref(false);
const message = ref("");

function handleSubmit() {
  message.value =
    "El acceso todavía no está conectado. La autenticación se configurará en el siguiente paso.";
}

function handlePasswordRecovery() {
  message.value =
    "La recuperación de contraseña todavía no está disponible.";
}
</script>

<template>
  <main class="login-page">
    <section class="image-panel" aria-label="CyMEZ Recep Visitantes">
      <img
        class="brand-image"
        src="/images/cymez-recep-logo.png"
        alt="CyMEZ Recep Visitantes"
      />
    </section>

    <section class="login-panel" aria-labelledby="welcome-title">
      <div class="panel-pattern" aria-hidden="true"></div>
      <div class="login-content">
        <header class="welcome-heading">
          <h1 id="welcome-title">Bienvenido de nuevo</h1>
          <p>Inicia sesión para continuar</p>
        </header>
        <div class="login-card">
          <header class="card-heading">
            <div class="card-heading-copy">
              <h2>Iniciar sesión</h2>
            </div>
            <span class="card-heading-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
          </header>
          <form class="login-form" @submit.prevent="handleSubmit">
            <div class="field-label">
              <label for="identifier">Usuario o correo electrónico</label>
            </div>
            <div class="input-wrap">
              <svg
                class="input-icon"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
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
              <button
                class="recovery-link"
                type="button"
                @click="handlePasswordRecovery"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <div class="input-wrap">
              <svg
                class="input-icon"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
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
                <svg
                  v-if="!showPassword"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15 15 0 0 1-3 3.5M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.4 6 9.5 6c1 0 1.9-.2 2.7-.5" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              </button>
            </div>

            <button class="submit-button" type="submit">
              <span>Iniciar sesión</span>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10h12m-5-5 5 5-5 5" />
              </svg>
            </button>

            <p v-if="message" class="form-message" role="status">
              {{ message }}
            </p>
          </form>
        </div>
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
  </main>
</template>
