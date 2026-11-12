<script setup lang="ts">
import { computed, ref, watch } from "vue";
import SectionHelpDialog from "./SectionHelpDialog.vue";

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
  isCompanyUser: boolean;
  canManageStaff: boolean;
  theme: "dark" | "light";
}>();

const helpOpen = ref(false);
const externalStaffHelpSections = [
  {
    title: "Encontrar una empresa y su personal",
    steps: [
      "En la vista inicial aparecen las empresas registradas y la cantidad de empleados. Selecciona una empresa para abrir su lista.",
      "Usa el buscador para localizar empresas o empleados por nombre, teléfono o correo. En la lista de empleados puedes recorrer las páginas si hay más de siete.",
      "Pulsa Volver a empresas para regresar a la lista completa.",
    ],
  },
  {
    title: "Registrar o actualizar a una persona",
    text: "Pulsa Registrar empleado y elige o confirma la empresa relacionada. Captura el nombre completo y, cuando estén disponibles, el teléfono y un correo válido. Usa Editar para corregir datos y Eliminar para quitar a la persona de la lista.",
  },
  {
    title: "Usar los pases QR",
    steps: [
      "Desde una cita de contratista en la agenda, selecciona Enviar QR. Se abrirá esta sección con la empresa correspondiente para preparar los pases.",
      "Cada empleado tiene un QR individual. Usa Ver QR para mostrarlo y Enviar QR para mandarlo al correo registrado; si no hay un correo válido, actualiza sus datos antes.",
      "El sistema indicará quién recibirá el enlace de un solo uso para declarar equipo y herramientas. Confirma que el correo de esa persona esté actualizado antes de enviar los pases.",
    ],
  },
];

const staffTableScroll = ref<HTMLDivElement | null>(null);
const selectedCompanyId = ref<number | null>(props.dispatchAppointment?.businessPartnerId ?? null);
watch(
  () => props.dispatchAppointment,
  (appointment) => {
    selectedCompanyId.value = appointment?.businessPartnerId ?? null;
  },
);
watch(
  [selectedCompanyId, () => props.dispatchAppointment?.id],
  () => {
    if (staffTableScroll.value) staffTableScroll.value.scrollLeft = 0;
  },
  { flush: "post" },
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
const staffPage = ref(1);
const staffPageSize = 7;
const staffPages = computed(() =>
  Math.max(1, Math.ceil(selectedCompanyStaff.value.length / staffPageSize)),
);
const paginatedStaff = computed(() =>
  selectedCompanyStaff.value.slice(
    (staffPage.value - 1) * staffPageSize,
    staffPage.value * staffPageSize,
  ),
);
watch([selectedCompanyStaff, selectedCompanyId], () => {
  staffPage.value = 1;
});
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
          <button class="button-secondary section-help-trigger" type="button" @click="helpOpen = true">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.9 1.7c-1.1 1-1.7 1.4-1.7 2.8M12 17h.01" /></svg>
            Ayuda
          </button>
          <button
            v-if="selectedCompany"
            class="button-secondary"
            type="button"
            @click="dispatchAppointment ? emit('clearDispatch') : selectedCompanyId = null"
          >
            {{ dispatchAppointment ? "Salir del envío" : "Volver a empresas" }}
          </button>
          <button v-if="canManageStaff" class="button-primary" type="button" @click="emit('create', selectedCompany?.id)">
            <svg class="icon"><use href="#i-plus" /></svg>
            <span>Registrar empleado</span>
          </button>
        </div>
      </header>
      <div v-if="dispatchAppointment && selectedCompany" class="external-qr-dispatch-note">
        <strong>{{ isCompanyUser ? "Envío de referencias para la cita" : "Envío de pases para la cita" }}</strong>
        <span>{{ dispatchAppointment.date }} · {{ dispatchAppointment.time }} · Anfitrión: {{ dispatchAppointment.host }}</span>
        <p v-if="equipmentRecipientName">
          {{ isCompanyUser ? "Cada empleado recibe su código de referencia." : "Cada empleado tiene su propio QR." }} El enlace para declarar equipo y herramientas, de un solo uso, se envía únicamente a
          {{ equipmentRecipientName }}.
        </p>
        <p v-else>
          {{ isCompanyUser ? "Cada empleado recibe su código de referencia." : "Cada empleado tiene su propio QR." }} Registra un correo electrónico válido para habilitar el envío y definir quién recibirá el enlace de equipo de un solo uso.
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
      <div v-else ref="staffTableScroll" class="workspace-table-scroll external-staff-table-scroll">
        <table class="workspace-table external-staff-table">
          <colgroup>
            <col class="external-staff-name-column" />
            <col class="external-staff-phone-column" />
            <col class="external-staff-email-column" />
            <col class="external-staff-relationship-column" />
            <col class="external-staff-company-column" />
            <col class="external-staff-actions-column" />
          </colgroup>
          <thead>
            <tr>
              <th>Nombre completo</th><th>Teléfono</th><th>Correo electrónico</th>
              <th>Vínculo</th><th>Empresa</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="person in paginatedStaff" :key="person.id">
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
                  <button v-if="canManageStaff" class="staff-edit-button" type="button" @click="emit('edit', person)">
                    Editar
                  </button>
                  <template v-if="dispatchAppointment">
                    <button v-if="!isCompanyUser" class="qr-button" type="button" @click="emit('openQr', person)">
                      <svg class="icon"><use href="#i-qr" /></svg><span>Ver QR</span>
                    </button>
                    <button
                      class="qr-button"
                      type="button"
                      :disabled="!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim())) || sendingStaffId === person.id"
                      :title="!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim())) ? 'Bloqueado: registra un correo electrónico válido para poder enviar el QR.' : undefined"
                      @click="emit('sendQr', person)"
                    >
                      <span>{{ !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim())) ? "Bloqueado" : sendingStaffId === person.id ? "Enviando..." : isCompanyUser ? "Enviar referencia" : "Enviar QR" }}</span>
                    </button>
                  </template>
                  <button
                    v-if="canManageStaff"
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
      <nav
        v-if="selectedCompany && selectedCompanyStaff.length > staffPageSize"
        class="directory-pagination"
        aria-label="Paginación de personal externo"
      >
        <span>
          Mostrando {{ (staffPage - 1) * staffPageSize + 1 }}–{{
            Math.min(staffPage * staffPageSize, selectedCompanyStaff.length)
          }} de {{ selectedCompanyStaff.length }} empleados
        </span>
        <div>
          <button class="pagination-button" type="button" :disabled="staffPage <= 1" @click="staffPage--">Anterior</button>
          <span class="pagination-current" aria-live="polite">{{ staffPage }} / {{ staffPages }}</span>
          <button class="pagination-button" type="button" :disabled="staffPage >= staffPages" @click="staffPage++">Siguiente</button>
        </div>
      </nav>
    </section>
    <SectionHelpDialog
      v-if="helpOpen"
      title="Ayuda del personal de externos"
      introduction="Aquí puedes consultar las empresas contratistas o proveedoras y administrar el personal relacionado con cada una."
      :sections="externalStaffHelpSections"
      :theme="theme"
      @close="helpOpen = false"
    />
  </section>
</template>
