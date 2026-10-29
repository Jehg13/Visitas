<script setup lang="ts">
import { computed, defineAsyncComponent, watch } from "vue";
import { storeToRefs } from "pinia";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import AppAlert from "./components/AppAlert.vue";
import { useAuthStore } from "./stores/auth";
import { useDashboardStore } from "./stores/dashboard";
import type { AccessAccount, AuthenticatedUser } from "./stores/types";

const DashboardView = defineAsyncComponent(() => import("./DashboardView.vue"));
const LoginView = defineAsyncComponent(() => import("./LoginView.vue"));
const PublicEquipmentDeclaration = defineAsyncComponent(() =>
  import("./sections/PublicEquipmentDeclaration.vue"),
);
const PublicVisitorKiosk = defineAsyncComponent(() =>
  import("./sections/PublicVisitorKiosk.vue"),
);
const sessionChecking = ref(true);
const route = useRoute();
const visitorKioskRoute = computed(() => route.path === "/registro");
const publicEquipmentToken = new URLSearchParams(window.location.hash.slice(1)).get("equipo");
const passwordResetToken = ref(
  new URLSearchParams(window.location.hash.slice(1)).get("restablecer") ?? "",
);
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
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = metadata.description;
  const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (robots) robots.content = user.value || publicEquipmentToken || passwordResetToken.value
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
      const result = await response.json() as {
        user: AuthenticatedUser | null;
        accounts?: AccessAccount[];
      };
      if (result.user) authStore.setSession(result.user, result.accounts ?? []);
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
  <PublicVisitorKiosk v-if="visitorKioskRoute" />
  <PublicEquipmentDeclaration v-else-if="publicEquipmentToken" />
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
