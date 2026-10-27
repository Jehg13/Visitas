import { defineStore } from "pinia";
import { ref } from "vue";
export const useDashboardStore = defineStore("dashboard", () => {
    const activeSection = ref("Inicio");
    const dashboardTheme = ref("dark");
    const selectedAppointmentDate = ref("");
    const appointmentFilter = ref("day");
    const appointments = ref([]);
    const externalStaff = ref([]);
    const departments = ref([]);
    const hosts = ref([]);
    const hostAccountOptions = ref([]);
    const businessPartners = ref([]);
    const generalVisitors = ref([]);
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
