<script setup lang="ts">
import { computed, ref, watch } from "vue";

type Department = {
  id: number;
  name: string;
};

type Host = {
  id: number;
  login: string;
  name: string;
  departmentId: number;
  role: string;
  email: string;
  phone: string;
  accessRoles: ("Administrador" | "Recepción" | "Anfitriones")[];
};

const props = defineProps<{
  hosts: Host[];
  filteredHosts: Host[];
  departments: Department[];
  eligibleDepartmentCount: number;
  search: string;
}>();

const page = ref(1);
const pageSize = 7;
const pages = computed(() => Math.max(1, Math.ceil(props.filteredHosts.length / pageSize)));
const paginatedHosts = computed(() =>
  props.filteredHosts.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch(
  () => props.filteredHosts,
  () => {
    page.value = 1;
  },
);

const emit = defineEmits<{
  "update:search": [value: string];
  create: [];
  edit: [host: Host];
  remove: [id: number];
}>();
</script>

<template>
  <section class="workspace-grid">
    <section class="panel workspace-panel" aria-labelledby="hosts-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-users" /></svg>
          <h2 id="hosts-title">Anfitriones</h2>
        </div>
        <div class="workspace-heading-actions">
          <span class="workspace-count">
            {{ filteredHosts.length }} {{ filteredHosts.length === 1 ? "cuenta" : "cuentas" }}
          </span>
          <button class="button-primary" type="button" @click="emit('create')">
            <svg class="icon"><use href="#i-plus" /></svg>
            <span>Registrar anfitrión</span>
          </button>
        </div>
      </header>
      <p v-if="eligibleDepartmentCount === 0" class="workspace-hint">
        Registra un departamento antes de asignar anfitriones.
      </p>
      <div class="external-staff-toolbar">
        <label class="agenda-search host-search">
          <svg class="icon"><use href="#i-search" /></svg>
          <span class="sr-only">Buscar anfitrión</span>
          <input
            :value="search"
            type="search"
            aria-label="Buscar anfitrión"
            placeholder="Buscar por usuario, departamento, puesto o correo..."
            @input="emit('update:search', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <div class="workspace-table-scroll">
        <table class="workspace-table host-table">
          <thead>
            <tr>
              <th>Login</th><th>Nombre completo</th><th>Correo electrónico</th>
              <th>Departamento</th><th>Puesto</th><th>Teléfono</th><th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="host in paginatedHosts" :key="host.id">
              <td><strong>{{ host.login }}</strong></td>
              <td>{{ host.name }}</td>
              <td>{{ host.email || "—" }}</td>
              <td>{{ departments.find((department) => department.id === host.departmentId)?.name ?? "No disponible" }}</td>
              <td>{{ host.role || "—" }}</td>
              <td>{{ host.phone || "—" }}</td>
              <td>
                <div class="staff-actions">
                  <button class="staff-edit-button" type="button" :aria-label="`Editar anfitrión ${host.login}`" @click="emit('edit', host)">
                    Editar
                  </button>
                  <button
                    class="workspace-remove"
                    type="button"
                    :aria-label="`Eliminar anfitrión ${host.login}`"
                    @click="emit('remove', host.id)"
                  >Eliminar</button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredHosts.length === 0">
              <td class="workspace-empty" colspan="7">
                {{ hosts.length === 0 ? "Todavía no hay anfitriones registrados." : "No hay anfitriones que coincidan con la búsqueda." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav
        v-if="filteredHosts.length > pageSize"
        class="directory-pagination"
        aria-label="Paginación de anfitriones"
      >
        <span>
          Mostrando {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, filteredHosts.length) }}
          de {{ filteredHosts.length }} anfitriones
        </span>
        <div>
          <button class="pagination-button" type="button" :disabled="page <= 1" @click="page--">Anterior</button>
          <span class="pagination-current" aria-live="polite">{{ page }} / {{ pages }}</span>
          <button class="pagination-button" type="button" :disabled="page >= pages" @click="page++">Siguiente</button>
        </div>
      </nav>
    </section>
  </section>
</template>
