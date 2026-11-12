<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AppDownloadCard from "../components/AppDownloadCard.vue";
import SectionHelpDialog from "./SectionHelpDialog.vue";

type AppointmentStatus = "Dentro" | "En proceso" | "Pendiente" | "Retirado" | "Cancelada";
type Appointment = {
  id: number;
  businessPartnerId?: number | null;
  visitorRecordId?: number | null;
  partnerType?: "Contratista" | "Proveedor" | "Visitante";
  date: string;
  time: string;
  visitor: string;
  email: string;
  referenceCode: string;
  registeredBy: string;
  company: string;
  tenantCompanyName?: string;
  host: string;
  status: AppointmentStatus;
};
type CalendarDay = {
  date: string;
  day: number;
  inMonth: boolean;
  appointments: Appointment[];
};

const props = defineProps<{
  filter: "day" | "all";
  search: string;
  selectedAppointments: Appointment[];
  searchedAppointments: Appointment[];
  paginatedAppointments: Appointment[];
  appointmentsPage: number;
  appointmentsPerPage: number;
  totalAppointmentPages: number;
  calendarMonthLabel: string;
  calendarDays: CalendarDay[];
  selectedAppointmentDate: string;
  today: string;
  loading: boolean;
  canCreateAppointments: boolean;
  canManageAppointments: boolean;
  canSendReference: boolean;
  isCompanyUser: boolean;
  companyScope: "cymez" | "all";
  isAdmin: boolean;
  isReception: boolean;
  isHost: boolean;
  showAppDownload: boolean;
  theme: "dark" | "light";
}>();

const helpOpen = ref(false);
const clock = ref(Date.now());
let attendanceClock: ReturnType<typeof setInterval> | undefined;
type HelpAudience = "reception" | "host";
const helpAudience = ref<HelpAudience>("reception");
const effectiveHelpAudience = computed<HelpAudience>(() =>
  props.isAdmin
    ? helpAudience.value
    : props.isHost && !props.isReception
      ? "host"
      : "reception",
);
const helpTitle = computed(() =>
  effectiveHelpAudience.value === "host"
    ? "Ayuda de la agenda para anfitriones"
    : "Ayuda de la agenda para recepción",
);
function getAttendanceStatus(appointment: Appointment) {
  if (appointment.status !== "Pendiente") return null;
  const now = new Date(clock.value);
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  if (appointment.date < today) return "No se presentó";
  if (appointment.date > today) return null;
  const [hours, minutes] = appointment.time.split(":").map(Number);
  const scheduledAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
  ).getTime();
  return scheduledAt <= clock.value ? "Tardía" : null;
}

function getAppointmentStatus(appointment: Appointment) {
  return getAttendanceStatus(appointment) ?? appointment.status;
}

function usesReference(appointment: Appointment) {
  return props.isCompanyUser ||
    appointment.tenantCompanyName?.trim().toLocaleLowerCase("es") !== "cymez";
}

function getAppointmentStatusClass(appointment: Appointment) {
  const attendanceStatus = getAttendanceStatus(appointment);
  if (attendanceStatus === "No se presentó") return "status-no-show";
  if (attendanceStatus === "Tardía") return "status-late";
  return `status-${appointment.status.replace(" ", "-").toLowerCase()}`;
}

onMounted(() => {
  attendanceClock = setInterval(() => {
    clock.value = Date.now();
  }, 30_000);
});

onBeforeUnmount(() => {
  if (attendanceClock) clearInterval(attendanceClock);
});

const helpIntroduction = computed(() =>
  effectiveHelpAudience.value === "host"
    ? "Usa la agenda para programar tus visitas y preparar su acceso."
    : "Usa la agenda para consultar las visitas programadas y apoyar su recepción.",
);
const appointmentHelpSections = computed(() =>
  effectiveHelpAudience.value === "host"
    ? [
        {
          title: "Consultar tus citas",
          steps: [
            "Usa Citas del día para revisar las visitas de la fecha elegida en el calendario. Selecciona Todas las citas para consultar la agenda completa.",
            "Busca por nombre de visitante, empresa o anfitrión. Cambia el mes y selecciona un día para revisar las citas programadas.",
            "Revisa hora, visitante, empresa, estado y pase QR para confirmar que los datos estén correctos.",
          ],
        },
        {
          title: "Crear una cita",
          steps: [
            "Pulsa Nueva cita y selecciona la empresa o persona que visitará.",
            "Indica visitante, fecha y hora. Tu nombre aparecerá como anfitrión; verifica la información antes de guardar.",
            "Comparte el pase QR con la persona visitante para que pueda presentarlo al llegar.",
          ],
        },
        {
          title: "Editar o cancelar una cita",
          text: "Si necesitas corregir una cita activa, pulsa Editar y guarda los cambios. Si la visita ya no se realizará, pulsa Cancelar. Las citas que ya fueron retiradas o canceladas no se pueden editar.",
        },
        {
          title: "Visitas de contratistas",
          text: "En una cita de contratista puedes usar Enviar QR para distribuir pases individuales al personal y compartir el enlace para declarar equipo y herramientas. Verifica que cada persona tenga un correo válido.",
        },
        {
          title: "Entender los estados",
          text: "Pendiente indica que aún no llega la hora de la cita; Tardía aparece y se avisa cuando ya pasó la hora sin registrar su llegada; No se presentó aparece al día siguiente si no llegó. Como anfitrión, puedes usar Reagendar en citas tardías, no presentadas o canceladas. En proceso significa que ya se registró la llegada; Dentro, que ingresó; Retirado, que terminó su visita; y Cancelada, que ya no se realizará.",
        },
      ]
    : [
        {
          title: "Consultar la agenda",
          steps: [
            "Usa Citas del día para ver las visitas de la fecha elegida en el calendario. Selecciona Todas las citas para consultar otras fechas.",
            "Busca por nombre del visitante, empresa o anfitrión. También puedes cambiar el mes y elegir un día del calendario.",
            "Revisa la hora, el visitante, la empresa, el anfitrión y el estado de cada cita.",
          ],
        },
        {
          title: "Mostrar el pase QR",
          text: "En la fila de la cita, pulsa Ver QR para mostrar el pase correspondiente. Confirma que el nombre y la empresa coincidan con la persona que se presenta.",
        },
        {
          title: "Registrar los movimientos",
          text: "La agenda sirve para consultar la programación. Cuando una persona llegue, registra su llegada, entrada y salida desde Bitácora diaria. Si necesita corregirse o cancelarse una cita, contacta al anfitrión responsable.",
        },
        {
          title: "Entender los estados",
          text: "Pendiente indica que aún no llega la hora de la cita; Tardía aparece cuando ya pasó la hora y no se registró su llegada; No se presentó aparece al día siguiente si no llegó. En proceso significa que ya se registró la llegada; Dentro, que ingresó; Retirado, que terminó su visita; y Cancelada, que ya no se realizará.",
        },
      ],
);

const emit = defineEmits<{
  "update:companyScope": [scope: "cymez" | "all"];
  "update:filter": [value: "day" | "all"];
  "update:search": [value: string];
  "update:page": [value: number];
  create: [];
  registerVisitor: [];
  reschedule: [appointment: Appointment];
  cancel: [appointment: Appointment];
  openQr: [appointment: Appointment];
  sendCompanyQrs: [appointment: Appointment];
  sendReference: [appointment: Appointment];
  delete: [appointment: Appointment];
  edit: [appointment: Appointment];
  changeMonth: [delta: number];
  selectDay: [date: string];
}>();
</script>

<template>
  <AppDownloadCard v-if="showAppDownload" />
  <section class="workspace-grid">
    <section class="panel workspace-panel agenda-workspace-panel" aria-labelledby="appointments-list-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-calendar" /></svg>
          <h2 id="appointments-list-title">
            {{ filter === "day" ? "Citas del día" : "Todas las citas" }}
          </h2>
        </div>
        <div class="workspace-heading-actions">
          <span class="workspace-count">{{ selectedAppointments.length }} citas</span>
          <button class="button-secondary section-help-trigger" type="button" @click="helpOpen = true">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.9 1.7c-1.1 1-1.7 1.4-1.7 2.8M12 17h.01" /></svg>
            Ayuda
          </button>
          <button
            v-if="isHost || isAdmin"
            class="button-secondary"
            type="button"
            @click="emit('registerVisitor')"
          >
            <span>Registrar visitante</span>
          </button>
          <button
            v-if="canCreateAppointments"
            class="button-primary"
            type="button"
            @click="emit('create')"
          >
            <svg class="icon"><use href="#i-plus" /></svg>
            <span>Nueva cita</span>
          </button>
        </div>
      </header>
      <div class="agenda-toolbar">
        <div class="agenda-view-filters" role="group" aria-label="Filtrar citas">
          <button
            class="agenda-filter-button"
            :class="{ 'agenda-filter-active': filter === 'day' }"
            type="button"
            :aria-pressed="filter === 'day'"
            @click="emit('update:filter', 'day')"
          >Citas del día</button>
          <button
            class="agenda-filter-button"
            :class="{ 'agenda-filter-active': filter === 'all' }"
            type="button"
            :aria-pressed="filter === 'all'"
            @click="emit('update:filter', 'all')"
          >Todas las citas</button>
        </div>
        <label v-if="isAdmin" class="agenda-company-scope">
          <span class="sr-only">Filtrar agenda por empresa</span>
          <select
            :value="companyScope"
            aria-label="Filtrar agenda por empresa"
            @change="emit('update:companyScope', ($event.target as HTMLSelectElement).value as 'cymez' | 'all')"
          >
            <option value="cymez">Cymez</option>
            <option value="all">Todas las empresas</option>
          </select>
        </label>
        <label class="agenda-search">
          <svg class="icon"><use href="#i-search" /></svg>
          <span class="sr-only">Buscar cita</span>
          <input
            :value="search"
            type="search"
            aria-label="Buscar cita"
            placeholder="Buscar visitante, empresa o anfitrión..."
            @input="emit('update:search', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <span class="agenda-result-count">
          {{ searchedAppointments.length }} {{ searchedAppointments.length === 1 ? "resultado" : "resultados" }}
        </span>
      </div>
      <div class="workspace-table-scroll">
        <table class="workspace-table agenda-table" :class="{ 'agenda-table-readonly': !canManageAppointments }">
          <thead>
            <tr>
              <th>Hora</th><th>Visitante</th><th>Empresa</th><th v-if="isAdmin && companyScope === 'all'">Empresa del registro</th><th>Anfitrión</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="appointment in paginatedAppointments" :key="appointment.id">
              <td>{{ appointment.time }}</td>
              <td>{{ appointment.visitor }}</td>
              <td>{{ appointment.company }}</td>
              <td v-if="isAdmin && companyScope === 'all'">{{ appointment.tenantCompanyName || "N/A" }}</td>
              <td>{{ appointment.host }}</td>
              <td>
                <span class="status-pill" :class="getAppointmentStatusClass(appointment)">
                  {{ getAppointmentStatus(appointment) }}
                </span>
              </td>
              <td>
                <div class="agenda-actions" :class="{ 'agenda-actions-readonly': !canManageAppointments }">
                  <button
                    v-if="canManageAppointments && isHost && (appointment.status === 'Cancelada' || ['Tardía', 'No se presentó'].includes(getAttendanceStatus(appointment) ?? ''))"
                    class="staff-edit-button agenda-reschedule-button"
                    type="button"
                    @click="emit('reschedule', appointment)"
                  >Reagendar</button>
                  <button
                    v-else-if="canManageAppointments && appointment.status !== 'Retirado' && appointment.status !== 'Cancelada'"
                    class="staff-edit-button"
                    type="button"
                    @click="emit('edit', appointment)"
                  >Editar</button>
                  <button
                    v-if="canManageAppointments && !isCompanyUser"
                    class="workspace-remove"
                    type="button"
                    :aria-label="`Cancelar cita de ${appointment.visitor}`"
                    :disabled="appointment.status === 'Retirado' || appointment.status === 'Cancelada'"
                    @click="emit('cancel', appointment)"
                  >Cancelar</button>
                  <button
                    v-if="!usesReference(appointment)"
                    class="qr-button"
                    type="button"
                    :aria-label="`Ver QR de ${appointment.visitor}`"
                    @click="emit('openQr', appointment)"
                  ><svg class="icon"><use href="#i-qr" /></svg><span>Ver QR</span></button>
                  <button
                    v-if="usesReference(appointment) && canSendReference && appointment.status !== 'Cancelada' && appointment.status !== 'Retirado'"
                    class="qr-button"
                    type="button"
                    :aria-label="`Enviar referencia a ${appointment.visitor}`"
                    @click="appointment.partnerType === 'Contratista' && appointment.businessPartnerId
                      ? emit('sendCompanyQrs', appointment)
                      : emit('sendReference', appointment)"
                  ><span>Enviar referencia</span></button>
                  <button
                    v-else-if="!usesReference(appointment) && canManageAppointments && appointment.partnerType === 'Contratista' && appointment.businessPartnerId && appointment.status !== 'Cancelada' && appointment.status !== 'Retirado'"
                    class="qr-button"
                    type="button"
                    :aria-label="`Enviar QR al personal de ${appointment.company}`"
                    @click="emit('sendCompanyQrs', appointment)"
                  ><svg class="icon"><use href="#i-qr" /></svg><span>Enviar QR</span></button>
                  <button
                    v-if="canManageAppointments && !isCompanyUser"
                    class="workspace-remove agenda-delete-action"
                    type="button"
                    :aria-label="`Eliminar cita de ${appointment.visitor}`"
                    :title="isAdmin || appointment.status === 'Cancelada' ? 'Eliminar cita' : 'Primero cancela la cita para poder eliminarla'"
                    :disabled="!isAdmin && appointment.status !== 'Cancelada'"
                    @click="emit('delete', appointment)"
                  >Eliminar</button>
                </div>
              </td>
            </tr>
            <tr v-if="searchedAppointments.length === 0">
              <td class="workspace-empty" colspan="6">
                {{ loading ? "Cargando citas..." : "No hay citas que coincidan con los filtros aplicados." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <nav v-if="searchedAppointments.length > appointmentsPerPage" class="agenda-pagination" aria-label="Paginación de citas">
        <span>
          Mostrando {{ (appointmentsPage - 1) * appointmentsPerPage + 1 }}–{{
            Math.min(appointmentsPage * appointmentsPerPage, searchedAppointments.length)
          }}
          de {{ searchedAppointments.length }} citas
        </span>
        <div>
          <button
            class="pagination-button"
            type="button"
            :disabled="appointmentsPage === 1"
            @click="emit('update:page', appointmentsPage - 1)"
          >Anterior</button>
          <span class="pagination-current">{{ appointmentsPage }} / {{ totalAppointmentPages }}</span>
          <button
            class="pagination-button"
            type="button"
            :disabled="appointmentsPage === totalAppointmentPages"
            @click="emit('update:page', appointmentsPage + 1)"
          >Siguiente</button>
        </div>
      </nav>

      <section class="appointment-calendar" aria-labelledby="appointment-calendar-title">
        <header class="calendar-heading">
          <div>
            <h3 id="appointment-calendar-title">Calendario de citas</h3>
            <p>Visitas programadas y sus anfitriones</p>
          </div>
          <div class="calendar-month-controls">
            <button class="calendar-nav-button" type="button" aria-label="Mes anterior" @click="emit('changeMonth', -1)">
              <svg class="icon"><use href="#i-chevron" /></svg>
            </button>
            <strong>{{ calendarMonthLabel }}</strong>
            <button class="calendar-nav-button calendar-next" type="button" aria-label="Mes siguiente" @click="emit('changeMonth', 1)">
              <svg class="icon"><use href="#i-chevron" /></svg>
            </button>
          </div>
        </header>
        <div class="calendar-grid">
          <span v-for="weekday in ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']" :key="weekday" class="calendar-weekday">
            {{ weekday }}
          </span>
          <button
            v-for="day in calendarDays"
            :key="day.date"
            class="calendar-day"
            :class="{
              'calendar-day-outside': !day.inMonth,
              'calendar-day-selected': selectedAppointmentDate === day.date,
              'calendar-day-today': day.date === today,
            }"
            type="button"
            :aria-pressed="selectedAppointmentDate === day.date"
            @click="emit('selectDay', day.date)"
          >
            <span class="sr-only">{{ day.date }}, {{ day.appointments.length }} citas</span>
            <span class="calendar-day-number">{{ day.day }}</span>
            <span
              v-for="appointment in day.appointments.slice(0, 2)"
              :key="appointment.id"
              class="calendar-appointment"
              :title="`${appointment.time} · ${appointment.visitor} · Anfitrión: ${appointment.host}`"
            >
              <time>{{ appointment.time }}</time>
              <span>{{ appointment.host }} · {{ appointment.visitor }}</span>
            </span>
            <span v-if="day.appointments.length > 2" class="calendar-more">
              +{{ day.appointments.length - 2 }} más
            </span>
          </button>
        </div>
      </section>
    </section>
  </section>
  <SectionHelpDialog
    v-if="helpOpen"
    :title="helpTitle"
    :introduction="helpIntroduction"
    :sections="appointmentHelpSections"
    :theme="theme"
    @close="helpOpen = false"
  >
    <template v-if="isAdmin" #before-content>
      <div class="section-help-audience-switch" role="group" aria-label="Seleccionar guía de agenda">
        <button
          type="button"
          :class="{ 'is-active': helpAudience === 'reception' }"
          :aria-pressed="helpAudience === 'reception'"
          @click="helpAudience = 'reception'"
        >Ayuda para recepción</button>
        <button
          type="button"
          :class="{ 'is-active': helpAudience === 'host' }"
          :aria-pressed="helpAudience === 'host'"
          @click="helpAudience = 'host'"
        >Ayuda para anfitrión</button>
      </div>
    </template>
  </SectionHelpDialog>
</template>
