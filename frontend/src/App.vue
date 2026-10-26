<script setup lang="ts">
import { onMounted, ref } from "vue";
import DashboardView from "./DashboardView.vue";
import LoginView from "./LoginView.vue";
import PublicEquipmentDeclaration from "./sections/PublicEquipmentDeclaration.vue";

type AuthenticatedUser = {
  login: string;
  name: string | null;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
  sectionAccess: ("recepcion" | "anfitriones" | "administrador")[];
};

type AccessAccount = {
  login: string;
  name: string | null;
  email: string | null;
  active: string | null;
  role: string | null;
  phone: string | null;
  hasFullAccess: boolean;
  picture: string;
  sectionAccess: ("recepcion" | "anfitriones" | "administrador")[];
};

const sessionChecking = ref(true);
const publicEquipmentToken = new URLSearchParams(window.location.hash.slice(1)).get("equipo");
const user = ref<AuthenticatedUser | null>(null);
const accounts = ref<AccessAccount[]>([]);

function acceptLogin(result: { user: AuthenticatedUser; accounts: AccessAccount[] }) {
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
      const result = await response.json() as {
        user: AuthenticatedUser;
        accounts?: AccessAccount[];
      };
      user.value = result.user;
      accounts.value = result.accounts ?? [];
    }
  } catch (error) {
    console.error("No se pudo restaurar la sesión:", error);
  } finally {
    sessionChecking.value = false;
  }
});
</script>

<template>
  <PublicEquipmentDeclaration v-if="publicEquipmentToken" />
  <main v-else-if="sessionChecking" class="session-loading" aria-label="Restaurando sesión"></main>
  <LoginView v-else-if="!user" @authenticated="acceptLogin" />
  <DashboardView v-else :user="user" :accounts="accounts" />
</template>
