<script setup lang="ts">
import { computed, ref, watch } from "vue";

type AccessAccount = {
  login: string;
  name: string | null;
  email: string | null;
  active: string | null;
  role: string | null;
  phone: string | null;
  sectionAccess: ("recepcion" | "anfitriones" | "administrador")[];
};

const props = defineProps<{
  accounts: AccessAccount[];
  isAdmin: boolean;
  search: string;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  edit: [account: AccessAccount];
}>();

const currentPage = ref(1);
const pageSize = 7;
const filteredAccounts = computed(() => {
  const query = props.search.trim().toLocaleLowerCase();
  if (!query) return props.accounts;
  return props.accounts.filter((account) =>
    [
      account.login,
      account.name ?? "",
      account.email ?? "",
      account.role ?? "",
      account.phone ?? "",
      account.sectionAccess.includes("administrador")
        ? "administrador"
        : account.sectionAccess.includes("recepcion")
          ? "recepción"
          : account.sectionAccess.includes("anfitriones")
            ? "anfitrión"
          : "sin acceso",
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query),
  );
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredAccounts.value.length / pageSize)));
const paginatedAccounts = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredAccounts.value.slice(start, start + pageSize);
});
const firstVisibleAccount = computed(() =>
  filteredAccounts.value.length === 0 ? 0 : (currentPage.value - 1) * pageSize + 1,
);
const lastVisibleAccount = computed(() =>
  Math.min(currentPage.value * pageSize, filteredAccounts.value.length),
);

watch(
  [() => props.search, () => props.accounts],
  () => {
    currentPage.value = 1;
  },
);
</script>

<template>
  <header class="panel-heading workspace-heading access-section-heading">
    <div class="panel-title access-section-title">
      <span class="access-section-icon">
        <svg class="icon"><use href="#i-shield" /></svg>
      </span>
      <div class="access-section-title-copy">
        <span class="access-section-eyebrow">Administración de cuentas</span>
        <h2 id="access-title">Accesos al sistema</h2>
      </div>
    </div>
    <div class="workspace-heading-actions">
      <span class="workspace-count access-account-count">
        <strong>{{ accounts.length }}</strong>
        {{ accounts.length === 1 ? "cuenta registrada" : "cuentas registradas" }}
      </span>
    </div>
  </header>
  <div class="access-intro">
    <span class="access-intro-label">Control de permisos</span>
    <p>
      Asigna a cada cuenta un perfil de Administrador, Recepción, Anfitrión o ninguno.
      <span>No se muestran contraseñas ni datos de activación.</span>
    </p>
  </div>
  <div class="external-staff-toolbar">
    <label class="agenda-search">
      <svg class="icon"><use href="#i-search" /></svg>
      <span class="sr-only">Buscar cuentas</span>
      <input
        :value="search"
        type="search"
        aria-label="Buscar cuentas"
        placeholder="Buscar por usuario, nombre, puesto o correo..."
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
  <div v-if="accounts.length > 0" class="workspace-table-scroll">
    <table class="workspace-table access-table">
      <caption class="workspace-table-caption access-table-caption">
        <span class="access-table-caption-title">Usuarios</span>
        <span class="access-table-caption-count">
          {{ firstVisibleAccount }}–{{ lastVisibleAccount }} de {{ filteredAccounts.length }}
          {{ filteredAccounts.length === 1 ? "cuenta" : "cuentas" }}
        </span>
      </caption>
      <thead>
        <tr>
          <th>Foto / Login</th><th>Nombre</th><th>Puesto (rol)</th>
          <th>Correo electrónico</th><th>Teléfono</th><th>Cuenta</th><th>Acceso</th>
          <th><span class="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="account in paginatedAccounts" :key="account.login">
          <td>
            <div class="host-identity">
              <span class="host-picture-avatar host-picture-placeholder" aria-hidden="true">
                <svg class="icon"><use href="#i-user" /></svg>
              </span>
              <strong>{{ account.login }}</strong>
            </div>
          </td>
          <td>{{ account.name || "—" }}</td>
          <td>{{ account.role || "—" }}</td>
          <td>{{ account.email || "—" }}</td>
          <td>{{ account.phone || "—" }}</td>
          <td>
            <span class="partner-status-pill" :class="['Y', '1'].includes(account.active ?? '') ? 'partner-status-activa' : 'partner-status-inactiva'">
              {{ ["Y", "1"].includes(account.active ?? "") ? "Activa" : "Inactiva" }}
            </span>
          </td>
          <td>
            <div class="host-state-pills">
              <span
                v-if="account.sectionAccess.includes('administrador')"
                class="access-role-pill access-role-admin"
              >Administrador</span>
              <span
                v-else-if="account.sectionAccess.includes('recepcion')"
                class="access-role-pill access-role-reception"
              >Recepción</span>
              <span
                v-else-if="account.sectionAccess.includes('anfitriones')"
                class="access-role-pill access-role-reception"
              >Anfitrión</span>
              <span
                v-else
                class="access-role-pill access-role-none"
              >Sin acceso</span>
            </div>
          </td>
          <td>
            <button
              v-if="isAdmin"
              class="staff-edit-button"
              type="button"
              :aria-label="`Editar control de acceso de ${account.login}`"
              @click="emit('edit', account)"
            >
              Editar acceso
            </button>
          </td>
        </tr>
        <tr v-if="filteredAccounts.length === 0">
          <td class="workspace-empty" colspan="8">No hay cuentas que coincidan con la búsqueda.</td>
        </tr>
      </tbody>
    </table>
  </div>
  <nav v-if="accounts.length > 0" class="directory-pagination access-pagination" aria-label="Paginación de accesos">
    <span>
      Mostrando {{ firstVisibleAccount }}–{{ lastVisibleAccount }} de {{ filteredAccounts.length }} cuentas
    </span>
    <div>
      <button
        class="pagination-button"
        type="button"
        :disabled="currentPage <= 1"
        @click="currentPage -= 1"
      >Anterior</button>
      <span class="pagination-current" aria-live="polite">{{ currentPage }} / {{ totalPages }}</span>
      <button
        class="pagination-button"
        type="button"
        :disabled="currentPage >= totalPages"
        @click="currentPage += 1"
      >Siguiente</button>
    </div>
  </nav>
  <p v-else class="workspace-hint">
    Inicia sesión con una cuenta administradora para consultar las cuentas externas.
  </p>
</template>
