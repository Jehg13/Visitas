<script setup lang="ts">
import { computed, ref, watch } from "vue";

type BusinessPartner = {
  id: number;
  name: string;
  employeeCount: number;
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
type Appointment = {
  id: number;
  businessPartnerId?: number | null;
  date: string;
  time: string;
  company: string;
  host: string;
  referenceCode: string;
};

const props = defineProps<{
  companies: BusinessPartner[];
  staff: ExternalStaff[];
  search: string;
  loading: boolean;
  dispatchAppointment: Appointment | null;
  sendingStaffId: number | null;
}>();

const selectedCompanyId = ref<number | null>(props.dispatchAppointment?.businessPartnerId ?? null);
watch(
  () => props.dispatchAppointment,
  (appointment) => {
    selectedCompanyId.value = appointment?.businessPartnerId ?? null;
  },
);
const searchQuery = computed(() => props.search.trim().toLocaleLowerCase());
const companiesWithStaffCount = computed(() =>
  props.companies
    .map((company) => {
      const staffCount = props.staff.filter((person) => person.businessPartnerId === company.id).length;
      return {
        ...company,
        staffCount,
      };
    })
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
const equipmentRecipientId = computed(() =>
  props.staff
    .filter((person) => person.businessPartnerId === selectedCompanyId.value)
    .filter((person) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim()))
    .sort((first, second) => first.id - second.id)[0]?.id ?? null,
);
const equipmentRecipientName = computed(() =>
  props.staff.find((person) => person.id === equipmentRecipientId.value)?.fullName ?? null,
);

const emit = defineEmits<{
  "update:search": [value: string];
  create: [businessPartnerId?: number];
  edit: [staff: ExternalStaff];
  remove: [id: number];
  sendQr: [staff: ExternalStaff];
  openQr: [staff: ExternalStaff];
  clearDispatch: [];
}>();
</script>

<template>
  <section class="workspace-grid external-staff-workspace">
    <section class="panel workspace-panel external-staff-panel" aria-labelledby="external-staff-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-users" /></svg>
          <div class="external-company-title">
            <h2 id="external-staff-title">
              {{ selectedCompany ? selectedCompany.name : "Personal por empresa" }}
            </h2>
            <span v-if="selectedCompany" class="external-type-pill">{{ selectedCompany.type }}</span>
          </div>
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
            @click="dispatchAppointment ? emit('clearDispatch') : selectedCompanyId = null"
          >
            {{ dispatchAppointment ? "Salir del envío" : "Volver a empresas" }}
          </button>
          <button class="button-primary" type="button" @click="emit('create', selectedCompany?.id)">
            <svg class="icon"><use href="#i-plus" /></svg>
            <span>Registrar empleado</span>
          </button>
        </div>
      </header>
      <div v-if="dispatchAppointment && selectedCompany" class="external-qr-dispatch-note">
        <strong>Envío de pases para la cita</strong>
        <span>{{ dispatchAppointment.date }} · {{ dispatchAppointment.time }} · Anfitrión: {{ dispatchAppointment.host }}</span>
        <p v-if="equipmentRecipientName">
          Cada empleado tiene su propio QR. El enlace para declarar equipo y herramientas, de un solo uso, se envía únicamente a
          {{ equipmentRecipientName }}.
        </p>
        <p v-else>
          Cada empleado tiene su propio QR. Registra un correo electrónico válido para habilitar el envío y definir quién recibirá el enlace de equipo de un solo uso.
        </p>
      </div>
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
              <strong>{{ company.employeeCount }}</strong>
              <span>{{ company.employeeCount === 1 ? "contemplado" : "contemplados" }}</span>
              <span class="external-staff-registered-count">
                {{ company.staffCount }} {{ company.staffCount === 1 ? "registrado" : "registrados" }}
              </span>
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
      <div v-else class="workspace-table-scroll external-staff-table-scroll">
        <table class="workspace-table external-staff-table">
          <thead>
            <tr>
              <th>Nombre completo</th><th>Teléfono</th><th>Correo electrónico</th>
              <th>Vínculo</th><th>Empresa</th><th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="person in selectedCompanyStaff" :key="person.id">
              <td>
                <strong class="external-staff-person-name">{{ person.fullName }}</strong>
                <span
                  v-if="dispatchAppointment && equipmentRecipientId === person.id"
                  class="external-qr-link-recipient"
                >Recibe enlace de equipo</span>
              </td>
              <td>{{ person.phone || "—" }}</td>
              <td><span class="external-staff-email">{{ person.email || "—" }}</span></td>
              <td><span class="external-type-pill">{{ person.relationshipType }}</span></td>
              <td><span class="external-staff-company">{{ person.companyName }}</span></td>
              <td>
                <div class="staff-actions">
                  <button class="staff-edit-button" type="button" @click="emit('edit', person)">
                    Editar
                  </button>
                  <template v-if="dispatchAppointment">
                    <button class="qr-button" type="button" @click="emit('openQr', person)">
                      <svg class="icon"><use href="#i-qr" /></svg><span>Ver QR</span>
                    </button>
                    <button
                      class="qr-button"
                      type="button"
                      :disabled="!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim())) || sendingStaffId === person.id"
                      :title="!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim())) ? 'Bloqueado: registra un correo electrónico válido para poder enviar el QR.' : undefined"
                      @click="emit('sendQr', person)"
                    >
                      <span>{{ !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim())) ? "Bloqueado" : sendingStaffId === person.id ? "Enviando..." : "Enviar QR" }}</span>
                    </button>
                  </template>
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
