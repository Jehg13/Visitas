<script setup lang="ts">
type Partner = {
  id: number;
  name: string;
  description: string;
  rfc: string;
  category: string;
  subject: string;
  employeeCount: number;
  type: "Contratista" | "Proveedor" | "Visitante";
  status: "Activa" | "Inactiva" | "No aplica";
};

defineProps<{
  businessPartners: Partner[];
  filteredBusinessPartners: Partner[];
  paginatedBusinessPartners: Partner[];
  businessPartnerSearch: string;
  businessPartnerTypeFilter: "Todas" | Partner["type"];
  businessPartnerCategories: string[];
  businessPartnerCategoryFilter: string;
  businessPartnerStatusFilter: "Todas" | Partner["status"];
  businessPartnerPage: number;
  businessPartnerPages: number;
  partnerRowsPerPage: number;
  loading: boolean;
  businessPartnerSaving: boolean;
}>();

const emit = defineEmits<{
  "update:businessPartnerSearch": [value: string];
  "update:businessPartnerTypeFilter": [value: "Todas" | Partner["type"]];
  "update:businessPartnerCategoryFilter": [value: string];
  "update:businessPartnerStatusFilter": [value: "Todas" | Partner["status"]];
  "update:businessPartnerPage": [value: number];
  createPartner: [];
  editPartner: [partner: Partner];
  removePartner: [id: number];
}>();
</script>

<template>
  <section class="workspace-grid directory-workspace">
    <section class="panel workspace-panel directory-panel" aria-labelledby="business-partners-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-building" /></svg>
          <h2 id="business-partners-title">Contratistas, proveedores y visitantes</h2>
        </div>
        <div class="workspace-heading-actions">
          <span class="workspace-count">{{ filteredBusinessPartners.length }} registros</span>
          <button class="button-primary" type="button" @click="emit('createPartner')">
            <svg class="icon"><use href="#i-plus" /></svg>
            <span>Registrar</span>
          </button>
        </div>
      </header>
      <div class="directory-toolbar">
        <label class="agenda-search">
          <svg class="icon"><use href="#i-search" /></svg>
          <span class="sr-only">Buscar contratistas, proveedores y visitantes</span>
          <input
            :value="businessPartnerSearch"
            type="search"
            aria-label="Buscar contratistas, proveedores y visitantes"
            placeholder="Buscar por nombre, RFC, categoría, descripción o asunto..."
            @input="emit('update:businessPartnerSearch', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="directory-filter">
          <span>Tipo</span>
          <select :value="businessPartnerTypeFilter" aria-label="Filtrar registros por tipo" @change="emit('update:businessPartnerTypeFilter', ($event.target as HTMLSelectElement).value as 'Todas' | Partner['type'])">
            <option value="Todas">Todos</option>
            <option value="Contratista">Contratistas</option>
            <option value="Proveedor">Proveedores</option>
            <option value="Visitante">Visitantes</option>
          </select>
        </label>
        <label class="directory-filter">
          <span>Categoría</span>
          <select :value="businessPartnerCategoryFilter" aria-label="Filtrar registros por categoría" @change="emit('update:businessPartnerCategoryFilter', ($event.target as HTMLSelectElement).value)">
            <option value="Todas">Todas</option>
            <option v-for="category in businessPartnerCategories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
        </label>
        <label class="directory-filter">
          <span>Estado</span>
          <select :value="businessPartnerStatusFilter" aria-label="Filtrar registros por estado" @change="emit('update:businessPartnerStatusFilter', ($event.target as HTMLSelectElement).value as 'Todas' | Partner['status'])">
            <option value="Todas">Todos</option>
            <option value="Activa">Activas</option>
            <option value="Inactiva">Inactivas</option>
            <option value="No aplica">No aplica</option>
          </select>
        </label>
      </div>
      <div class="workspace-table-scroll">
        <table class="workspace-table business-partner-table">
          <thead>
            <tr><th>Nombre</th><th>Descripción</th><th>RFC</th><th>Categoría</th><th>Asunto</th><th>Empleados</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            <tr v-for="partner in paginatedBusinessPartners" :key="partner.id">
              <td><strong>{{ partner.name }}</strong><small>{{ partner.type }}</small></td>
              <td>
                <span
                  class="business-partner-description"
                  :title="partner.description || undefined"
                >{{ partner.description || "—" }}</span>
              </td>
              <td>{{ partner.rfc }}</td>
              <td>{{ partner.category }}</td>
              <td>{{ partner.type === "Visitante" ? partner.subject || "—" : "—" }}</td>
              <td>{{ partner.employeeCount }}</td>
              <td>
                <span
                  class="partner-status-pill"
                  :class="partner.status === 'No aplica' ? '' : `partner-status-${partner.status.toLowerCase()}`"
                >{{ partner.status }}</span>
              </td>
              <td>
                <div class="staff-actions">
                  <button class="staff-edit-button" type="button" :disabled="businessPartnerSaving || loading" :aria-label="`Editar ${partner.name}`" @click="emit('editPartner', partner)">Editar</button>
                  <button class="workspace-remove" type="button" :disabled="businessPartnerSaving || loading" :aria-label="`Eliminar ${partner.name}`" @click="emit('removePartner', partner.id)">Eliminar</button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredBusinessPartners.length === 0">
              <td class="workspace-empty" colspan="8">
                {{ loading ? "Cargando registros..." : businessPartners.length === 0 ? "Aún no hay contratistas, proveedores o visitantes registrados." : "No hay registros que coincidan con los filtros." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav v-if="filteredBusinessPartners.length > partnerRowsPerPage" class="directory-pagination" aria-label="Paginación del directorio">
        <span>
          Mostrando {{ (businessPartnerPage - 1) * partnerRowsPerPage + 1 }}–{{
            Math.min(businessPartnerPage * partnerRowsPerPage, filteredBusinessPartners.length)
          }} de {{ filteredBusinessPartners.length }} registros
        </span>
        <div>
          <button class="pagination-button" type="button" :disabled="businessPartnerPage === 1" @click="emit('update:businessPartnerPage', businessPartnerPage - 1)">Anterior</button>
          <span class="pagination-current">{{ businessPartnerPage }} / {{ businessPartnerPages }}</span>
          <button class="pagination-button" type="button" :disabled="businessPartnerPage === businessPartnerPages" @click="emit('update:businessPartnerPage', businessPartnerPage + 1)">Siguiente</button>
        </div>
      </nav>
    </section>
  </section>
</template>
