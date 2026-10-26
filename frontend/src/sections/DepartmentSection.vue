<script setup lang="ts">
import { computed } from "vue";

type Department = {
  id: number;
  name: string;
};

type Host = {
  departmentId: number;
};

const props = defineProps<{
  departments: Department[];
  hosts: Host[];
  isAdmin: boolean;
}>();

const departmentsWithHostCounts = computed(() =>
  props.departments.map((department) => ({
    ...department,
    hostCount: props.hosts.filter((host) => host.departmentId === department.id).length,
  })),
);

const emit = defineEmits<{
  create: [];
  edit: [department: Department];
  remove: [id: number];
}>();
</script>

<template>
  <section class="workspace-grid department-workspace">
    <section class="panel workspace-panel department-panel" aria-labelledby="departments-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-organization" /></svg>
          <h2 id="departments-title">Departamentos</h2>
        </div>
        <div class="workspace-heading-actions">
          <span class="workspace-count">
            {{ departments.length }} {{ departments.length === 1 ? "departamento" : "departamentos" }}
          </span>
          <button v-if="isAdmin" class="button-primary" type="button" @click="emit('create')">
            <svg class="icon"><use href="#i-plus" /></svg>
            <span>Registrar departamento</span>
          </button>
        </div>
      </header>
      <div v-if="departmentsWithHostCounts.length" class="department-card-grid">
        <article
          v-for="department in departmentsWithHostCounts"
          :key="department.id"
          class="department-card"
        >
          <div class="department-card-heading">
            <span class="department-card-icon">
              <svg class="icon"><use href="#i-organization" /></svg>
            </span>
            <span class="department-card-count">
              <strong>{{ department.hostCount }}</strong>
              <span>{{ department.hostCount === 1 ? "anfitrión vinculado" : "anfitriones vinculados" }}</span>
            </span>
          </div>
          <h3>{{ department.name }}</h3>
          <div v-if="isAdmin" class="department-card-actions">
            <button
              class="staff-edit-button"
              type="button"
              :aria-label="`Editar departamento ${department.name}`"
              @click="emit('edit', department)"
            >Editar</button>
            <button
              class="workspace-remove"
              type="button"
              :aria-label="`Eliminar departamento ${department.name}`"
              @click="emit('remove', department.id)"
            >Eliminar</button>
          </div>
        </article>
      </div>
      <div v-else class="department-empty-state">
        <span class="department-card-icon">
          <svg class="icon"><use href="#i-organization" /></svg>
        </span>
        <strong>Aún no hay departamentos</strong>
        <p>Registra un departamento para empezar a vincular anfitriones.</p>
      </div>
    </section>
  </section>
</template>
