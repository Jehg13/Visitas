<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Company, CompanyUser, Department } from "../stores/types";

const props = defineProps<{
  users: CompanyUser[];
  search: string;
  companyName: string;
  companies: Company[];
  departments: Department[];
  companyId: number | null;
  canSelectCompany: boolean;
  canManageDepartments: boolean;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  "update:companyId": [value: number | null];
  create: [];
  createDepartment: [];
  edit: [user: CompanyUser];
  remove: [user: CompanyUser];
}>();

const currentPage = ref(1);
const pageSize = 8;
const filteredUsers = computed(() => {
  const query = props.search.trim().toLocaleLowerCase();
  if (!query) return props.users;
  return props.users.filter((user) =>
    [
      user.login,
      user.name ?? "",
      user.email ?? "",
      user.role ?? "",
      user.applicationRole === "recepcion" ? "recepción recepcionista" : "anfitrión anfitrion",
      user.departmentName ?? "",
    ].join(" ").toLocaleLowerCase().includes(query),
  );
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / pageSize)));
const visibleUsers = computed(() =>
  filteredUsers.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize),
);

watch([() => props.search, () => props.users], () => {
  currentPage.value = 1;
});
</script>

<template>
  <header class="panel-heading workspace-heading">
    <div class="panel-title">
      <span class="access-section-icon"><svg class="icon"><use href="#i-users" /></svg></span>
      <div class="access-section-title-copy">
        <span class="access-section-eyebrow">Personal y permisos</span>
        <h2 id="company-users-title">Usuarios de empresa</h2>
      </div>
    </div>
    <div class="workspace-heading-actions">
      <label v-if="canSelectCompany" class="company-users-company-select">
        <span class="sr-only">Empresa seleccionada</span>
        <select
          :value="companyId ?? ''"
          aria-label="Empresa para gestionar usuarios"
          @change="emit('update:companyId', ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"
        >
          <option value="" disabled>Selecciona empresa</option>
          <option v-for="company in companies" :key="company.id" :value="company.id">{{ company.name }}</option>
        </select>
      </label>
      <span class="workspace-count"><strong>{{ users.length }}</strong> usuarios</span>
      <button
        class="button-primary"
        type="button"
        :disabled="companyId === null || departments.length === 0"
        @click="emit('create')"
      >Agregar usuario</button>
    </div>
  </header>

  <div v-if="companyId === null" class="department-empty-state">
    <strong>Selecciona una empresa</strong>
    <p>Selecciona la empresa cuyos usuarios quieres administrar.</p>
  </div>
  <div v-else-if="departments.length === 0" class="department-empty-state">
    <strong>Primero registra un departamento</strong>
    <p>Debes tener al menos un departamento dado de alta para poder registrar usuarios en {{ companyName }}.</p>
    <button
      v-if="canManageDepartments"
      class="button-primary"
      type="button"
      @click="emit('createDepartment')"
    >Registrar departamento</button>
  </div>
  <p class="workspace-hint">
    Administra recepcionistas y anfitriones de <strong>{{ companyName }}</strong>. Asigna a cada usuario un departamento. Las cuentas nuevas recibirán una contraseña temporal que deberán cambiar al ingresar.
  </p>
  <div class="external-staff-toolbar">
    <label class="agenda-search">
      <svg class="icon"><use href="#i-search" /></svg>
      <span class="sr-only">Buscar usuarios de empresa</span>
      <input
        :value="search"
        type="search"
        aria-label="Buscar usuarios de empresa"
        placeholder="Buscar por usuario, nombre, departamento..."
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>

  <div v-if="users.length" class="workspace-table-scroll">
    <table class="workspace-table">
      <thead>
        <tr>
          <th>Usuario</th><th>Nombre</th><th>Correo</th><th>Perfil</th>
          <th>Departamento</th><th>Estado</th><th><span class="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in visibleUsers" :key="user.login">
          <td><strong>{{ user.login }}</strong></td>
          <td>{{ user.name || "—" }}</td>
          <td>{{ user.email || "—" }}</td>
          <td>{{ user.applicationRole === "recepcion" ? "Recepción" : "Anfitrión" }}</td>
          <td>{{ user.departmentName || "—" }}</td>
          <td>
            <span class="partner-status-pill" :class="['Y', '1'].includes(user.active) ? 'partner-status-activa' : 'partner-status-inactiva'">
              {{ ["Y", "1"].includes(user.active) ? "Activa" : "Inactiva" }}
            </span>
          </td>
          <td>
            <div class="staff-actions">
              <button class="staff-edit-button" type="button" @click="emit('edit', user)">Editar</button>
              <button class="workspace-remove" type="button" @click="emit('remove', user)">Eliminar</button>
            </div>
          </td>
        </tr>
        <tr v-if="filteredUsers.length === 0">
          <td class="workspace-empty" colspan="7">No hay usuarios que coincidan con la búsqueda.</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p v-else class="workspace-empty">Todavía no hay usuarios registrados en esta empresa.</p>

  <nav v-if="filteredUsers.length > pageSize" class="directory-pagination" aria-label="Paginación de usuarios de empresa">
    <span>Mostrando {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredUsers.length) }} de {{ filteredUsers.length }}</span>
    <div>
      <button class="pagination-button" type="button" :disabled="currentPage <= 1" @click="currentPage -= 1">Anterior</button>
      <span class="pagination-current" aria-live="polite">{{ currentPage }} / {{ totalPages }}</span>
      <button class="pagination-button" type="button" :disabled="currentPage >= totalPages" @click="currentPage += 1">Siguiente</button>
    </div>
  </nav>
</template>
