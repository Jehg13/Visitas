import { defineStore } from "pinia";
import { ref } from "vue";
import type {
  Appointment,
  BusinessPartner,
  Department,
  ExternalStaff,
  GeneralVisitor,
  Host,
  HostAccountOption,
} from "./types";

export const useDashboardStore = defineStore("dashboard", () => {
  const activeSection = ref("Inicio");
  const dashboardTheme = ref<"dark" | "light">("dark");
  const selectedAppointmentDate = ref("");
  const appointmentFilter = ref<"day" | "all">("day");
  const appointments = ref<Appointment[]>([]);
  const externalStaff = ref<ExternalStaff[]>([]);
  const departments = ref<Department[]>([]);
  const hosts = ref<Host[]>([]);
  const hostAccountOptions = ref<HostAccountOption[]>([]);
  const businessPartners = ref<BusinessPartner[]>([]);
  const generalVisitors = ref<GeneralVisitor[]>([]);

  function reset() {
    activeSection.value = "Inicio";
    dashboardTheme.value = "dark";
    selectedAppointmentDate.value = "";
    appointmentFilter.value = "day";
    appointments.value = [];
    externalStaff.value = [];
    departments.value = [];
    hosts.value = [];
    hostAccountOptions.value = [];
    businessPartners.value = [];
    generalVisitors.value = [];
  }

  return {
    activeSection,
    dashboardTheme,
    selectedAppointmentDate,
    appointmentFilter,
    appointments,
    externalStaff,
    departments,
    hosts,
    hostAccountOptions,
    businessPartners,
    generalVisitors,
    reset,
  };
});
