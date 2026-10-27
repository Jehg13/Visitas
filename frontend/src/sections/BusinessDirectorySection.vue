<script setup lang="ts">
type Partner = {
  id: number;
  name: string;
  description: string;
  rfc: string;
  category: string;
  employeeCount: number;
  type: "Contratista" | "Proveedor";
  status: "Activa" | "Inactiva";
};
type Visitor = {
  id: number;
  fullName: string;
  curp: string;
  phone: string;
  email: string;
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
  generalVisitorSaving: boolean;
  generalVisitors: Visitor[];
  filteredGeneralVisitors: Visitor[];
  paginatedGeneralVisitors: Visitor[];
  generalVisitorSearch: string;
  generalVisitorCurpFilter: "Todas" | "Con CURP" | "Sin CURP";
  generalVisitorPage: number;
  generalVisitorPages: number;
}>();

const emit = defineEmits<{
  "update:businessPartnerSearch": [value: string];
  "update:businessPartnerTypeFilter": [value: "Todas" | Partner["type"]];
  "update:businessPartnerCategoryFilter": [value: string];
  "update:businessPartnerStatusFilter": [value: "Todas" | Partner["status"]];
  "update:businessPartnerPage": [value: number];
  "update:generalVisitorSearch": [value: string];
  "update:generalVisitorCurpFilter": [value: "Todas" | "Con CURP" | "Sin CURP"];
  "update:generalVisitorPage": [value: number];
  createPartner: [];
  editPartner: [partner: Partner];
  removePartner: [id: number];
  createVisitor: [];
  editVisitor: [visitor: Visitor];
  removeVisitor: [id: number];
}>();
</script>

<template>
  <section class="workspace-grid directory-workspace">
    <section class="panel workspace-panel directory-panel" aria-labelledby="business-partners-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-building" /></svg>
          <h2 id="business-partners-title">Contratistas y proveedores</h2>
        </div>
        <div class="workspace-heading-actions">
          <span class="workspace-count">{{ filteredBusinessPartners.length }} empresas</span>
          <button class="button-primary" type="button" @click="emit('createPartner')">
            <svg class="icon"><use href="#i-plus" /></svg>
            <span>Registrar empresa</span>
          </button>
        </div>
      </header>
      <div class="directory-toolbar">
        <label class="agenda-search">
          <svg class="icon"><use href="#i-search" /></svg>
          <span class="sr-only">Buscar contratistas y proveedores</span>
          <input
            :value="businessPartnerSearch"
            type="search"
            aria-label="Buscar contratistas y proveedores"
            placeholder="Buscar por nombre, RFC, categoría o descripción..."
            @input="emit('update:businessPartnerSearch', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="directory-filter">
          <span>Tipo</span>
          <select :value="businessPartnerTypeFilter" aria-label="Filtrar empresas por tipo" @change="emit('update:businessPartnerTypeFilter', ($event.target as HTMLSelectElement).value as 'Todas' | Partner['type'])">
            <option value="Todas">Todos</option>
            <option value="Contratista">Contratistas</option>
            <option value="Proveedor">Proveedores</option>
          </select>
        </label>
        <label class="directory-filter">
          <span>Categoría</span>
          <select :value="businessPartnerCategoryFilter" aria-label="Filtrar empresas por categoría" @change="emit('update:businessPartnerCategoryFilter', ($event.target as HTMLSelectElement).value)">
            <option value="Todas">Todas</option>
            <option v-for="category in businessPartnerCategories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
        </label>
        <label class="directory-filter">
          <span>Estado</span>
          <select :value="businessPartnerStatusFilter" aria-label="Filtrar empresas por estado" @change="emit('update:businessPartnerStatusFilter', ($event.target as HTMLSelectElement).value as 'Todas' | Partner['status'])">
            <option value="Todas">Todos</option>
            <option value="Activa">Activas</option>
            <option value="Inactiva">Inactivas</option>
          </select>
        </label>
      </div>
      <div class="workspace-table-scroll">
        <table class="workspace-table business-partner-table">
          <thead>
            <tr><th>Nombre</th><th>Descripción</th><th>RFC</th><th>Categoría</th><th>Empleados</th><th>Estado</th><th>Acciones</th></tr>
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
              <td>{{ partner.employeeCount }}</td>
              <td>
                <span class="partner-status-pill" :class="`partner-status-${partner.status.toLowerCase()}`">{{ partner.status }}</span>
              </td>
              <td>
                <div class="staff-actions">
                  <button class="staff-edit-button" type="button" :disabled="businessPartnerSaving || loading" :aria-label="`Editar ${partner.name}`" @click="emit('editPartner', partner)">Editar</button>
                  <button class="workspace-remove" type="button" :disabled="businessPartnerSaving || loading" :aria-label="`Eliminar ${partner.name}`" @click="emit('removePartner', partner.id)">Eliminar</button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredBusinessPartners.length === 0">
              <td class="workspace-empty" colspan="7">
                {{ loading ? "Cargando empresas..." : businessPartners.length === 0 ? "Aún no hay contratistas o proveedores registrados." : "No hay empresas que coincidan con los filtros." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav v-if="filteredBusinessPartners.length > partnerRowsPerPage" class="directory-pagination" aria-label="Paginación de contratistas y proveedores">
        <span>
          Mostrando {{ (businessPartnerPage - 1) * partnerRowsPerPage + 1 }}–{{
            Math.min(businessPartnerPage * partnerRowsPerPage, filteredBusinessPartners.length)
          }} de {{ filteredBusinessPartners.length }} empresas
        </span>
        <div>
          <button class="pagination-button" type="button" :disabled="businessPartnerPage === 1" @click="emit('update:businessPartnerPage', businessPartnerPage - 1)">Anterior</button>
          <span class="pagination-current">{{ businessPartnerPage }} / {{ businessPartnerPages }}</span>
          <button class="pagination-button" type="button" :disabled="businessPartnerPage === businessPartnerPages" @click="emit('update:businessPartnerPage', businessPartnerPage + 1)">Siguiente</button>
        </div>
      </nav>
    </section>

    <section class="panel workspace-panel directory-panel" aria-labelledby="general-visitors-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-people" /></svg>
          <h2 id="general-visitors-title">Público general</h2>
        </div>
        <div class="workspace-heading-actions">
          <span class="workspace-count">{{ filteredGeneralVisitors.length }} personas</span>
          <button class="button-primary" type="button" @click="emit('createVisitor')">
            <svg class="icon"><use href="#i-plus" /></svg>
            <span>Registrar persona</span>
          </button>
        </div>
      </header>
      <div class="directory-toolbar">
        <label class="agenda-search">
          <svg class="icon"><use href="#i-search" /></svg>
          <span class="sr-only">Buscar público general</span>
          <input
            :value="generalVisitorSearch"
            type="search"
            aria-label="Buscar público general"
            placeholder="Buscar por nombre, CURP, teléfono o correo..."
            @input="emit('update:generalVisitorSearch', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="directory-filter">
          <span>CURP</span>
          <select :value="generalVisitorCurpFilter" aria-label="Filtrar personas por CURP" @change="emit('update:generalVisitorCurpFilter', ($event.target as HTMLSelectElement).value as 'Todas' | 'Con CURP' | 'Sin CURP')">
            <option value="Todas">Todas</option>
            <option value="Con CURP">Con CURP</option>
            <option value="Sin CURP">Sin CURP</option>
          </select>
        </label>
      </div>
      <div class="workspace-table-scroll">
        <table class="workspace-table general-visitor-table">
          <thead><tr><th>Nombre completo</th><th>CURP</th><th>Teléfono</th><th>Correo electrónico</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="visitor in paginatedGeneralVisitors" :key="visitor.id">
              <td>{{ visitor.fullName }}</td>
              <td>{{ visitor.curp || "—" }}</td>
              <td>{{ visitor.phone || "—" }}</td>
              <td>{{ visitor.email || "—" }}</td>
              <td>
                <div class="staff-actions">
                  <button class="staff-edit-button" type="button" :disabled="generalVisitorSaving || loading" :aria-label="`Editar a ${visitor.fullName}`" @click="emit('editVisitor', visitor)">Editar</button>
                  <button class="workspace-remove" type="button" :disabled="generalVisitorSaving || loading" :aria-label="`Eliminar a ${visitor.fullName}`" @click="emit('removeVisitor', visitor.id)">Eliminar</button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredGeneralVisitors.length === 0">
              <td class="workspace-empty" colspan="5">
                {{ loading ? "Cargando personas..." : generalVisitors.length === 0 ? "Aún no hay personas de público general registradas." : "No hay personas que coincidan con los filtros." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav v-if="filteredGeneralVisitors.length > partnerRowsPerPage" class="directory-pagination" aria-label="Paginación de público general">
        <span>
          Mostrando {{ (generalVisitorPage - 1) * partnerRowsPerPage + 1 }}–{{
            Math.min(generalVisitorPage * partnerRowsPerPage, filteredGeneralVisitors.length)
          }} de {{ filteredGeneralVisitors.length }} personas
        </span>
        <div>
          <button class="pagination-button" type="button" :disabled="generalVisitorPage === 1" @click="emit('update:generalVisitorPage', generalVisitorPage - 1)">Anterior</button>
          <span class="pagination-current">{{ generalVisitorPage }} / {{ generalVisitorPages }}</span>
          <button class="pagination-button" type="button" :disabled="generalVisitorPage === generalVisitorPages" @click="emit('update:generalVisitorPage', generalVisitorPage + 1)">Siguiente</button>
        </div>
      </nav>
    </section>
  </section>
</template>
