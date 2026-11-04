<script setup lang="ts">
import { computed, ref } from "vue";
import SectionHelpDialog from "./SectionHelpDialog.vue";

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
  registeredBy: string;
};

const props = defineProps<{
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
  isAdmin: boolean;
  theme: "dark" | "light";
}>();

const helpOpen = ref(false);
const businessDirectoryHelpSections = computed(() => [
  {
    title: "Buscar y filtrar registros",
    steps: [
      "Escribe parte del nombre, RFC, categoría, descripción o asunto en el buscador.",
      "Usa los filtros Tipo, Categoría y Estado para acotar la lista. Puedes combinarlos y limpiar la búsqueda cuando quieras consultar otros registros.",
      "La tabla muestra siete registros por página. Usa Anterior y Siguiente para recorrer los resultados.",
    ],
  },
  {
    title: "Completar el formulario de registro",
    steps: [
      "En Tipo, selecciona Contratista, Proveedor o Visitante. Los campos cambian según lo que elijas.",
      "Para un contratista o proveedor, captura el nombre de la empresa, una descripción de su servicio, RFC, categoría, número de empleados y estado. Deja Activa si actualmente presta servicios.",
      "Para un visitante, captura su nombre completo y el asunto o motivo de la visita. Se guardará como Público General y no requiere RFC ni estado.",
      "Revisa los datos y pulsa Registrar empresa para guardar la ficha. Para hacer cambios después, abre Editar y pulsa Guardar cambios.",
    ],
  },
  {
    title: "Marcar un servicio como inactivo",
    text: "Si un contratista o proveedor ya no presta servicios, busca su registro, pulsa Editar, cambia Estado a Inactiva y guarda los cambios. La ficha se conservará en el directorio y podrás encontrarla usando el filtro de estado.",
  },
  {
    title: "Registros y personal relacionado",
    text: "El directorio reúne las fichas de contratistas, proveedores y visitantes. Para registrar empleados de una empresa o consultar sus datos de contacto, abre la sección Personal de externos y selecciona la empresa correspondiente.",
  },
  ...(props.isAdmin
    ? [{
        title: "Eliminar un registro",
        text: "Eliminar quita la ficha del directorio de forma permanente. Antes de hacerlo, confirma que seleccionaste el registro correcto y que ya no necesitas conservarlo.",
      }]
    : []),
]);

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
          <button class="button-secondary section-help-trigger" type="button" @click="helpOpen = true">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.9 1.7c-1.1 1-1.7 1.4-1.7 2.8M12 17h.01" /></svg>
            Ayuda
          </button>
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
      <div class="workspace-table-scroll business-directory-table-scroll">
        <table class="workspace-table business-partner-table">
          <thead>
            <tr>
              <th>Nombre</th><th>Descripción</th><th>RFC</th><th>Categoría</th>
              <th class="business-partner-subject-column business-partner-subject">Asunto</th>
              <th>Empleados</th><th v-if="isAdmin">Registrado por</th><th>Estado</th><th>Acciones</th>
            </tr>
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
              <td class="business-partner-subject-column business-partner-subject">{{ partner.type === "Visitante" ? partner.subject || "—" : "—" }}</td>
              <td>{{ partner.employeeCount }}</td>
              <td v-if="isAdmin">{{ partner.registeredBy }}</td>
              <td>
                <span
                  class="partner-status-pill"
                  :class="partner.status === 'No aplica' ? '' : `partner-status-${partner.status.toLowerCase()}`"
                >{{ partner.status }}</span>
              </td>
              <td>
                <div class="staff-actions">
                  <button class="staff-edit-button" type="button" :disabled="businessPartnerSaving || loading" :aria-label="`Editar ${partner.name}`" @click="emit('editPartner', partner)">Editar</button>
                  <button v-if="isAdmin" class="workspace-remove" type="button" :disabled="businessPartnerSaving || loading" :aria-label="`Eliminar ${partner.name}`" @click="emit('removePartner', partner.id)">Eliminar</button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredBusinessPartners.length === 0">
              <td class="workspace-empty" :colspan="isAdmin ? 9 : 8">
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
    <SectionHelpDialog
      v-if="helpOpen"
      title="Ayuda del directorio"
      introduction="Esta sección sirve para consultar y mantener las fichas de las empresas y personas externas."
      :sections="businessDirectoryHelpSections"
      :theme="theme"
      @close="helpOpen = false"
    />
  </section>
</template>
