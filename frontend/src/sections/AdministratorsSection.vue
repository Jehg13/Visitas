<script setup lang="ts">
import type { Administrator } from "../stores/types";

defineProps<{
  administrators: Administrator[];
}>();

const emit = defineEmits<{
  create: [];
  edit: [administrator: Administrator];
  remove: [administrator: Administrator];
}>();
</script>

<template>
  <section class="workspace-grid directory-workspace">
    <section class="panel workspace-panel directory-panel" aria-labelledby="administrators-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <span class="access-section-icon">
            <svg class="icon"><use href="#i-shield" /></svg>
          </span>
          <div class="access-section-title-copy">
            <span class="access-section-eyebrow">Cuentas de empresa</span>
            <h2 id="administrators-title">Administradores</h2>
          </div>
        </div>
        <div class="workspace-heading-actions">
          <span class="workspace-count">
            {{ administrators.length }} {{ administrators.length === 1 ? "administrador" : "administradores" }}
          </span>
          <button class="button-primary" type="button" @click="emit('create')">
            <svg class="icon"><use href="#i-plus" /></svg>
            <span>Registrar administrador</span>
          </button>
        </div>
      </header>

      <div v-if="administrators.length" class="workspace-table-scroll">
        <table class="workspace-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Empresa</th>
              <th>Correo electrónico</th>
              <th>Puesto</th>
              <th>Cuenta</th>
              <th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="administrator in administrators" :key="administrator.login">
              <td><strong>{{ administrator.login }}</strong></td>
              <td>{{ administrator.name || "—" }}</td>
              <td>{{ administrator.companyName }}</td>
              <td>{{ administrator.email || "—" }}</td>
              <td>{{ administrator.role || "—" }}</td>
              <td>
                <span
                  class="partner-status-pill"
                  :class="['Y', '1'].includes(administrator.active) ? 'partner-status-activa' : 'partner-status-inactiva'"
                >
                  {{ ["Y", "1"].includes(administrator.active) ? "Activa" : "Inactiva" }}
                </span>
              </td>
              <td>
                <div class="department-card-actions">
                  <button
                    class="staff-edit-button"
                    type="button"
                    :aria-label="`Editar administrador ${administrator.login}`"
                    @click="emit('edit', administrator)"
                  >Editar</button>
                  <button
                    class="workspace-remove"
                    type="button"
                    :aria-label="`Eliminar administrador ${administrator.login}`"
                    @click="emit('remove', administrator)"
                  >Eliminar</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="department-empty-state">
        <span class="department-card-icon">
          <svg class="icon"><use href="#i-shield" /></svg>
        </span>
        <strong>Aún no hay administradores</strong>
        <p>Registra un administrador y asígnalo a una empresa.</p>
      </div>
    </section>
  </section>
</template>
