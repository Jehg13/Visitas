<script setup lang="ts">
type AppointmentStatus = "Dentro" | "En proceso" | "Pendiente" | "Retirado" | "Cancelada";
type Appointment = {
  id: number;
  date: string;
  time: string;
  visitor: string;
  email: string;
  registeredBy: string;
  company: string;
  host: string;
  status: AppointmentStatus;
};
type Activity = {
  time: string;
  title: string;
  visitor: string;
  company?: string;
  detail: string;
  icon: string;
  tone: string;
};
type SummaryItem = {
  title: string;
  detail: string;
  icon: string;
};

defineProps<{
  appointments: Appointment[];
  activities: Activity[];
  summaryItems: SummaryItem[];
}>();

const emit = defineEmits<{
  createAppointment: [];
  openQr: [appointment: Appointment];
  showToast: [message: string];
  openLog: [];
}>();
</script>

<template>
  <section class="metric-grid" aria-label="Resumen de hoy">
    <article class="metric-card">
      <span class="metric-icon metric-red"><svg class="icon"><use href="#i-calendar" /></svg></span>
      <div class="metric-copy"><p>Citas de hoy</p><strong>12</strong><small><b class="trend-red">↑ +3</b> vs. ayer</small></div>
      <svg class="icon metric-arrow"><use href="#i-chevron" /></svg>
    </article>
    <article class="metric-card">
      <span class="metric-icon metric-blue"><svg class="icon"><use href="#i-user" /></svg></span>
      <div class="metric-copy"><p>Visitantes dentro</p><strong>08</strong><small><b class="trend-green">↑ +1</b> vs. ayer</small></div>
      <svg class="icon metric-arrow"><use href="#i-chevron" /></svg>
    </article>
    <article class="metric-card">
      <span class="metric-icon metric-red"><svg class="icon"><use href="#i-qr" /></svg></span>
      <div class="metric-copy"><p>QR pendientes</p><strong>03</strong><small><b class="trend-red">↑ +2</b> vs. ayer</small></div>
      <svg class="icon metric-arrow"><use href="#i-chevron" /></svg>
    </article>
    <article class="metric-card">
      <span class="metric-icon metric-blue"><svg class="icon"><use href="#i-briefcase" /></svg></span>
      <div class="metric-copy"><p>Equipos registrados</p><strong>24</strong><small><b class="trend-green">↑ +4</b> vs. ayer</small></div>
      <svg class="icon metric-arrow"><use href="#i-chevron" /></svg>
    </article>
  </section>

  <div class="dashboard-panels">
    <section class="panel agenda-panel" aria-labelledby="agenda-title">
      <header class="panel-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-calendar" /></svg>
          <h2 id="agenda-title">Agenda de citas de hoy</h2>
        </div>
        <div class="panel-actions">
          <button class="button-primary" type="button" @click="emit('createAppointment')">
            <svg class="icon"><use href="#i-plus" /></svg><span>Nueva cita</span>
          </button>
          <button class="button-secondary" type="button" @click="emit('showToast', 'Selecciona una cita en la agenda para enviar su QR.')">
            <svg class="icon"><use href="#i-qr" /></svg><span>Enviar QR</span>
          </button>
        </div>
      </header>

      <div class="table-scroll">
        <table class="appointment-table">
          <thead>
            <tr>
              <th>Hora</th><th>Visitante</th><th>Empresa</th><th>Anfitrión</th><th>Estado</th><th>QR</th><th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="appointment in appointments" :key="`${appointment.time}-${appointment.visitor}`">
              <td class="appointment-time">{{ appointment.time }}</td>
              <td><strong>{{ appointment.visitor }}</strong><small>{{ appointment.registeredBy }}</small></td>
              <td>{{ appointment.company }}</td>
              <td>{{ appointment.host }}</td>
              <td><span class="status-pill" :class="`status-${appointment.status.replace(' ', '-').toLowerCase()}`">{{ appointment.status }}</span></td>
              <td>
                <button class="qr-button" type="button" :aria-label="`Ver QR de ${appointment.visitor}`" @click="emit('openQr', appointment)">
                  <svg class="icon"><use href="#i-qr" /></svg><span>Ver QR</span>
                </button>
              </td>
              <td><button class="row-menu" type="button" :aria-label="`Más opciones para ${appointment.visitor}`" @click="emit('showToast', `Cita de ${appointment.visitor}`)"><svg class="icon"><use href="#i-dots" /></svg></button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel activity-panel" aria-labelledby="activity-title">
      <header class="panel-heading activity-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-clock" /></svg>
          <h2 id="activity-title">Actividad reciente</h2>
        </div>
        <button class="history-link" type="button" @click="emit('openLog')">
          Ver toda la bitácora <svg class="icon"><use href="#i-arrow" /></svg>
        </button>
      </header>

      <div class="activity-list">
        <article v-for="(activity, index) in activities" :key="`${activity.time}-${index}`" class="activity-item">
          <span class="activity-marker" :class="`tone-${activity.tone}`"><svg class="icon"><use :href="`#i-${activity.icon}`" /></svg></span>
          <time>{{ activity.time }}</time>
          <div class="activity-copy">
            <strong :class="`text-${activity.tone}`">{{ activity.title }}</strong>
            <p v-if="activity.company"><b>{{ activity.visitor }}</b><span>•</span>{{ activity.company }}</p>
            <p v-else><b>{{ activity.visitor }}</b></p>
            <small>{{ activity.detail }}</small>
          </div>
          <svg class="icon activity-arrow"><use href="#i-chevron" /></svg>
        </article>
      </div>

      <aside class="external-data">
        <svg class="icon"><use href="#i-shield" /></svg>
        <div><strong>Datos del personal externo</strong><p>Registra personal externo, contratistas, proveedores y visitantes con sus datos básicos, empresa y motivo de visita.</p></div>
      </aside>
    </section>
  </div>

  <footer class="dashboard-summary" aria-label="Funciones del sistema">
    <article v-for="item in summaryItems" :key="item.title" class="summary-item">
      <svg class="icon"><use :href="`#i-${item.icon}`" /></svg>
      <div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p></div>
    </article>
  </footer>
</template>
