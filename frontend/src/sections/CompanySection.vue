<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Company, Department, Host } from "../stores/types";

const props = defineProps<{
  companies: Company[];
  departments: Department[];
  hosts: Host[];
  isAdmin: boolean;
  canManageDepartments: boolean;
}>();

const emit = defineEmits<{
  createCompany: [];
  editCompany: [company: Company];
  removeCompany: [companyId: number];
  createDepartment: [companyId: number];
  editDepartment: [department: Department];
  removeDepartment: [departmentId: number];
}>();

const selectedCompanyId = ref<number | null>(null);
const selectedDepartmentId = ref<number | null>(null);
const selectedCompany = computed(() =>
  props.companies.find((company) => company.id === selectedCompanyId.value) ?? null,
);
const companyDepartments = computed(() =>
  props.departments.filter((department) => department.companyId === selectedCompanyId.value),
);
const selectedDepartment = computed(() =>
  companyDepartments.value.find((department) => department.id === selectedDepartmentId.value) ?? null,
);
const assignedHosts = computed(() =>
  props.hosts.filter((host) => host.departmentId === selectedDepartmentId.value),
);

watch(
  () => props.companies.map((company) => company.id),
  (companyIds) => {
    if (selectedCompanyId.value !== null && !companyIds.includes(selectedCompanyId.value)) {
      selectedCompanyId.value = null;
      selectedDepartmentId.value = null;
    }
  },
);

watch(
  () => props.departments.map((department) => department.id),
  (departmentIds) => {
    if (selectedDepartmentId.value !== null && !departmentIds.includes(selectedDepartmentId.value)) {
      selectedDepartmentId.value = null;
    }
  },
);
</script>

<template>
  <section class="workspace-grid department-workspace">
    <section class="panel workspace-panel department-panel" aria-labelledby="companies-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <button
            v-if="selectedDepartment"
            class="company-directory-back"
            type="button"
            @click="selectedDepartmentId = null"
          >
            <svg class="icon"><use href="#i-chevron" /></svg>
            Departamentos
          </button>
          <button
            v-else-if="selectedCompany"
            class="company-directory-back"
            type="button"
            @click="selectedCompanyId = null"
          >
            <svg class="icon"><use href="#i-chevron" /></svg>
            Empresas
          </button>
          <svg v-else class="icon"><use href="#i-building" /></svg>
          <h2 id="companies-title">
            {{ selectedDepartment?.name ?? selectedCompany?.name ?? "Empresas" }}
          </h2>
        </div>
        <div class="workspace-heading-actions">
          <template v-if="selectedDepartment">
            <span class="workspace-count">
              {{ assignedHosts.length }} {{ assignedHosts.length === 1 ? "usuario asignado" : "usuarios asignados" }}
            </span>
          </template>
          <template v-else-if="selectedCompany">
            <span class="workspace-count">
              {{ companyDepartments.length }} {{ companyDepartments.length === 1 ? "departamento" : "departamentos" }}
            </span>
            <button
              v-if="isAdmin || canManageDepartments"
              class="button-primary"
              type="button"
              @click="emit('createDepartment', selectedCompany.id)"
            >
              <svg class="icon"><use href="#i-plus" /></svg>
              <span>Registrar departamento</span>
            </button>
          </template>
          <template v-else>
            <span class="workspace-count">
              {{ companies.length }} {{ companies.length === 1 ? "empresa" : "empresas" }}
            </span>
            <button v-if="isAdmin" class="button-primary" type="button" @click="emit('createCompany')">
              <svg class="icon"><use href="#i-plus" /></svg>
              <span>Registrar empresa</span>
            </button>
          </template>
        </div>
      </header>

      <div v-if="!selectedCompany" class="department-card-grid">
        <article
          v-for="company in companies"
          :key="company.id"
          class="department-card company-directory-card"
        >
          <button
            class="company-directory-card-main"
            type="button"
            @click="selectedCompanyId = company.id"
          >
            <span class="department-card-icon">
              <svg class="icon"><use href="#i-building" /></svg>
            </span>
            <span class="company-directory-card-copy">
              <strong>{{ company.name }}</strong>
              <span>
                {{ company.departmentCount }}
                {{ company.departmentCount === 1 ? "departamento" : "departamentos" }}
              </span>
            </span>
            <svg class="icon company-directory-card-chevron"><use href="#i-chevron" /></svg>
          </button>
          <div v-if="isAdmin || canManageDepartments" class="department-card-actions">
            <button
              class="staff-edit-button"
              type="button"
              :aria-label="`Editar empresa ${company.name}`"
              @click="emit('editCompany', company)"
            >Editar</button>
            <button
              class="workspace-remove"
              type="button"
              :aria-label="`Eliminar empresa ${company.name}`"
              @click="emit('removeCompany', company.id)"
            >Eliminar</button>
          </div>
        </article>
        <div v-if="companies.length === 0" class="department-empty-state">
          <span class="department-card-icon">
            <svg class="icon"><use href="#i-building" /></svg>
          </span>
          <strong>Aún no hay empresas</strong>
          <p>Registra una empresa para organizar sus departamentos.</p>
        </div>
      </div>

      <div v-else-if="selectedCompany && !selectedDepartment" class="department-card-grid">
        <article
          v-for="department in companyDepartments"
          :key="department.id"
          class="department-card company-directory-card"
        >
          <button
            class="company-directory-card-main"
            type="button"
            @click="selectedDepartmentId = department.id"
          >
            <span class="department-card-icon">
              <svg class="icon"><use href="#i-organization" /></svg>
            </span>
            <span class="company-directory-card-copy">
              <strong>{{ department.name }}</strong>
              <span>
                {{ department.hostCount ?? 0 }}
                {{ department.hostCount === 1 ? "usuario asignado" : "usuarios asignados" }}
              </span>
            </span>
            <svg class="icon company-directory-card-chevron"><use href="#i-chevron" /></svg>
          </button>
          <div v-if="isAdmin" class="department-card-actions">
            <button
              class="staff-edit-button"
              type="button"
              :aria-label="`Editar departamento ${department.name}`"
              @click="emit('editDepartment', department)"
            >Editar</button>
            <button
              class="workspace-remove"
              type="button"
              :aria-label="`Eliminar departamento ${department.name}`"
              @click="emit('removeDepartment', department.id)"
            >Eliminar</button>
          </div>
        </article>
        <div v-if="companyDepartments.length === 0" class="department-empty-state">
          <span class="department-card-icon">
            <svg class="icon"><use href="#i-organization" /></svg>
          </span>
          <strong>Aún no hay departamentos</strong>
          <p>Registra un departamento para empezar a organizar la empresa.</p>
        </div>
      </div>

      <div v-else-if="selectedDepartment" class="department-users">
        <p class="department-users-intro">
          Usuarios actualmente vinculados a {{ selectedDepartment.name }} en {{ selectedCompany?.name }}.
        </p>
        <div v-if="assignedHosts.length" class="workspace-table-scroll">
          <table class="workspace-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Puesto</th>
                <th>Acceso</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="host in assignedHosts" :key="host.id">
                <td>{{ host.name }}</td>
                <td>{{ host.login }}</td>
                <td>{{ host.role || "N/A" }}</td>
                <td>{{ host.accessRoles.join(" · ") }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="department-empty-state">
          <span class="department-card-icon">
            <svg class="icon"><use href="#i-users" /></svg>
          </span>
          <strong>Aún no hay usuarios asignados</strong>
          <p>Los anfitriones se registran desde Usuarios de empresa y se asignan a un departamento.</p>
        </div>
      </div>
    </section>
  </section>
</template>
