<script setup lang="ts">
import { computed } from "vue";

type AccessAccount = {
  login: string;
  name: string | null;
  email: string | null;
  active: string | null;
  role: string | null;
  phone: string | null;
  picture: string;
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
          : "sin acceso",
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query),
  );
});
</script>

<template>
  <header class="panel-heading workspace-heading">
    <div class="panel-title">
      <svg class="icon"><use href="#i-shield" /></svg>
      <h2 id="access-title">Accesos al sistema</h2>
    </div>
    <div class="workspace-heading-actions">
      <span class="workspace-count">
        {{ accounts.length }} cuentas en accesos
      </span>
    </div>
  </header>
  <p class="access-intro">
    Asigna a cada cuenta Administrador, Recepción o ningún acceso. El permiso de anfitrión se administra desde su propia sección. No se muestran contraseñas ni datos de activación.
  </p>
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
        <span class="access-table-caption-title">Usuarios en accesos</span>
        <span class="access-table-caption-count">
          {{ filteredAccounts.length }} de {{ accounts.length }} cuentas
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
        <tr v-for="account in filteredAccounts" :key="account.login">
          <td>
            <div class="host-identity">
              <img v-if="account.picture" class="host-picture-avatar" :src="account.picture" alt="" />
              <span v-else class="host-picture-avatar host-picture-placeholder">
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
  <p v-else class="workspace-hint">
    Inicia sesión con una cuenta administradora para consultar las cuentas de la tabla `accesos`.
  </p>
</template>
