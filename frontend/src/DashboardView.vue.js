import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import QRCode from "qrcode";
import { confirmUser, notifyUser } from "./notifications";
import DepartmentSection from "./sections/DepartmentSection.vue";
import DailyLogSection from "./sections/DailyLogSection.vue";
import EquipmentSection from "./sections/EquipmentSection.vue";
import HostsSection from "./sections/HostsSection.vue";
import ExternalStaffSection from "./sections/ExternalStaffSection.vue";
import AppointmentsSection from "./sections/AppointmentsSection.vue";
import HomeSection from "./sections/HomeSection.vue";
import BusinessDirectorySection from "./sections/BusinessDirectorySection.vue";
import AccessSection from "./sections/AccessSection.vue";
import { useAuthStore } from "./stores/auth";
import { useDashboardStore } from "./stores/dashboard";
import { dashboardSectionForPath, dashboardSectionPaths } from "./dashboardRoutes";
const otherAppointmentVisitor = "__otro__";
const emit = defineEmits();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const { activeSection, dashboardTheme, selectedAppointmentDate, appointmentFilter, appointments, externalStaff, departments, hosts, hostAccountOptions, businessPartners, generalVisitors, } = storeToRefs(dashboardStore);
const { accounts: accessAccounts } = storeToRefs(authStore);
const currentUser = computed(() => authStore.user);
const otherHostAccountOption = "__otro__";
const dashboardSections = [
    "Inicio",
    "Agenda de citas",
    "Anfitriones",
    "Accesos",
    "Departamento",
    "Personal de externos",
    "Contratistas, proveedores y visitantes",
    "Equipo y herramientas",
    "Bitácora diaria",
];
const visibleNavigationGroups = computed(() => navigationGroups
    .map((group) => ({
    ...group,
    items: group.items.filter((item) => allowedDashboardSections.value.includes(item.label)),
}))
    .filter((group) => group.items.length > 0));
function getStoredDashboardSection(login) {
    const key = `visitas:${encodeURIComponent(login)}:active-section`;
    let section = null;
    try {
        section = localStorage.getItem(key);
    }
    catch (error) {
        console.warn("No se pudo restaurar la sección guardada del dashboard:", error);
    }
    if (!section || !dashboardSections.includes(section)) {
        try {
            section = sessionStorage.getItem(key);
        }
        catch (fallbackError) {
            console.error("No se pudo restaurar la sección de la sesión actual:", fallbackError);
        }
    }
    return section && dashboardSections.includes(section) ? section : "Inicio";
}
function getStoredDashboardTheme(login) {
    try {
        const theme = localStorage.getItem(`visitas:${encodeURIComponent(login)}:theme`);
        return theme === "light" ? "light" : "dark";
    }
    catch (error) {
        console.error("No se pudo restaurar el tema del dashboard:", error);
        return "dark";
    }
}
function isStoredHost(value) {
    if (typeof value !== "object" || value === null)
        return false;
    if (!("id" in value) || typeof value.id !== "number" ||
        !("login" in value) || typeof value.login !== "string" ||
        !("name" in value) || typeof value.name !== "string" ||
        !("departmentId" in value) || typeof value.departmentId !== "number" ||
        !("role" in value) || typeof value.role !== "string" ||
        !("email" in value) || typeof value.email !== "string" ||
        !("phone" in value) || typeof value.phone !== "string" ||
        !("accessRoles" in value) || !Array.isArray(value.accessRoles)) {
        return false;
    }
    return value.accessRoles.every((role) => role === "Administrador" || role === "Recepción" || role === "Anfitriones");
}
function getStoredHosts() {
    try {
        const storedHosts = localStorage.getItem("visitas:hosts");
        if (!storedHosts)
            return [];
        const parsed = JSON.parse(storedHosts);
        return Array.isArray(parsed) ? parsed.filter(isStoredHost) : [];
    }
    catch (error) {
        console.error("No se pudieron restaurar los anfitriones locales:", error);
        return [];
    }
}
activeSection.value =
    dashboardSectionForPath(route.path) ?? getStoredDashboardSection(currentUser.value.login);
dashboardTheme.value = getStoredDashboardTheme(currentUser.value.login);
selectedAppointmentDate.value = getLocalDate();
hosts.value = getStoredHosts();
const allowedDashboardSections = computed(() => {
    if (currentUser.value.isAdmin)
        return dashboardSections;
    if (currentUser.value.sectionAccess.includes("recepcion")) {
        return [
            "Agenda de citas",
            "Bitácora diaria",
        ];
    }
    if (currentUser.value.sectionAccess.includes("anfitriones")) {
        return [
            "Agenda de citas",
            "Personal de externos",
            "Contratistas, proveedores y visitantes",
            "Equipo y herramientas",
        ];
    }
    return [];
});
const isReception = computed(() => !currentUser.value.isAdmin && currentUser.value.sectionAccess.includes("recepcion"));
const isHost = computed(() => !currentUser.value.isAdmin &&
    currentUser.value.sectionAccess.includes("anfitriones") &&
    !currentUser.value.sectionAccess.includes("recepcion"));
if (isHost.value)
    appointmentFilter.value = "all";
const currentRoleLabel = computed(() => currentUser.value.isAdmin
    ? "Programador"
    : isReception.value
        ? "Recepción"
        : "Anfitrión");
const drawerOpen = ref(false);
const privateMenuOpen = ref(false);
const appointmentDialogOpen = ref(false);
const editingAppointmentId = ref(null);
const qrDialogOpen = ref(false);
const qrAppointment = ref(null);
const qrExternalStaff = ref(null);
const qrDataUrl = ref("");
const qrGenerating = ref(false);
const qrDispatchAppointment = ref(null);
const sendingExternalQrStaffId = ref(null);
const deletingAppointmentId = ref(null);
const dailyLogInitialRange = ref(null);
const externalStaffDialogOpen = ref(false);
const editingExternalStaffId = ref(null);
const externalStaffSaving = ref(false);
const businessPartnerDialogOpen = ref(false);
const editingBusinessPartnerId = ref(null);
const visitorName = ref("");
const visitorEmail = ref("");
const visitorSelection = ref("");
const visitorCompanyId = ref(null);
const visitorHostLogin = ref("");
const visitorDate = ref(getLocalDate());
const visitorTime = ref("18:00");
const appointmentSaving = ref(false);
const appointmentLoading = ref(false);
const appointmentSearch = ref("");
const appointmentsPage = ref(1);
const appointmentsPerPage = 5;
const calendarMonth = ref(getLocalDate().slice(0, 7));
const externalStaffSearch = ref("");
const externalStaffName = ref("");
const externalStaffPhone = ref("");
const externalStaffEmail = ref("");
const externalStaffRelationshipType = ref("Contratista");
const externalStaffBusinessPartnerId = ref(null);
const departmentDialogOpen = ref(false);
const editingDepartmentId = ref(null);
const departmentName = ref("");
const departmentSaving = ref(false);
const hostRole = ref("");
const hostDialogOpen = ref(false);
const editingHostId = ref(null);
const hostSaving = ref(false);
const nextHostId = ref(Math.max(0, ...hosts.value.map((host) => host.id)));
const hostAccountSelection = ref("");
const editingAccessAccount = ref(null);
const accessAccountRoleDraft = ref("");
const accessAccountSaving = ref(false);
const hostSearch = ref("");
const accessSearch = ref("");
const hostLogin = ref("");
const hostName = ref("");
const hostDepartmentId = ref(null);
const hostEmail = ref("");
const hostPhone = ref("");
const businessDirectoryLoading = ref(false);
const businessPartnerSaving = ref(false);
const nextBusinessPartnerId = ref(0);
const businessPartnerSearch = ref("");
const businessPartnerTypeFilter = ref("Todas");
const businessPartnerCategoryFilter = ref("Todas");
const businessPartnerStatusFilter = ref("Todas");
const businessPartnerPage = ref(1);
const partnerRowsPerPage = 7;
const businessPartnerName = ref("");
const businessPartnerDescription = ref("");
const businessPartnerRfc = ref("");
const businessPartnerCategory = ref("");
const businessPartnerSubject = ref("");
const businessPartnerEmployeeCount = ref(1);
const businessPartnerType = ref("Contratista");
const businessPartnerStatus = ref("Activa");
watch(allowedDashboardSections, (sections) => {
    if (!sections.includes(activeSection.value)) {
        activeSection.value = sections[0] ?? "";
    }
}, { immediate: true });
watch(() => route.path, (path) => {
    const section = dashboardSectionForPath(path);
    if (section) {
        if (allowedDashboardSections.value.includes(section)) {
            activeSection.value = section;
        }
        else {
            void router.replace(dashboardSectionPaths[allowedDashboardSections.value[0]] ?? "/");
        }
        return;
    }
    if (path !== "/")
        void router.replace("/");
}, { immediate: true });
watch(accessAccounts, (accounts) => {
    const sectionsByLogin = new Map(accounts.map((account) => [account.login.toLocaleLowerCase(), account.sectionAccess]));
    hosts.value = hosts.value.map((host) => {
        const sections = sectionsByLogin.get(host.login.toLocaleLowerCase());
        if (!sections)
            return host;
        return {
            ...host,
            accessRoles: [
                ...(sections.includes("administrador") ? ["Administrador"] : []),
                ...(sections.includes("recepcion") ? ["Recepción"] : []),
                ...(sections.includes("anfitriones") ? ["Anfitriones"] : []),
            ],
        };
    });
}, { immediate: true });
watch(activeSection, (section) => {
    const key = `visitas:${encodeURIComponent(currentUser.value.login)}:active-section`;
    try {
        localStorage.setItem(key, section);
    }
    catch (error) {
        console.warn("No se pudo guardar la sección del dashboard de forma permanente:", error);
        try {
            sessionStorage.setItem(key, section);
        }
        catch (fallbackError) {
            console.error("No se pudo guardar la sección de la sesión actual:", fallbackError);
        }
    }
    if (section === "Bitácora diaria")
        void loadAppointments();
}, { flush: "sync" });
watch(hosts, (storedHosts) => {
    try {
        localStorage.setItem("visitas:hosts", JSON.stringify(storedHosts));
    }
    catch (error) {
        console.error("No se pudieron guardar los anfitriones locales:", error);
        showToast("No se pudieron guardar los anfitriones en este navegador.");
    }
}, { deep: true });
const selectableHostAccounts = computed(() => hostAccountOptions.value.filter((account) => !hosts.value.some((host) => host.login.toLocaleLowerCase() === account.login.toLocaleLowerCase() &&
    host.id !== editingHostId.value)));
const externalStaffPartnerOptions = computed(() => businessPartners.value.filter((partner) => partner.type !== "Visitante" &&
    partner.type === externalStaffRelationshipType.value));
let liveRefreshTimer;
function refreshVisibleSection() {
    if (document.visibilityState !== "visible")
        return;
    if (activeSection.value === "Inicio" ||
        activeSection.value === "Agenda de citas" ||
        activeSection.value === "Bitácora diaria") {
        void loadAppointments(true);
    }
    if (activeSection.value === "Personal de externos" ||
        activeSection.value === "Contratistas, proveedores y visitantes" ||
        activeSection.value === "Agenda de citas" ||
        activeSection.value === "Bitácora diaria") {
        void loadBusinessDirectory(true);
    }
    if (activeSection.value === "Departamento" && (currentUser.value.isAdmin || isReception.value)) {
        void loadDepartments(true);
    }
    if (activeSection.value === "Anfitriones" && currentUser.value.isAdmin) {
        void loadHostAccounts(true);
    }
}
onMounted(() => {
    if (currentUser.value.isAdmin || isReception.value)
        void loadDepartments();
    if (currentUser.value.isAdmin || isReception.value || isHost.value) {
        void loadBusinessDirectory();
        void loadAppointments();
    }
    if (currentUser.value.isAdmin) {
        void loadHostAccounts();
    }
    liveRefreshTimer = window.setInterval(refreshVisibleSection, 30000);
});
onBeforeUnmount(() => {
    if (liveRefreshTimer !== undefined)
        window.clearInterval(liveRefreshTimer);
});
watch(dashboardTheme, (theme) => {
    try {
        localStorage.setItem(`visitas:${encodeURIComponent(currentUser.value.login)}:theme`, theme);
    }
    catch (error) {
        console.error("No se pudo guardar la preferencia del tema:", error);
    }
});
async function loadAppointments(silent = false) {
    if (appointmentsRequestInProgress)
        return;
    appointmentsRequestInProgress = true;
    if (!silent)
        appointmentLoading.value = true;
    try {
        const response = await fetch("/api/appointments");
        const result = await response.json();
        if (!response.ok) {
            const message = result.error ?? "No se pudo cargar la agenda.";
            if (silent)
                console.error(message);
            else
                showToast(message);
            return;
        }
        if (!Array.isArray(result.appointments)) {
            console.error("La API devolvió una lista de citas con formato inválido.");
            if (!silent)
                showToast("No se pudo cargar la agenda.");
            return;
        }
        appointments.value = result.appointments;
    }
    catch (error) {
        console.error("Failed to load appointments:", error);
        if (!silent)
            showToast("No se pudo conectar con el servidor para cargar la agenda.");
    }
    finally {
        appointmentsRequestInProgress = false;
        if (!silent)
            appointmentLoading.value = false;
    }
}
async function loadBusinessDirectory(silent = false) {
    if (businessDirectoryRequestInProgress)
        return;
    businessDirectoryRequestInProgress = true;
    if (!silent)
        businessDirectoryLoading.value = true;
    try {
        const [partnersResponse, visitorsResponse, externalStaffResponse] = await Promise.all([
            fetch("/api/business-partners"),
            fetch("/api/general-visitors"),
            fetch("/api/external-staff"),
        ]);
        const [partnersResult, visitorsResult, externalStaffResult] = await Promise.all([
            partnersResponse.json(),
            visitorsResponse.json(),
            externalStaffResponse.json(),
        ]);
        if (!partnersResponse.ok) {
            const message = partnersResult.error ?? "No se pudieron cargar los contratistas y proveedores.";
            if (silent)
                console.error(message);
            else
                showToast(message);
            return;
        }
        if (!Array.isArray(partnersResult.businessPartners)) {
            console.error("La API devolvió una lista de empresas con formato inválido.");
            if (!silent)
                showToast("No se pudo cargar el directorio de empresas.");
            return;
        }
        if (!visitorsResponse.ok) {
            const message = visitorsResult.error ?? "No se pudo cargar el público general.";
            if (silent)
                console.error(message);
            else
                showToast(message);
            return;
        }
        if (!Array.isArray(visitorsResult.generalVisitors)) {
            console.error("La API devolvió una lista de personas con formato inválido.");
            if (!silent)
                showToast("No se pudo cargar el público general.");
            return;
        }
        if (!externalStaffResponse.ok) {
            const message = externalStaffResult.error ?? "No se pudo cargar el personal externo.";
            if (silent)
                console.error(message);
            else
                showToast(message);
            return;
        }
        if (!Array.isArray(externalStaffResult.externalStaff)) {
            console.error("La API devolvió una lista de personal externo con formato inválido.");
            if (!silent)
                showToast("No se pudo cargar el personal externo.");
            return;
        }
        businessPartners.value = partnersResult.businessPartners;
        generalVisitors.value = visitorsResult.generalVisitors;
        externalStaff.value = externalStaffResult.externalStaff;
    }
    catch (error) {
        console.error("Failed to load business directory:", error);
        if (!silent)
            showToast("No se pudo conectar con el servidor para cargar el directorio.");
    }
    finally {
        businessDirectoryRequestInProgress = false;
        if (!silent)
            businessDirectoryLoading.value = false;
    }
}
function openAccessAccountEditor(account) {
    editingAccessAccount.value = account;
    accessAccountRoleDraft.value =
        account.hasFullAccess || account.sectionAccess.includes("administrador")
            ? "administrador"
            : account.sectionAccess.includes("recepcion")
                ? "recepcion"
                : "";
}
async function saveAccessAccount() {
    const account = editingAccessAccount.value;
    if (!account || accessAccountSaving.value)
        return;
    accessAccountSaving.value = true;
    try {
        const response = await fetch(`/api/access/${encodeURIComponent(account.login)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sections: accessAccountRoleDraft.value ? [accessAccountRoleDraft.value] : [],
            }),
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo actualizar el acceso.");
            return;
        }
        if (!Array.isArray(result.accounts)) {
            showToast("Los permisos se guardaron, pero no se pudo actualizar la lista.");
            return;
        }
        accessAccounts.value = result.accounts;
        editingAccessAccount.value = null;
        showToast(`Se actualizaron las secciones autorizadas para ${account.login}.`, "success");
    }
    catch (error) {
        console.error("Failed to save account section access:", error);
        showToast("No se pudo conectar con el servidor para actualizar el acceso.");
    }
    finally {
        accessAccountSaving.value = false;
    }
}
function getLocalDate() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
}
function formatLocalDate(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}
const navigationGroups = [
    {
        title: "ORGANIZACIÓN",
        items: [
            { label: "Departamento", icon: "organization" },
            { label: "Anfitriones", icon: "users" },
            { label: "Accesos", icon: "shield" },
        ],
    },
    {
        title: "EXTERNOS",
        items: [
            { label: "Contratistas, proveedores y visitantes", icon: "people" },
            { label: "Personal de externos", icon: "user" },
            { label: "Equipo y herramientas", icon: "tool" },
        ],
    },
];
let appointmentsRequestInProgress = false;
let businessDirectoryRequestInProgress = false;
const summaryItems = [
    {
        title: "Personal externo",
        detail: "Nombre, empresa, motivo, contacto, vigencia.",
        icon: "people",
    },
    {
        title: "Crear cita (anfitrión)",
        detail: "Selecciona visitante, fecha, hora y anfitrión. Descarga el QR para compartirlo.",
        icon: "calendar",
    },
    {
        title: "Equipo y herramienta",
        detail: "Campos: cantidad, producto, marca, modelo, número de serie, color.",
        icon: "tool",
    },
    {
        title: "Bitácora diaria",
        detail: "Campos: llegada, ingreso, retiro, observaciones.",
        icon: "note",
    },
];
const pageTitle = computed(() => !activeSection.value
    ? "Sin acceso asignado"
    : activeSection.value === "Inicio"
        ? "Panel de control"
        : activeSection.value);
const hostEligibleDepartments = computed(() => departments.value);
const appointmentCompanyOptions = computed(() => [...businessPartners.value]
    .filter((partner) => partner.type !== "Visitante")
    .sort((first, second) => first.name.localeCompare(second.name, "es")));
const appointmentHostOptions = computed(() => isHost.value
    ? [{
            id: 0,
            login: currentUser.value.login,
            name: currentUser.value.name?.trim() || currentUser.value.login,
            departmentId: 0,
            role: currentUser.value.role ?? "",
            email: currentUser.value.email ?? "",
            phone: "",
            accessRoles: [],
        }]
    : [...hosts.value].sort((first, second) => first.name.localeCompare(second.name, "es")));
const appointmentVisitorOptions = computed(() => externalStaff.value
    .filter((staff) => staff.businessPartnerId === visitorCompanyId.value)
    .sort((first, second) => first.fullName.localeCompare(second.fullName, "es")));
const filteredHosts = computed(() => {
    const query = hostSearch.value.trim().toLocaleLowerCase();
    if (!query)
        return hosts.value;
    return hosts.value.filter((host) => {
        const departmentName = departments.value.find((department) => department.id === host.departmentId)?.name ?? "";
        return [
            host.login,
            host.name,
            departmentName,
            host.role,
            host.email,
            host.phone,
            host.accessRoles.join(" "),
        ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query);
    });
});
const businessPartnerCategories = computed(() => [...new Set(businessPartners.value.map((partner) => partner.category).filter(Boolean))].sort((first, second) => first.localeCompare(second, "es")));
const filteredBusinessPartners = computed(() => {
    const query = businessPartnerSearch.value.trim().toLocaleLowerCase();
    return businessPartners.value.filter((partner) => {
        const matchesQuery = !query ||
            [
                partner.name,
                partner.description,
                partner.rfc,
                partner.category,
                partner.type,
                partner.status,
            ]
                .join(" ")
                .toLocaleLowerCase()
                .includes(query);
        const matchesType = businessPartnerTypeFilter.value === "Todas" ||
            partner.type === businessPartnerTypeFilter.value;
        const matchesCategory = businessPartnerCategoryFilter.value === "Todas" ||
            partner.category === businessPartnerCategoryFilter.value;
        const matchesStatus = businessPartnerStatusFilter.value === "Todas" ||
            partner.status === businessPartnerStatusFilter.value;
        return matchesQuery && matchesType && matchesCategory && matchesStatus;
    });
});
const paginatedBusinessPartners = computed(() => {
    const start = (businessPartnerPage.value - 1) * partnerRowsPerPage;
    return filteredBusinessPartners.value.slice(start, start + partnerRowsPerPage);
});
const businessPartnerPages = computed(() => Math.max(1, Math.ceil(filteredBusinessPartners.value.length / partnerRowsPerPage)));
const selectedAppointments = computed(() => appointments.value
    .filter((appointment) => appointmentFilter.value === "all" || appointment.date === selectedAppointmentDate.value)
    .sort((first, second) => first.date.localeCompare(second.date) || first.time.localeCompare(second.time)));
const searchedAppointments = computed(() => {
    const query = appointmentSearch.value.trim().toLocaleLowerCase();
    if (!query)
        return selectedAppointments.value;
    return selectedAppointments.value.filter((appointment) => [
        appointment.date,
        appointment.visitor,
        appointment.company,
        appointment.host,
        appointment.status,
    ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query));
});
const totalAppointmentPages = computed(() => Math.max(1, Math.ceil(searchedAppointments.value.length / appointmentsPerPage)));
const paginatedAppointments = computed(() => {
    const start = (appointmentsPage.value - 1) * appointmentsPerPage;
    return searchedAppointments.value.slice(start, start + appointmentsPerPage);
});
const calendarMonthLabel = computed(() => {
    const [year, month] = calendarMonth.value.split("-").map(Number);
    return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
});
const calendarDays = computed(() => {
    const [year, month] = calendarMonth.value.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(year, month - 1, 1 - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + index);
        const dateKey = formatLocalDate(date);
        return {
            date: dateKey,
            day: date.getDate(),
            inMonth: date.getMonth() === month - 1,
            appointments: appointments.value
                .filter((appointment) => appointment.date === dateKey)
                .sort((first, second) => first.time.localeCompare(second.time)),
        };
    });
});
const activeAppointmentCount = computed(() => selectedAppointments.value.filter((appointment) => appointment.status !== "Retirado" && appointment.status !== "Cancelada").length);
watch([selectedAppointmentDate, appointmentSearch, appointmentFilter], () => {
    appointmentsPage.value = 1;
});
watch([
    businessPartnerSearch,
    businessPartnerTypeFilter,
    businessPartnerCategoryFilter,
    businessPartnerStatusFilter,
], () => {
    businessPartnerPage.value = 1;
});
watch(filteredBusinessPartners, () => {
    if (businessPartnerPage.value > businessPartnerPages.value) {
        businessPartnerPage.value = businessPartnerPages.value;
    }
});
watch(selectedAppointmentDate, (date) => {
    calendarMonth.value = date.slice(0, 7);
    appointmentFilter.value = "day";
});
watch(appointmentsPage, (page) => {
    if (page > totalAppointmentPages.value) {
        appointmentsPage.value = totalAppointmentPages.value;
    }
});
function selectSection(label) {
    if (!allowedDashboardSections.value.includes(label))
        return;
    activeSection.value = label;
    drawerOpen.value = false;
    const path = dashboardSectionPaths[label];
    if (path && route.path !== path)
        void router.push(path);
}
function openDailyLogRange(from, to) {
    dailyLogInitialRange.value = { from, to };
    selectSection("Bitácora diaria");
}
async function loadDepartments(silent = false) {
    try {
        const response = await fetch("/api/departments");
        const result = await response.json();
        if (!response.ok) {
            const message = result.error ?? "No se pudieron cargar los departamentos.";
            if (silent)
                console.error(message);
            else
                showToast(message);
            return;
        }
        if (!Array.isArray(result.departments)) {
            console.error("La API devolvió una lista de departamentos con formato inválido.");
            if (!silent)
                showToast("No se pudieron cargar los departamentos.");
            return;
        }
        departments.value = result.departments;
    }
    catch (error) {
        console.error("Failed to load departments:", error);
        if (!silent)
            showToast("No se pudo conectar con el servidor para cargar los departamentos.");
    }
}
async function loadHostAccounts(silent = false) {
    try {
        const response = await fetch("/api/host-accounts");
        const result = await response.json();
        if (!response.ok) {
            const message = result.error ?? "No se pudieron cargar las cuentas de Accesos.";
            if (silent)
                console.error(message);
            else
                showToast(message);
            return;
        }
        if (!Array.isArray(result.accounts)) {
            console.error("La API devolvió opciones de anfitrión con formato inválido.");
            if (!silent)
                showToast("No se pudieron cargar las cuentas de Accesos.");
            return;
        }
        hostAccountOptions.value = result.accounts;
    }
    catch (error) {
        console.error("Failed to load host account options:", error);
        if (!silent)
            showToast("No se pudo conectar con el servidor para cargar las cuentas de Accesos.");
    }
}
function showToast(message, type = "error") {
    notifyUser(message, type);
}
async function logout() {
    try {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        if (!response.ok) {
            showToast("No se pudo cerrar la sesión. Inténtalo de nuevo.");
            return;
        }
        emit("logout");
    }
    catch (error) {
        console.error("Failed to log out:", error);
        showToast("No se pudo conectar con el servidor para cerrar la sesión.");
    }
}
async function createAppointmentQr(appointment, staff) {
    return QRCode.toDataURL(JSON.stringify({
        type: "visitas-appointment",
        id: appointment.id,
        referenceCode: appointment.referenceCode,
        visitor: staff?.fullName ?? appointment.visitor,
        ...(staff ? { externalStaffId: staff.id } : {}),
        company: appointment.company,
        host: appointment.host,
        date: appointment.date,
        time: appointment.time,
    }), {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 320,
        color: { dark: "#10243a", light: "#ffffff" },
    });
}
async function openQrDialog(appointment) {
    qrExternalStaff.value = null;
    qrAppointment.value = appointment;
    qrDataUrl.value = "";
    qrGenerating.value = true;
    qrDialogOpen.value = true;
    try {
        qrDataUrl.value = await createAppointmentQr(appointment);
    }
    catch (error) {
        console.error("Failed to generate appointment QR:", error);
        showToast("No se pudo generar el código QR de esta cita.");
        qrDialogOpen.value = false;
    }
    finally {
        qrGenerating.value = false;
    }
}
function openCompanyQrDispatch(appointment) {
    if (appointment.partnerType !== "Contratista" || !appointment.businessPartnerId) {
        showToast("Esta cita no está vinculada a un contratista.");
        return;
    }
    qrDispatchAppointment.value = appointment;
    selectSection("Personal de externos");
}
async function openExternalStaffQr(staff) {
    const appointment = qrDispatchAppointment.value;
    if (!appointment) {
        showToast("No se encontró la cita para generar este QR.");
        return;
    }
    qrAppointment.value = appointment;
    qrExternalStaff.value = staff;
    qrDataUrl.value = "";
    qrGenerating.value = true;
    qrDialogOpen.value = true;
    try {
        qrDataUrl.value = await createAppointmentQr(appointment, staff);
    }
    catch (error) {
        console.error("Failed to generate external staff appointment QR:", error);
        showToast("No se pudo generar el código QR de este empleado.");
        qrDialogOpen.value = false;
    }
    finally {
        qrGenerating.value = false;
    }
}
async function sendExternalStaffQr(staff) {
    const appointment = qrDispatchAppointment.value;
    if (!appointment || staff.businessPartnerId !== appointment.businessPartnerId) {
        showToast("El empleado no pertenece a la empresa de esta cita.");
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staff.email.trim())) {
        showToast("El envío está bloqueado hasta registrar un correo electrónico válido.");
        return;
    }
    if (sendingExternalQrStaffId.value !== null)
        return;
    const equipmentRecipient = externalStaff.value
        .filter((person) => person.businessPartnerId === appointment.businessPartnerId &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim()))
        .sort((first, second) => first.id - second.id)[0];
    const receivesEquipmentLink = equipmentRecipient?.id === staff.id;
    const confirmed = await confirmUser(receivesEquipmentLink
        ? `Se enviará el QR de ${staff.fullName} a ${staff.email}. Si la declaración aún está pendiente, este correo incluirá el enlace para declarar equipo y herramientas. Ese enlace solo puede usarse una vez y se desactiva al enviar la declaración; solo esta persona lo recibe. ¿Continuar?`
        : `Se enviará el QR de ${staff.fullName} a ${staff.email}. El enlace de declaración de equipo se envía únicamente a ${equipmentRecipient?.fullName ?? "la primera persona con correo válido"}. ¿Continuar?`, "Enviar QR");
    if (!confirmed)
        return;
    sendingExternalQrStaffId.value = staff.id;
    try {
        const response = await fetch(`/api/appointments/${appointment.id}/send-qr`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeId: staff.id }),
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo enviar el QR al empleado.");
            return;
        }
        if (!result.message) {
            console.error("La API no devolvió la confirmación del envío del QR.");
            showToast("El servidor no confirmó el envío del QR.");
            return;
        }
        showToast(result.message, "success");
    }
    catch (error) {
        console.error("Failed to send external staff appointment QR:", error);
        showToast("No se pudo conectar con el servidor para enviar el QR.");
    }
    finally {
        sendingExternalQrStaffId.value = null;
    }
}
function clearQrDispatch() {
    qrDispatchAppointment.value = null;
}
function openAppointmentDialog(appointment) {
    editingAppointmentId.value = appointment?.id ?? null;
    visitorDate.value = appointment?.date ?? selectedAppointmentDate.value;
    visitorTime.value = appointment?.time ?? "18:00";
    visitorName.value = appointment?.visitor ?? "";
    visitorEmail.value = appointment?.email ?? "";
    visitorSelection.value = appointment ? otherAppointmentVisitor : "";
    visitorCompanyId.value = appointment
        ? appointment.businessPartnerId ??
            businessPartners.value.find((partner) => partner.name === appointment.company)?.id ??
            null
        : null;
    visitorHostLogin.value = isHost.value
        ? currentUser.value.login
        : hosts.value.find((host) => host.name === appointment?.host)?.login ?? "";
    appointmentDialogOpen.value = true;
}
function openHomeAppointmentDialog(date) {
    openAppointmentDialog();
    visitorDate.value = date;
}
function changeAppointmentCompany() {
    visitorSelection.value = "";
    visitorName.value = "";
    visitorEmail.value = "";
}
function changeAppointmentVisitor() {
    if (visitorSelection.value === otherAppointmentVisitor) {
        visitorName.value = "";
        visitorEmail.value = "";
        return;
    }
    const visitor = appointmentVisitorOptions.value.find((staff) => String(staff.id) === visitorSelection.value);
    visitorName.value = visitor?.fullName ?? "";
    visitorEmail.value = visitor?.email ?? "";
}
function changeCalendarMonth(offset) {
    const [year, month] = calendarMonth.value.split("-").map(Number);
    const nextMonth = new Date(year, month - 1 + offset, 1);
    calendarMonth.value = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
}
function openDepartmentDialog(department) {
    editingDepartmentId.value = department?.id ?? null;
    departmentName.value = department?.name ?? "";
    departmentDialogOpen.value = true;
}
async function submitDepartment() {
    const name = departmentName.value.trim();
    if (!name || departmentSaving.value)
        return;
    const duplicate = departments.value.some((department) => department.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
        department.id !== editingDepartmentId.value);
    if (duplicate) {
        showToast("Ya existe un departamento con ese nombre.");
        return;
    }
    departmentSaving.value = true;
    try {
        const departmentId = editingDepartmentId.value;
        const response = await fetch(departmentId === null
            ? "/api/departments"
            : `/api/departments/${departmentId}`, {
            method: departmentId === null ? "POST" : "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo guardar el departamento.");
            return;
        }
        if (!Array.isArray(result.departments)) {
            console.error("La API devolvió una lista de departamentos con formato inválido.");
            showToast("El cambio se guardó, pero no se pudo actualizar la lista. Recarga la sección.");
            return;
        }
        departments.value = result.departments;
        departmentDialogOpen.value = false;
        editingDepartmentId.value = null;
        departmentName.value = "";
        showToast(departmentId === null ? "El departamento se guardó correctamente." : "El departamento se actualizó.", "success");
    }
    catch (error) {
        console.error("Failed to save department:", error);
        showToast("No se pudo conectar con el servidor para guardar el departamento.");
    }
    finally {
        departmentSaving.value = false;
    }
}
async function removeDepartment(id) {
    if (hosts.value.some((host) => host.departmentId === id)) {
        showToast("No se puede eliminar el departamento porque tiene anfitriones asignados.");
        return;
    }
    try {
        const response = await fetch(`/api/departments/${id}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo eliminar el departamento.");
            return;
        }
        if (!Array.isArray(result.departments)) {
            console.error("La API devolvió una lista de departamentos con formato inválido.");
            showToast("El departamento se eliminó, pero no se pudo actualizar la lista. Recarga la sección.");
            return;
        }
        departments.value = result.departments;
        showToast("El departamento se eliminó.", "success");
    }
    catch (error) {
        console.error("Failed to delete department:", error);
        showToast("No se pudo conectar con el servidor para eliminar el departamento.");
    }
}
function openHostDialog(host) {
    editingHostId.value = host?.id ?? null;
    hostLogin.value = host?.login ?? "";
    hostName.value = host?.name ?? "";
    hostDepartmentId.value =
        host?.departmentId ?? hostEligibleDepartments.value[0]?.id ?? departments.value[0]?.id ?? null;
    hostRole.value = host?.role ?? "";
    hostEmail.value = host?.email ?? "";
    hostPhone.value = host?.phone ?? "";
    hostAccountSelection.value = host
        ? hostAccountOptions.value.some((account) => account.login.toLocaleLowerCase() === host.login.toLocaleLowerCase())
            ? host.login
            : otherHostAccountOption
        : "";
    hostDialogOpen.value = true;
}
function selectHostAccount(login) {
    hostAccountSelection.value = login;
    if (login === otherHostAccountOption) {
        hostLogin.value = "";
        hostName.value = "";
        hostEmail.value = "";
        hostRole.value = "";
        hostPhone.value = "";
        return;
    }
    const account = hostAccountOptions.value.find((item) => item.login === login);
    if (!account) {
        showToast("No se encontró la cuenta seleccionada en Accesos.");
        hostAccountSelection.value = otherHostAccountOption;
        return;
    }
    hostLogin.value = account.login;
    hostName.value = account.name?.trim() || account.login;
    hostEmail.value = account.email ?? "";
    hostRole.value = account.role ?? "";
    hostPhone.value = account.phone ?? "";
}
async function submitHost() {
    if (hostSaving.value)
        return;
    const selectedAccount = hostAccountSelection.value === otherHostAccountOption
        ? null
        : hostAccountOptions.value.find((account) => account.login === hostAccountSelection.value);
    if (hostAccountSelection.value !== otherHostAccountOption && !selectedAccount) {
        showToast("Selecciona una cuenta de Accesos o elige Otro.");
        return;
    }
    const login = selectedAccount?.login ?? hostLogin.value.trim();
    const name = selectedAccount?.name?.trim() || (selectedAccount ? selectedAccount.login : hostName.value.trim());
    const email = (selectedAccount?.email ?? hostEmail.value).trim().toLocaleLowerCase();
    const phone = (selectedAccount?.phone ?? hostPhone.value).trim();
    const departmentId = hostDepartmentId.value;
    const role = (selectedAccount?.role ?? hostRole.value).trim();
    const departmentExists = departments.value.some((department) => department.id === departmentId);
    if (!login ||
        !name ||
        departmentId === null ||
        !departmentExists) {
        showToast("Completa el login, el nombre y asigna el anfitrión a un departamento.");
        return;
    }
    const duplicateLogin = hosts.value.some((host) => host.login.toLocaleLowerCase() === login.toLocaleLowerCase() &&
        host.id !== editingHostId.value);
    if (duplicateLogin) {
        showToast("Ya existe un anfitrión con ese usuario.");
        return;
    }
    const duplicateEmail = hosts.value.some((host) => Boolean(email) &&
        host.email.toLocaleLowerCase() === email &&
        host.id !== editingHostId.value);
    if (duplicateEmail) {
        showToast("Ya existe un anfitrión con ese correo electrónico.");
        return;
    }
    let hostSectionAccess = selectedAccount
        ? [
            ...(accessAccounts.value.find((account) => account.login === login)?.sectionAccess ?? []),
            "anfitriones",
        ]
        : [];
    if (selectedAccount) {
        hostSaving.value = true;
        try {
            const response = await fetch(`/api/host-access/${encodeURIComponent(login)}`, {
                method: "POST",
            });
            const result = await response.json();
            if (!response.ok) {
                showToast(result.error ?? "No se pudo asignar el acceso a Anfitriones.");
                return;
            }
            if (!Array.isArray(result.sectionAccess) ||
                !result.sectionAccess.every((section) => section === "recepcion" || section === "anfitriones")) {
                console.error("La API devolvió permisos de anfitrión con formato inválido.");
                showToast("Se guardó el permiso, pero no se pudo actualizar el registro.");
                return;
            }
            hostSectionAccess = result.sectionAccess;
            accessAccounts.value = accessAccounts.value.map((account) => account.login === login
                ? { ...account, sectionAccess: hostSectionAccess }
                : account);
        }
        catch (error) {
            console.error("Failed to assign host section access:", error);
            showToast("No se pudo conectar con el servidor para asignar el acceso a Anfitriones.");
            return;
        }
        finally {
            hostSaving.value = false;
        }
    }
    const hostData = {
        login,
        name,
        departmentId,
        role,
        email,
        phone,
        accessRoles: selectedAccount
            ? [
                ...(hostSectionAccess.includes("recepcion") ? ["Recepción"] : []),
                ...(hostSectionAccess.includes("anfitriones") ? ["Anfitriones"] : []),
            ]
            : editingHostId.value === null
                ? []
                : (hosts.value.find((host) => host.id === editingHostId.value)?.accessRoles ?? []),
    };
    if (editingHostId.value === null) {
        hosts.value.unshift({ id: ++nextHostId.value, ...hostData });
        showToast("El anfitrión se registró con los datos de Accesos.", "success");
    }
    else {
        const hostIndex = hosts.value.findIndex((host) => host.id === editingHostId.value);
        if (hostIndex === -1) {
            hostDialogOpen.value = false;
            showToast("No se encontró el anfitrión que intentabas editar.");
            return;
        }
        hosts.value[hostIndex] = { id: editingHostId.value, ...hostData };
        showToast("Los datos del anfitrión se actualizaron.", "success");
    }
    hostDialogOpen.value = false;
    editingHostId.value = null;
    hostLogin.value = "";
    hostName.value = "";
    hostRole.value = "";
    hostEmail.value = "";
    hostPhone.value = "";
    hostAccountSelection.value = "";
}
function removeHost(id) {
    hosts.value = hosts.value.filter((host) => host.id !== id);
    showToast("El anfitrión se eliminó del registro de demostración.", "success");
}
function selectCalendarDay(date) {
    selectedAppointmentDate.value = date;
    appointmentFilter.value = "day";
}
function setAppointmentFilter(filter) {
    appointmentFilter.value = filter;
}
async function submitAppointment() {
    if (appointmentSaving.value)
        return;
    const company = businessPartners.value.find((partner) => partner.id === visitorCompanyId.value);
    const host = isHost.value
        ? {
            login: currentUser.value.login,
            name: currentUser.value.name?.trim() || currentUser.value.login,
        }
        : hosts.value.find((candidate) => candidate.login === visitorHostLogin.value);
    const selectedVisitor = visitorSelection.value === otherAppointmentVisitor
        ? null
        : appointmentVisitorOptions.value.find((staff) => String(staff.id) === visitorSelection.value);
    const appointmentVisitorName = visitorSelection.value === otherAppointmentVisitor
        ? visitorName.value.trim()
        : selectedVisitor?.fullName ?? "";
    const email = visitorEmail.value.trim();
    let appointmentEmail = visitorSelection.value === otherAppointmentVisitor
        ? email
        : selectedVisitor?.email.trim() ?? "";
    if (!appointmentVisitorName || !company || !host || !visitorSelection.value) {
        showToast("Selecciona empresa, visitante y anfitrión.");
        return;
    }
    if (appointmentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appointmentEmail)) {
        if (visitorSelection.value === otherAppointmentVisitor) {
            showToast("Ingresa un correo válido o déjalo vacío.");
            return;
        }
        appointmentEmail = "";
    }
    appointmentSaving.value = true;
    try {
        const appointmentId = editingAppointmentId.value;
        const response = await fetch(appointmentId === null ? "/api/appointments" : `/api/appointments/${appointmentId}`, {
            method: appointmentId === null ? "POST" : "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                visitorName: appointmentVisitorName,
                visitorEmail: appointmentEmail,
                businessPartnerId: company.id,
                hostName: host.name,
                date: visitorDate.value,
                time: visitorTime.value,
            }),
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo registrar la cita.");
            return;
        }
        if (!Array.isArray(result.appointments)) {
            console.error("La API devolvió una lista de citas con formato inválido.");
            showToast("La cita se guardó, pero no se pudo actualizar la agenda.");
            return;
        }
        appointments.value = result.appointments;
        appointmentDialogOpen.value = false;
        editingAppointmentId.value = null;
        selectedAppointmentDate.value = visitorDate.value;
        showToast(result.message ?? (appointmentId === null ? "La cita se guardó en la agenda." : "La cita se actualizó en la agenda."), "success");
        visitorName.value = "";
        visitorEmail.value = "";
        visitorSelection.value = "";
        visitorCompanyId.value = null;
        visitorHostLogin.value = "";
        visitorDate.value = getLocalDate();
        visitorTime.value = "18:00";
    }
    catch (error) {
        console.error("Failed to create appointment:", error);
        showToast("No se pudo conectar con el servidor para guardar la cita.");
    }
    finally {
        appointmentSaving.value = false;
    }
}
function downloadAppointmentQr(appointment, dataUrl = qrDataUrl.value, staff = qrExternalStaff.value) {
    if (!dataUrl) {
        showToast("El QR aún no está listo para descargarse.");
        return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = staff
        ? `visitas-cita-${appointment.id}-empleado-${staff.id}.png`
        : `visitas-cita-${appointment.id}.png`;
    link.click();
}
async function deleteAppointment(appointment) {
    if (appointment.status !== "Cancelada") {
        showToast("Para eliminar una cita, primero debes cancelarla.");
        return;
    }
    if (deletingAppointmentId.value !== null ||
        !window.confirm(`¿Quitar de la agenda la cita cancelada de ${appointment.visitor}? Se conservará en el historial.`)) {
        return;
    }
    deletingAppointmentId.value = appointment.id;
    try {
        const response = await fetch(`/api/appointments/${appointment.id}`, {
            method: "DELETE",
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo eliminar la cita.");
            return;
        }
        if (!Array.isArray(result.appointments)) {
            console.error("La API devolvió una lista de citas con formato inválido.");
            showToast("La cita se eliminó, pero no se pudo actualizar la agenda.");
            return;
        }
        appointments.value = result.appointments;
        showToast("La cita se eliminó de la agenda.", "success");
    }
    catch (error) {
        console.error("Failed to delete appointment:", error);
        showToast("No se pudo conectar con el servidor para eliminar la cita.");
    }
    finally {
        deletingAppointmentId.value = null;
    }
}
async function cancelAppointment(appointment) {
    if (appointment.status === "Cancelada" || appointment.status === "Retirado")
        return;
    if (!await confirmUser(`¿Cancelar la cita de ${appointment.visitor}?`, "Cancelar cita"))
        return;
    try {
        const response = await fetch(`/api/appointments/${appointment.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Cancelada" }),
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo cancelar la cita.");
            return;
        }
        if (!Array.isArray(result.appointments)) {
            console.error("La API devolvió una lista de citas con formato inválido.");
            showToast("La cita se canceló, pero no se pudo actualizar la agenda.");
            return;
        }
        appointments.value = result.appointments;
        showToast(`Se canceló la cita de ${appointment.visitor}.`, "success");
    }
    catch (error) {
        console.error("Failed to cancel appointment:", error);
        showToast("No se pudo conectar con el servidor para cancelar la cita.");
    }
}
function openExternalStaffDialog(staff, businessPartnerId) {
    editingExternalStaffId.value = staff?.id ?? null;
    externalStaffName.value = staff?.fullName ?? "";
    externalStaffPhone.value = staff?.phone ?? "";
    externalStaffEmail.value = staff?.email ?? "";
    const selectedPartner = businessPartners.value.find((partner) => partner.id === (staff?.businessPartnerId ?? businessPartnerId));
    externalStaffRelationshipType.value =
        staff?.relationshipType ?? (selectedPartner?.type === "Proveedor" ? "Proveedor" : "Contratista");
    externalStaffBusinessPartnerId.value =
        staff?.businessPartnerId ?? businessPartnerId ?? null;
    externalStaffDialogOpen.value = true;
}
function changeExternalStaffRelationshipType(type) {
    externalStaffRelationshipType.value = type;
    const selectedPartner = businessPartners.value.find((partner) => partner.id === externalStaffBusinessPartnerId.value);
    if (selectedPartner && selectedPartner.type !== type) {
        externalStaffBusinessPartnerId.value = null;
    }
}
async function submitExternalStaff() {
    if (externalStaffSaving.value)
        return;
    const fullName = externalStaffName.value.trim();
    const businessPartnerId = externalStaffBusinessPartnerId.value;
    if (!fullName || businessPartnerId === null)
        return;
    const editingId = editingExternalStaffId.value;
    const selectedPartner = businessPartners.value.find((partner) => partner.id === businessPartnerId);
    const currentStaffPartnerId = editingId === null
        ? null
        : externalStaff.value.find((person) => person.id === editingId)?.businessPartnerId ?? null;
    if (selectedPartner && (editingId === null || currentStaffPartnerId !== businessPartnerId)) {
        const registeredStaff = externalStaff.value.filter((person) => person.businessPartnerId === businessPartnerId).length;
        if (registeredStaff >= selectedPartner.employeeCount) {
            showToast(`Modifica el número de empleados de este ${selectedPartner.type.toLocaleLowerCase()} en Contratistas y proveedores antes de registrar más personal.`);
            return;
        }
    }
    externalStaffSaving.value = true;
    try {
        const response = await fetch(editingId === null
            ? "/api/external-staff"
            : `/api/external-staff/${editingId}`, {
            method: editingId === null ? "POST" : "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                businessPartnerId,
                fullName,
                phone: externalStaffPhone.value.trim(),
                email: externalStaffEmail.value.trim(),
            }),
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo guardar el personal externo.");
            return;
        }
        if (!Array.isArray(result.externalStaff)) {
            console.error("La API no devolvió la lista actualizada de personal externo.");
            showToast("Se guardaron los datos, pero no se pudo actualizar la lista.");
            return;
        }
        externalStaff.value = result.externalStaff;
        externalStaffDialogOpen.value = false;
        editingExternalStaffId.value = null;
        showToast(editingId === null
            ? "El trabajador externo se registró."
            : "Los datos del trabajador externo se actualizaron.", "success");
    }
    catch (error) {
        console.error("Failed to save external staff:", error);
        showToast("No se pudo conectar con el servidor para guardar al trabajador externo.");
    }
    finally {
        externalStaffSaving.value = false;
    }
}
async function removeExternalStaff(id) {
    try {
        const response = await fetch(`/api/external-staff/${id}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo eliminar el personal externo.");
            return;
        }
        if (!Array.isArray(result.externalStaff)) {
            console.error("La API no devolvió la lista actualizada de personal externo.");
            showToast("Se eliminó el registro, pero no se pudo actualizar la lista.");
            return;
        }
        externalStaff.value = result.externalStaff;
        showToast("El trabajador externo se eliminó.", "success");
    }
    catch (error) {
        console.error("Failed to delete external staff:", error);
        showToast("No se pudo conectar con el servidor para eliminar al trabajador externo.");
    }
}
function openBusinessPartnerDialog(partner) {
    editingBusinessPartnerId.value = partner?.id ?? null;
    businessPartnerName.value = partner?.name ?? "";
    businessPartnerDescription.value = partner?.description ?? "";
    businessPartnerRfc.value = partner?.rfc ?? "";
    businessPartnerCategory.value = partner?.category ?? "";
    businessPartnerSubject.value = partner?.subject ?? "";
    businessPartnerEmployeeCount.value = partner?.employeeCount ?? 1;
    businessPartnerType.value = partner?.type ?? "Contratista";
    businessPartnerStatus.value = partner?.status ?? "Activa";
    businessPartnerDialogOpen.value = true;
}
function changeBusinessPartnerType(type) {
    businessPartnerType.value = type;
    if (type === "Visitante") {
        businessPartnerDescription.value = "Público General";
        businessPartnerRfc.value = "N/A";
        businessPartnerCategory.value = "Visitante";
        businessPartnerEmployeeCount.value = 1;
        businessPartnerStatus.value = "No aplica";
    }
    else {
        if (businessPartnerStatus.value === "No aplica")
            businessPartnerStatus.value = "Activa";
        businessPartnerSubject.value = "";
    }
}
async function submitBusinessPartner() {
    if (businessPartnerSaving.value)
        return;
    const name = businessPartnerName.value.trim();
    const description = businessPartnerDescription.value.trim();
    const rfc = businessPartnerRfc.value.trim().toLocaleUpperCase();
    const category = businessPartnerCategory.value.trim();
    const subject = businessPartnerSubject.value.trim();
    const employeeCount = businessPartnerEmployeeCount.value;
    const isVisitor = businessPartnerType.value === "Visitante";
    if (!name || (isVisitor && !subject) || (!isVisitor && (!description || !rfc || !category))) {
        showToast(isVisitor
            ? "Completa el nombre y el asunto del visitante."
            : "Completa el nombre, la descripción, el RFC y la categoría de la empresa.");
        return;
    }
    if (!isVisitor &&
        (!Number.isSafeInteger(employeeCount) || employeeCount < 1 || employeeCount > 4294967295)) {
        showToast("El número de empleados debe ser un entero entre 1 y 4,294,967,295.");
        return;
    }
    const existingPartner = businessPartners.value.find((partner) => partner.id === editingBusinessPartnerId.value);
    if (existingPartner) {
        const registeredStaff = externalStaff.value.filter((person) => person.businessPartnerId === existingPartner.id).length;
        if (employeeCount < registeredStaff) {
            showToast(`No puedes establecer menos empleados que el personal externo ya registrado para este ${existingPartner.type.toLocaleLowerCase()} (${registeredStaff}).`);
            return;
        }
    }
    const duplicateRfc = !isVisitor && businessPartners.value.some((partner) => partner.rfc.toLocaleUpperCase() === rfc &&
        partner.id !== editingBusinessPartnerId.value);
    if (duplicateRfc) {
        showToast("Ya existe un contratista o proveedor registrado con ese RFC.");
        return;
    }
    const partnerData = {
        name,
        description: isVisitor ? "Público General" : description,
        rfc: isVisitor ? "N/A" : rfc,
        category: isVisitor ? "Visitante" : category,
        subject: isVisitor ? subject : null,
        employeeCount: isVisitor ? 1 : employeeCount,
        type: businessPartnerType.value,
        status: isVisitor ? "No aplica" : businessPartnerStatus.value,
    };
    businessPartnerSaving.value = true;
    try {
        const partnerId = editingBusinessPartnerId.value;
        const response = await fetch(partnerId === null ? "/api/business-partners" : `/api/business-partners/${partnerId}`, {
            method: partnerId === null ? "POST" : "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(partnerData),
        });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo guardar la empresa.");
            return;
        }
        if (!Array.isArray(result.businessPartners)) {
            console.error("La API devolvió una lista de empresas con formato inválido.");
            showToast("La empresa se guardó, pero no se pudo actualizar la lista.");
            return;
        }
        businessPartners.value = result.businessPartners;
        businessPartnerDialogOpen.value = false;
        showToast(partnerId === null ? "La empresa se registró correctamente." : "Los datos de la empresa se actualizaron.", "success");
    }
    catch (error) {
        console.error("Failed to save business partner:", error);
        showToast("No se pudo conectar con el servidor para guardar la empresa.");
    }
    finally {
        businessPartnerSaving.value = false;
    }
    editingBusinessPartnerId.value = null;
    businessPartnerName.value = "";
    businessPartnerDescription.value = "";
    businessPartnerRfc.value = "";
    businessPartnerCategory.value = "";
    businessPartnerSubject.value = "";
    businessPartnerEmployeeCount.value = 1;
}
async function removeBusinessPartner(id) {
    try {
        const response = await fetch(`/api/business-partners/${id}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) {
            showToast(result.error ?? "No se pudo eliminar la empresa.");
            return;
        }
        if (!Array.isArray(result.businessPartners)) {
            console.error("La API devolvió una lista de empresas con formato inválido.");
            showToast("La empresa se eliminó, pero no se pudo actualizar la lista.");
            return;
        }
        businessPartners.value = result.businessPartners;
        showToast("La empresa se eliminó.", "success");
    }
    catch (error) {
        console.error("Failed to delete business partner:", error);
        showToast("No se pudo conectar con el servidor para eliminar la empresa.");
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon-library" },
    xmlns: "http://www.w3.org/2000/svg",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-home",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1V10Z",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-building",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M4 21V5l8-2v18M4 9h8m-8 4h8m-8 4h8m4-8h4v12h-4zM7 6h2m-2 6h2m-2 6h2m10-3h.01",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-organization",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
    x: "9",
    y: "3",
    width: "6",
    height: "5",
    rx: "1",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
    x: "3",
    y: "16",
    width: "6",
    height: "5",
    rx: "1",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
    x: "15",
    y: "16",
    width: "6",
    height: "5",
    rx: "1",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 8v4M6 16v-4h12v4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-briefcase",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
    x: "3",
    y: "7",
    width: "18",
    height: "14",
    rx: "2",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M8 7V4h8v3M3 12h18m-11 0v2h4v-2",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-users",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-7.5a4 4 0 0 1 0 7.7m5 10.3v-2a4 4 0 0 0-3-3.87",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-people",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "9",
    cy: "8",
    r: "3.5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M2.5 20v-1a6.5 6.5 0 0 1 13 0v1h-13ZM17 5a3.5 3.5 0 0 1 0 7m2 2a5 5 0 0 1 3 4.6V20h-4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-user",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "12",
    cy: "8",
    r: "4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M4 21v-2a8 8 0 0 1 16 0v2H4Z",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-tool",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m14.7 6.3 3-3a6 6 0 0 1-7.8 7.8L4 17a2.1 2.1 0 0 0 3 3l5.9-5.9a6 6 0 0 0 7.8-7.8l-3 3-3-3Z",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-link",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-calendar",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
    x: "3",
    y: "5",
    width: "18",
    height: "16",
    rx: "2",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M16 3v4M8 3v4M3 10h18",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-clock",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "12",
    cy: "12",
    r: "9",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 7v5l3.5 2",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-qr",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zm5 0h2v2h-2zm-5 5h2v2h-2zm4-1h3v3h-3zM5 5h3v3H5zm11 0h3v3h-3zM5 16h3v3H5z",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-plus",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 5v14M5 12h14",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-arrow",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M5 12h14m-6-6 6 6-6 6",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-chevron",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m9 18 6-6-6-6",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-down",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m7 10 5 5 5-5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-shield",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m9 12 2 2 4-4",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-menu",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M4 6h16M4 12h16M4 18h16",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-close",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m18 6-12 12M6 6l12 12",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-dots",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "5",
    cy: "12",
    r: "1",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "12",
    cy: "12",
    r: "1",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "19",
    cy: "12",
    r: "1",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-note",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
    x: "4",
    y: "3",
    width: "16",
    height: "18",
    rx: "2",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M8 8h8M8 12h8M8 16h5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-arrival",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M12 3v12m-5-5 5 5 5-5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-entry",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5M10 17l5-5-5-5m5 5H3",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-exit",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5m4-4 5-5-5-5m5 5H7",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-history",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M3 12a9 9 0 1 0 2.6-6.4L3 8m0-5v5h5m4-1v5l3 2",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.symbol, __VLS_intrinsicElements.symbol)({
    id: "i-search",
    viewBox: "0 0 24 24",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "10.8",
    cy: "10.8",
    r: "6.8",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m16 16 5 5",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "dashboard-app" },
    'data-theme': (__VLS_ctx.dashboardTheme),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "topbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "topbar-brand" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.drawerOpen = !__VLS_ctx.drawerOpen;
        } },
    ...{ class: "mobile-menu-button" },
    type: "button",
    'aria-label': "Abrir menú",
    'aria-expanded': (__VLS_ctx.drawerOpen),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-menu",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.selectSection(__VLS_ctx.allowedDashboardSections[0] ?? '');
        } },
    ...{ class: "brand-lockup" },
    href: "#",
    'aria-label': "CyMEZ Recep, inicio",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
    ...{ class: "brand-mark" },
    src: "/images/cymez-mark.png",
    alt: "",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "brand-recep" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "brand-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "brand-product" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "topbar-account" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "topbar-identity" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "topbar-shield" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-shield",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "account-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.privateMenuOpen = !__VLS_ctx.privateMenuOpen;
        } },
    ...{ class: "account-menu-button" },
    type: "button",
    'aria-expanded': (__VLS_ctx.privateMenuOpen),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "avatar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-user",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "account-menu-identity" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.currentUser.name || __VLS_ctx.currentUser.login);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
(__VLS_ctx.currentRoleLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon account-chevron" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-down",
});
if (__VLS_ctx.privateMenuOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "account-dropdown" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "account-dropdown-profile" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "avatar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-user",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "account-dropdown-identity" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.currentUser.name || __VLS_ctx.currentUser.login);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (__VLS_ctx.currentRoleLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "theme-toggle-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.privateMenuOpen))
                    return;
                __VLS_ctx.dashboardTheme = __VLS_ctx.dashboardTheme === 'dark' ? 'light' : 'dark';
            } },
        ...{ class: "theme-toggle" },
        type: "button",
        'aria-pressed': (__VLS_ctx.dashboardTheme === 'light'),
        'aria-label': (__VLS_ctx.dashboardTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'),
    });
    if (__VLS_ctx.dashboardTheme === 'dark') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "icon" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            cx: "12",
            cy: "12",
            r: "4",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "icon" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.dashboardTheme === "dark" ? "Modo oscuro" : "Modo claro");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "theme-toggle-switch" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.logout) },
        ...{ class: "logout-button" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-exit",
    });
}
if (__VLS_ctx.drawerOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.drawerOpen))
                    return;
                __VLS_ctx.drawerOpen = false;
            } },
        ...{ class: "drawer-scrim" },
        'aria-hidden': "true",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "sidebar" },
    ...{ class: ({ 'sidebar-open': __VLS_ctx.drawerOpen }) },
    'aria-label': "Navegación principal",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sidebar-mobile-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.drawerOpen = false;
        } },
    type: "button",
    'aria-label': "Cerrar menú",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-close",
});
if (__VLS_ctx.allowedDashboardSections.includes('Inicio')) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.allowedDashboardSections.includes('Inicio')))
                    return;
                __VLS_ctx.selectSection('Inicio');
            } },
        ...{ class: "nav-link nav-home" },
        ...{ class: ({ 'is-active': __VLS_ctx.activeSection === 'Inicio' }) },
        type: "button",
        'aria-current': (__VLS_ctx.activeSection === 'Inicio' ? 'page' : undefined),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-home",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
for (const [group] of __VLS_getVForSourceType((__VLS_ctx.visibleNavigationGroups))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (group.title),
        ...{ class: "nav-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "nav-group-title" },
    });
    (group.title);
    for (const [item] of __VLS_getVForSourceType((group.items))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    __VLS_ctx.selectSection(item.label);
                } },
            key: (item.label),
            ...{ class: "nav-link" },
            ...{ class: ({ 'is-active': __VLS_ctx.activeSection === item.label }) },
            type: "button",
            'aria-current': (__VLS_ctx.activeSection === item.label ? 'page' : undefined),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
            href: (`#i-${item.icon}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (item.label);
    }
}
if (__VLS_ctx.allowedDashboardSections.includes('Agenda de citas') || __VLS_ctx.allowedDashboardSections.includes('Bitácora diaria')) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "nav-group nav-secondary" },
    });
    if (__VLS_ctx.allowedDashboardSections.includes('Agenda de citas')) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.allowedDashboardSections.includes('Agenda de citas') || __VLS_ctx.allowedDashboardSections.includes('Bitácora diaria')))
                        return;
                    if (!(__VLS_ctx.allowedDashboardSections.includes('Agenda de citas')))
                        return;
                    __VLS_ctx.selectSection('Agenda de citas');
                } },
            ...{ class: "nav-link" },
            ...{ class: ({ 'is-active': __VLS_ctx.activeSection === 'Agenda de citas' }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
            href: "#i-calendar",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    if (__VLS_ctx.allowedDashboardSections.includes('Bitácora diaria')) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.allowedDashboardSections.includes('Agenda de citas') || __VLS_ctx.allowedDashboardSections.includes('Bitácora diaria')))
                        return;
                    if (!(__VLS_ctx.allowedDashboardSections.includes('Bitácora diaria')))
                        return;
                    __VLS_ctx.selectSection('Bitácora diaria');
                } },
            ...{ class: "nav-link" },
            ...{ class: ({ 'is-active': __VLS_ctx.activeSection === 'Bitácora diaria' }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "icon" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
            href: "#i-note",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sidebar-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
    href: "#i-shield",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.currentRoleLabel.toLocaleUpperCase("es-MX"));
__VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "dashboard-main" },
    ...{ class: ({
            'dashboard-main-departments': __VLS_ctx.activeSection === 'Departamento',
            'dashboard-main-daily-log': __VLS_ctx.activeSection === 'Bitácora diaria',
            'dashboard-main-home': __VLS_ctx.activeSection === 'Inicio',
        }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "dashboard-heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
(__VLS_ctx.pageTitle);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "heading-accent" },
});
if (__VLS_ctx.activeSection === 'Equipo y herramientas') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
else if (__VLS_ctx.activeSection === 'Contratistas, proveedores y visitantes') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
else if (__VLS_ctx.activeSection === 'Agenda de citas') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.activeAppointmentCount);
    if (__VLS_ctx.appointmentFilter === 'day') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
}
else if (__VLS_ctx.activeSection === 'Departamento') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
else if (__VLS_ctx.activeSection === 'Personal de externos') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
else if (__VLS_ctx.activeSection === 'Anfitriones') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
else if (__VLS_ctx.activeSection === 'Accesos') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
if (__VLS_ctx.activeSection === 'Agenda de citas') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "date-selector date-filter" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-calendar",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sr-only" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "date",
        'aria-label': "Filtrar agenda por fecha",
    });
    (__VLS_ctx.selectedAppointmentDate);
}
else if (__VLS_ctx.activeSection === 'Inicio') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "date-selector" },
        'aria-label': "Fecha actual",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-calendar",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" }).format(new Date()));
}
if (__VLS_ctx.activeSection === 'Agenda de citas') {
    /** @type {[typeof AppointmentsSection, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(AppointmentsSection, new AppointmentsSection({
        ...{ 'onUpdate:page': {} },
        ...{ 'onCreate': {} },
        ...{ 'onCancel': {} },
        ...{ 'onOpenQr': {} },
        ...{ 'onSendCompanyQrs': {} },
        ...{ 'onDelete': {} },
        ...{ 'onEdit': {} },
        ...{ 'onChangeMonth': {} },
        ...{ 'onSelectDay': {} },
        filter: (__VLS_ctx.appointmentFilter),
        search: (__VLS_ctx.appointmentSearch),
        selectedAppointments: (__VLS_ctx.selectedAppointments),
        searchedAppointments: (__VLS_ctx.searchedAppointments),
        paginatedAppointments: (__VLS_ctx.paginatedAppointments),
        appointmentsPage: (__VLS_ctx.appointmentsPage),
        appointmentsPerPage: (__VLS_ctx.appointmentsPerPage),
        totalAppointmentPages: (__VLS_ctx.totalAppointmentPages),
        calendarMonthLabel: (__VLS_ctx.calendarMonthLabel),
        calendarDays: (__VLS_ctx.calendarDays),
        selectedAppointmentDate: (__VLS_ctx.selectedAppointmentDate),
        today: (__VLS_ctx.getLocalDate()),
        loading: (__VLS_ctx.appointmentLoading),
        canCreateAppointments: (__VLS_ctx.currentUser.isAdmin || __VLS_ctx.isHost),
        canManageAppointments: (__VLS_ctx.currentUser.isAdmin || __VLS_ctx.isHost),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onUpdate:page': {} },
        ...{ 'onCreate': {} },
        ...{ 'onCancel': {} },
        ...{ 'onOpenQr': {} },
        ...{ 'onSendCompanyQrs': {} },
        ...{ 'onDelete': {} },
        ...{ 'onEdit': {} },
        ...{ 'onChangeMonth': {} },
        ...{ 'onSelectDay': {} },
        filter: (__VLS_ctx.appointmentFilter),
        search: (__VLS_ctx.appointmentSearch),
        selectedAppointments: (__VLS_ctx.selectedAppointments),
        searchedAppointments: (__VLS_ctx.searchedAppointments),
        paginatedAppointments: (__VLS_ctx.paginatedAppointments),
        appointmentsPage: (__VLS_ctx.appointmentsPage),
        appointmentsPerPage: (__VLS_ctx.appointmentsPerPage),
        totalAppointmentPages: (__VLS_ctx.totalAppointmentPages),
        calendarMonthLabel: (__VLS_ctx.calendarMonthLabel),
        calendarDays: (__VLS_ctx.calendarDays),
        selectedAppointmentDate: (__VLS_ctx.selectedAppointmentDate),
        today: (__VLS_ctx.getLocalDate()),
        loading: (__VLS_ctx.appointmentLoading),
        canCreateAppointments: (__VLS_ctx.currentUser.isAdmin || __VLS_ctx.isHost),
        canManageAppointments: (__VLS_ctx.currentUser.isAdmin || __VLS_ctx.isHost),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        'onUpdate:page': (...[$event]) => {
            if (!(__VLS_ctx.activeSection === 'Agenda de citas'))
                return;
            __VLS_ctx.appointmentsPage = $event;
        }
    };
    const __VLS_7 = {
        onCreate: (__VLS_ctx.openAppointmentDialog)
    };
    const __VLS_8 = {
        onCancel: (__VLS_ctx.cancelAppointment)
    };
    const __VLS_9 = {
        onOpenQr: (__VLS_ctx.openQrDialog)
    };
    const __VLS_10 = {
        onSendCompanyQrs: (__VLS_ctx.openCompanyQrDispatch)
    };
    const __VLS_11 = {
        onDelete: (__VLS_ctx.deleteAppointment)
    };
    const __VLS_12 = {
        onEdit: (__VLS_ctx.openAppointmentDialog)
    };
    const __VLS_13 = {
        onChangeMonth: (__VLS_ctx.changeCalendarMonth)
    };
    const __VLS_14 = {
        onSelectDay: (__VLS_ctx.selectCalendarDay)
    };
    var __VLS_2;
}
else if (__VLS_ctx.activeSection === 'Anfitriones') {
    /** @type {[typeof HostsSection, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(HostsSection, new HostsSection({
        ...{ 'onCreate': {} },
        ...{ 'onEdit': {} },
        ...{ 'onRemove': {} },
        search: (__VLS_ctx.hostSearch),
        hosts: (__VLS_ctx.hosts),
        filteredHosts: (__VLS_ctx.filteredHosts),
        departments: (__VLS_ctx.departments),
        eligibleDepartmentCount: (__VLS_ctx.hostEligibleDepartments.length),
    }));
    const __VLS_16 = __VLS_15({
        ...{ 'onCreate': {} },
        ...{ 'onEdit': {} },
        ...{ 'onRemove': {} },
        search: (__VLS_ctx.hostSearch),
        hosts: (__VLS_ctx.hosts),
        filteredHosts: (__VLS_ctx.filteredHosts),
        departments: (__VLS_ctx.departments),
        eligibleDepartmentCount: (__VLS_ctx.hostEligibleDepartments.length),
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    let __VLS_18;
    let __VLS_19;
    let __VLS_20;
    const __VLS_21 = {
        onCreate: (...[$event]) => {
            if (!!(__VLS_ctx.activeSection === 'Agenda de citas'))
                return;
            if (!(__VLS_ctx.activeSection === 'Anfitriones'))
                return;
            __VLS_ctx.openHostDialog();
        }
    };
    const __VLS_22 = {
        onEdit: (__VLS_ctx.openHostDialog)
    };
    const __VLS_23 = {
        onRemove: (__VLS_ctx.removeHost)
    };
    var __VLS_17;
}
else if (__VLS_ctx.activeSection === 'Accesos') {
    /** @type {[typeof AccessSection, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(AccessSection, new AccessSection({
        ...{ 'onEditAccount': {} },
        search: (__VLS_ctx.accessSearch),
        accounts: (__VLS_ctx.accessAccounts),
        isAdmin: (__VLS_ctx.currentUser.isAdmin),
    }));
    const __VLS_25 = __VLS_24({
        ...{ 'onEditAccount': {} },
        search: (__VLS_ctx.accessSearch),
        accounts: (__VLS_ctx.accessAccounts),
        isAdmin: (__VLS_ctx.currentUser.isAdmin),
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    let __VLS_27;
    let __VLS_28;
    let __VLS_29;
    const __VLS_30 = {
        onEditAccount: (__VLS_ctx.openAccessAccountEditor)
    };
    var __VLS_26;
}
else if (__VLS_ctx.activeSection === 'Departamento') {
    /** @type {[typeof DepartmentSection, ]} */ ;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent(DepartmentSection, new DepartmentSection({
        ...{ 'onCreate': {} },
        ...{ 'onEdit': {} },
        ...{ 'onRemove': {} },
        departments: (__VLS_ctx.departments),
        hosts: (__VLS_ctx.hosts),
        isAdmin: (__VLS_ctx.currentUser.isAdmin),
    }));
    const __VLS_32 = __VLS_31({
        ...{ 'onCreate': {} },
        ...{ 'onEdit': {} },
        ...{ 'onRemove': {} },
        departments: (__VLS_ctx.departments),
        hosts: (__VLS_ctx.hosts),
        isAdmin: (__VLS_ctx.currentUser.isAdmin),
    }, ...__VLS_functionalComponentArgsRest(__VLS_31));
    let __VLS_34;
    let __VLS_35;
    let __VLS_36;
    const __VLS_37 = {
        onCreate: (...[$event]) => {
            if (!!(__VLS_ctx.activeSection === 'Agenda de citas'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Anfitriones'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Accesos'))
                return;
            if (!(__VLS_ctx.activeSection === 'Departamento'))
                return;
            __VLS_ctx.openDepartmentDialog();
        }
    };
    const __VLS_38 = {
        onEdit: (__VLS_ctx.openDepartmentDialog)
    };
    const __VLS_39 = {
        onRemove: (__VLS_ctx.removeDepartment)
    };
    var __VLS_33;
}
else if (__VLS_ctx.activeSection === 'Personal de externos') {
    /** @type {[typeof ExternalStaffSection, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(ExternalStaffSection, new ExternalStaffSection({
        ...{ 'onCreate': {} },
        ...{ 'onEdit': {} },
        ...{ 'onRemove': {} },
        ...{ 'onSendQr': {} },
        ...{ 'onOpenQr': {} },
        ...{ 'onClearDispatch': {} },
        search: (__VLS_ctx.externalStaffSearch),
        companies: (__VLS_ctx.externalStaffPartnerOptions),
        staff: (__VLS_ctx.externalStaff),
        loading: (__VLS_ctx.businessDirectoryLoading),
        dispatchAppointment: (__VLS_ctx.qrDispatchAppointment),
        sendingStaffId: (__VLS_ctx.sendingExternalQrStaffId),
    }));
    const __VLS_41 = __VLS_40({
        ...{ 'onCreate': {} },
        ...{ 'onEdit': {} },
        ...{ 'onRemove': {} },
        ...{ 'onSendQr': {} },
        ...{ 'onOpenQr': {} },
        ...{ 'onClearDispatch': {} },
        search: (__VLS_ctx.externalStaffSearch),
        companies: (__VLS_ctx.externalStaffPartnerOptions),
        staff: (__VLS_ctx.externalStaff),
        loading: (__VLS_ctx.businessDirectoryLoading),
        dispatchAppointment: (__VLS_ctx.qrDispatchAppointment),
        sendingStaffId: (__VLS_ctx.sendingExternalQrStaffId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    let __VLS_43;
    let __VLS_44;
    let __VLS_45;
    const __VLS_46 = {
        onCreate: (...[$event]) => {
            if (!!(__VLS_ctx.activeSection === 'Agenda de citas'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Anfitriones'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Accesos'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Departamento'))
                return;
            if (!(__VLS_ctx.activeSection === 'Personal de externos'))
                return;
            __VLS_ctx.openExternalStaffDialog(undefined, $event);
        }
    };
    const __VLS_47 = {
        onEdit: (__VLS_ctx.openExternalStaffDialog)
    };
    const __VLS_48 = {
        onRemove: (__VLS_ctx.removeExternalStaff)
    };
    const __VLS_49 = {
        onSendQr: (__VLS_ctx.sendExternalStaffQr)
    };
    const __VLS_50 = {
        onOpenQr: (__VLS_ctx.openExternalStaffQr)
    };
    const __VLS_51 = {
        onClearDispatch: (__VLS_ctx.clearQrDispatch)
    };
    var __VLS_42;
}
else if (__VLS_ctx.activeSection === 'Contratistas, proveedores y visitantes') {
    /** @type {[typeof BusinessDirectorySection, ]} */ ;
    // @ts-ignore
    const __VLS_52 = __VLS_asFunctionalComponent(BusinessDirectorySection, new BusinessDirectorySection({
        ...{ 'onCreatePartner': {} },
        ...{ 'onEditPartner': {} },
        ...{ 'onRemovePartner': {} },
        businessPartnerSearch: (__VLS_ctx.businessPartnerSearch),
        businessPartnerTypeFilter: (__VLS_ctx.businessPartnerTypeFilter),
        businessPartnerCategoryFilter: (__VLS_ctx.businessPartnerCategoryFilter),
        businessPartnerStatusFilter: (__VLS_ctx.businessPartnerStatusFilter),
        businessPartnerPage: (__VLS_ctx.businessPartnerPage),
        businessPartners: (__VLS_ctx.businessPartners),
        filteredBusinessPartners: (__VLS_ctx.filteredBusinessPartners),
        paginatedBusinessPartners: (__VLS_ctx.paginatedBusinessPartners),
        businessPartnerCategories: (__VLS_ctx.businessPartnerCategories),
        businessPartnerPages: (__VLS_ctx.businessPartnerPages),
        partnerRowsPerPage: (__VLS_ctx.partnerRowsPerPage),
        loading: (__VLS_ctx.businessDirectoryLoading),
        businessPartnerSaving: (__VLS_ctx.businessPartnerSaving),
    }));
    const __VLS_53 = __VLS_52({
        ...{ 'onCreatePartner': {} },
        ...{ 'onEditPartner': {} },
        ...{ 'onRemovePartner': {} },
        businessPartnerSearch: (__VLS_ctx.businessPartnerSearch),
        businessPartnerTypeFilter: (__VLS_ctx.businessPartnerTypeFilter),
        businessPartnerCategoryFilter: (__VLS_ctx.businessPartnerCategoryFilter),
        businessPartnerStatusFilter: (__VLS_ctx.businessPartnerStatusFilter),
        businessPartnerPage: (__VLS_ctx.businessPartnerPage),
        businessPartners: (__VLS_ctx.businessPartners),
        filteredBusinessPartners: (__VLS_ctx.filteredBusinessPartners),
        paginatedBusinessPartners: (__VLS_ctx.paginatedBusinessPartners),
        businessPartnerCategories: (__VLS_ctx.businessPartnerCategories),
        businessPartnerPages: (__VLS_ctx.businessPartnerPages),
        partnerRowsPerPage: (__VLS_ctx.partnerRowsPerPage),
        loading: (__VLS_ctx.businessDirectoryLoading),
        businessPartnerSaving: (__VLS_ctx.businessPartnerSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
    let __VLS_55;
    let __VLS_56;
    let __VLS_57;
    const __VLS_58 = {
        onCreatePartner: (...[$event]) => {
            if (!!(__VLS_ctx.activeSection === 'Agenda de citas'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Anfitriones'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Accesos'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Departamento'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Personal de externos'))
                return;
            if (!(__VLS_ctx.activeSection === 'Contratistas, proveedores y visitantes'))
                return;
            __VLS_ctx.openBusinessPartnerDialog();
        }
    };
    const __VLS_59 = {
        onEditPartner: (__VLS_ctx.openBusinessPartnerDialog)
    };
    const __VLS_60 = {
        onRemovePartner: (__VLS_ctx.removeBusinessPartner)
    };
    var __VLS_54;
}
else if (__VLS_ctx.activeSection === 'Equipo y herramientas') {
    /** @type {[typeof EquipmentSection, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(EquipmentSection, new EquipmentSection({
        theme: (__VLS_ctx.dashboardTheme),
    }));
    const __VLS_62 = __VLS_61({
        theme: (__VLS_ctx.dashboardTheme),
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
}
else if (__VLS_ctx.activeSection === 'Bitácora diaria') {
    /** @type {[typeof DailyLogSection, ]} */ ;
    // @ts-ignore
    const __VLS_64 = __VLS_asFunctionalComponent(DailyLogSection, new DailyLogSection({
        ...{ 'onMovementSaved': {} },
        ...{ 'onOpenQr': {} },
        initialRange: (__VLS_ctx.dailyLogInitialRange),
        isAdmin: (__VLS_ctx.currentUser.isAdmin),
        appointments: (__VLS_ctx.appointments),
        appointmentsLoading: (__VLS_ctx.appointmentLoading),
        externalStaff: (__VLS_ctx.externalStaff),
        generalVisitors: (__VLS_ctx.generalVisitors),
        hosts: (__VLS_ctx.hosts),
        departments: (__VLS_ctx.departments),
    }));
    const __VLS_65 = __VLS_64({
        ...{ 'onMovementSaved': {} },
        ...{ 'onOpenQr': {} },
        initialRange: (__VLS_ctx.dailyLogInitialRange),
        isAdmin: (__VLS_ctx.currentUser.isAdmin),
        appointments: (__VLS_ctx.appointments),
        appointmentsLoading: (__VLS_ctx.appointmentLoading),
        externalStaff: (__VLS_ctx.externalStaff),
        generalVisitors: (__VLS_ctx.generalVisitors),
        hosts: (__VLS_ctx.hosts),
        departments: (__VLS_ctx.departments),
    }, ...__VLS_functionalComponentArgsRest(__VLS_64));
    let __VLS_67;
    let __VLS_68;
    let __VLS_69;
    const __VLS_70 = {
        onMovementSaved: (__VLS_ctx.loadAppointments)
    };
    const __VLS_71 = {
        onOpenQr: (__VLS_ctx.openQrDialog)
    };
    var __VLS_66;
}
else if (__VLS_ctx.activeSection === 'Inicio') {
    /** @type {[typeof HomeSection, ]} */ ;
    // @ts-ignore
    const __VLS_72 = __VLS_asFunctionalComponent(HomeSection, new HomeSection({
        ...{ 'onCreateAppointment': {} },
        ...{ 'onEditAppointment': {} },
        ...{ 'onCancelAppointment': {} },
        ...{ 'onDeleteAppointment': {} },
        ...{ 'onOpenQr': {} },
        ...{ 'onSendCompanyQrs': {} },
        ...{ 'onOpenLog': {} },
        ...{ 'onOpenAppointments': {} },
        ...{ 'onOpenEquipment': {} },
        appointments: (__VLS_ctx.appointments),
        summaryItems: (__VLS_ctx.summaryItems),
        canManageAppointments: (__VLS_ctx.currentUser.isAdmin || __VLS_ctx.isHost),
    }));
    const __VLS_73 = __VLS_72({
        ...{ 'onCreateAppointment': {} },
        ...{ 'onEditAppointment': {} },
        ...{ 'onCancelAppointment': {} },
        ...{ 'onDeleteAppointment': {} },
        ...{ 'onOpenQr': {} },
        ...{ 'onSendCompanyQrs': {} },
        ...{ 'onOpenLog': {} },
        ...{ 'onOpenAppointments': {} },
        ...{ 'onOpenEquipment': {} },
        appointments: (__VLS_ctx.appointments),
        summaryItems: (__VLS_ctx.summaryItems),
        canManageAppointments: (__VLS_ctx.currentUser.isAdmin || __VLS_ctx.isHost),
    }, ...__VLS_functionalComponentArgsRest(__VLS_72));
    let __VLS_75;
    let __VLS_76;
    let __VLS_77;
    const __VLS_78 = {
        onCreateAppointment: (__VLS_ctx.openHomeAppointmentDialog)
    };
    const __VLS_79 = {
        onEditAppointment: (__VLS_ctx.openAppointmentDialog)
    };
    const __VLS_80 = {
        onCancelAppointment: (__VLS_ctx.cancelAppointment)
    };
    const __VLS_81 = {
        onDeleteAppointment: (__VLS_ctx.deleteAppointment)
    };
    const __VLS_82 = {
        onOpenQr: (__VLS_ctx.openQrDialog)
    };
    const __VLS_83 = {
        onSendCompanyQrs: (__VLS_ctx.openCompanyQrDispatch)
    };
    const __VLS_84 = {
        onOpenLog: (__VLS_ctx.openDailyLogRange)
    };
    const __VLS_85 = {
        onOpenAppointments: (...[$event]) => {
            if (!!(__VLS_ctx.activeSection === 'Agenda de citas'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Anfitriones'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Accesos'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Departamento'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Personal de externos'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Contratistas, proveedores y visitantes'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Equipo y herramientas'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Bitácora diaria'))
                return;
            if (!(__VLS_ctx.activeSection === 'Inicio'))
                return;
            __VLS_ctx.selectSection('Agenda de citas');
        }
    };
    const __VLS_86 = {
        onOpenEquipment: (...[$event]) => {
            if (!!(__VLS_ctx.activeSection === 'Agenda de citas'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Anfitriones'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Accesos'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Departamento'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Personal de externos'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Contratistas, proveedores y visitantes'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Equipo y herramientas'))
                return;
            if (!!(__VLS_ctx.activeSection === 'Bitácora diaria'))
                return;
            if (!(__VLS_ctx.activeSection === 'Inicio'))
                return;
            __VLS_ctx.selectSection('Equipo y herramientas');
        }
    };
    var __VLS_74;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel workspace-panel access-none-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
if (__VLS_ctx.appointmentDialogOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.appointmentDialogOpen))
                    return;
                __VLS_ctx.appointmentDialogOpen = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog appointment-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "appointment-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.appointmentDialogOpen))
                    return;
                __VLS_ctx.appointmentDialogOpen = false;
            } },
        ...{ class: "dialog-close" },
        type: "button",
        'aria-label': "Cerrar",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-close",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dialog-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-calendar",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "appointment-dialog-title",
    });
    (__VLS_ctx.editingAppointmentId === null ? "Nueva cita" : "Editar cita");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    (__VLS_ctx.editingAppointmentId === null ? "Agrega una visita a la agenda." : "Actualiza los datos de la visita.");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submitAppointment) },
        ...{ class: "appointment-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (__VLS_ctx.changeAppointmentCompany) },
        value: (__VLS_ctx.visitorCompanyId),
        required: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: (null),
        disabled: true,
    });
    for (const [company] of __VLS_getVForSourceType((__VLS_ctx.appointmentCompanyOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (company.id),
            value: (company.id),
        });
        (company.name);
        (company.type);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (__VLS_ctx.changeAppointmentVisitor) },
        value: (__VLS_ctx.visitorSelection),
        required: true,
        disabled: (__VLS_ctx.visitorCompanyId === null),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
        disabled: true,
    });
    (__VLS_ctx.visitorCompanyId === null ? "Primero selecciona una empresa" : "Selecciona el nombre del visitante");
    for (const [person] of __VLS_getVForSourceType((__VLS_ctx.appointmentVisitorOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (person.id),
            value: (String(person.id)),
        });
        (person.fullName);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: (__VLS_ctx.otherAppointmentVisitor),
    });
    if (__VLS_ctx.visitorSelection === __VLS_ctx.otherAppointmentVisitor) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (__VLS_ctx.visitorName),
            type: "text",
            autocomplete: "name",
            maxlength: "180",
            pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
            placeholder: "Nombre completo del visitante",
            required: true,
        });
    }
    else if (__VLS_ctx.visitorCompanyId !== null && __VLS_ctx.appointmentVisitorOptions.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "appointment-field-hint" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.visitorHostLogin),
        required: true,
        disabled: (__VLS_ctx.isHost),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
        disabled: true,
    });
    for (const [host] of __VLS_getVForSourceType((__VLS_ctx.appointmentHostOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (host.login),
            value: (host.login),
        });
        (__VLS_ctx.isHost
            ? host.name
            : `${host.name} · ${__VLS_ctx.departments.find((department) => department.id === host.departmentId)?.name ?? "Sin departamento"}`);
    }
    if (__VLS_ctx.visitorSelection === __VLS_ctx.otherAppointmentVisitor) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "appointment-form-full" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "email",
            autocomplete: "email",
            maxlength: "254",
            placeholder: "persona@empresa.com",
        });
        (__VLS_ctx.visitorEmail);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "appointment-field-hint" },
        });
    }
    else if (__VLS_ctx.visitorSelection) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "appointment-field-hint appointment-form-full" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        required: true,
        type: "date",
    });
    (__VLS_ctx.visitorDate);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        required: true,
        type: "time",
    });
    (__VLS_ctx.visitorTime);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "button-primary dialog-submit" },
        type: "submit",
        disabled: (__VLS_ctx.appointmentSaving),
    });
    (__VLS_ctx.appointmentSaving ? "Guardando cita..." : __VLS_ctx.editingAppointmentId === null ? "Agregar cita" : "Guardar cambios");
}
if (__VLS_ctx.qrDialogOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.qrDialogOpen))
                    return;
                __VLS_ctx.qrDialogOpen = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog qr-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "qr-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.qrDialogOpen))
                    return;
                __VLS_ctx.qrDialogOpen = false;
            } },
        ...{ class: "dialog-close" },
        type: "button",
        'aria-label': "Cerrar",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-close",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dialog-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-qr",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "qr-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.qrExternalStaff?.fullName ?? __VLS_ctx.qrAppointment?.visitor);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "qr-preview" },
    });
    if (__VLS_ctx.qrGenerating) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "qr-loading" },
        });
    }
    else if (__VLS_ctx.qrDataUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            src: (__VLS_ctx.qrDataUrl),
            alt: (`Código QR de la cita de ${__VLS_ctx.qrExternalStaff?.fullName ?? __VLS_ctx.qrAppointment?.visitor}`),
        });
    }
    if (__VLS_ctx.qrAppointment) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "qr-appointment-details" },
        });
        (__VLS_ctx.qrAppointment.company);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
        (__VLS_ctx.qrAppointment.date);
        (__VLS_ctx.qrAppointment.time);
        (__VLS_ctx.qrAppointment.host);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.qrAppointment.referenceCode);
        if (__VLS_ctx.qrExternalStaff) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
            (__VLS_ctx.qrExternalStaff.fullName);
        }
    }
    if (!__VLS_ctx.isReception) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "qr-dialog-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.qrDialogOpen))
                        return;
                    if (!(!__VLS_ctx.isReception))
                        return;
                    __VLS_ctx.qrAppointment && __VLS_ctx.downloadAppointmentQr(__VLS_ctx.qrAppointment);
                } },
            ...{ class: "button-primary dialog-submit" },
            type: "button",
            disabled: (__VLS_ctx.qrGenerating || !__VLS_ctx.qrDataUrl || !__VLS_ctx.qrAppointment),
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "qr-placeholder-note" },
    });
    (__VLS_ctx.isReception
        ? "Recepción puede consultar el pase."
        : "Descarga el código y compártelo manualmente con las personas de la empresa.");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.qrDialogOpen))
                    return;
                __VLS_ctx.qrDialogOpen = false;
            } },
        ...{ class: "button-secondary dialog-submit" },
        type: "button",
    });
}
if (__VLS_ctx.businessPartnerDialogOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.businessPartnerDialogOpen))
                    return;
                __VLS_ctx.businessPartnerDialogOpen = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog workspace-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "business-partner-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.businessPartnerDialogOpen))
                    return;
                __VLS_ctx.businessPartnerDialogOpen = false;
            } },
        ...{ class: "dialog-close" },
        type: "button",
        'aria-label': "Cerrar",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-close",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dialog-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-building",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "business-partner-dialog-title",
    });
    (__VLS_ctx.editingBusinessPartnerId === null ? "Registrar registro" : "Editar registro");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    (__VLS_ctx.businessPartnerType === "Visitante" ? "Registra el nombre y asunto de la visita." : "Datos del contratista o proveedor.");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submitBusinessPartner) },
        ...{ class: "workspace-form modal-workspace-form directory-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.businessPartnerDialogOpen))
                    return;
                __VLS_ctx.changeBusinessPartnerType($event.target.value);
            } },
        value: (__VLS_ctx.businessPartnerType),
        required: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "Contratista",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "Proveedor",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "Visitante",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    (__VLS_ctx.businessPartnerType === "Visitante" ? "Nombre completo" : "Nombre de la empresa");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        value: (__VLS_ctx.businessPartnerName),
        type: "text",
        autocomplete: (__VLS_ctx.businessPartnerType === 'Visitante' ? 'name' : 'organization'),
        maxlength: "180",
        pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
        required: true,
    });
    if (__VLS_ctx.businessPartnerType === 'Visitante') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "directory-form-full" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (__VLS_ctx.businessPartnerSubject),
            type: "text",
            maxlength: "500",
            pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
            placeholder: "Motivo de la visita",
            required: true,
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "directory-form-full" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
            value: (__VLS_ctx.businessPartnerDescription),
            rows: "3",
            maxlength: "65535",
            placeholder: "Describe a qué se dedica la empresa",
            required: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (__VLS_ctx.businessPartnerRfc),
            type: "text",
            maxlength: "13",
            pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
            required: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (__VLS_ctx.businessPartnerCategory),
            type: "text",
            maxlength: "120",
            pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
            placeholder: "Ej. Construcción, limpieza",
            required: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "number",
            min: "1",
            max: "4294967295",
            step: "1",
            required: true,
        });
        (__VLS_ctx.businessPartnerEmployeeCount);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            value: (__VLS_ctx.businessPartnerStatus),
            required: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: "Activa",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: "Inactiva",
        });
    }
    if (__VLS_ctx.businessPartnerType === 'Visitante') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "directory-form-full access-none-note" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "button-primary workspace-submit" },
        type: "submit",
        disabled: (__VLS_ctx.businessPartnerSaving),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-plus",
    });
    (__VLS_ctx.businessPartnerSaving ? "Guardando..." : __VLS_ctx.editingBusinessPartnerId === null ? "Registrar empresa" : "Guardar cambios");
}
if (__VLS_ctx.editingAccessAccount) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.editingAccessAccount))
                    return;
                __VLS_ctx.editingAccessAccount = null;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog workspace-dialog access-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "database-access-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.editingAccessAccount))
                    return;
                __VLS_ctx.editingAccessAccount = null;
            } },
        ...{ class: "dialog-close" },
        type: "button",
        'aria-label': "Cerrar",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-close",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dialog-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-shield",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "database-access-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.editingAccessAccount.login);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.saveAccessAccount) },
        ...{ class: "workspace-form modal-workspace-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "workspace-form-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "host-toggle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "radio",
        value: "administrador",
        disabled: (__VLS_ctx.editingAccessAccount.hasFullAccess),
    });
    (__VLS_ctx.accessAccountRoleDraft);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "host-toggle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "radio",
        value: "recepcion",
        disabled: (__VLS_ctx.editingAccessAccount.hasFullAccess),
    });
    (__VLS_ctx.accessAccountRoleDraft);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "host-toggle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "radio",
        value: "",
        disabled: (__VLS_ctx.editingAccessAccount.hasFullAccess),
    });
    (__VLS_ctx.accessAccountRoleDraft);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    if (__VLS_ctx.editingAccessAccount.hasFullAccess) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "access-none-note" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "access-none-note" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "button-primary workspace-submit" },
        type: "submit",
        disabled: (__VLS_ctx.accessAccountSaving),
    });
    (__VLS_ctx.accessAccountSaving ? "Guardando..." : "Guardar cambios");
}
if (__VLS_ctx.hostDialogOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.hostDialogOpen))
                    return;
                __VLS_ctx.hostDialogOpen = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog workspace-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "host-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.hostDialogOpen))
                    return;
                __VLS_ctx.hostDialogOpen = false;
            } },
        ...{ class: "dialog-close" },
        type: "button",
        'aria-label': "Cerrar",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-close",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dialog-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-users",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "host-dialog-title",
    });
    (__VLS_ctx.editingHostId === null ? "Registrar anfitrión" : "Editar anfitrión");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submitHost) },
        ...{ class: "workspace-form modal-workspace-form host-form" },
    });
    if (__VLS_ctx.hostEligibleDepartments.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "setup-callout" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.hostDialogOpen))
                        return;
                    if (!(__VLS_ctx.hostEligibleDepartments.length === 0))
                        return;
                    __VLS_ctx.selectSection('Departamento');
                } },
            ...{ class: "button-secondary" },
            type: "button",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            ...{ onChange: (...[$event]) => {
                    if (!(__VLS_ctx.hostDialogOpen))
                        return;
                    if (!!(__VLS_ctx.hostEligibleDepartments.length === 0))
                        return;
                    __VLS_ctx.selectHostAccount($event.target.value);
                } },
            value: (__VLS_ctx.hostAccountSelection),
            autocomplete: "name",
            required: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: "",
            disabled: true,
        });
        for (const [account] of __VLS_getVForSourceType((__VLS_ctx.selectableHostAccounts))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                key: (account.login),
                value: (account.login),
            });
            (account.name?.trim() || account.login);
            (account.login);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: (__VLS_ctx.otherHostAccountOption),
        });
        if (__VLS_ctx.hostAccountSelection === __VLS_ctx.otherHostAccountOption) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                value: (__VLS_ctx.hostName),
                type: "text",
                autocomplete: "name",
                maxlength: "180",
                pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
                required: true,
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (__VLS_ctx.hostLogin),
            type: "text",
            autocomplete: "username",
            maxlength: "180",
            pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
            readonly: (__VLS_ctx.hostAccountSelection !== __VLS_ctx.otherHostAccountOption),
            required: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "email",
            autocomplete: "email",
            maxlength: "254",
            readonly: (__VLS_ctx.hostAccountSelection !== __VLS_ctx.otherHostAccountOption),
        });
        (__VLS_ctx.hostEmail);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            value: (__VLS_ctx.hostDepartmentId),
            required: true,
        });
        for (const [department] of __VLS_getVForSourceType((__VLS_ctx.hostEligibleDepartments))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                key: (department.id),
                value: (department.id),
            });
            (department.name);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (__VLS_ctx.hostRole),
            type: "text",
            autocomplete: "organization-title",
            maxlength: "120",
            readonly: (__VLS_ctx.hostAccountSelection !== __VLS_ctx.otherHostAccountOption),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            type: "tel",
            autocomplete: "tel",
            maxlength: "30",
            readonly: (__VLS_ctx.hostAccountSelection !== __VLS_ctx.otherHostAccountOption),
        });
        (__VLS_ctx.hostPhone);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "button-primary workspace-submit" },
            type: "submit",
            disabled: (__VLS_ctx.hostSaving),
        });
        (__VLS_ctx.hostSaving ? "Guardando..." : __VLS_ctx.editingHostId === null ? "Registrar anfitrión" : "Guardar cambios");
    }
}
if (__VLS_ctx.departmentDialogOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.departmentDialogOpen))
                    return;
                __VLS_ctx.departmentDialogOpen = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog workspace-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "department-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.departmentDialogOpen))
                    return;
                __VLS_ctx.departmentDialogOpen = false;
            } },
        ...{ class: "dialog-close" },
        type: "button",
        'aria-label': "Cerrar",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-close",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dialog-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-organization",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "department-dialog-title",
    });
    (__VLS_ctx.editingDepartmentId === null ? "Registrar departamento" : "Editar departamento");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submitDepartment) },
        ...{ class: "workspace-form modal-workspace-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        value: (__VLS_ctx.departmentName),
        type: "text",
        maxlength: "120",
        pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
        autocomplete: "organization-title",
        required: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "button-primary workspace-submit" },
        type: "submit",
        disabled: (__VLS_ctx.departmentSaving),
    });
    (__VLS_ctx.departmentSaving ? "Guardando..." : __VLS_ctx.editingDepartmentId === null ? "Registrar departamento" : "Guardar cambios");
}
if (__VLS_ctx.externalStaffDialogOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.externalStaffDialogOpen))
                    return;
                __VLS_ctx.externalStaffDialogOpen = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dialog workspace-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "external-staff-dialog-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.externalStaffDialogOpen))
                    return;
                __VLS_ctx.externalStaffDialogOpen = false;
            } },
        ...{ class: "dialog-close" },
        type: "button",
        'aria-label': "Cerrar",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-close",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dialog-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-users",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "external-staff-dialog-title",
    });
    (__VLS_ctx.editingExternalStaffId === null ? "Registrar personal externo" : "Editar personal externo");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dialog-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submitExternalStaff) },
        ...{ class: "workspace-form modal-workspace-form external-staff-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "workspace-form-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "external-staff-full-name" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        value: (__VLS_ctx.externalStaffName),
        type: "text",
        autocomplete: "name",
        maxlength: "180",
        pattern: "\u002e\u002a\u005c\u0053\u002e\u002a",
        placeholder: "Nombre y apellidos",
        required: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "optional-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "tel",
        autocomplete: "tel",
        maxlength: "30",
        placeholder: "Número de contacto",
    });
    (__VLS_ctx.externalStaffPhone);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "optional-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "email",
        autocomplete: "email",
        maxlength: "254",
        placeholder: "correo@empresa.com",
    });
    (__VLS_ctx.externalStaffEmail);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "workspace-form-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.externalStaffDialogOpen))
                    return;
                __VLS_ctx.changeExternalStaffRelationshipType(__VLS_ctx.externalStaffRelationshipType);
            } },
        value: (__VLS_ctx.externalStaffRelationshipType),
        required: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "Contratista",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "Proveedor",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.externalStaffBusinessPartnerId),
        required: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
        disabled: true,
    });
    (__VLS_ctx.businessDirectoryLoading ? "Cargando empresas..." : "Selecciona una empresa registrada");
    for (const [partner] of __VLS_getVForSourceType((__VLS_ctx.externalStaffPartnerOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (partner.id),
            value: (partner.id),
        });
        (partner.name);
        (partner.category);
        (partner.rfc);
    }
    if (!__VLS_ctx.businessDirectoryLoading && __VLS_ctx.externalStaffPartnerOptions.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "field-hint" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "button-primary workspace-submit" },
        type: "submit",
        disabled: (__VLS_ctx.externalStaffSaving),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.use)({
        href: "#i-plus",
    });
    (__VLS_ctx.externalStaffSaving ? "Guardando..." : __VLS_ctx.editingExternalStaffId === null ? "Registrar personal" : "Guardar cambios");
}
/** @type {__VLS_StyleScopedClasses['icon-library']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-app']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-lockup']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-recep']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-product']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-account']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-shield']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['account-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['account-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['account-menu-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['account-chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['account-dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['account-dropdown-profile']} */ ;
/** @type {__VLS_StyleScopedClasses['avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['account-dropdown-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-toggle-label']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-toggle-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['logout-button']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-scrim']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-open']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-mobile-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-home']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-group']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-group-title']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-group']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-main']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-main-departments']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-main-daily-log']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-main-home']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['heading-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['date-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['date-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['date-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['access-none-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['appointment-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['appointment-form']} */ ;
/** @type {__VLS_StyleScopedClasses['appointment-field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['appointment-form-full']} */ ;
/** @type {__VLS_StyleScopedClasses['appointment-field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['appointment-field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['appointment-form-full']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-appointment-details']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-dialog-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['qr-placeholder-note']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-form']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-form-full']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-form-full']} */ ;
/** @type {__VLS_StyleScopedClasses['directory-form-full']} */ ;
/** @type {__VLS_StyleScopedClasses['access-none-note']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['access-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['host-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['host-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['host-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['access-none-note']} */ ;
/** @type {__VLS_StyleScopedClasses['access-none-note']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['host-form']} */ ;
/** @type {__VLS_StyleScopedClasses['setup-callout']} */ ;
/** @type {__VLS_StyleScopedClasses['button-secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-description']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-workspace-form']} */ ;
/** @type {__VLS_StyleScopedClasses['external-staff-form']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['external-staff-full-name']} */ ;
/** @type {__VLS_StyleScopedClasses['optional-field']} */ ;
/** @type {__VLS_StyleScopedClasses['optional-field']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['button-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            DepartmentSection: DepartmentSection,
            DailyLogSection: DailyLogSection,
            EquipmentSection: EquipmentSection,
            HostsSection: HostsSection,
            ExternalStaffSection: ExternalStaffSection,
            AppointmentsSection: AppointmentsSection,
            HomeSection: HomeSection,
            BusinessDirectorySection: BusinessDirectorySection,
            AccessSection: AccessSection,
            otherAppointmentVisitor: otherAppointmentVisitor,
            activeSection: activeSection,
            dashboardTheme: dashboardTheme,
            selectedAppointmentDate: selectedAppointmentDate,
            appointmentFilter: appointmentFilter,
            appointments: appointments,
            externalStaff: externalStaff,
            departments: departments,
            hosts: hosts,
            businessPartners: businessPartners,
            generalVisitors: generalVisitors,
            accessAccounts: accessAccounts,
            currentUser: currentUser,
            otherHostAccountOption: otherHostAccountOption,
            visibleNavigationGroups: visibleNavigationGroups,
            allowedDashboardSections: allowedDashboardSections,
            isReception: isReception,
            isHost: isHost,
            currentRoleLabel: currentRoleLabel,
            drawerOpen: drawerOpen,
            privateMenuOpen: privateMenuOpen,
            appointmentDialogOpen: appointmentDialogOpen,
            editingAppointmentId: editingAppointmentId,
            qrDialogOpen: qrDialogOpen,
            qrAppointment: qrAppointment,
            qrExternalStaff: qrExternalStaff,
            qrDataUrl: qrDataUrl,
            qrGenerating: qrGenerating,
            qrDispatchAppointment: qrDispatchAppointment,
            sendingExternalQrStaffId: sendingExternalQrStaffId,
            dailyLogInitialRange: dailyLogInitialRange,
            externalStaffDialogOpen: externalStaffDialogOpen,
            editingExternalStaffId: editingExternalStaffId,
            externalStaffSaving: externalStaffSaving,
            businessPartnerDialogOpen: businessPartnerDialogOpen,
            editingBusinessPartnerId: editingBusinessPartnerId,
            visitorName: visitorName,
            visitorEmail: visitorEmail,
            visitorSelection: visitorSelection,
            visitorCompanyId: visitorCompanyId,
            visitorHostLogin: visitorHostLogin,
            visitorDate: visitorDate,
            visitorTime: visitorTime,
            appointmentSaving: appointmentSaving,
            appointmentLoading: appointmentLoading,
            appointmentSearch: appointmentSearch,
            appointmentsPage: appointmentsPage,
            appointmentsPerPage: appointmentsPerPage,
            externalStaffSearch: externalStaffSearch,
            externalStaffName: externalStaffName,
            externalStaffPhone: externalStaffPhone,
            externalStaffEmail: externalStaffEmail,
            externalStaffRelationshipType: externalStaffRelationshipType,
            externalStaffBusinessPartnerId: externalStaffBusinessPartnerId,
            departmentDialogOpen: departmentDialogOpen,
            editingDepartmentId: editingDepartmentId,
            departmentName: departmentName,
            departmentSaving: departmentSaving,
            hostRole: hostRole,
            hostDialogOpen: hostDialogOpen,
            editingHostId: editingHostId,
            hostSaving: hostSaving,
            hostAccountSelection: hostAccountSelection,
            editingAccessAccount: editingAccessAccount,
            accessAccountRoleDraft: accessAccountRoleDraft,
            accessAccountSaving: accessAccountSaving,
            hostSearch: hostSearch,
            accessSearch: accessSearch,
            hostLogin: hostLogin,
            hostName: hostName,
            hostDepartmentId: hostDepartmentId,
            hostEmail: hostEmail,
            hostPhone: hostPhone,
            businessDirectoryLoading: businessDirectoryLoading,
            businessPartnerSaving: businessPartnerSaving,
            businessPartnerSearch: businessPartnerSearch,
            businessPartnerTypeFilter: businessPartnerTypeFilter,
            businessPartnerCategoryFilter: businessPartnerCategoryFilter,
            businessPartnerStatusFilter: businessPartnerStatusFilter,
            businessPartnerPage: businessPartnerPage,
            partnerRowsPerPage: partnerRowsPerPage,
            businessPartnerName: businessPartnerName,
            businessPartnerDescription: businessPartnerDescription,
            businessPartnerRfc: businessPartnerRfc,
            businessPartnerCategory: businessPartnerCategory,
            businessPartnerSubject: businessPartnerSubject,
            businessPartnerEmployeeCount: businessPartnerEmployeeCount,
            businessPartnerType: businessPartnerType,
            businessPartnerStatus: businessPartnerStatus,
            selectableHostAccounts: selectableHostAccounts,
            externalStaffPartnerOptions: externalStaffPartnerOptions,
            loadAppointments: loadAppointments,
            openAccessAccountEditor: openAccessAccountEditor,
            saveAccessAccount: saveAccessAccount,
            getLocalDate: getLocalDate,
            summaryItems: summaryItems,
            pageTitle: pageTitle,
            hostEligibleDepartments: hostEligibleDepartments,
            appointmentCompanyOptions: appointmentCompanyOptions,
            appointmentHostOptions: appointmentHostOptions,
            appointmentVisitorOptions: appointmentVisitorOptions,
            filteredHosts: filteredHosts,
            businessPartnerCategories: businessPartnerCategories,
            filteredBusinessPartners: filteredBusinessPartners,
            paginatedBusinessPartners: paginatedBusinessPartners,
            businessPartnerPages: businessPartnerPages,
            selectedAppointments: selectedAppointments,
            searchedAppointments: searchedAppointments,
            totalAppointmentPages: totalAppointmentPages,
            paginatedAppointments: paginatedAppointments,
            calendarMonthLabel: calendarMonthLabel,
            calendarDays: calendarDays,
            activeAppointmentCount: activeAppointmentCount,
            selectSection: selectSection,
            openDailyLogRange: openDailyLogRange,
            logout: logout,
            openQrDialog: openQrDialog,
            openCompanyQrDispatch: openCompanyQrDispatch,
            openExternalStaffQr: openExternalStaffQr,
            sendExternalStaffQr: sendExternalStaffQr,
            clearQrDispatch: clearQrDispatch,
            openAppointmentDialog: openAppointmentDialog,
            openHomeAppointmentDialog: openHomeAppointmentDialog,
            changeAppointmentCompany: changeAppointmentCompany,
            changeAppointmentVisitor: changeAppointmentVisitor,
            changeCalendarMonth: changeCalendarMonth,
            openDepartmentDialog: openDepartmentDialog,
            submitDepartment: submitDepartment,
            removeDepartment: removeDepartment,
            openHostDialog: openHostDialog,
            selectHostAccount: selectHostAccount,
            submitHost: submitHost,
            removeHost: removeHost,
            selectCalendarDay: selectCalendarDay,
            submitAppointment: submitAppointment,
            downloadAppointmentQr: downloadAppointmentQr,
            deleteAppointment: deleteAppointment,
            cancelAppointment: cancelAppointment,
            openExternalStaffDialog: openExternalStaffDialog,
            changeExternalStaffRelationshipType: changeExternalStaffRelationshipType,
            submitExternalStaff: submitExternalStaff,
            removeExternalStaff: removeExternalStaff,
            openBusinessPartnerDialog: openBusinessPartnerDialog,
            changeBusinessPartnerType: changeBusinessPartnerType,
            submitBusinessPartner: submitBusinessPartner,
            removeBusinessPartner: removeBusinessPartner,
        };
    },
    __typeEmits: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
});
; /* PartiallyEnd: #4569/main.vue */
