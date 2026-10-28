<script setup lang="ts">
type AppointmentStatus = "Dentro" | "En proceso" | "Pendiente" | "Retirado" | "Cancelada";
type Appointment = {
  id: number;
  businessPartnerId?: number | null;
  partnerType?: "Contratista" | "Proveedor" | "Visitante";
  date: string;
  time: string;
  visitor: string;
  email: string;
  referenceCode: string;
  registeredBy: string;
  company: string;
  host: string;
  status: AppointmentStatus;
};
type CalendarDay = {
  date: string;
  day: number;
  inMonth: boolean;
  appointments: Appointment[];
};

defineProps<{
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
}>();

const emit = defineEmits<{
  "update:filter": [value: "day" | "all"];
  "update:search": [value: string];
  "update:page": [value: number];
  create: [];
  cancel: [appointment: Appointment];
  openQr: [appointment: Appointment];
  sendCompanyQrs: [appointment: Appointment];
  delete: [appointment: Appointment];
  edit: [appointment: Appointment];
  changeMonth: [delta: number];
  selectDay: [date: string];
}>();
</script>

<template>
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
              <th>Hora</th><th>Visitante</th><th>Empresa</th><th>Anfitrión</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="appointment in paginatedAppointments" :key="appointment.id">
              <td>{{ appointment.time }}</td>
              <td>{{ appointment.visitor }}</td>
              <td>{{ appointment.company }}</td>
              <td>{{ appointment.host }}</td>
              <td>
                <span class="status-pill" :class="`status-${appointment.status.replace(' ', '-').toLowerCase()}`">
                  {{ appointment.status }}
                </span>
              </td>
              <td>
                <div class="agenda-actions" :class="{ 'agenda-actions-readonly': !canManageAppointments }">
                  <button
                    v-if="canManageAppointments && appointment.status !== 'Retirado' && appointment.status !== 'Cancelada'"
                    class="staff-edit-button"
                    type="button"
                    @click="emit('edit', appointment)"
                  >Editar</button>
                  <button
                    v-if="canManageAppointments"
                    class="workspace-remove"
                    type="button"
                    :aria-label="`Cancelar cita de ${appointment.visitor}`"
                    :disabled="appointment.status === 'Retirado' || appointment.status === 'Cancelada'"
                    @click="emit('cancel', appointment)"
                  >Cancelar</button>
                  <button
                    class="qr-button"
                    type="button"
                    :aria-label="`Ver QR de ${appointment.visitor}`"
                    @click="emit('openQr', appointment)"
                  ><svg class="icon"><use href="#i-qr" /></svg><span>Ver QR</span></button>
                  <button
                    v-if="canManageAppointments && appointment.partnerType === 'Contratista' && appointment.businessPartnerId && appointment.status !== 'Cancelada' && appointment.status !== 'Retirado'"
                    class="qr-button"
                    type="button"
                    :aria-label="`Enviar QR al personal de ${appointment.company}`"
                    @click="emit('sendCompanyQrs', appointment)"
                  ><svg class="icon"><use href="#i-qr" /></svg><span>Enviar QR</span></button>
                  <button
                    v-if="canManageAppointments"
                    class="workspace-remove agenda-delete-action"
                    type="button"
                    :aria-label="`Eliminar cita de ${appointment.visitor}`"
                    :title="appointment.status === 'Cancelada' ? 'Eliminar cita cancelada' : 'Primero cancela la cita para poder eliminarla'"
                    :disabled="appointment.status !== 'Cancelada'"
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
        <div class="calendar-grid" role="grid" aria-labelledby="appointment-calendar-title">
          <span v-for="weekday in ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']" :key="weekday" class="calendar-weekday" role="columnheader">
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
            role="gridcell"
            :aria-label="`${day.date}, ${day.appointments.length} citas`"
            :aria-pressed="selectedAppointmentDate === day.date"
            @click="emit('selectDay', day.date)"
          >
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
</template>
