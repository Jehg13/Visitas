<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { listenForAlerts, type AppAlertPayload } from "../notifications";

const alert = ref<AppAlertPayload | null>(null);
const dashboardTheme = ref<"dark" | "light">("dark");
const closeButton = ref<HTMLButtonElement | null>(null);
let removeAlertListener: (() => void) | null = null;
let dismissTimer: number | undefined;

const title = computed(() => {
  if (alert.value?.type === "success") return "Operación completada";
  if (alert.value?.type === "info") return "Aviso";
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

function show(nextAlert: AppAlertPayload) {
  if (alert.value?.resolve) alert.value.resolve(false);
  const activeTheme = document.querySelector<HTMLElement>(".dashboard-app")?.dataset.theme;
  dashboardTheme.value = activeTheme === "light" ? "light" : "dark";
  alert.value = nextAlert;
  if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
  dismissTimer = nextAlert.type === "success"
    ? window.setTimeout(dismiss, 3200)
    : undefined;
  void nextTick(() => closeButton.value?.focus());
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && alert.value) dismiss();
}

onMounted(() => {
  removeAlertListener = listenForAlerts(show);
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  dismiss(false);
  removeAlertListener?.();
  window.removeEventListener("keydown", handleKeydown);
  if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="app-alert">
      <div v-if="alert" class="app-alert-backdrop" @click.self="dismiss()">
        <section
          class="app-alert-dialog"
          :class="[`is-${alert.type}`, `theme-${dashboardTheme}`]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="app-alert-title"
          aria-describedby="app-alert-message"
        >
          <span class="app-alert-icon" aria-hidden="true">
            <svg v-if="alert.type === 'success'" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" />
              <path d="m14 24 7 7 14-15" />
            </svg>
            <svg v-else-if="alert.type === 'info'" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" />
              <path d="M24 21v12m0-20h.02" />
            </svg>
            <svg v-else viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" />
              <path d="m17 17 14 14m0-14L17 31" />
            </svg>
          </span>
          <h2 id="app-alert-title">{{ title }}</h2>
          <p id="app-alert-message">{{ alert.message }}</p>
          <div class="app-alert-actions">
            <button
              v-if="alert.resolve"
              class="app-alert-cancel"
              type="button"
              @click="dismiss(false)"
            >
              {{ alert.cancelLabel ?? "Cancelar" }}
            </button>
            <button
              ref="closeButton"
              type="button"
              @click="dismiss(alert.resolve ? true : false)"
            >
              {{ alert.resolve ? (alert.confirmLabel ?? "Confirmar") : alert.type === "success" ? "Continuar" : "Entendido" }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
