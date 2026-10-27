<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onBeforeUnmount, onMounted, ref } from "vue";
import DashboardView from "./DashboardView.vue";
import AppAlert from "./components/AppAlert.vue";
import LoginView from "./LoginView.vue";
import PublicEquipmentDeclaration from "./sections/PublicEquipmentDeclaration.vue";
import { useAuthStore } from "./stores/auth";
import { useDashboardStore } from "./stores/dashboard";
import type { AccessAccount, AuthenticatedUser } from "./stores/types";

const sessionChecking = ref(true);
const publicEquipmentToken = new URLSearchParams(window.location.hash.slice(1)).get("equipo");
const passwordResetToken = ref(
  new URLSearchParams(window.location.hash.slice(1)).get("restablecer") ?? "",
);
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
      const result = await response.json() as {
        user: AuthenticatedUser;
        accounts?: AccessAccount[];
      };
      authStore.setSession(result.user, result.accounts ?? []);
    }
  } catch (error) {
    console.error("No se pudo restaurar la sesión:", error);
  } finally {
    sessionChecking.value = false;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("hashchange", syncPasswordResetToken);
});
</script>

<template>
  <PublicEquipmentDeclaration v-if="publicEquipmentToken" />
  <LoginView
    v-else-if="passwordResetToken"
    :password-reset-token="passwordResetToken"
    @password-reset-complete="finishPasswordReset"
  />
  <main v-else-if="sessionChecking" class="session-loading" aria-label="Restaurando sesión"></main>
  <LoginView
    v-else-if="!user"
    :password-reset-token="passwordResetToken"
    @password-reset-complete="finishPasswordReset"
  />
  <DashboardView v-else @logout="closeSession" />
  <AppAlert />
</template>
