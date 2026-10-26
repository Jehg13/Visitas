<script setup lang="ts">
import { computed, ref } from "vue";

type BusinessPartner = {
  id: number;
  name: string;
  type: "Contratista" | "Proveedor";
};

type ExternalStaff = {
  id: number;
  businessPartnerId: number;
  fullName: string;
  phone: string;
  email: string;
  relationshipType: "Contratista" | "Proveedor";
  companyName: string;
};

const props = defineProps<{
  companies: BusinessPartner[];
  staff: ExternalStaff[];
  search: string;
  loading: boolean;
}>();

const selectedCompanyId = ref<number | null>(null);
const searchQuery = computed(() => props.search.trim().toLocaleLowerCase());
const companiesWithStaffCount = computed(() =>
  props.companies
    .map((company) => ({
      ...company,
      staffCount: props.staff.filter((person) => person.businessPartnerId === company.id).length,
    }))
    .filter((company) => {
      if (!searchQuery.value) return true;
      return [
        company.name,
        company.type,
        ...props.staff
          .filter((person) => person.businessPartnerId === company.id)
          .flatMap((person) => [person.fullName, person.phone, person.email]),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(searchQuery.value);
    })
    .sort((first, second) => first.name.localeCompare(second.name, "es")),
);
const selectedCompany = computed(() =>
  props.companies.find((company) => company.id === selectedCompanyId.value) ?? null,
);
const selectedCompanyStaff = computed(() =>
  props.staff
    .filter((person) => person.businessPartnerId === selectedCompanyId.value)
    .filter((person) =>
      !searchQuery.value ||
      [person.fullName, person.phone, person.email, person.companyName]
        .join(" ")
        .toLocaleLowerCase()
        .includes(searchQuery.value),
    ),
);

const emit = defineEmits<{
  "update:search": [value: string];
  create: [businessPartnerId?: number];
  edit: [staff: ExternalStaff];
  remove: [id: number];
}>();
</script>

<template>
  <section class="workspace-grid">
    <section class="panel workspace-panel" aria-labelledby="external-staff-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-users" /></svg>
          <h2 id="external-staff-title">
            {{ selectedCompany ? selectedCompany.name : "Personal por empresa" }}
          </h2>
        </div>
        <div class="workspace-heading-actions">
          <span v-if="selectedCompany" class="workspace-count">
            {{ selectedCompanyStaff.length }} {{ selectedCompanyStaff.length === 1 ? "empleado" : "empleados" }}
          </span>
          <span v-else class="workspace-count">
            {{ companiesWithStaffCount.length }} {{ companiesWithStaffCount.length === 1 ? "empresa" : "empresas" }}
          </span>
          <button
            v-if="selectedCompany"
            class="button-secondary"
            type="button"
            @click="selectedCompanyId = null"
          >
            Volver a empresas
          </button>
          <button class="button-primary" type="button" @click="emit('create', selectedCompany?.id)">
            <svg class="icon"><use href="#i-plus" /></svg>
            <span>Registrar empleado</span>
          </button>
        </div>
      </header>
      <p v-if="selectedCompany" class="external-company-detail">
        <span class="external-type-pill">{{ selectedCompany.type }}</span>
        Personal externo registrado para esta empresa.
      </p>
      <div class="external-staff-toolbar">
        <label class="agenda-search">
          <svg class="icon"><use href="#i-search" /></svg>
          <span class="sr-only">Buscar personal externo</span>
          <input
            :value="search"
            type="search"
            aria-label="Buscar personal externo"
            placeholder="Buscar por nombre, contacto o empresa..."
            @input="emit('update:search', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <div v-if="!selectedCompany" class="external-company-card-grid">
        <button
          v-for="company in companiesWithStaffCount"
          :key="company.id"
          class="external-company-card"
          type="button"
          @click="selectedCompanyId = company.id"
        >
          <span class="department-card-heading">
            <span class="department-card-icon">
              <svg class="icon"><use href="#i-building" /></svg>
            </span>
            <span class="department-card-count">
              <strong>{{ company.staffCount }}</strong>
              <span>{{ company.staffCount === 1 ? "empleado registrado" : "empleados registrados" }}</span>
            </span>
          </span>
          <strong class="external-company-name">{{ company.name }}</strong>
          <span class="external-company-meta">{{ company.type }}</span>
          <span class="external-company-view">Ver personal <svg class="icon"><use href="#i-arrow" /></svg></span>
        </button>
        <div v-if="companiesWithStaffCount.length === 0" class="department-empty-state">
          <span class="department-card-icon">
            <svg class="icon"><use href="#i-building" /></svg>
          </span>
          <strong>
            {{ loading ? "Cargando empresas..." : companies.length === 0 ? "Aún no hay empresas registradas" : "No hay resultados" }}
          </strong>
          <p>
            {{ companies.length === 0 ? "Registra primero un contratista o proveedor en el directorio de empresas." : "Intenta buscar con otro nombre de empresa o empleado." }}
          </p>
        </div>
      </div>
      <div v-else class="workspace-table-scroll">
        <table class="workspace-table external-staff-table">
          <thead>
            <tr>
              <th>Nombre completo</th><th>Teléfono</th><th>Correo electrónico</th>
              <th>Vínculo</th><th>Empresa</th><th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="person in selectedCompanyStaff" :key="person.id">
              <td>{{ person.fullName }}</td>
              <td>{{ person.phone || "—" }}</td>
              <td>{{ person.email || "—" }}</td>
              <td><span class="external-type-pill">{{ person.relationshipType }}</span></td>
              <td>{{ person.companyName }}</td>
              <td>
                <div class="staff-actions">
                  <button class="staff-edit-button" type="button" @click="emit('edit', person)">
                    Editar
                  </button>
                  <button
                    class="workspace-remove"
                    type="button"
                    :aria-label="`Eliminar a ${person.fullName}`"
                    @click="emit('remove', person.id)"
                  >Eliminar</button>
                </div>
              </td>
            </tr>
            <tr v-if="selectedCompanyStaff.length === 0">
              <td class="workspace-empty" colspan="6">
                {{ searchQuery ? "No hay empleados que coincidan con la búsqueda." : "Esta empresa aún no tiene personal registrado." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
