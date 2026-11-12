<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { apiEventSource, apiFetch as fetch } from "./api";
import {
  isSameAppointmentPartner,
  isSameAppointmentVisitor,
} from "./appointment-host-ownership";
import { confirmUser, notifyUser, type AppAlertType } from "./notifications";
import { useAuthStore } from "./stores/auth";
import { useDashboardStore } from "./stores/dashboard";
import { dashboardSectionForPath, dashboardSectionPaths } from "./dashboardRoutes";
import type {
  AccessAccount,
  Appointment,
  BusinessPartner,
  BusinessPartnerStatus,
  BusinessPartnerType,
  Company,
  CompanyUser,
  Department,
  Administrator,
  ExternalStaff,
  ExternalStaffType,
  GeneralVisitor,
  Host,
  HostAccountOption,
  AuthenticatedUser,
  SystemAccessRole,
} from "./stores/types";

const DepartmentSection = defineAsyncComponent(() => import("./sections/DepartmentSection.vue"));
const CompanySection = defineAsyncComponent(() => import("./sections/CompanySection.vue"));
const CompanyUsersSection = defineAsyncComponent(() => import("./sections/CompanyUsersSection.vue"));
const AdministratorsSection = defineAsyncComponent(() => import("./sections/AdministratorsSection.vue"));
const DailyLogSection = defineAsyncComponent(() => import("./sections/DailyLogSection.vue"));
const EquipmentSection = defineAsyncComponent(() => import("./sections/EquipmentSection.vue"));
const ExternalStaffSection = defineAsyncComponent(() => import("./sections/ExternalStaffSection.vue"));
const AppointmentsSection = defineAsyncComponent(() => import("./sections/AppointmentsSection.vue"));
const HomeSection = defineAsyncComponent(() => import("./sections/HomeSection.vue"));
const BusinessDirectorySection = defineAsyncComponent(() => import("./sections/BusinessDirectorySection.vue"));
const AccessSection = defineAsyncComponent(() => import("./sections/AccessSection.vue"));
const MobileAppReleasesSection = defineAsyncComponent(
  () => import("./sections/MobileAppReleasesSection.vue"),
);

type AccessRoleDraft = "administrador" | "recepcion" | "anfitriones" | "";
const otherAppointmentVisitor = "__otro__";
const hostVisitorCompanyOption = -1;
type HostVisitor = {
  id: number;
  fullName: string;
  phone: string;
  email: string;
  registeredByLogin?: string | null;
};

function isProgrammerRole(role: string | null) {
  return role?.trim().toLocaleLowerCase("es") === "programador";
}

const emit = defineEmits<{ logout: [] }>();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const {
  activeSection,
  dashboardTheme,
  selectedAppointmentDate,
  appointmentFilter,
  appointments,
  companies,
  externalStaff,
  departments,
  hosts,
  hostAccountOptions,
  businessPartners,
  generalVisitors,
} = storeToRefs(dashboardStore);
const { accounts: accessAccounts } = storeToRefs(authStore);
const currentUser = computed(() => authStore.user!);
const otherHostAccountOption = "__otro__";
const dashboardSections = [
  "Inicio",
  "Agenda de citas",
  "Usuarios de empresa",
  "Accesos",
  "Empresas",
  "Administradores",
  "Departamento",
  "Personal de externos",
  "Contratistas, proveedores y visitantes",
  "Equipo y herramientas",
  "Bitácora diaria",
  "Aplicación móvil",
];
const visibleNavigationGroups = computed(() =>
  navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedDashboardSections.value.includes(item.label)),
    }))
    .filter((group) => group.items.length > 0),
);

function getStoredDashboardSection(login: string) {
  const key = `visitas:${encodeURIComponent(login)}:active-section`;
  let section: string | null = null;
  try {
    section = localStorage.getItem(key);
  } catch (error) {
    console.warn("No se pudo restaurar la sección guardada del dashboard:", error);
  }
  if (!section || !dashboardSections.includes(section)) {
    try {
      section = sessionStorage.getItem(key);
    } catch (fallbackError) {
      console.error("No se pudo restaurar la sección de la sesión actual:", fallbackError);
    }
  }
  return section && dashboardSections.includes(section) ? section : "Inicio";
}

function getStoredDashboardTheme(login: string): "dark" | "light" {
  try {
    const theme = localStorage.getItem(`visitas:${encodeURIComponent(login)}:theme`);
    return theme === "light" ? "light" : "dark";
  } catch (error) {
    console.error("No se pudo restaurar el tema del dashboard:", error);
    return "dark";
  }
}

function isStoredHost(value: unknown): value is Host {
  if (typeof value !== "object" || value === null) return false;
  if (
    !("id" in value) || typeof value.id !== "number" ||
    !("login" in value) || typeof value.login !== "string" ||
    !("name" in value) || typeof value.name !== "string" ||
    !("departmentId" in value) || typeof value.departmentId !== "number" ||
    !("role" in value) || typeof value.role !== "string" ||
    !("email" in value) || typeof value.email !== "string" ||
    !("phone" in value) || typeof value.phone !== "string" ||
    !("accessRoles" in value) || !Array.isArray(value.accessRoles)
  ) {
    return false;
  }
  return value.accessRoles.every(
    (role) =>
      role === "Administrador" || role === "Recepción" || role === "Anfitriones",
  );
}

function getStoredHosts(): Host[] {
  try {
    const storedHosts = localStorage.getItem("visitas:hosts");
    if (!storedHosts) return [];
    const parsed: unknown = JSON.parse(storedHosts);
    return Array.isArray(parsed) ? parsed.filter(isStoredHost) : [];
  } catch (error) {
    console.error("No se pudieron restaurar los anfitriones locales:", error);
    return [];
  }
}

activeSection.value =
  dashboardSectionForPath(route.path) ?? getStoredDashboardSection(currentUser.value.login);
dashboardTheme.value = getStoredDashboardTheme(currentUser.value.login);
selectedAppointmentDate.value = getLocalDate();
const allowedDashboardSections = computed(() => {
  if (currentUser.value.isAdmin) return dashboardSections;
  const companyOperationalSections = [
    "Agenda de citas",
    "Personal de externos",
    "Contratistas, proveedores y visitantes",
    "Equipo y herramientas",
    "Bitácora diaria",
  ];
  if (currentUser.value.isCompanyAdmin) {
    return ["Empresas", "Usuarios de empresa", ...companyOperationalSections];
  }
  if (currentUser.value.companyRole) return companyOperationalSections;
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
const companyUsersCompanyName = computed(() =>
  companies.value.find((company) => company.id === selectedCompanyUsersCompanyId.value)?.name ?? "",
);
const companyUserDepartments = computed(() => {
  const companyId = currentUser.value.isCompanyAdmin
    ? currentUser.value.companyId
    : selectedCompanyUsersCompanyId.value;
  return departments.value.filter((department) => department.companyId === companyId);
});
watch(allowedDashboardSections, (allowed) => {
  if (!allowed.includes(activeSection.value)) {
    activeSection.value = allowed[0] ?? "";
  }
}, { immediate: true });
const isReception = computed(
  () =>
    !currentUser.value.isAdmin &&
    (currentUser.value.companyRole === "recepcion" ||
      (!currentUser.value.companyRole && currentUser.value.sectionAccess.includes("recepcion"))),
);
const isHost = computed(
  () =>
    !currentUser.value.isAdmin &&
    (currentUser.value.companyRole === "anfitrion" ||
      (!currentUser.value.companyRole &&
        currentUser.value.sectionAccess.includes("anfitriones") &&
        !currentUser.value.sectionAccess.includes("recepcion"))),
);
if (isHost.value) appointmentFilter.value = "all";
const currentRoleLabel = computed(() =>
  currentUser.value.isAdmin
    ? "Administrador"
    : currentUser.value.isCompanyAdmin
      ? "Administrador de empresa"
      : isReception.value
        ? "Recepción"
        : "Anfitrión",
);
const lateAppointmentCheckClock = ref(Date.now());
const lateAppointmentNoticeKeys = new Set<string>();
let lateAppointmentNoticePoller: ReturnType<typeof setInterval> | undefined;
const drawerOpen = ref(false);
const privateMenuOpen = ref(false);
const accountMenuRef = ref<HTMLElement | null>(null);
const appointmentDialogOpen = ref(false);
const editingAppointmentId = ref<number | null>(null);
const reschedulingAppointmentId = ref<number | null>(null);
const hostVisitorDialogOpen = ref(false);
const hostVisitorSaving = ref(false);
const hostVisitorName = ref("");
const hostVisitorPhone = ref("");
const hostVisitorEmail = ref("");
const hostVisitors = ref<HostVisitor[]>([]);
const appointmentBusinessPartners = ref<BusinessPartner[]>([]);
const appointmentHostVisitors = ref<HostVisitor[]>([]);
const qrDialogOpen = ref(false);
const qrAppointment = ref<Appointment | null>(null);
const qrExternalStaff = ref<ExternalStaff | null>(null);
const qrDataUrl = ref("");
const qrGenerating = ref(false);
const qrDispatchAppointment = ref<Appointment | null>(null);
function appointmentUsesReference(appointment: Appointment) {
  return Boolean(currentUser.value.companyRole) ||
    appointment.tenantCompanyName?.trim().toLocaleLowerCase("es") !== "cymez";
}
const qrDispatchUsesReference = computed(() =>
  qrDispatchAppointment.value
    ? appointmentUsesReference(qrDispatchAppointment.value)
    : Boolean(currentUser.value.companyRole),
);
const sendingExternalQrStaffId = ref<number | null>(null);
const deletingAppointmentId = ref<number | null>(null);
const dailyLogInitialRange = ref<{ from: string; to: string } | null>(null);
const externalStaffDialogOpen = ref(false);
const editingExternalStaffId = ref<number | null>(null);
const externalStaffSaving = ref(false);
const businessPartnerDialogOpen = ref(false);
const editingBusinessPartnerId = ref<number | null>(null);
const visitorName = ref("");
const visitorEmail = ref("");
const visitorSelection = ref("");
const visitorCompanyId = ref<number | null>(null);
const visitorHostLogin = ref("");
const visitorDate = ref(getLocalDate());
const visitorTime = ref("18:00");
const appointmentSaving = ref(false);
const appointmentLoading = ref(false);
const appointmentSearch = ref("");
const globalCompanyScope = ref<"cymez" | "all">("cymez");
const appointmentsPage = ref(1);
const appointmentsPerPage = 7;
const calendarMonth = ref(getLocalDate().slice(0, 7));
const externalStaffSearch = ref("");
const externalStaffName = ref("");
const externalStaffPhone = ref("");
const externalStaffEmail = ref("");
const externalStaffRelationshipType = ref<ExternalStaffType>("Contratista");
const externalStaffBusinessPartnerId = ref<number | null>(null);
const departmentDialogOpen = ref(false);
const editingDepartmentId = ref<number | null>(null);
const departmentCompanyId = ref<number | null>(null);
const departmentName = ref("");
const departmentSaving = ref(false);
const companyDialogOpen = ref(false);
const editingCompanyId = ref<number | null>(null);
const companyName = ref("");
const companySaving = ref(false);
const administrators = ref<Administrator[]>([]);
const administratorDialogOpen = ref(false);
const editingAdministratorLogin = ref<string | null>(null);
const administratorLogin = ref("");
const administratorPassword = ref("");
const administratorName = ref("");
const administratorEmail = ref("");
const administratorRole = ref("");
const administratorPhone = ref("");
const administratorActive = ref("Y");
const administratorCompanyId = ref<number | null>(null);
const administratorSaving = ref(false);
const temporaryPasswordDialogOpen = ref(false);
const temporaryPasswordValue = ref("");
const passwordChangeValue = ref("");
const passwordChangeConfirmation = ref("");
const passwordChangeError = ref("");
const passwordChangeSaving = ref(false);
const passwordChangeRequirements = computed(() => [
  { label: "Mínimo 8 caracteres", valid: Array.from(passwordChangeValue.value).length >= 8 },
  { label: "Una mayúscula", valid: /\p{Lu}/u.test(passwordChangeValue.value) },
  { label: "Una minúscula", valid: /\p{Ll}/u.test(passwordChangeValue.value) },
  { label: "Un número", valid: /\d/.test(passwordChangeValue.value) },
  { label: "Un símbolo", valid: /[^\p{L}\p{N}\s]/u.test(passwordChangeValue.value) },
]);
const companyUsers = ref<CompanyUser[]>([]);
const companyUsersSearch = ref("");
const selectedCompanyUsersCompanyId = ref<number | null>(null);
const companyUserDialogOpen = ref(false);
const editingCompanyUserLogin = ref<string | null>(null);
const companyUserLogin = ref("");
const companyUserName = ref("");
const companyUserEmail = ref("");
const companyUserRole = ref("");
const companyUserPhone = ref("");
const companyUserApplicationRole = ref<"recepcion" | "anfitrion">("recepcion");
const companyUserDepartmentId = ref<number | null>(null);
const companyUserActive = ref("Y");
const companyUserResetPassword = ref(false);
const companyUserSaving = ref(false);
const hostRole = ref("");
const hostDialogOpen = ref(false);
const editingHostId = ref<number | null>(null);
const hostSaving = ref(false);
const hostAccountSelection = ref("");
const editingAccessAccount = ref<AccessAccount | null>(null);
const accessAccountRoleDraft = ref<AccessRoleDraft>("");
const accessAccountSaving = ref(false);
const hostSearch = ref("");
const accessSearch = ref("");
const hostLogin = ref("");
const hostName = ref("");
const hostDepartmentId = ref<number | null>(null);
const hostEmail = ref("");
const hostPhone = ref("");
const businessDirectoryLoading = ref(false);
const businessPartnerSaving = ref(false);
const nextBusinessPartnerId = ref(0);
const businessPartnerSearch = ref("");
const businessPartnerTypeFilter = ref<"Todas" | BusinessPartnerType>("Todas");
const businessPartnerCategoryFilter = ref("Todas");
const businessPartnerStatusFilter = ref<"Todas" | BusinessPartnerStatus>("Todas");
const businessPartnerPage = ref(1);
const partnerRowsPerPage = 7;
const businessPartnerName = ref("");
const businessPartnerDescription = ref("");
const businessPartnerRfc = ref("");
const businessPartnerCategory = ref("");
const businessPartnerSubject = ref("");
const businessPartnerEmployeeCount = ref(1);
const businessPartnerType = ref<BusinessPartnerType>("Contratista");
const businessPartnerStatus = ref<BusinessPartnerStatus>("Activa");

watch([appointments, lateAppointmentCheckClock, isHost], () => {
  if (!isHost.value) return;
  const now = new Date(lateAppointmentCheckClock.value);
  const today = formatLocalDate(now);
  for (const appointment of appointments.value) {
    if (appointment.status !== "Pendiente" || appointment.date !== today) continue;
    const [hours, minutes] = appointment.time.split(":").map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) continue;
    const scheduledAt = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
    ).getTime();
    if (scheduledAt > now.getTime()) continue;
    const key = `${appointment.id}:${appointment.date}:${appointment.time}`;
    if (lateAppointmentNoticeKeys.has(key)) continue;
    lateAppointmentNoticeKeys.add(key);
    showToast(
      `La visita de ${appointment.visitor}, programada a las ${appointment.time}, aún no registra su llegada. La cita ya está tardía.`,
      "warning",
      "Cita tardía",
    );
  }
}, { deep: true, immediate: true });

watch(allowedDashboardSections, (sections) => {
  if (!sections.includes(activeSection.value)) {
    activeSection.value = sections[0] ?? "";
  }
}, { immediate: true });

watch(
  () => route.path,
  (path) => {
    const section = dashboardSectionForPath(path);
    if (section) {
      if (allowedDashboardSections.value.includes(section)) {
        activeSection.value = section;
      } else {
        void router.replace(dashboardSectionPaths[allowedDashboardSections.value[0] as keyof typeof dashboardSectionPaths] ?? "/");
      }
      return;
    }
    if (path !== "/") void router.replace("/");
  },
  { immediate: true },
);

watch(accessAccounts, (accounts) => {
  const sectionsByLogin = new Map(
    accounts.map((account) => [account.login.toLocaleLowerCase(), account.sectionAccess]),
  );
  hosts.value = hosts.value.map((host) => {
    const sections = sectionsByLogin.get(host.login.toLocaleLowerCase());
    if (!sections) return host;
    return {
      ...host,
      accessRoles: [
        ...(sections.includes("administrador") ? ["Administrador" as const] : []),
        ...(sections.includes("recepcion") ? ["Recepción" as const] : []),
        "Anfitriones" as const,
      ],
    };
  });
}, { immediate: true });

watch(activeSection, (section) => {
  const key = `visitas:${encodeURIComponent(currentUser.value.login)}:active-section`;
  try {
    localStorage.setItem(key, section);
  } catch (error) {
    console.warn("No se pudo guardar la sección del dashboard de forma permanente:", error);
    try {
      sessionStorage.setItem(key, section);
    } catch (fallbackError) {
      console.error("No se pudo guardar la sección de la sesión actual:", fallbackError);
    }
  }
  if (section === "Bitácora diaria") void loadAppointments();
}, { flush: "sync" });

const selectableHostAccounts = computed(() =>
  hostAccountOptions.value.filter((account) =>
    !hosts.value.some((host) =>
      host.login.toLocaleLowerCase() === account.login.toLocaleLowerCase() &&
      host.id !== editingHostId.value,
    ),
  ),
);

function setDepartmentHosts(nextHosts: Host[]) {
  hosts.value = nextHosts;
  const hostCounts = new Map<number, number>();
  for (const host of nextHosts) {
    hostCounts.set(host.departmentId, (hostCounts.get(host.departmentId) ?? 0) + 1);
  }
  departments.value = departments.value.map((department) => ({
    ...department,
    hostCount: hostCounts.get(department.id) ?? 0,
  }));
}

const externalStaffPartnerOptions = computed(() =>
  businessPartners.value.filter(
    (partner): partner is BusinessPartner & { type: ExternalStaffType } =>
      partner.type !== "Visitante" &&
      partner.type === externalStaffRelationshipType.value,
  ),
);

let realtimeEvents: EventSource | null = null;
let realtimeFallbackTimer: number | undefined;

function refreshVisibleSection() {
  if (document.visibilityState !== "visible") return;
  if (
    activeSection.value === "Inicio" ||
    activeSection.value === "Agenda de citas" ||
    activeSection.value === "Bitácora diaria"
  ) {
    void loadAppointments(true);
  }
  if (
    activeSection.value === "Agenda de citas" &&
    (currentUser.value.isAdmin || isHost.value)
  ) {
    void loadHostVisitors(true);
  }
  if (
    activeSection.value === "Personal de externos" ||
    activeSection.value === "Contratistas, proveedores y visitantes" ||
    activeSection.value === "Agenda de citas" ||
    activeSection.value === "Bitácora diaria"
  ) {
    void loadBusinessDirectory(true);
  }
  if (activeSection.value === "Departamento" && (currentUser.value.isAdmin || isReception.value)) {
    void loadDepartments(true);
  }
  if (activeSection.value === "Usuarios de empresa") {
    void loadCompanyUsers(true);
  }
  if (
    (activeSection.value === "Departamento" ||
      activeSection.value === "Agenda de citas") &&
    (currentUser.value.isAdmin || isReception.value)
  ) {
    void loadDepartmentHosts(true);
  }
  if (activeSection.value === "Accesos" && currentUser.value.isAdmin) {
    void refreshAccessAccounts();
  }
}

async function refreshAccessAccounts() {
  try {
    const response = await fetch("/api/auth/session");
    const result = await response.json() as {
      user?: AuthenticatedUser;
      accounts?: AccessAccount[];
      error?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar la lista de accesos.");
    if (!result.user || !Array.isArray(result.accounts)) {
      throw new Error("El servidor devolvió datos de acceso incompletos.");
    }
    authStore.setSession(result.user, result.accounts);
  } catch (error) {
    console.error("No se pudieron actualizar los accesos en tiempo real:", error);
  }
}

function refreshAfterRealtimeUpdate() {
  if (document.visibilityState !== "visible") return;
  refreshVisibleSection();
  window.dispatchEvent(new Event("visitas:data-changed"));
}

function stopRealtimeFallback() {
  if (realtimeFallbackTimer === undefined) return;
  window.clearInterval(realtimeFallbackTimer);
  realtimeFallbackTimer = undefined;
}

function startRealtimeFallback() {
  if (realtimeFallbackTimer !== undefined) return;
  realtimeFallbackTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") refreshAfterRealtimeUpdate();
  }, 3000);
}

function closeAccountMenuOnOutsideClick(event: MouseEvent) {
  const target = event.target;
  if (target instanceof Node && !accountMenuRef.value?.contains(target)) {
    privateMenuOpen.value = false;
  }
}

function closeAccountMenuOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape") privateMenuOpen.value = false;
}

async function unregisterLegacyWebPush() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const workers = [
        registration.active,
        registration.waiting,
        registration.installing,
      ];
      if (!workers.some((worker) => worker?.scriptURL.endsWith("/visitas-notifications-sw.js"))) {
        continue;
      }
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      await registration.unregister();
    }
  } catch (error) {
    console.warn("No se pudo retirar el antiguo servicio de notificaciones web:", error);
  }
}

onMounted(() => {
  void unregisterLegacyWebPush();
  lateAppointmentNoticePoller = setInterval(() => {
    lateAppointmentCheckClock.value = Date.now();
  }, 30_000);
  document.addEventListener("click", closeAccountMenuOnOutsideClick);
  document.addEventListener("keydown", closeAccountMenuOnEscape);
  if (currentUser.value.mustChangePassword) return;
  if (currentUser.value.isAdmin || currentUser.value.isCompanyAdmin || isReception.value) void loadDepartments();
  if (currentUser.value.isAdmin || currentUser.value.companyRole || isReception.value || isHost.value) {
    void loadBusinessDirectory();
    void loadAppointments();
  }
  if (currentUser.value.isAdmin || isHost.value) void loadHostVisitors();
  if (currentUser.value.isAdmin) {
    void loadCompanies();
    void loadAdministrators();
    void loadHostAccounts();
  }
  if (currentUser.value.isAdmin || currentUser.value.isCompanyAdmin || isReception.value) {
    void loadDepartmentHosts();
  }
  if (currentUser.value.isCompanyAdmin) void loadCompanies();
  realtimeEvents = apiEventSource("/api/events");
  realtimeEvents.onopen = () => {
    stopRealtimeFallback();
    refreshAfterRealtimeUpdate();
  };
  realtimeEvents.onmessage = refreshAfterRealtimeUpdate;
  realtimeEvents.onerror = startRealtimeFallback;
  document.addEventListener("visibilitychange", refreshAfterRealtimeUpdate);
});

onBeforeUnmount(() => {
  if (lateAppointmentNoticePoller) clearInterval(lateAppointmentNoticePoller);
  document.removeEventListener("click", closeAccountMenuOnOutsideClick);
  document.removeEventListener("keydown", closeAccountMenuOnEscape);
  realtimeEvents?.close();
  realtimeEvents = null;
  stopRealtimeFallback();
  document.removeEventListener("visibilitychange", refreshAfterRealtimeUpdate);
});

watch(dashboardTheme, (theme) => {
  try {
    localStorage.setItem(`visitas:${encodeURIComponent(currentUser.value.login)}:theme`, theme);
  } catch (error) {
    console.error("No se pudo guardar la preferencia del tema:", error);
  }
});

async function loadAppointments(silent = false) {
  if (appointmentsRequestInProgress) {
    appointmentsRequestQueued = true;
    return;
  }
  appointmentsRequestInProgress = true;
  if (!silent) appointmentLoading.value = true;
  try {
    const endpoint = currentUser.value.isAdmin
      ? `/api/appointments?scope=${globalCompanyScope.value}`
      : "/api/appointments";
    const response = await fetch(endpoint);
    const result = await response.json() as {
      appointments?: Appointment[];
      error?: string;
    };
    if (!response.ok) {
      const message = result.error ?? "No se pudo cargar la agenda.";
      if (silent) console.error(message);
      else showToast(message);
      return;
    }
    if (!Array.isArray(result.appointments)) {
      console.error("La API devolvió una lista de citas con formato inválido.");
      if (!silent) showToast("No se pudo cargar la agenda.");
      return;
    }
    appointments.value = result.appointments;
  } catch (error) {
    console.error("Failed to load appointments:", error);
    if (!silent) showToast("No se pudo conectar con el servidor para cargar la agenda.");
  } finally {
    appointmentsRequestInProgress = false;
    if (!silent) appointmentLoading.value = false;
    if (appointmentsRequestQueued) {
      appointmentsRequestQueued = false;
      void loadAppointments(silent);
    }
  }
}

async function loadHostVisitors(silent = false) {
  try {
    const response = await fetch("/api/host-visitors");
    const result = await response.json() as { visitors?: HostVisitor[]; error?: string };
    if (!response.ok) {
      const message = result.error ?? "No se pudieron cargar los visitantes registrados.";
      if (silent) console.error(message);
      else showToast(message);
      return;
    }
    if (!Array.isArray(result.visitors)) {
      throw new Error("La API devolvió visitantes con formato inválido.");
    }
    hostVisitors.value = result.visitors;
  } catch (error) {
    console.error("Failed to load host visitors:", error);
    if (!silent) {
      showToast(error instanceof Error ? error.message : "No se pudieron cargar los visitantes registrados.");
    }
  }
}

async function loadBusinessDirectory(silent = false) {
  if (businessDirectoryRequestInProgress) return;
  businessDirectoryRequestInProgress = true;
  if (!silent) businessDirectoryLoading.value = true;
  try {
    const [partnersResponse, visitorsResponse, externalStaffResponse] = await Promise.all([
      fetch("/api/business-partners"),
      fetch("/api/general-visitors"),
      fetch("/api/external-staff"),
    ]);
    const [partnersResult, visitorsResult, externalStaffResult] = await Promise.all([
      partnersResponse.json() as Promise<{
      businessPartners?: BusinessPartner[];
      error?: string;
      }>,
      visitorsResponse.json() as Promise<{
        generalVisitors?: GeneralVisitor[];
        error?: string;
      }>,
      externalStaffResponse.json() as Promise<{
        externalStaff?: ExternalStaff[];
        error?: string;
      }>,
    ]);
    if (!partnersResponse.ok) {
      const message = partnersResult.error ?? "No se pudieron cargar los contratistas y proveedores.";
      if (silent) console.error(message);
      else showToast(message);
      return;
    }
    if (!Array.isArray(partnersResult.businessPartners)) {
      console.error("La API devolvió una lista de empresas con formato inválido.");
      if (!silent) showToast("No se pudo cargar el directorio de empresas.");
      return;
    }
    if (!visitorsResponse.ok) {
      const message = visitorsResult.error ?? "No se pudo cargar el público general.";
      if (silent) console.error(message);
      else showToast(message);
      return;
    }
    if (!Array.isArray(visitorsResult.generalVisitors)) {
      console.error("La API devolvió una lista de personas con formato inválido.");
      if (!silent) showToast("No se pudo cargar el público general.");
      return;
    }
    if (!externalStaffResponse.ok) {
      const message = externalStaffResult.error ?? "No se pudo cargar el personal externo.";
      if (silent) console.error(message);
      else showToast(message);
      return;
    }
    if (!Array.isArray(externalStaffResult.externalStaff)) {
      console.error("La API devolvió una lista de personal externo con formato inválido.");
      if (!silent) showToast("No se pudo cargar el personal externo.");
      return;
    }
    businessPartners.value = partnersResult.businessPartners;
    generalVisitors.value = visitorsResult.generalVisitors;
    externalStaff.value = externalStaffResult.externalStaff;
  } catch (error) {
    console.error("Failed to load business directory:", error);
    if (!silent) showToast("No se pudo conectar con el servidor para cargar el directorio.");
  } finally {
    businessDirectoryRequestInProgress = false;
    if (!silent) businessDirectoryLoading.value = false;
  }
}

function openAccessAccountEditor(account: AccessAccount) {
  editingAccessAccount.value = account;
  accessAccountRoleDraft.value =
    account.sectionAccess.includes("administrador")
      ? "administrador"
      : account.sectionAccess.includes("recepcion")
        ? "recepcion"
        : account.sectionAccess.includes("anfitriones")
          ? "anfitriones"
          : "";
}

async function saveAccessAccount() {
  const account = editingAccessAccount.value;
  if (!account || accessAccountSaving.value) return;
  accessAccountSaving.value = true;

  try {
    const response = await fetch(`/api/access/${encodeURIComponent(account.login)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: accessAccountRoleDraft.value ? [accessAccountRoleDraft.value] : [],
      }),
    });
    const result = await response.json() as { accounts?: AccessAccount[]; error?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo actualizar el acceso.");
      return;
    }
    if (!Array.isArray(result.accounts)) {
      showToast("Los permisos se guardaron, pero no se pudo actualizar la lista.");
      return;
    }
    accessAccounts.value = result.accounts;
    if (account.login === currentUser.value.login) {
      const updatedAccount = result.accounts.find(({ login }) => login === account.login);
      if (updatedAccount) {
        const isAdmin =
          updatedAccount.sectionAccess.includes("administrador") ||
          isProgrammerRole(updatedAccount.role);
        const isHost = hosts.value.some(
          (host) => host.login.toLocaleLowerCase() === account.login.toLocaleLowerCase(),
        );
        const sectionAccess = [
          ...updatedAccount.sectionAccess,
          ...(isHost && !updatedAccount.sectionAccess.includes("anfitriones")
            ? ["anfitriones" as const]
            : []),
        ];
        authStore.user = {
          ...currentUser.value,
          role: updatedAccount.role,
          isAdmin,
          sectionAccess,
        };
        if (!authStore.user.isAdmin) {
          const nextSection = sectionAccess.includes("recepcion")
            ? "Bitácora diaria"
            : sectionAccess.includes("anfitriones")
              ? "Agenda de citas"
              : "";
          const nextPath = dashboardSectionPaths[nextSection as keyof typeof dashboardSectionPaths];
          if (nextPath) {
            activeSection.value = nextSection;
            void router.replace(nextPath);
          } else {
            emit("logout");
          }
        }
      }
    }
    editingAccessAccount.value = null;
    showToast(`Se actualizaron las secciones autorizadas para ${account.login}.`, "success", "Permisos actualizados");
  } catch (error) {
    console.error("Failed to save account section access:", error);
    showToast("No se pudo conectar con el servidor para actualizar el acceso.");
  } finally {
    accessAccountSaving.value = false;
  }
}

function getLocalDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatLocalDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const navigationGroups = [
  {
    title: "ORGANIZACIÓN",
    items: [
      { label: "Empresas", icon: "building" },
      { label: "Usuarios de empresa", icon: "users" },
      { label: "Accesos", icon: "shield" },
    ],
  },
  {
    title: "ADMINISTRACIÓN",
    items: [
      { label: "Administradores", icon: "users" },
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
let appointmentsRequestQueued = false;
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

const pageTitle = computed(() =>
  !activeSection.value
    ? "Sin acceso asignado"
    : activeSection.value === "Inicio"
      ? "Panel de control"
      : activeSection.value,
);
const hostEligibleDepartments = computed(() => departments.value);
const appointmentCompanyOptions = computed(() =>
  [...appointmentBusinessPartners.value]
    .filter((partner) => partner.type !== "Visitante")
    .sort((first, second) =>
    first.name.localeCompare(second.name, "es"),
  ),
);
const selectedAppointmentPartner = computed(() =>
  appointmentBusinessPartners.value.find((partner) => partner.id === visitorCompanyId.value),
);
const matchingAppointmentPartners = computed(() => {
  const selected = selectedAppointmentPartner.value;
  return selected
    ? appointmentBusinessPartners.value.filter((partner) =>
        isSameAppointmentPartner(partner, selected),
      )
    : [];
});
const selectedAppointmentHostVisitor = computed(() =>
  visitorCompanyId.value === hostVisitorCompanyOption
    ? appointmentHostVisitors.value.find(
        (visitor) => String(visitor.id) === visitorSelection.value,
      )
    : undefined,
);
const matchingAppointmentHostVisitors = computed(() => {
  const selected = selectedAppointmentHostVisitor.value;
  return selected
    ? appointmentHostVisitors.value.filter((visitor) =>
        isSameAppointmentVisitor(visitor, selected),
      )
    : [];
});
const appointmentHostOptions = computed(() =>
  isHost.value
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
    : (() => {
        const ownerLogins = new Set(
          visitorCompanyId.value === hostVisitorCompanyOption
            ? matchingAppointmentHostVisitors.value
                .map((visitor) => visitor.registeredByLogin)
                .filter((login): login is string => Boolean(login))
            : matchingAppointmentPartners.value
                .map((partner) => partner.registeredByLogin)
                .filter((login): login is string => Boolean(login)),
        );
        return hosts.value
          .filter((host) => ownerLogins.has(host.login))
          .sort((first, second) => first.name.localeCompare(second.name, "es"));
      })(),
);
const appointmentVisitorOptions = computed(() =>
  visitorCompanyId.value === hostVisitorCompanyOption
    ? [...appointmentHostVisitors.value].sort((first, second) =>
        first.fullName.localeCompare(second.fullName, "es"),
      )
    : externalStaff.value
        .filter((staff) => staff.businessPartnerId === visitorCompanyId.value)
        .sort((first, second) => first.fullName.localeCompare(second.fullName, "es")),
);
function getAppointmentHostLabel(login: string | null | undefined) {
  if (!login) return "Sin anfitrión asociado";
  return hosts.value.find((host) => host.login === login)?.name ?? login;
}
function getAppointmentPartnerLabel(partner: BusinessPartner) {
  const duplicateOwners = appointmentBusinessPartners.value
    .filter((matchingPartner) => isSameAppointmentPartner(matchingPartner, partner))
    .filter((matchingPartner) => matchingPartner.registeredByLogin)
    .map((matchingPartner) => matchingPartner.registeredByLogin);
  const hasMultipleOwners = new Set(duplicateOwners).size > 1;
  return `${partner.name} · ${partner.type}${
    currentUser.value.isAdmin && hasMultipleOwners
      ? ` · ${getAppointmentHostLabel(partner.registeredByLogin)}`
      : ""
  }`;
}
function getAppointmentVisitorLabel(visitor: HostVisitor) {
  const duplicateOwners = appointmentHostVisitors.value
    .filter((matchingVisitor) => isSameAppointmentVisitor(matchingVisitor, visitor))
    .filter((matchingVisitor) => matchingVisitor.registeredByLogin)
    .map((matchingVisitor) => matchingVisitor.registeredByLogin);
  const hasMultipleOwners = new Set(duplicateOwners).size > 1;
  return `${visitor.fullName}${
    currentUser.value.isAdmin && hasMultipleOwners
      ? ` · ${getAppointmentHostLabel(visitor.registeredByLogin)}`
      : ""
  }`;
}
function getSelectedAppointmentHostVisitor() {
  const selected = selectedAppointmentHostVisitor.value;
  if (!selected) return undefined;
  return matchingAppointmentHostVisitors.value.find(
    (visitor) => visitor.registeredByLogin === visitorHostLogin.value,
  );
}
const filteredHosts = computed(() => {
  const query = hostSearch.value.trim().toLocaleLowerCase();
  if (!query) return hosts.value;

  return hosts.value.filter((host) => {
    const departmentName =
      departments.value.find((department) => department.id === host.departmentId)?.name ?? "";
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
const businessPartnerCategories = computed(() =>
  [...new Set(businessPartners.value.map((partner) => partner.category).filter(Boolean))].sort(
    (first, second) => first.localeCompare(second, "es"),
  ),
);
const filteredBusinessPartners = computed(() => {
  const query = businessPartnerSearch.value.trim().toLocaleLowerCase();

  return businessPartners.value.filter((partner) => {
    const matchesQuery =
      !query ||
      [
        partner.name,
        partner.description,
        partner.rfc,
        partner.category,
        partner.type,
        partner.status,
        partner.registeredBy,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    const matchesType =
      businessPartnerTypeFilter.value === "Todas" ||
      partner.type === businessPartnerTypeFilter.value;
    const matchesCategory =
      businessPartnerCategoryFilter.value === "Todas" ||
      partner.category === businessPartnerCategoryFilter.value;
    const matchesStatus =
      businessPartnerStatusFilter.value === "Todas" ||
      partner.status === businessPartnerStatusFilter.value;

    return matchesQuery && matchesType && matchesCategory && matchesStatus;
  });
});
const paginatedBusinessPartners = computed(() => {
  const start = (businessPartnerPage.value - 1) * partnerRowsPerPage;
  return filteredBusinessPartners.value.slice(start, start + partnerRowsPerPage);
});
const businessPartnerPages = computed(() =>
  Math.max(1, Math.ceil(filteredBusinessPartners.value.length / partnerRowsPerPage)),
);
const selectedAppointments = computed(() =>
  appointments.value
    .filter(
      (appointment) =>
        appointmentFilter.value === "all" || appointment.date === selectedAppointmentDate.value,
    )
    .sort((first, second) =>
      first.date.localeCompare(second.date) || first.time.localeCompare(second.time),
    ),
);
const searchedAppointments = computed(() => {
  const query = appointmentSearch.value.trim().toLocaleLowerCase();
  if (!query) return selectedAppointments.value;

  return selectedAppointments.value.filter((appointment) =>
    [
      appointment.date,
      appointment.visitor,
      appointment.company,
      appointment.host,
      appointment.status,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query),
  );
});
const totalAppointmentPages = computed(() =>
  Math.max(1, Math.ceil(searchedAppointments.value.length / appointmentsPerPage)),
);
const paginatedAppointments = computed(() => {
  const start = (appointmentsPage.value - 1) * appointmentsPerPage;
  return searchedAppointments.value.slice(start, start + appointmentsPerPage);
});
const calendarMonthLabel = computed(() => {
  const [year, month] = calendarMonth.value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
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
const activeAppointmentCount = computed(
  () =>
    selectedAppointments.value.filter(
      (appointment) => appointment.status !== "Retirado" && appointment.status !== "Cancelada",
    ).length,
);

watch([selectedAppointmentDate, appointmentSearch, appointmentFilter], () => {
  appointmentsPage.value = 1;
});

watch(
  [
    businessPartnerSearch,
    businessPartnerTypeFilter,
    businessPartnerCategoryFilter,
    businessPartnerStatusFilter,
  ],
  () => {
    businessPartnerPage.value = 1;
  },
);

watch(filteredBusinessPartners, () => {
  if (businessPartnerPage.value > businessPartnerPages.value) {
    businessPartnerPage.value = businessPartnerPages.value;
  }
});

watch(selectedAppointmentDate, (date) => {
  calendarMonth.value = date.slice(0, 7);
  appointmentFilter.value = "day";
});

watch(globalCompanyScope, () => {
  appointmentsPage.value = 1;
  if (currentUser.value.isAdmin) void loadAppointments();
});

watch(appointmentsPage, (page) => {
  if (page > totalAppointmentPages.value) {
    appointmentsPage.value = totalAppointmentPages.value;
  }
});

function selectSection(label: string) {
  if (!allowedDashboardSections.value.includes(label)) return;
  activeSection.value = label;
  drawerOpen.value = false;
  const path = dashboardSectionPaths[label as keyof typeof dashboardSectionPaths];
  if (path && route.path !== path) void router.push(path);
}

async function changeTemporaryPassword() {
  passwordChangeError.value = "";
  const length = Array.from(passwordChangeValue.value).length;
  if (
    length < 8 ||
    length > 128 ||
    passwordChangeRequirements.value.some((requirement) => !requirement.valid) ||
    passwordChangeValue.value !== passwordChangeConfirmation.value
  ) {
    passwordChangeError.value =
      "Usa de 8 a 128 caracteres, incluye mayúscula, minúscula, número y símbolo; ambas contraseñas deben coincidir.";
    return;
  }
  if (passwordChangeSaving.value) return;
  passwordChangeSaving.value = true;
  try {
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: passwordChangeValue.value,
        confirmation: passwordChangeConfirmation.value,
      }),
    });
    const result = await response.json() as {
      user?: AuthenticatedUser;
      error?: string;
    };
    if (!response.ok || !result.user) {
      passwordChangeError.value = result.error ?? "No se pudo actualizar la contraseña.";
      return;
    }
    authStore.setSession(result.user, authStore.accounts);
    passwordChangeValue.value = "";
    passwordChangeConfirmation.value = "";
    if (result.user.isCompanyAdmin) {
      void loadDepartments(true);
      void loadCompanies(true);
      void loadDepartmentHosts(true);
    }
    showToast("Tu contraseña quedó actualizada.", "success", "Cambio completado");
  } catch (error) {
    console.error("Failed to change temporary password:", error);
    passwordChangeError.value = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
  } finally {
    passwordChangeSaving.value = false;
  }
}

async function copyTemporaryPassword() {
  try {
    await navigator.clipboard.writeText(temporaryPasswordValue.value);
    showToast("La contraseña temporal se copió.", "success");
  } catch (error) {
    console.error("Failed to copy temporary password:", error);
    showToast("No se pudo copiar. Selecciona y copia la contraseña manualmente.");
  }
}

function closeTemporaryPasswordDialog() {
  temporaryPasswordDialogOpen.value = false;
  temporaryPasswordValue.value = "";
}

function openDailyLogRange(from: string, to: string) {
  dailyLogInitialRange.value = { from, to };
  selectSection("Bitácora diaria");
}

async function loadDepartments(silent = false) {
  try {
    const response = await fetch("/api/departments");
    const result = await response.json() as { departments?: Department[]; error?: string };
    if (!response.ok) {
      const message = result.error ?? "No se pudieron cargar los departamentos.";
      if (silent) console.error(message);
      else showToast(message);
      return;
    }
    if (!Array.isArray(result.departments)) {
      console.error("La API devolvió una lista de departamentos con formato inválido.");
      if (!silent) showToast("No se pudieron cargar los departamentos.");
      return;
    }
    departments.value = result.departments;
  } catch (error) {
    console.error("Failed to load departments:", error);
    if (!silent) showToast("No se pudo conectar con el servidor para cargar los departamentos.");
  }
}

async function loadCompanies(silent = false) {
  try {
    const response = await fetch("/api/companies");
    const result = await response.json() as { companies?: Company[]; error?: string };
    if (!response.ok) {
      const message = result.error ?? "No se pudieron cargar las empresas.";
      if (silent) console.error(message);
      else showToast(message);
      return;
    }
    if (!Array.isArray(result.companies)) {
      console.error("La API devolvió una lista de empresas con formato inválido.");
      if (!silent) showToast("No se pudieron cargar las empresas.");
      return;
    }
    companies.value = result.companies;
    if (selectedCompanyUsersCompanyId.value === null) {
      selectedCompanyUsersCompanyId.value = currentUser.value.isCompanyAdmin
        ? currentUser.value.companyId
        : result.companies[0]?.id ?? null;
    }
    if (currentUser.value.isAdmin || currentUser.value.isCompanyAdmin) {
      void loadCompanyUsers(true);
    }
  } catch (error) {
    console.error("Failed to load companies:", error);
    if (!silent) showToast("No se pudo conectar con el servidor para cargar las empresas.");
  }
}

async function loadCompanyUsers(silent = false): Promise<boolean> {
  const companyId = selectedCompanyUsersCompanyId.value;
  if (companyId === null && currentUser.value.isAdmin) {
    companyUsers.value = [];
    return true;
  }
  try {
    const query = companyId === null ? "" : `?companyId=${companyId}`;
    const response = await fetch(`/api/company-users${query}`);
    const result = await response.json() as { users?: CompanyUser[]; error?: string };
    if (!response.ok) {
      const message = result.error ?? "No se pudieron cargar los usuarios de empresa.";
      if (silent) console.error(message);
      else showToast(message);
      return false;
    }
    if (!Array.isArray(result.users)) {
      console.error("La API devolvió una lista de usuarios de empresa con formato inválido.");
      if (!silent) showToast("No se pudieron cargar los usuarios de empresa.");
      return false;
    }
    companyUsers.value = result.users;
    return true;
  } catch (error) {
    console.error("Failed to load company users:", error);
    if (!silent) showToast("No se pudo conectar con el servidor para cargar los usuarios de empresa.");
    return false;
  }
}

function selectCompanyForUsers(companyId: number | null) {
  selectedCompanyUsersCompanyId.value = companyId;
  companyUsers.value = [];
  void loadCompanyUsers();
}

async function loadAdministrators(silent = false): Promise<boolean> {
  try {
    const response = await fetch("/api/administrators");
    const result = await response.json() as { administrators?: Administrator[]; error?: string };
    if (!response.ok) {
      const message = result.error ?? "No se pudieron cargar los administradores.";
      if (silent) console.error(message);
      else showToast(message);
      return false;
    }
    if (!Array.isArray(result.administrators)) {
      console.error("La API devolvió una lista de administradores con formato inválido.");
      if (!silent) showToast("No se pudieron cargar los administradores.");
      return false;
    }
    administrators.value = result.administrators;
    return true;
  } catch (error) {
    console.error("Failed to load administrators:", error);
    if (!silent) showToast("No se pudo conectar con el servidor para cargar los administradores.");
    return false;
  }
}

async function loadHostAccounts(silent = false) {
  try {
    const response = await fetch("/api/host-accounts");
    const result = await response.json() as {
      accounts?: HostAccountOption[];
      error?: string;
    };
    if (!response.ok) {
      const message = result.error ?? "No se pudieron cargar las cuentas de Accesos.";
      if (silent) console.error(message);
      else showToast(message);
      return;
    }
    if (!Array.isArray(result.accounts)) {
      console.error("La API devolvió opciones de anfitrión con formato inválido.");
      if (!silent) showToast("No se pudieron cargar las cuentas de Accesos.");
      return;
    }
    hostAccountOptions.value = result.accounts;
  } catch (error) {
    console.error("Failed to load host account options:", error);
    if (!silent) showToast("No se pudo conectar con el servidor para cargar las cuentas de Accesos.");
  }
}

async function loadDepartmentHosts(silent = false) {
  try {
    const response = await fetch("/api/department-hosts");
    const result = await response.json() as { hosts?: Host[]; error?: string };
    if (!response.ok) {
      throw new Error(result.error ?? "No se pudieron cargar los anfitriones.");
    }
    if (!Array.isArray(result.hosts)) {
      throw new Error("La API devolvió una lista de anfitriones con formato inválido.");
    }

    let loadedHosts = result.hosts;
    const legacyHosts = currentUser.value.isAdmin ? getStoredHosts() : [];
    if (legacyHosts.length > 0) {
      const importResponse = await fetch("/api/department-hosts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hosts: legacyHosts }),
      });
      const importResult = await importResponse.json() as {
        hosts?: Host[];
        error?: string;
      };
      if (!importResponse.ok || !Array.isArray(importResult.hosts)) {
        throw new Error(importResult.error ?? "No se pudieron importar los anfitriones locales.");
      }
      loadedHosts = importResult.hosts;
      try {
        localStorage.removeItem("visitas:hosts");
      } catch (error) {
        console.warn("No se pudo limpiar la copia local de anfitriones:", error);
      }
    }
    setDepartmentHosts(loadedHosts);
  } catch (error) {
    console.error("Failed to load department hosts:", error);
    if (!silent) {
      showToast(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los anfitriones.",
      );
    }
  }
}

function showToast(message: string, type: AppAlertType = "error", title?: string) {
  notifyUser(message, type, title);
}

async function logout() {
  try {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      showToast("No se pudo cerrar la sesión. Inténtalo de nuevo.");
      return;
    }
    emit("logout");
  } catch (error) {
    console.error("Failed to log out:", error);
    showToast("No se pudo conectar con el servidor para cerrar la sesión.");
  }
}

async function createAppointmentQr(appointment: Appointment, staff?: ExternalStaff) {
  const { default: QRCode } = await import("qrcode");
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
    width: 600,
    color: { dark: "#10243a", light: "#ffffff" },
  });
}

async function openQrDialog(appointment: Appointment, externalStaffId?: number) {
  if (appointmentUsesReference(appointment)) {
    showToast("Las empresas reciben un código de referencia, no un pase QR.");
    return;
  }
  const staff = externalStaffId === undefined
    ? undefined
    : externalStaff.value.find(({ id }) => id === externalStaffId);
  if (
    externalStaffId !== undefined &&
    (!staff || staff.businessPartnerId !== appointment.businessPartnerId)
  ) {
    showToast("No se encontró el empleado asociado a esta cita.");
    return;
  }
  qrExternalStaff.value = staff ?? null;
  qrAppointment.value = appointment;
  qrDataUrl.value = "";
  qrGenerating.value = true;
  qrDialogOpen.value = true;
  try {
    qrDataUrl.value = await createAppointmentQr(appointment, staff);
  } catch (error) {
    console.error("Failed to generate appointment QR:", error);
    showToast("No se pudo generar el código QR de esta cita.");
    qrDialogOpen.value = false;
  } finally {
    qrGenerating.value = false;
  }
}

function openCompanyQrDispatch(appointment: Appointment) {
  if (appointment.partnerType !== "Contratista" || !appointment.businessPartnerId) {
    showToast("Esta cita no está vinculada a un contratista.");
    return;
  }
  qrDispatchAppointment.value = appointment;
  selectSection("Personal de externos");
}

async function openExternalStaffQr(staff: ExternalStaff) {
  if (!qrDispatchAppointment.value || appointmentUsesReference(qrDispatchAppointment.value)) {
    showToast("Las empresas reciben códigos de referencia, no pases QR.");
    return;
  }
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
  } catch (error) {
    console.error("Failed to generate external staff appointment QR:", error);
    showToast("No se pudo generar el código QR de este empleado.");
    qrDialogOpen.value = false;
  } finally {
    qrGenerating.value = false;
  }
}

async function sendExternalStaffQr(staff: ExternalStaff) {
  const appointment = qrDispatchAppointment.value;
  if (!appointment || staff.businessPartnerId !== appointment.businessPartnerId) {
    showToast("El empleado no pertenece a la empresa de esta cita.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staff.email.trim())) {
    showToast("El envío está bloqueado hasta registrar un correo electrónico válido.");
    return;
  }
  if (sendingExternalQrStaffId.value !== null) return;

  const equipmentRecipient = externalStaff.value
    .filter((person) =>
      person.businessPartnerId === appointment.businessPartnerId &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim()),
    )
    .sort((first, second) => first.id - second.id)[0];
  const receivesEquipmentLink = equipmentRecipient?.id === staff.id;
  const usesReference = appointmentUsesReference(appointment);
  const confirmed = await confirmUser(
    usesReference
      ? receivesEquipmentLink
        ? `Se enviará la referencia de ${staff.fullName} a ${staff.email}, con el enlace de un solo uso para declarar equipo y herramientas. ¿Continuar?`
        : `Se enviará la referencia de ${staff.fullName} a ${staff.email}. El enlace de declaración de equipo se enviará únicamente a ${equipmentRecipient?.fullName ?? "la primera persona con correo válido"}. ¿Continuar?`
      : receivesEquipmentLink
        ? `Se enviará el QR de ${staff.fullName} a ${staff.email}. Si la declaración aún está pendiente, este correo incluirá el enlace para declarar equipo y herramientas. Ese enlace solo puede usarse una vez y se desactiva al enviar la declaración; solo esta persona lo recibe. ¿Continuar?`
        : `Se enviará el QR de ${staff.fullName} a ${staff.email}. El enlace de declaración de equipo se envía únicamente a ${equipmentRecipient?.fullName ?? "la primera persona con correo válido"}. ¿Continuar?`,
    usesReference ? "Enviar referencia" : "Enviar QR",
  );
  if (!confirmed) return;

  sendingExternalQrStaffId.value = staff.id;
  try {
    const response = await fetch(`/api/appointments/${appointment.id}/send-qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: staff.id }),
    });
    const result = await response.json() as {
      message?: string;
      error?: string;
      diagnostic?: {
        code?: string;
        responseCode?: number | null;
        command?: string;
        response?: string;
      };
    };
    if (!response.ok) {
      const diagnostic = result.diagnostic;
      const diagnosticDetails = diagnostic
        ? [
            diagnostic.code ? `Código SMTP: ${diagnostic.code}` : "",
            diagnostic.responseCode ? `Respuesta: ${diagnostic.responseCode}` : "",
            diagnostic.command && diagnostic.command !== "UNKNOWN"
              ? `Comando: ${diagnostic.command}`
              : "",
            diagnostic.response ? `Detalle: ${diagnostic.response}` : "",
          ].filter(Boolean).join("\n")
        : "";
      showToast([
        result.error ?? `No se pudo enviar ${usesReference ? "la referencia" : "el QR"} al empleado.`,
        diagnosticDetails,
      ].filter(Boolean).join("\n\n"));
      return;
    }
    if (!result.message) {
      console.error("La API no devolvió la confirmación del envío.");
      showToast("El servidor no confirmó el envío.");
      return;
    }
    showToast(result.message, "success");
  } catch (error) {
    console.error("Failed to send external staff appointment QR:", error);
    showToast("No se pudo conectar con el servidor para enviar el QR.");
  } finally {
    sendingExternalQrStaffId.value = null;
  }
}

async function sendAppointmentReference(appointment: Appointment) {
  if (!currentUser.value.isAdmin && !currentUser.value.companyRole) return;
  let email = appointment.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    email = window.prompt(`Correo para enviar la referencia de ${appointment.visitor}:`)?.trim() ?? "";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    showToast("Escribe un correo electrónico válido para enviar la referencia.");
    return;
  }
  if (!await confirmUser(
    `Se enviará el código de referencia de ${appointment.visitor} a ${email}.`,
    "Enviar referencia",
  )) return;
  try {
    const response = await fetch(`/api/appointments/${appointment.id}/send-qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo enviar la referencia.");
      return;
    }
    if (!result.message) {
      showToast("El servidor no confirmó el envío de la referencia.");
      return;
    }
    showToast(result.message, "success");
  } catch (error) {
    console.error("Failed to send appointment reference:", error);
    showToast("No se pudo conectar con el servidor para enviar la referencia.");
  }
}

function clearQrDispatch() {
  qrDispatchAppointment.value = null;
}

async function openAppointmentDialog(appointment?: Appointment) {
  try {
    const [partnersResponse, visitorsResponse] = await Promise.all([
      fetch("/api/business-partners?scope=appointment"),
      fetch("/api/host-visitors?scope=appointment"),
    ]);
    const [partnersResult, visitorsResult] = await Promise.all([
      partnersResponse.json() as Promise<{
        businessPartners?: BusinessPartner[];
        error?: string;
      }>,
      visitorsResponse.json() as Promise<{
        visitors?: HostVisitor[];
        error?: string;
      }>,
    ]);
    if (!partnersResponse.ok || !Array.isArray(partnersResult.businessPartners)) {
      throw new Error(
        partnersResult.error ?? "No se pudieron cargar tus empresas registradas.",
      );
    }
    if (!visitorsResponse.ok || !Array.isArray(visitorsResult.visitors)) {
      throw new Error(
        visitorsResult.error ?? "No se pudieron cargar tus visitantes registrados.",
      );
    }
    appointmentBusinessPartners.value = partnersResult.businessPartners;
    appointmentHostVisitors.value = visitorsResult.visitors;
  } catch (error) {
    console.error("Failed to load appointment registration options:", error);
    showToast(
      error instanceof Error
        ? error.message
        : "No se pudieron cargar los registros para la cita.",
    );
    return;
  }
  if (
    !currentUser.value.isAdmin &&
    appointmentCompanyOptions.value.length === 0 &&
    appointmentHostVisitors.value.length === 0
  ) {
    showToast("Registra primero una empresa o un visitante para agendar una cita.");
    return;
  }
  reschedulingAppointmentId.value = null;
  editingAppointmentId.value = appointment?.id ?? null;
  visitorDate.value = appointment?.date ?? selectedAppointmentDate.value;
  visitorTime.value = appointment?.time ?? "18:00";
  visitorName.value = appointment?.visitor ?? "";
  visitorEmail.value = appointment?.email ?? "";
  visitorSelection.value = appointment?.visitorRecordId
    ? String(appointment.visitorRecordId)
    : appointment
      ? otherAppointmentVisitor
      : "";
  visitorCompanyId.value = appointment?.visitorRecordId
    ? hostVisitorCompanyOption
    : appointment
      ? appointment.businessPartnerId ??
      appointmentBusinessPartners.value.find((partner) => partner.name === appointment.company)?.id ??
        null
      : null;
  const preferredHostLogin = isHost.value
    ? currentUser.value.login
    : hosts.value.find((host) => host.name === appointment?.host)?.login ?? "";
  visitorHostLogin.value = preferredHostLogin;
  updateAppointmentHostSelection(preferredHostLogin);
  changeAppointmentHost();
  appointmentDialogOpen.value = true;
}

async function openHomeAppointmentDialog(date: string) {
  await openAppointmentDialog();
  if (appointmentDialogOpen.value) visitorDate.value = date;
}

async function openRescheduleAppointmentDialog(appointment: Appointment) {
  appointmentDialogOpen.value = false;
  await openAppointmentDialog(appointment);
  if (!appointmentDialogOpen.value) return;
  reschedulingAppointmentId.value = appointment.id;
  const nextDay = new Date();
  nextDay.setDate(nextDay.getDate() + 1);
  visitorDate.value = formatLocalDate(nextDay);
}

function changeAppointmentCompany() {
  visitorSelection.value = "";
  visitorName.value = "";
  visitorEmail.value = "";
  updateAppointmentHostSelection();
  changeAppointmentHost();
}

function changeAppointmentVisitor() {
  if (visitorSelection.value === otherAppointmentVisitor) {
    visitorName.value = "";
    visitorEmail.value = "";
    return;
  }
  const visitor = appointmentVisitorOptions.value.find(
    (staff) => String(staff.id) === visitorSelection.value,
  );
  visitorName.value = visitor?.fullName ?? "";
  visitorEmail.value = visitor?.email ?? "";
  if (visitorCompanyId.value === hostVisitorCompanyOption) {
    updateAppointmentHostSelection();
  }
}

function updateAppointmentHostSelection(preferredLogin?: string) {
  if (isHost.value) {
    visitorHostLogin.value = currentUser.value.login;
    return;
  }
  const options = appointmentHostOptions.value;
  visitorHostLogin.value = preferredLogin && options.some((host) => host.login === preferredLogin)
    ? preferredLogin
    : options.length === 1
      ? options[0].login
      : "";
}

function changeAppointmentHost() {
  if (isHost.value || visitorCompanyId.value === hostVisitorCompanyOption) return;
  const partner = matchingAppointmentPartners.value.find(
    (candidate) => candidate.registeredByLogin === visitorHostLogin.value,
  );
  if (!partner || partner.id === visitorCompanyId.value) return;
  visitorCompanyId.value = partner.id;
  visitorSelection.value = "";
  visitorName.value = "";
  visitorEmail.value = "";
}

function openHostVisitorDialog() {
  hostVisitorName.value = "";
  hostVisitorPhone.value = "";
  hostVisitorEmail.value = "";
  hostVisitorDialogOpen.value = true;
}

async function submitHostVisitor() {
  if (hostVisitorSaving.value) return;
  const fullName = hostVisitorName.value.trim();
  const phone = hostVisitorPhone.value.trim();
  const email = hostVisitorEmail.value.trim();
  if (!fullName) {
    showToast("Ingresa el nombre completo del visitante.");
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("Ingresa un correo válido o déjalo vacío.");
    return;
  }
  hostVisitorSaving.value = true;
  try {
    const response = await fetch("/api/host-visitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, phone, email }),
    });
    const result = await response.json() as { visitors?: HostVisitor[]; error?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo guardar el visitante.");
      return;
    }
    if (!Array.isArray(result.visitors)) {
      throw new Error("La API devolvió visitantes con formato inválido.");
    }
    hostVisitors.value = result.visitors;
    hostVisitorDialogOpen.value = false;
    showToast("El visitante quedó guardado para usarlo en tus citas.", "success", "Visitante registrado");
  } catch (error) {
    console.error("Failed to save host visitor:", error);
    showToast(error instanceof Error ? error.message : "No se pudo guardar el visitante.");
  } finally {
    hostVisitorSaving.value = false;
  }
}

function changeCalendarMonth(offset: number) {
  const [year, month] = calendarMonth.value.split("-").map(Number);
  const nextMonth = new Date(year, month - 1 + offset, 1);
  calendarMonth.value = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
}

function openCompanyDialog(company?: Company) {
  editingCompanyId.value = company?.id ?? null;
  companyName.value = company?.name ?? "";
  companyDialogOpen.value = true;
}

async function submitCompany() {
  const name = companyName.value.trim();
  if (!name || companySaving.value) return;
  const duplicate = companies.value.some(
    (company) =>
      company.name.trim().toLocaleLowerCase("es") === name.toLocaleLowerCase("es") &&
      company.id !== editingCompanyId.value,
  );
  if (duplicate) {
    showToast("Ya existe una empresa con ese nombre.");
    return;
  }

  companySaving.value = true;
  try {
    const companyId = editingCompanyId.value;
    const response = await fetch(
      companyId === null ? "/api/companies" : `/api/companies/${companyId}`,
      {
        method: companyId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      },
    );
    const result = await response.json() as { companies?: Company[]; error?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo guardar la empresa.");
      return;
    }
    if (!Array.isArray(result.companies)) {
      console.error("La API devolvió una lista de empresas con formato inválido.");
      showToast("La empresa se guardó, pero no se pudo actualizar la lista. Recarga la sección.");
      return;
    }
    companies.value = result.companies;
    companyDialogOpen.value = false;
    editingCompanyId.value = null;
    companyName.value = "";
    showToast(
      companyId === null ? "La empresa se registró correctamente." : "La empresa se actualizó.",
      "success",
      companyId === null ? "Empresa registrada" : "Empresa actualizada",
    );
  } catch (error) {
    console.error("Failed to save company:", error);
    showToast("No se pudo conectar con el servidor para guardar la empresa.");
  } finally {
    companySaving.value = false;
  }
}

async function removeCompany(id: number) {
  const company = companies.value.find((item) => item.id === id);
  if (!await confirmUser(
    `¿Eliminar la empresa${company ? ` ${company.name}` : ""}? Solo se pueden eliminar empresas sin departamentos vinculados.`,
    "Eliminar empresa",
    "Confirmar eliminación",
    "warning",
  )) return;
  try {
    const response = await fetch(`/api/companies/${id}`, { method: "DELETE" });
    const result = await response.json() as { companies?: Company[]; error?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo eliminar la empresa.");
      return;
    }
    if (!Array.isArray(result.companies)) {
      console.error("La API devolvió una lista de empresas con formato inválido.");
      showToast("La empresa se eliminó, pero no se pudo actualizar la lista.");
      return;
    }
    companies.value = result.companies;
    showToast("La empresa se eliminó.", "success", "Empresa eliminada");
  } catch (error) {
    console.error("Failed to delete company:", error);
    showToast("No se pudo conectar con el servidor para eliminar la empresa.");
  }
}

function openAdministratorDialog(administrator?: Administrator) {
  editingAdministratorLogin.value = administrator?.login ?? null;
  administratorLogin.value = administrator?.login ?? "";
  administratorPassword.value = "";
  administratorName.value = administrator?.name ?? "";
  administratorEmail.value = administrator?.email ?? "";
  administratorRole.value = administrator?.role ?? "";
  administratorPhone.value = administrator?.phone ?? "";
  administratorActive.value = administrator?.active ?? "Y";
  administratorCompanyId.value = administrator?.companyId ?? companies.value[0]?.id ?? null;
  administratorDialogOpen.value = true;
}

function openCompanyUserDialog(companyUser?: CompanyUser) {
  editingCompanyUserLogin.value = companyUser?.login ?? null;
  companyUserLogin.value = companyUser?.login ?? "";
  companyUserName.value = companyUser?.name ?? "";
  companyUserEmail.value = companyUser?.email ?? "";
  companyUserRole.value = companyUser?.role ?? "";
  companyUserPhone.value = companyUser?.phone ?? "";
  companyUserApplicationRole.value = companyUser?.applicationRole ?? "recepcion";
  companyUserDepartmentId.value = companyUser?.departmentId ?? null;
  companyUserActive.value = companyUser?.active ?? "Y";
  companyUserResetPassword.value = false;
  companyUserDialogOpen.value = true;
}

async function submitCompanyUser() {
  const login = companyUserLogin.value.trim();
  const name = companyUserName.value.trim();
  const companyId = currentUser.value.isCompanyAdmin
    ? currentUser.value.companyId
    : selectedCompanyUsersCompanyId.value;
  if (
    companyUserSaving.value ||
    !login ||
    !name ||
    companyId === null ||
    (companyUserApplicationRole.value === "anfitrion" && companyUserDepartmentId.value === null)
  ) {
    showToast("Revisa el usuario, nombre, empresa y departamento del anfitrión.");
    return;
  }
  companyUserSaving.value = true;
  try {
    const editingLogin = editingCompanyUserLogin.value;
    const endpoint = editingLogin === null
      ? "/api/company-users"
      : `/api/company-users/${encodeURIComponent(editingLogin)}`;
    const response = await fetch(`${endpoint}?companyId=${companyId}`, {
      method: editingLogin === null ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login,
        name,
        email: companyUserEmail.value.trim(),
        role: companyUserRole.value.trim(),
        phone: companyUserPhone.value.trim(),
        applicationRole: companyUserApplicationRole.value,
        departmentId: companyUserApplicationRole.value === "anfitrion"
          ? companyUserDepartmentId.value
          : null,
        active: companyUserActive.value,
        resetPassword: companyUserResetPassword.value,
      }),
    });
    const result = await response.json() as { error?: string; temporaryPassword?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo guardar el usuario de empresa.");
      return;
    }
    companyUserDialogOpen.value = false;
    const listUpdated = await loadCompanyUsers(true);
    if (result.temporaryPassword) {
      temporaryPasswordValue.value = result.temporaryPassword;
      temporaryPasswordDialogOpen.value = true;
      if (!listUpdated) {
        showToast("La cuenta se guardó, pero no se pudo actualizar la lista. Guarda la contraseña y recarga después.", "warning");
      }
    } else if (listUpdated) {
      showToast(
        editingLogin === null ? "El usuario se registró correctamente." : "El usuario se actualizó.",
        "success",
        "Usuario de empresa guardado",
      );
    } else {
      showToast("El usuario se guardó, pero no se pudo actualizar la lista. Recárgala.", "warning");
    }
  } catch (error) {
    console.error("Failed to save company user:", error);
    showToast("No se pudo conectar con el servidor para guardar el usuario.");
  } finally {
    companyUserSaving.value = false;
  }
}

async function removeCompanyUser(companyUser: CompanyUser) {
  if (!await confirmUser(
    `¿Eliminar la cuenta ${companyUser.login} de esta empresa?`,
    "Eliminar usuario de empresa",
    "Confirmar eliminación",
    "warning",
  )) return;
  try {
    const companyId = currentUser.value.isCompanyAdmin
      ? currentUser.value.companyId
      : selectedCompanyUsersCompanyId.value;
    const response = await fetch(
      `/api/company-users/${encodeURIComponent(companyUser.login)}?companyId=${companyId}`,
      { method: "DELETE" },
    );
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo eliminar el usuario de empresa.");
      return;
    }
    if (await loadCompanyUsers(true)) {
      showToast("El usuario de empresa se eliminó.", "success", "Usuario eliminado");
    } else {
      showToast("El usuario se eliminó, pero no se pudo actualizar la lista. Recárgala.", "warning");
    }
  } catch (error) {
    console.error("Failed to delete company user:", error);
    showToast("No se pudo conectar con el servidor para eliminar el usuario.");
  }
}

async function submitAdministrator() {
  const login = administratorLogin.value.trim();
  const name = administratorName.value.trim();
  if (
    administratorSaving.value ||
    !login ||
    !name ||
    administratorCompanyId.value === null
  ) {
    showToast("Revisa el usuario, nombre y empresa del administrador.");
    return;
  }
  administratorSaving.value = true;
  try {
    const editingLogin = editingAdministratorLogin.value;
    const payload = {
      login,
      name,
      email: administratorEmail.value.trim(),
      role: administratorRole.value.trim(),
      phone: administratorPhone.value.trim(),
      active: administratorActive.value,
      companyId: administratorCompanyId.value,
    };
    const response = await fetch(
      editingLogin === null
        ? "/api/administrators"
        : `/api/administrators/${encodeURIComponent(editingLogin)}`,
      {
        method: editingLogin === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json() as { error?: string; temporaryPassword?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo guardar el administrador.");
      return;
    }
    administratorDialogOpen.value = false;
    const listUpdated = await loadAdministrators(true);
    if (result.temporaryPassword) {
      temporaryPasswordValue.value = result.temporaryPassword;
      temporaryPasswordDialogOpen.value = true;
      if (!listUpdated) {
        showToast("La cuenta se creó, pero no se pudo actualizar la lista. Guarda la contraseña y recarga después.", "warning");
      }
    } else if (listUpdated) {
      showToast(
        editingLogin === null ? "El administrador se registró correctamente." : "El administrador se actualizó.",
        "success",
        editingLogin === null ? "Administrador registrado" : "Administrador actualizado",
      );
    } else {
      showToast("El administrador se guardó, pero no se pudo actualizar la lista. Recárgala.", "warning");
    }
  } catch (error) {
    console.error("Failed to save administrator:", error);
    showToast("No se pudo conectar con el servidor para guardar el administrador.");
  } finally {
    administratorSaving.value = false;
  }
}

async function removeAdministrator(administrator: Administrator) {
  if (!await confirmUser(
    `¿Eliminar la cuenta de administrador ${administrator.login}?`,
    "Eliminar administrador",
    "Confirmar eliminación",
    "warning",
  )) return;
  try {
    const response = await fetch(
      `/api/administrators/${encodeURIComponent(administrator.login)}`,
      { method: "DELETE" },
    );
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo eliminar el administrador.");
      return;
    }
    if (await loadAdministrators(true)) {
      showToast("El administrador se eliminó.", "success", "Administrador eliminado");
    } else {
      showToast("El administrador se eliminó, pero no se pudo actualizar la lista. Recárgala.", "warning");
    }
  } catch (error) {
    console.error("Failed to delete administrator:", error);
    showToast("No se pudo conectar con el servidor para eliminar el administrador.");
  }
}

function openDepartmentDialog(department?: Department, companyId?: number) {
  editingDepartmentId.value = department?.id ?? null;
  departmentCompanyId.value =
    department?.companyId ??
    companyId ??
    companies.value[0]?.id ??
    null;
  departmentName.value = department?.name ?? "";
  departmentDialogOpen.value = true;
}

async function submitDepartment() {
  const name = departmentName.value.trim();
  if (!name || departmentSaving.value) return;
  const companyId = departmentCompanyId.value;
  if (companyId === null) {
    showToast("No se pudo identificar la empresa del departamento. Actualiza la página e inténtalo de nuevo.");
    return;
  }

  const duplicate = departments.value.some(
    (department) =>
      department.companyId === companyId &&
      department.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
      department.id !== editingDepartmentId.value,
  );
  if (duplicate) {
    showToast("Ya existe un departamento con ese nombre.");
    return;
  }

  departmentSaving.value = true;
  try {
    const departmentId = editingDepartmentId.value;
    const response = await fetch(
      departmentId === null
        ? "/api/departments"
        : `/api/departments/${departmentId}`,
      {
        method: departmentId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, companyId }),
      },
    );
    const result = await response.json() as { departments?: Department[]; error?: string };
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
    void loadCompanies(true);
    departmentDialogOpen.value = false;
    editingDepartmentId.value = null;
    departmentCompanyId.value = null;
    departmentName.value = "";
    showToast(
      departmentId === null ? "El departamento se guardó correctamente." : "El departamento se actualizó.",
      "success",
      departmentId === null ? "Departamento registrado" : "Departamento actualizado",
    );
  } catch (error) {
    console.error("Failed to save department:", error);
    showToast("No se pudo conectar con el servidor para guardar el departamento.");
  } finally {
    departmentSaving.value = false;
  }
}

async function removeDepartment(id: number) {
  if (hosts.value.some((host) => host.departmentId === id)) {
    showToast("No se puede eliminar el departamento porque tiene anfitriones asignados.");
    return;
  }
  const department = departments.value.find((item) => item.id === id);
  if (!await confirmUser(
    `¿Eliminar el departamento${department ? ` ${department.name}` : ""}? Esta acción no se puede deshacer.`,
    "Eliminar departamento",
    "Confirmar eliminación",
    "warning",
  )) return;
  try {
    const response = await fetch(`/api/departments/${id}`, { method: "DELETE" });
    const result = await response.json() as { departments?: Department[]; error?: string };
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
    void loadCompanies(true);
    showToast("El departamento se eliminó.", "success", "Departamento eliminado");
  } catch (error) {
    console.error("Failed to delete department:", error);
    showToast("No se pudo conectar con el servidor para eliminar el departamento.");
  }
}

function openHostDialog(host?: Host) {
  editingHostId.value = host?.id ?? null;
  hostLogin.value = host?.login ?? "";
  hostName.value = host?.name ?? "";
  hostDepartmentId.value =
    host?.departmentId ?? hostEligibleDepartments.value[0]?.id ?? departments.value[0]?.id ?? null;
  hostRole.value = host?.role ?? "";
  hostEmail.value = host?.email ?? "";
  hostPhone.value = host?.phone ?? "";
  hostAccountSelection.value = host
    ? hostAccountOptions.value.some((account) =>
      account.login.toLocaleLowerCase() === host.login.toLocaleLowerCase(),
    )
      ? host.login
      : otherHostAccountOption
    : "";
  hostDialogOpen.value = true;
}

function selectHostAccount(login: string) {
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
  if (hostSaving.value) return;
  const selectedAccount = hostAccountSelection.value === otherHostAccountOption
    ? null
    : hostAccountOptions.value.find(
      (account) => account.login === hostAccountSelection.value,
    );
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
  const departmentExists = departments.value.some(
    (department) => department.id === departmentId,
  );

  if (
    !login ||
    !name ||
    departmentId === null ||
    !departmentExists
  ) {
    showToast("Completa el login, el nombre y asigna el anfitrión a un departamento.");
    return;
  }

  const duplicateLogin = hosts.value.some(
    (host) =>
      host.login.toLocaleLowerCase() === login.toLocaleLowerCase() &&
      host.id !== editingHostId.value,
  );
  if (duplicateLogin) {
    showToast("Ya existe un anfitrión con ese usuario.");
    return;
  }

  const duplicateEmail = hosts.value.some(
    (host) =>
      Boolean(email) &&
      host.email.toLocaleLowerCase() === email &&
      host.id !== editingHostId.value,
  );
  if (duplicateEmail) {
    showToast("Ya existe un anfitrión con ese correo electrónico.");
    return;
  }

  hostSaving.value = true;
  try {
    const hostId = editingHostId.value;
    const response = await fetch(
      hostId === null ? "/api/department-hosts" : `/api/department-hosts/${hostId}`,
      {
        method: hostId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, name, departmentId, role, email, phone }),
      },
    );
    const result = await response.json() as { hosts?: Host[]; error?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo guardar el anfitrión.");
      return;
    }
    if (!Array.isArray(result.hosts)) {
      console.error("La API devolvió una lista de anfitriones con formato inválido.");
      showToast("El anfitrión se guardó, pero no se pudo actualizar la lista.");
      return;
    }
    setDepartmentHosts(result.hosts);
    hostDialogOpen.value = false;
    editingHostId.value = null;
    hostLogin.value = "";
    hostName.value = "";
    hostRole.value = "";
    hostEmail.value = "";
    hostPhone.value = "";
    hostAccountSelection.value = "";
    showToast(
      hostId === null
        ? "El anfitrión se registró con los datos de Accesos."
        : "Los datos del anfitrión se actualizaron.",
      "success",
      hostId === null ? "Anfitrión registrado" : "Anfitrión actualizado",
    );
  } catch (error) {
    console.error("Failed to save department host:", error);
    showToast("No se pudo conectar con el servidor para guardar el anfitrión.");
  } finally {
    hostSaving.value = false;
  }
}

async function removeHost(id: number) {
  const host = hosts.value.find((item) => item.id === id);
  if (!await confirmUser(
    `¿Eliminar el anfitrión${host ? ` ${host.name}` : ""}?`,
    "Eliminar anfitrión",
    "Confirmar eliminación",
    "warning",
  )) return;
  try {
    const response = await fetch(`/api/department-hosts/${id}`, { method: "DELETE" });
    const result = await response.json() as { hosts?: Host[]; error?: string };
    if (!response.ok) {
      showToast(result.error ?? "No se pudo eliminar el anfitrión.");
      return;
    }
    if (!Array.isArray(result.hosts)) {
      console.error("La API devolvió una lista de anfitriones con formato inválido.");
      showToast("El anfitrión se eliminó, pero no se pudo actualizar la lista.");
      return;
    }
    setDepartmentHosts(result.hosts);
    showToast("El anfitrión se eliminó.", "success", "Anfitrión eliminado");
  } catch (error) {
    console.error("Failed to delete department host:", error);
    showToast("No se pudo conectar con el servidor para eliminar el anfitrión.");
  }
}

function selectCalendarDay(date: string) {
  selectedAppointmentDate.value = date;
  appointmentFilter.value = "day";
}

function setAppointmentFilter(filter: "day" | "all") {
  appointmentFilter.value = filter;
}

async function submitAppointment() {
  if (appointmentSaving.value) return;
  const isHostVisitor = visitorCompanyId.value === hostVisitorCompanyOption;
  const company = isHostVisitor
    ? undefined
    : appointmentBusinessPartners.value.find((partner) => partner.id === visitorCompanyId.value);
  const host = appointmentHostOptions.value.find(
    (candidate) => candidate.login === visitorHostLogin.value,
  );
  const selectedVisitor =
    isHostVisitor || visitorSelection.value === otherAppointmentVisitor
      ? null
      : appointmentVisitorOptions.value.find(
          (staff) => String(staff.id) === visitorSelection.value,
        );
  const selectedHostVisitor = isHostVisitor
    ? getSelectedAppointmentHostVisitor()
    : undefined;
  const appointmentVisitorName =
    visitorSelection.value === otherAppointmentVisitor
      ? visitorName.value.trim()
      : selectedHostVisitor?.fullName ?? selectedVisitor?.fullName ?? "";
  const email = visitorEmail.value.trim();
  let appointmentEmail =
    visitorSelection.value === otherAppointmentVisitor
      ? email
      : selectedHostVisitor?.email.trim() ?? selectedVisitor?.email.trim() ?? "";
  if (!appointmentVisitorName || (!company && !isHostVisitor) || !host || !visitorSelection.value) {
    showToast("Selecciona una empresa o un visitante registrado, y un visitante.");
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
    const isRescheduling = appointmentId !== null &&
      reschedulingAppointmentId.value === appointmentId;
    const response = await fetch(
      appointmentId === null ? "/api/appointments" : `/api/appointments/${appointmentId}`,
      {
      method: appointmentId === null ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorName: appointmentVisitorName,
        visitorEmail: appointmentEmail,
        businessPartnerId: company?.id ?? null,
        visitorRecordId: selectedHostVisitor?.id ?? null,
        hostName: host.name,
        hostLogin: host.login,
        date: visitorDate.value,
        time: visitorTime.value,
        reschedule: isRescheduling,
      }),
      },
    );
    const result = await response.json() as {
      appointments?: Appointment[];
      message?: string;
      error?: string;
    };
    if (!response.ok) {
      showToast(
        result.error ?? (isRescheduling ? "No se pudo reagendar la cita." : "No se pudo guardar la cita."),
        "error",
        isRescheduling ? "No se pudo reagendar la cita" : "No se pudo guardar la cita",
      );
      return;
    }
    if (!Array.isArray(result.appointments)) {
      console.error("La API devolvió una lista de citas con formato inválido.");
      showToast(
        isRescheduling
          ? "La cita se reagendó, pero no se pudo actualizar la agenda."
          : "La cita se guardó, pero no se pudo actualizar la agenda.",
        "error",
        isRescheduling ? "Cita reagendada" : "Cita guardada",
      );
      return;
    }
    appointments.value = result.appointments;
    appointmentDialogOpen.value = false;
    editingAppointmentId.value = null;
    reschedulingAppointmentId.value = null;
    selectedAppointmentDate.value = visitorDate.value;
    showToast(
      result.message ?? (
        isRescheduling
          ? "La cita se reagendó y quedó nuevamente pendiente."
          : appointmentId === null
            ? "La cita se guardó en la agenda."
            : "La cita se actualizó en la agenda."
      ),
      "success",
      isRescheduling ? "Cita reagendada" : appointmentId === null ? "Cita registrada" : "Cita actualizada",
    );
    visitorName.value = "";
    visitorEmail.value = "";
    visitorSelection.value = "";
    visitorCompanyId.value = null;
    visitorHostLogin.value = "";
    visitorDate.value = getLocalDate();
    visitorTime.value = "18:00";
  } catch (error) {
    console.error("Failed to create appointment:", error);
    showToast("No se pudo conectar con el servidor para guardar la cita.");
  } finally {
    appointmentSaving.value = false;
  }
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapPassName(value: string, maxLength = 25) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (word.length > maxLength) {
      if (line) lines.push(line);
      line = "";
      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }
      continue;
    }
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["VISITANTE"];
}

function createPrintablePassSvg(
  name: string,
  referenceCode: string,
  qrDataUrl: string,
  logoDataUrl: string,
) {
  const width = 768;
  const nameLines = wrapPassName(name, 34);
  const nameBandY = 405;
  const nameBandHeight = Math.max(112, nameLines.length * 42 + 26);
  const referenceTitleY = nameBandY + nameBandHeight + 42;
  const referencePillY = referenceTitleY + 21;
  const qrTop = referencePillY + 105;
  const qrSize = 500;
  const qrFrameSize = qrSize + 44;
  const footerY = qrTop + qrFrameSize + 46;
  const height = Math.max(1376, footerY + 112);
  const longestNameLine = Math.max(...nameLines.map((line) => line.length));
  const nameFontSize =
    nameLines.length > 1 || longestNameLine > 24 ? 30 : 36;
  const nameBandCenterY = nameBandY + nameBandHeight / 2;
  const nameStartY =
    nameBandCenterY - ((nameLines.length - 1) * 37) / 2 + nameFontSize * 0.34;
  const nameText = nameLines
    .map((line, index) =>
      `<text x="458" y="${nameStartY + index * 37}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${nameFontSize}" font-weight="800" fill="#ffffff">${escapeSvgText(line)}</text>`,
    )
    .join("");
  const safeReference = escapeSvgText(referenceCode || "SIN REFERENCIA");
  const qrInset = 22;
  const qrFrameX = (width - qrFrameSize) / 2;
  const qrImageSize = qrSize;
  const logoWidth = 250;
  const logoHeight = 308;
  const logoX = (width - logoWidth) / 2;
  const logoY = 42;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <clipPath id="pass-card-clip"><rect x="3" y="3" width="${width - 6}" height="${height - 6}" rx="48"/></clipPath>
    </defs>
    <g clip-path="url(#pass-card-clip)">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <path d="M0 0h${width * .32}L0 ${height * .27}z" fill="#071a36"/>
    <path d="M${width * .27} 0h${width * .09}L0 ${height * .34}v-${height * .08}z" fill="#e21b2d"/>
    <path d="M0 ${height * .29}L${width * .29} 0h${width * .04}L0 ${height * .34}z" fill="#d8dde5"/>
    <path d="M768 ${height * .72}V${height}H492z" fill="#071a36"/>
    <path d="M768 ${height * .68}v${height * .07}L553 ${height}h-61z" fill="#e21b2d"/>
    <path d="M768 ${height * .66}v${height * .02}L520 ${height}h-28z" fill="#d8dde5"/>
    <image x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoHeight}" href="${logoDataUrl}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="42" y="${nameBandY}" width="684" height="${nameBandHeight}" rx="52" fill="#071a36" stroke="#e21b2d" stroke-width="8"/>
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" transform="translate(80 ${nameBandCenterY - 36}) scale(3)" fill="#ffffff"/>
    <path d="M170 ${nameBandY + 17}v${nameBandHeight - 34}" stroke="#ffffff" stroke-width="3" opacity=".8"/>
    ${nameText}
    <path d="M30 ${referenceTitleY}h130m448 0h130" stroke="#e21b2d" stroke-width="5"/>
    <rect x="174" y="${referenceTitleY - 25}" width="420" height="48" rx="24" fill="#ffffff" stroke="#7b111b" stroke-width="3"/>
    <text x="384" y="${referenceTitleY + 7}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="800" letter-spacing="1" fill="#071a36">CÓDIGO DE REFERENCIA</text>
    <rect x="202" y="${referencePillY}" width="364" height="58" rx="29" fill="#d20d1b"/>
    <text x="384" y="${referencePillY + 40}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="800" letter-spacing="2" fill="#ffffff">${safeReference}</text>
    <rect x="${qrFrameX}" y="${qrTop}" width="${qrFrameSize}" height="${qrFrameSize}" rx="44" fill="#ffffff" stroke="#071a36" stroke-width="7"/>
    <rect x="${qrFrameX + 8}" y="${qrTop + 8}" width="${qrFrameSize - 16}" height="${qrFrameSize - 16}" rx="38" fill="none" stroke="#e21b2d" stroke-width="6"/>
    <image x="${(width - qrImageSize) / 2}" y="${qrTop + qrInset}" width="${qrImageSize}" height="${qrImageSize}" href="${qrDataUrl}" preserveAspectRatio="xMidYMid meet"/>
    <text x="384" y="${footerY + 14}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="800" letter-spacing="4.5" fill="#071a36">ESCANEA EL CÓDIGO QR</text>
    <text x="384" y="${footerY + 50}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="800" letter-spacing="4.5" fill="#071a36">PARA REGISTRAR TU VISITA</text>
    </g>
    <rect x="3" y="3" width="${width - 6}" height="${height - 6}" rx="48" fill="none" stroke="#071a36" stroke-width="6"/>
  </svg>`;
}

async function downloadAppointmentQr(
  appointment: Appointment,
  dataUrl = qrDataUrl.value,
  staff = qrExternalStaff.value,
) {
  if (!dataUrl) {
    showToast("El QR aún no está listo para descargarse.");
    return;
  }
  const personName = staff?.fullName ?? appointment.visitor;
  try {
    const logoResponse = await fetch("/images/cymez-pass-logo.png");
    if (!logoResponse.ok) {
    throw new Error(`No se pudo cargar el logo del pase (${logoResponse.status}).`);
    }
    const logoBlob = await logoResponse.blob();
    const logoDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("No se pudo leer el logo del pase."));
    };
    reader.onerror = () =>
      reject(new Error("No se pudo leer el logo del pase."));
    reader.readAsDataURL(logoBlob);
    });
    const svg = createPrintablePassSvg(
    personName,
    appointment.referenceCode,
    dataUrl,
    logoDataUrl,
    );
    const svgUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
    let downloadUrl: string | null = null;
    try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo preparar la plantilla del pase."));
      image.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la descarga PNG.");
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo convertir el pase a PNG."));
      }, "image/png");
    });
    downloadUrl = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `pase-visita-${personName.trim().replace(/[^a-zA-Z0-9]+/g, "-")}.png`;
    link.click();
    window.setTimeout(() => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    }, 1000);
    } finally {
    URL.revokeObjectURL(svgUrl);
    }
  } catch (error) {
    console.error("Failed to create printable appointment QR:", error);
    showToast("No se pudo preparar el PNG del pase.");
  }
}

async function deleteAppointment(appointment: Appointment) {
  if (!currentUser.value.isAdmin && appointment.status !== "Cancelada") {
    showToast("Para eliminar una cita, primero debes cancelarla.");
    return;
  }
  if (
    deletingAppointmentId.value !== null ||
    !await confirmUser(
      `¿Quitar de la agenda la cita${appointment.status === "Cancelada" ? " cancelada" : ""} de ${appointment.visitor}? Se conservará en el historial.`,
      "Eliminar cita",
      "Confirmar eliminación",
      "warning",
    )
  ) {
    return;
  }
  deletingAppointmentId.value = appointment.id;
  try {
    const response = await fetch(`/api/appointments/${appointment.id}`, {
      method: "DELETE",
    });
    const result = await response.json() as {
      appointments?: Appointment[];
      error?: string;
    };
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
    showToast("La cita se eliminó de la agenda.", "success", "Cita eliminada");
  } catch (error) {
    console.error("Failed to delete appointment:", error);
    showToast("No se pudo conectar con el servidor para eliminar la cita.");
  } finally {
    deletingAppointmentId.value = null;
  }
}

async function cancelAppointment(appointment: Appointment) {
  if (appointment.status === "Cancelada" || appointment.status === "Retirado") return;
  if (!await confirmUser(
    `¿Cancelar la cita de ${appointment.visitor}?`,
    "Cancelar cita",
    "Confirmar cancelación",
    "warning",
  )) return;

  try {
    const response = await fetch(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Cancelada" }),
    });
    const result = await response.json() as {
      appointments?: Appointment[];
      error?: string;
    };
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
    showToast(`Se canceló la cita de ${appointment.visitor}.`, "success", "Cita cancelada");
  } catch (error) {
    console.error("Failed to cancel appointment:", error);
    showToast("No se pudo conectar con el servidor para cancelar la cita.");
  }
}

function openExternalStaffDialog(staff?: ExternalStaff, businessPartnerId?: number) {
  editingExternalStaffId.value = staff?.id ?? null;
  externalStaffName.value = staff?.fullName ?? "";
  externalStaffPhone.value = staff?.phone ?? "";
  externalStaffEmail.value = staff?.email ?? "";
  const selectedPartner = businessPartners.value.find(
    (partner) => partner.id === (staff?.businessPartnerId ?? businessPartnerId),
  );
  externalStaffRelationshipType.value =
    staff?.relationshipType ?? (selectedPartner?.type === "Proveedor" ? "Proveedor" : "Contratista");
  externalStaffBusinessPartnerId.value =
    staff?.businessPartnerId ?? businessPartnerId ?? null;
  externalStaffDialogOpen.value = true;
}

function changeExternalStaffRelationshipType(type: ExternalStaffType) {
  externalStaffRelationshipType.value = type;
  const selectedPartner = businessPartners.value.find(
    (partner) => partner.id === externalStaffBusinessPartnerId.value,
  );
  if (selectedPartner && selectedPartner.type !== type) {
    externalStaffBusinessPartnerId.value = null;
  }
}

async function submitExternalStaff() {
  if (externalStaffSaving.value) return;
  const fullName = externalStaffName.value.trim();
  const businessPartnerId = externalStaffBusinessPartnerId.value;
  if (!fullName || businessPartnerId === null) return;
  const editingId = editingExternalStaffId.value;
  const selectedPartner = businessPartners.value.find((partner) => partner.id === businessPartnerId);
  const currentStaffPartnerId = editingId === null
    ? null
    : externalStaff.value.find((person) => person.id === editingId)?.businessPartnerId ?? null;
  if (selectedPartner && (editingId === null || currentStaffPartnerId !== businessPartnerId)) {
    const registeredStaff = externalStaff.value.filter(
      (person) => person.businessPartnerId === businessPartnerId,
    ).length;
    if (registeredStaff >= selectedPartner.employeeCount) {
      showToast(
        `Modifica el número de empleados de este ${selectedPartner.type.toLocaleLowerCase()} en Contratistas y proveedores antes de registrar más personal.`,
      );
      return;
    }
  }
  externalStaffSaving.value = true;

  try {
    const response = await fetch(
      editingId === null
        ? "/api/external-staff"
        : `/api/external-staff/${editingId}`,
      {
        method: editingId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessPartnerId,
          fullName,
          phone: externalStaffPhone.value.trim(),
          email: externalStaffEmail.value.trim(),
        }),
      },
    );
    const result = await response.json() as {
      externalStaff?: ExternalStaff[];
      error?: string;
    };
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
    showToast(
      editingId === null
        ? "El trabajador externo se registró."
        : "Los datos del trabajador externo se actualizaron.",
      "success",
      editingId === null ? "Personal registrado" : "Datos actualizados",
    );
  } catch (error) {
    console.error("Failed to save external staff:", error);
    showToast("No se pudo conectar con el servidor para guardar al trabajador externo.");
  } finally {
    externalStaffSaving.value = false;
  }
}

async function removeExternalStaff(id: number) {
  const staffMember = externalStaff.value.find((item) => item.id === id);
  if (!await confirmUser(
    `¿Eliminar el registro${staffMember ? ` de ${staffMember.fullName}` : ""}?`,
    "Eliminar registro",
    "Confirmar eliminación",
    "warning",
  )) return;
  try {
    const response = await fetch(`/api/external-staff/${id}`, { method: "DELETE" });
    const result = await response.json() as {
      externalStaff?: ExternalStaff[];
      error?: string;
    };
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
    showToast("El trabajador externo se eliminó.", "success", "Registro eliminado");
  } catch (error) {
    console.error("Failed to delete external staff:", error);
    showToast("No se pudo conectar con el servidor para eliminar al trabajador externo.");
  }
}

function openBusinessPartnerDialog(partner?: BusinessPartner) {
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

function changeBusinessPartnerType(type: BusinessPartnerType) {
  businessPartnerType.value = type;
  if (type === "Visitante") {
    businessPartnerDescription.value = "Público General";
    businessPartnerRfc.value = "N/A";
    businessPartnerCategory.value = "Visitante";
    businessPartnerEmployeeCount.value = 1;
    businessPartnerStatus.value = "No aplica";
  } else {
    if (businessPartnerStatus.value === "No aplica") businessPartnerStatus.value = "Activa";
    businessPartnerSubject.value = "";
  }
}

async function submitBusinessPartner() {
  if (businessPartnerSaving.value) return;
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
  if (
    !isVisitor &&
    (!Number.isSafeInteger(employeeCount) || employeeCount < 1 || employeeCount > 4294967295)
  ) {
    showToast("El número de empleados debe ser un entero entre 1 y 4,294,967,295.");
    return;
  }
  const existingPartner = businessPartners.value.find(
    (partner) => partner.id === editingBusinessPartnerId.value,
  );
  if (existingPartner) {
    const registeredStaff = externalStaff.value.filter(
      (person) => person.businessPartnerId === existingPartner.id,
    ).length;
    if (employeeCount < registeredStaff) {
      showToast(
        `No puedes establecer menos empleados que el personal externo ya registrado para este ${existingPartner.type.toLocaleLowerCase()} (${registeredStaff}).`,
      );
      return;
    }
  }

  const duplicateRfc = !isVisitor && businessPartners.value.some(
    (partner) =>
      partner.rfc.toLocaleUpperCase() === rfc &&
      partner.id !== editingBusinessPartnerId.value,
  );
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
    const response = await fetch(
      partnerId === null ? "/api/business-partners" : `/api/business-partners/${partnerId}`,
      {
        method: partnerId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partnerData),
      },
    );
    const result = await response.json() as {
      businessPartners?: BusinessPartner[];
      error?: string;
    };
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
    showToast(
      partnerId === null ? "La empresa se registró correctamente." : "Los datos de la empresa se actualizaron.",
      "success",
      partnerId === null ? "Empresa registrada" : "Datos actualizados",
    );
  } catch (error) {
    console.error("Failed to save business partner:", error);
    showToast("No se pudo conectar con el servidor para guardar la empresa.");
  } finally {
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

async function removeBusinessPartner(id: number) {
  const partner = businessPartners.value.find((item) => item.id === id);
  if (!await confirmUser(
    `¿Eliminar el registro${partner ? ` de ${partner.name}` : ""}? Esta acción no se puede deshacer.`,
    "Eliminar registro",
    "Confirmar eliminación",
    "warning",
  )) return;
  try {
    const response = await fetch(`/api/business-partners/${id}`, { method: "DELETE" });
    const result = await response.json() as {
      businessPartners?: BusinessPartner[];
      error?: string;
    };
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
    showToast("La empresa se eliminó.", "success", "Registro eliminado");
  } catch (error) {
    console.error("Failed to delete business partner:", error);
    showToast("No se pudo conectar con el servidor para eliminar la empresa.");
  }
}

</script>

<template>
  <svg class="icon-library" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <symbol id="i-home" viewBox="0 0 24 24">
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1V10Z" />
    </symbol>
    <symbol id="i-building" viewBox="0 0 24 24">
      <path d="M4 21V5l8-2v18M4 9h8m-8 4h8m-8 4h8m4-8h4v12h-4zM7 6h2m-2 6h2m-2 6h2m10-3h.01" />
    </symbol>
    <symbol id="i-organization" viewBox="0 0 24 24">
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="3" y="16" width="6" height="5" rx="1" />
      <rect x="15" y="16" width="6" height="5" rx="1" />
      <path d="M12 8v4M6 16v-4h12v4" />
    </symbol>
    <symbol id="i-briefcase" viewBox="0 0 24 24">
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M8 7V4h8v3M3 12h18m-11 0v2h4v-2" />
    </symbol>
    <symbol id="i-users" viewBox="0 0 24 24">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-7.5a4 4 0 0 1 0 7.7m5 10.3v-2a4 4 0 0 0-3-3.87" />
    </symbol>
    <symbol id="i-people" viewBox="0 0 24 24">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1h-13ZM17 5a3.5 3.5 0 0 1 0 7m2 2a5 5 0 0 1 3 4.6V20h-4" />
    </symbol>
    <symbol id="i-user" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2H4Z" />
    </symbol>
    <symbol id="i-tool" viewBox="0 0 24 24">
      <path d="m14.7 6.3 3-3a6 6 0 0 1-7.8 7.8L4 17a2.1 2.1 0 0 0 3 3l5.9-5.9a6 6 0 0 0 7.8-7.8l-3 3-3-3Z" />
    </symbol>
    <symbol id="i-link" viewBox="0 0 24 24">
      <path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7" />
    </symbol>
    <symbol id="i-calendar" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </symbol>
    <symbol id="i-clock" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </symbol>
    <symbol id="i-qr" viewBox="0 0 24 24">
      <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zm5 0h2v2h-2zm-5 5h2v2h-2zm4-1h3v3h-3zM5 5h3v3H5zm11 0h3v3h-3zM5 16h3v3H5z" />
    </symbol>
    <symbol id="i-plus" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </symbol>
    <symbol id="i-arrow" viewBox="0 0 24 24">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </symbol>
    <symbol id="i-chevron" viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </symbol>
    <symbol id="i-down" viewBox="0 0 24 24">
      <path d="m7 10 5 5 5-5" />
    </symbol>
    <symbol id="i-shield" viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
      <path d="m9 12 2 2 4-4" />
    </symbol>
    <symbol id="i-menu" viewBox="0 0 24 24">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </symbol>
    <symbol id="i-close" viewBox="0 0 24 24">
      <path d="m18 6-12 12M6 6l12 12" />
    </symbol>
    <symbol id="i-dots" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </symbol>
    <symbol id="i-note" viewBox="0 0 24 24">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </symbol>
    <symbol id="i-arrival" viewBox="0 0 24 24">
      <path d="M12 3v12m-5-5 5 5 5-5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </symbol>
    <symbol id="i-entry" viewBox="0 0 24 24">
      <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5M10 17l5-5-5-5m5 5H3" />
    </symbol>
    <symbol id="i-exit" viewBox="0 0 24 24">
      <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5m4-4 5-5-5-5m5 5H7" />
    </symbol>
    <symbol id="i-history" viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8m0-5v5h5m4-1v5l3 2" />
    </symbol>
    <symbol id="i-search" viewBox="0 0 24 24">
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 5 5" />
    </symbol>
  </svg>

  <main class="dashboard-app" :data-theme="dashboardTheme">
    <header class="topbar">
      <div class="topbar-brand">
        <button
          class="mobile-menu-button"
          type="button"
          aria-label="Abrir menú"
          :aria-expanded="drawerOpen"
          @click="drawerOpen = !drawerOpen"
        >
          <svg class="icon"><use href="#i-menu" /></svg>
        </button>
        <a
          class="brand-lockup"
          href="#"
          aria-label="CyMEZ Recep, inicio"
          @click.prevent="selectSection(allowedDashboardSections[0] ?? '')"
        >
          <img class="brand-mark" src="/images/cymez-mark.webp" alt="" width="130" height="156" decoding="async" />
          <span class="brand-recep">RECEP</span>
        </a>
        <span class="brand-divider" aria-hidden="true"></span>
        <span class="brand-product">CONTROL DE<br />VISITANTES</span>
      </div>

      <div ref="accountMenuRef" class="topbar-account">
        <div class="topbar-identity">
          <span class="topbar-shield"><svg class="icon"><use href="#i-shield" /></svg></span>
          <span><strong>CYMEZ RECEP</strong><small>CONTROL DE VISITANTES</small></span>
        </div>
        <span class="account-divider" aria-hidden="true"></span>
        <button
          class="account-menu-button"
          type="button"
          :aria-expanded="privateMenuOpen"
          @click="privateMenuOpen = !privateMenuOpen"
        >
          <span class="avatar"><svg class="icon"><use href="#i-user" /></svg></span>
          <span class="account-menu-identity">
            <strong>{{ currentUser.name || currentUser.login }}</strong>
            <small>{{ currentRoleLabel }}</small>
          </span>
          <svg class="icon account-chevron"><use href="#i-down" /></svg>
        </button>
        <div v-if="privateMenuOpen" class="account-dropdown">
          <div class="account-dropdown-profile">
            <span class="avatar"><svg class="icon"><use href="#i-user" /></svg></span>
            <span class="account-dropdown-identity">
              <strong>{{ currentUser.name || currentUser.login }}</strong>
              <small>{{ currentRoleLabel }}</small>
            </span>
          </div>
          <span class="theme-toggle-label">Apariencia</span>
          <button
            class="theme-toggle"
            type="button"
            :aria-pressed="dashboardTheme === 'light'"
            :aria-label="dashboardTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
            @click="dashboardTheme = dashboardTheme === 'dark' ? 'light' : 'dark'"
          >
            <svg v-if="dashboardTheme === 'dark'" class="icon" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
            </svg>
            <svg v-else class="icon" aria-hidden="true">
              <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
            </svg>
            <span>{{ dashboardTheme === "dark" ? "Modo oscuro" : "Modo claro" }}</span>
            <span class="theme-toggle-switch" aria-hidden="true"><span></span></span>
          </button>
          <button
            v-if="currentUser.isAdmin"
            class="mobile-app-menu-button"
            type="button"
            @click="privateMenuOpen = false; selectSection('Aplicación móvil')"
          >
            <svg class="icon"><use href="#i-tool" /></svg>
            <span>Aplicación móvil</span>
          </button>
          <button class="logout-button" type="button" @click="logout">
            <svg class="icon"><use href="#i-exit" /></svg>
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>

    <div
      v-if="drawerOpen"
      class="drawer-scrim"
      aria-hidden="true"
      @click="drawerOpen = false"
    ></div>

    <aside class="sidebar" :class="{ 'sidebar-open': drawerOpen }" aria-label="Navegación principal">
      <div class="sidebar-mobile-heading">
        <span>MENÚ</span>
        <button type="button" aria-label="Cerrar menú" @click="drawerOpen = false">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
      </div>
      <button
        v-if="allowedDashboardSections.includes('Inicio')"
        class="nav-link nav-home"
        :class="{ 'is-active': activeSection === 'Inicio' }"
        type="button"
        :aria-current="activeSection === 'Inicio' ? 'page' : undefined"
        @click="selectSection('Inicio')"
      >
        <svg class="icon"><use href="#i-home" /></svg><span>Inicio</span>
      </button>

      <div v-for="group in visibleNavigationGroups" :key="group.title" class="nav-group">
        <p class="nav-group-title">{{ group.title }}</p>
        <button
          v-for="item in group.items"
          :key="item.label"
          class="nav-link"
          :class="{ 'is-active': activeSection === item.label }"
          type="button"
          :aria-current="activeSection === item.label ? 'page' : undefined"
          @click="selectSection(item.label)"
        >
          <svg class="icon"><use :href="`#i-${item.icon}`" /></svg>
          <span>{{ item.label }}</span>
        </button>
      </div>

      <div
        v-if="allowedDashboardSections.includes('Agenda de citas') || allowedDashboardSections.includes('Bitácora diaria')"
        class="nav-group nav-secondary"
      >
        <button
          v-if="allowedDashboardSections.includes('Agenda de citas')"
          class="nav-link"
          :class="{ 'is-active': activeSection === 'Agenda de citas' }"
          type="button"
          @click="selectSection('Agenda de citas')"
        >
          <svg class="icon"><use href="#i-calendar" /></svg><span>Agenda de citas</span>
        </button>
        <button
          v-if="allowedDashboardSections.includes('Bitácora diaria')"
          class="nav-link"
          :class="{ 'is-active': activeSection === 'Bitácora diaria' }"
          type="button"
          @click="selectSection('Bitácora diaria')"
        >
          <svg class="icon"><use href="#i-note" /></svg><span>Bitácora diaria</span>
        </button>
      </div>

      <div class="sidebar-footer">
        <svg class="icon"><use href="#i-shield" /></svg>
        <span>{{ currentRoleLabel.toLocaleUpperCase("es-MX") }}</span>
      </div>
    </aside>

    <section
      class="dashboard-main"
      :class="{
        'dashboard-main-departments': activeSection === 'Departamento',
        'dashboard-main-daily-log': activeSection === 'Bitácora diaria',
        'dashboard-main-home': activeSection === 'Inicio',
      }"
    >
      <div v-if="allowedDashboardSections.length === 0" class="setup-callout company-role-unavailable">
        <strong>Tu cuenta está lista, pero aún no hay módulos operativos habilitados para este perfil.</strong>
        <p>Contacta a la administración de tu empresa. El acceso a los datos se habilitará cuando estén protegidos por empresa.</p>
      </div>
      <div class="dashboard-heading">
        <div>
          <h1>{{ pageTitle }}</h1>
          <span class="heading-accent"></span>
          <p v-if="activeSection === 'Equipo y herramientas'">
            Declaraciones y revisiones vinculadas a las visitas registradas
          </p>
          <p v-else-if="activeSection === 'Contratistas, proveedores y visitantes'">
            Registros de empresas y personas guardados en MySQL
          </p>
          <p v-else-if="activeSection === 'Agenda de citas'">
            {{ activeAppointmentCount }} citas activas
            <span v-if="appointmentFilter === 'day'">para el día seleccionado</span>
            · agenda conectada
          </p>
          <p v-else-if="activeSection === 'Departamento'">
            Administra departamentos y consulta los anfitriones vinculados
          </p>
          <p v-else-if="activeSection === 'Empresas'">
            Organiza empresas y consulta sus departamentos y usuarios asignados
          </p>
          <p v-else-if="activeSection === 'Administradores'">
            Registra las cuentas administradoras y asígnalas a una empresa
          </p>
          <p v-else-if="activeSection === 'Personal de externos'">
            Personal vinculado a contratistas y proveedores registrados en MySQL
          </p>
          <p v-else-if="activeSection === 'Usuarios de empresa'">
            Administra administradores, recepcionistas y anfitriones ligados a cada empresa
          </p>
          <p v-else-if="activeSection === 'Accesos'">
            Asigna quién puede entrar al sistema y qué áreas puede utilizar · datos de demostración
          </p>
          <p v-else-if="activeSection === 'Aplicación móvil'">
            Publica actualizaciones para celulares de recepción o tablets de visitas sin cita
          </p>
          <p v-else>Resumen de acceso y visitas</p>
        </div>
        <label v-if="activeSection === 'Agenda de citas'" class="date-selector date-filter">
          <svg class="icon"><use href="#i-calendar" /></svg>
          <span class="sr-only">Filtrar agenda por fecha</span>
          <input
            v-model="selectedAppointmentDate"
            type="date"
            aria-label="Filtrar agenda por fecha"
          />
        </label>
        <div
          v-else-if="activeSection === 'Inicio'"
          class="date-selector"
          aria-label="Fecha actual"
        >
          <svg class="icon"><use href="#i-calendar" /></svg>
          <span>{{ new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" }).format(new Date()) }}</span>
        </div>
      </div>

      <AppointmentsSection
        v-if="activeSection === 'Agenda de citas'"
        v-model:filter="appointmentFilter"
        v-model:search="appointmentSearch"
        v-model:company-scope="globalCompanyScope"
        :selected-appointments="selectedAppointments"
        :searched-appointments="searchedAppointments"
        :paginated-appointments="paginatedAppointments"
        :appointments-page="appointmentsPage"
        :appointments-per-page="appointmentsPerPage"
        :total-appointment-pages="totalAppointmentPages"
        :calendar-month-label="calendarMonthLabel"
        :calendar-days="calendarDays"
        :selected-appointment-date="selectedAppointmentDate"
        :today="getLocalDate()"
        :loading="appointmentLoading"
        :can-create-appointments="currentUser.isAdmin || isHost"
        :can-manage-appointments="currentUser.isAdmin || isHost"
        :can-send-reference="Boolean(currentUser.companyRole) || currentUser.isAdmin"
        :is-company-user="Boolean(currentUser.companyRole)"
        :is-admin="currentUser.isAdmin"
        :is-reception="isReception"
        :is-host="isHost"
        :show-app-download="isReception && !currentUser.isAdmin"
        :theme="dashboardTheme"
        @update:page="appointmentsPage = $event"
        @create="openAppointmentDialog"
        @register-visitor="openHostVisitorDialog"
        @reschedule="openRescheduleAppointmentDialog"
        @cancel="cancelAppointment"
        @open-qr="openQrDialog"
        @send-company-qrs="openCompanyQrDispatch"
        @send-reference="sendAppointmentReference"
        @delete="deleteAppointment"
        @edit="openAppointmentDialog"
        @change-month="changeCalendarMonth"
        @select-day="selectCalendarDay"
      />

      <CompanyUsersSection
        v-else-if="activeSection === 'Usuarios de empresa'"
        v-model:search="companyUsersSearch"
        :users="companyUsers"
        :companies="companies"
        :company-id="selectedCompanyUsersCompanyId"
        :company-name="companyUsersCompanyName"
        :can-select-company="currentUser.isAdmin"
        @update:company-id="selectCompanyForUsers"
        @create="openCompanyUserDialog()"
        @edit="openCompanyUserDialog"
        @remove="removeCompanyUser"
      />

      <AccessSection
        v-else-if="activeSection === 'Accesos'"
        v-model:search="accessSearch"
        :accounts="accessAccounts"
        :is-admin="currentUser.isAdmin"
        @edit-account="openAccessAccountEditor"
      />

      <DepartmentSection
        v-else-if="activeSection === 'Departamento'"
        :departments="departments"
        :hosts="hosts"
        :is-admin="currentUser.isAdmin"
        @create="openDepartmentDialog()"
        @edit="openDepartmentDialog"
        @remove="removeDepartment"
      />

      <CompanySection
        v-else-if="activeSection === 'Empresas'"
        :companies="companies"
        :departments="departments"
        :hosts="hosts"
        :is-admin="currentUser.isAdmin"
        :can-manage-departments="currentUser.isCompanyAdmin"
        @create-company="openCompanyDialog()"
        @edit-company="openCompanyDialog"
        @remove-company="removeCompany"
        @create-department="openDepartmentDialog(undefined, $event)"
        @edit-department="openDepartmentDialog"
        @remove-department="removeDepartment"
      />

      <AdministratorsSection
        v-else-if="activeSection === 'Administradores'"
        :administrators="administrators"
        @create="openAdministratorDialog()"
        @edit="openAdministratorDialog"
        @remove="removeAdministrator"
      />

      <ExternalStaffSection
        v-else-if="activeSection === 'Personal de externos'"
        v-model:search="externalStaffSearch"
        :companies="externalStaffPartnerOptions"
        :staff="externalStaff"
        :loading="businessDirectoryLoading"
        :dispatch-appointment="qrDispatchAppointment"
        :sending-staff-id="sendingExternalQrStaffId"
        :is-company-user="qrDispatchUsesReference"
        :can-manage-staff="currentUser.isAdmin || currentUser.isCompanyAdmin || isHost"
        :theme="dashboardTheme"
        @create="openExternalStaffDialog(undefined, $event)"
        @edit="openExternalStaffDialog"
        @remove="removeExternalStaff"
        @send-qr="sendExternalStaffQr"
        @open-qr="openExternalStaffQr"
        @clear-dispatch="clearQrDispatch"
      />

      <BusinessDirectorySection
        v-else-if="activeSection === 'Contratistas, proveedores y visitantes'"
        v-model:business-partner-search="businessPartnerSearch"
        v-model:business-partner-type-filter="businessPartnerTypeFilter"
        v-model:business-partner-category-filter="businessPartnerCategoryFilter"
        v-model:business-partner-status-filter="businessPartnerStatusFilter"
        v-model:business-partner-page="businessPartnerPage"
        :business-partners="businessPartners"
        :filtered-business-partners="filteredBusinessPartners"
        :paginated-business-partners="paginatedBusinessPartners"
        :business-partner-categories="businessPartnerCategories"
        :business-partner-pages="businessPartnerPages"
        :partner-rows-per-page="partnerRowsPerPage"
        :loading="businessDirectoryLoading"
        :business-partner-saving="businessPartnerSaving"
        :is-admin="currentUser.isAdmin || currentUser.isCompanyAdmin || (!currentUser.companyRole && isHost)"
        :show-app-download="isHost"
        :theme="dashboardTheme"
        @create-partner="openBusinessPartnerDialog()"
        @edit-partner="openBusinessPartnerDialog"
        @remove-partner="removeBusinessPartner"
      />

      <EquipmentSection
        v-else-if="activeSection === 'Equipo y herramientas'"
        :theme="dashboardTheme"
        :is-admin="currentUser.isAdmin || currentUser.isCompanyAdmin"
        :is-host="isHost"
      />

      <DailyLogSection
        v-else-if="activeSection === 'Bitácora diaria'"
        :initial-range="dailyLogInitialRange"
        :theme="dashboardTheme"
        :is-admin="currentUser.isAdmin"
        :is-reception="isReception"
        :is-company-user="Boolean(currentUser.companyRole)"
        :is-company-admin="currentUser.isCompanyAdmin"
        v-model:company-scope="globalCompanyScope"
        :appointments="appointments"
        :appointments-loading="appointmentLoading"
        :external-staff="externalStaff"
        :general-visitors="generalVisitors"
        :hosts="hosts"
        :departments="departments"
        @movement-saved="loadAppointments"
        @open-qr="openQrDialog"
      />

      <HomeSection
        v-else-if="activeSection === 'Inicio'"
        :appointments="appointments"
        :summary-items="summaryItems"
        :can-manage-appointments="currentUser.isAdmin || isHost"
        :is-admin="currentUser.isAdmin"
        @create-appointment="openHomeAppointmentDialog"
        @edit-appointment="openAppointmentDialog"
        @cancel-appointment="cancelAppointment"
        @delete-appointment="deleteAppointment"
        @open-qr="openQrDialog"
        @send-company-qrs="openCompanyQrDispatch"
        @send-reference="sendAppointmentReference"
        @open-log="openDailyLogRange"
        @open-appointments="selectSection('Agenda de citas')"
        @open-equipment="selectSection('Equipo y herramientas')"
      />
      <MobileAppReleasesSection
        v-else-if="activeSection === 'Aplicación móvil' && currentUser.isAdmin"
        :theme="dashboardTheme"
      />
      <div v-else class="panel workspace-panel access-none-panel">
        <h2>Sin secciones asignadas</h2>
        <p>Solicita al administrador que te otorgue acceso a una sección de la aplicación.</p>
      </div>
    </section>

    <Teleport to="body">
    <div
      v-if="appointmentDialogOpen"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
      @click.self="appointmentDialogOpen = false"
    >
      <section class="dialog appointment-dialog" role="dialog" aria-modal="true" aria-labelledby="appointment-dialog-title">
        <button class="dialog-close" type="button" aria-label="Cerrar" @click="appointmentDialogOpen = false"><svg class="icon"><use href="#i-close" /></svg></button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-calendar" /></svg></span>
        <h2 id="appointment-dialog-title">{{ editingAppointmentId === null ? "Nueva cita" : "Editar cita" }}</h2>
        <p class="dialog-description">{{ editingAppointmentId === null ? "Agrega una visita a la agenda." : "Actualiza los datos de la visita." }}</p>
        <form class="appointment-form" @submit.prevent="submitAppointment">
          <label>
            Empresa o visitante registrado
            <select
              v-model.number="visitorCompanyId"
              required
              @change="changeAppointmentCompany"
            >
              <option :value="null" disabled>Selecciona una empresa</option>
              <option
                v-if="currentUser.isAdmin || isHost"
                :value="hostVisitorCompanyOption"
              >
                Visitante registrado
              </option>
              <option
                v-for="company in appointmentCompanyOptions"
                :key="company.id"
                :value="company.id"
              >
                {{ getAppointmentPartnerLabel(company) }}
              </option>
            </select>
          </label>
          <label>
            Visitante
            <select
              v-model="visitorSelection"
              required
              :disabled="
                visitorCompanyId === null ||
                (visitorCompanyId !== hostVisitorCompanyOption &&
                  (!appointmentHostOptions.length ||
                    (appointmentHostOptions.length > 1 && !visitorHostLogin)))
              "
              @change="changeAppointmentVisitor"
            >
              <option value="" disabled>
                {{ visitorCompanyId === null ? "Primero selecciona una empresa o visitante" : "Selecciona el nombre del visitante" }}
              </option>
              <option
                v-for="person in appointmentVisitorOptions"
                :key="person.id"
                :value="String(person.id)"
              >
                {{ getAppointmentVisitorLabel(person) }}
              </option>
              <option
                v-if="visitorCompanyId !== hostVisitorCompanyOption"
                :value="otherAppointmentVisitor"
              >Otro (escribir nombre)</option>
            </select>
            <input
              v-if="visitorSelection === otherAppointmentVisitor"
              v-model.trim="visitorName"
              type="text"
              autocomplete="name"
              maxlength="180"
              pattern=".*\S.*"
              placeholder="Nombre completo del visitante"
              required
            />
            <span
              v-else-if="visitorCompanyId === hostVisitorCompanyOption && appointmentVisitorOptions.length === 0"
              class="appointment-field-hint"
            >
              Registra primero al visitante para poder seleccionarlo.
            </span>
            <span
              v-else-if="visitorCompanyId !== null && appointmentVisitorOptions.length === 0"
              class="appointment-field-hint"
            >
              Esta empresa aún no tiene personal registrado; selecciona “Otro” para capturar el nombre.
            </span>
          </label>
          <label>
            Anfitrión
            <select
              v-model="visitorHostLogin"
              required
              :disabled="isHost || appointmentHostOptions.length <= 1"
              @change="changeAppointmentHost"
            >
              <option value="" disabled>Selecciona un anfitrión</option>
              <option
                v-for="host in appointmentHostOptions"
                :key="host.login"
                :value="host.login"
              >
                {{ isHost
                  ? host.name
                  : `${host.name} · ${departments.find((department) => department.id === host.departmentId)?.name ?? "Sin departamento"}` }}
              </option>
            </select>
            <span
              v-if="
                !isHost &&
                visitorCompanyId !== null &&
                (visitorCompanyId !== hostVisitorCompanyOption || visitorSelection) &&
                appointmentHostOptions.length === 0
              "
              class="appointment-field-hint"
            >
              Este registro no está asociado a un anfitrión. No se puede agendar hasta seleccionar una empresa o visitante registrado por un anfitrión.
            </span>
            <span
              v-else-if="appointmentHostOptions.length > 1 && !visitorHostLogin"
              class="appointment-field-hint"
            >
              Este registro está asociado a varios anfitriones. Selecciona a quién se asignará la cita.
            </span>
            <span
              v-else-if="!isHost && appointmentHostOptions.length === 1"
              class="appointment-field-hint"
            >
              Asignado automáticamente al anfitrión que registró la empresa o visitante.
            </span>
          </label>
          <label v-if="visitorSelection === otherAppointmentVisitor" class="appointment-form-full">
            Correo del visitante
            <input
              v-model.trim="visitorEmail"
              type="email"
              autocomplete="email"
              maxlength="254"
              placeholder="persona@empresa.com"
            />
            <span class="appointment-field-hint">
              Opcional. No se envían correos; el QR se puede descargar para compartirlo manualmente.
            </span>
          </label>
          <p
            v-else-if="visitorSelection"
            class="appointment-field-hint appointment-form-full"
          >
            El pase QR se puede descargar desde la cita y compartir manualmente.
          </p>
          <label>Fecha<input v-model="visitorDate" required type="date" /></label>
          <label>Hora<input v-model="visitorTime" required type="time" /></label>
          <button class="button-primary dialog-submit" type="submit" :disabled="appointmentSaving">
            {{ appointmentSaving ? "Guardando cita..." : editingAppointmentId === null ? "Agregar cita" : "Guardar cambios" }}
          </button>
        </form>
      </section>
    </div>

      <div
        v-if="hostVisitorDialogOpen"
        class="dashboard-app dashboard-modal-backdrop modal-backdrop"
        :data-theme="dashboardTheme"
        @click.self="hostVisitorDialogOpen = false"
      >
        <section class="dialog appointment-dialog" role="dialog" aria-modal="true" aria-labelledby="host-visitor-dialog-title">
          <button class="dialog-close" type="button" aria-label="Cerrar" @click="hostVisitorDialogOpen = false"><svg class="icon"><use href="#i-close" /></svg></button>
          <span class="dialog-icon"><svg class="icon"><use href="#i-user" /></svg></span>
          <h2 id="host-visitor-dialog-title">Registrar visitante</h2>
          <p class="dialog-description">Guarda sus datos para seleccionarlo al programar futuras citas.</p>
          <form class="appointment-form" @submit.prevent="submitHostVisitor">
            <label class="appointment-form-full">
              Nombre completo
              <input v-model.trim="hostVisitorName" type="text" autocomplete="name" maxlength="180" required />
            </label>
            <label>
              Teléfono (opcional)
              <input v-model.trim="hostVisitorPhone" type="tel" autocomplete="tel" maxlength="30" />
            </label>
            <label>
              Correo (opcional)
              <input v-model.trim="hostVisitorEmail" type="email" autocomplete="email" maxlength="254" />
            </label>
            <button class="button-primary dialog-submit" type="submit" :disabled="hostVisitorSaving">
              {{ hostVisitorSaving ? "Guardando visitante..." : "Guardar visitante" }}
            </button>
          </form>
        </section>
      </div>

      <div
        v-if="qrDialogOpen"
        class="dashboard-app dashboard-modal-backdrop modal-backdrop appointment-qr-backdrop"
        :data-theme="dashboardTheme"
        @click.self="qrDialogOpen = false"
      >
        <section class="dialog qr-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-dialog-title">
          <button class="dialog-close" type="button" aria-label="Cerrar" @click="qrDialogOpen = false"><svg class="icon"><use href="#i-close" /></svg></button>
          <span class="dialog-icon"><svg class="icon"><use href="#i-qr" /></svg></span>
          <h2 id="qr-dialog-title">Ver código QR</h2>
          <p class="dialog-description">
            Pase de visita para <strong>{{ qrExternalStaff?.fullName ?? qrAppointment?.visitor }}</strong>
          </p>
          <div class="qr-preview">
            <span v-if="qrGenerating" class="qr-loading">Generando código...</span>
            <img
              v-else-if="qrDataUrl"
              :src="qrDataUrl"
              :alt="`Código QR de la cita de ${qrExternalStaff?.fullName ?? qrAppointment?.visitor}`"
            />
          </div>
          <p v-if="qrAppointment" class="qr-appointment-details">
            {{ qrAppointment.company }}<br />
            {{ qrAppointment.date }} · {{ qrAppointment.time }} · Anfitrión: {{ qrAppointment.host }}<br />
            Código de referencia: <strong>{{ qrAppointment.referenceCode }}</strong>
            <template v-if="qrExternalStaff"><br />Empleado: {{ qrExternalStaff.fullName }}</template>
          </p>
          <div v-if="!isReception" class="qr-dialog-actions">
            <button
              class="button-primary dialog-submit"
              type="button"
              :disabled="qrGenerating || !qrDataUrl || !qrAppointment"
              @click="qrAppointment && downloadAppointmentQr(qrAppointment)"
            >
              Descargar PNG
            </button>
          </div>
          <p class="qr-placeholder-note">
            {{ isReception
              ? "Recepción puede consultar el pase."
              : "Descarga el código y compártelo manualmente con las personas de la empresa." }}
          </p>
          <button class="button-secondary dialog-submit" type="button" @click="qrDialogOpen = false">Cerrar</button>
        </section>
      </div>
    <div
      v-if="businessPartnerDialogOpen"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
      @click.self="businessPartnerDialogOpen = false"
    >
      <section
        class="dialog workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="business-partner-dialog-title"
      >
        <button class="dialog-close" type="button" aria-label="Cerrar" @click="businessPartnerDialogOpen = false">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-building" /></svg></span>
        <h2 id="business-partner-dialog-title">
          {{ editingBusinessPartnerId === null ? "Registrar registro" : "Editar registro" }}
        </h2>
        <p class="dialog-description">
          {{ businessPartnerType === "Visitante" ? "Registra el nombre y asunto de la visita." : "Datos del contratista o proveedor." }}
        </p>
        <form class="workspace-form modal-workspace-form directory-form" @submit.prevent="submitBusinessPartner">
          <label>
            Tipo
            <select
              :value="businessPartnerType"
              required
              @change="changeBusinessPartnerType(($event.target as HTMLSelectElement).value as BusinessPartnerType)"
            >
              <option value="Contratista">Contratista</option>
              <option value="Proveedor">Proveedor</option>
              <option value="Visitante">Visitante</option>
            </select>
          </label>
          <label>
            {{ businessPartnerType === "Visitante" ? "Nombre completo" : "Nombre de la empresa" }}
            <input
              v-model.trim="businessPartnerName"
              type="text"
              :autocomplete="businessPartnerType === 'Visitante' ? 'name' : 'organization'"
              maxlength="180"
              pattern=".*\S.*"
              required
            />
          </label>
          <label v-if="businessPartnerType === 'Visitante'" class="directory-form-full">
            Asunto de la visita
            <input
              v-model.trim="businessPartnerSubject"
              type="text"
              maxlength="500"
              pattern=".*\S.*"
              placeholder="Motivo de la visita"
              required
            />
          </label>
          <template v-else>
            <label class="directory-form-full">
              Descripción breve
              <textarea v-model.trim="businessPartnerDescription" rows="3" maxlength="65535" placeholder="Describe a qué se dedica la empresa" required></textarea>
            </label>
            <label>
              RFC
              <input v-model.trim="businessPartnerRfc" type="text" maxlength="13" pattern=".*\S.*" required />
            </label>
            <label>
              Categoría
              <input v-model.trim="businessPartnerCategory" type="text" maxlength="120" pattern=".*\S.*" placeholder="Ej. Construcción, limpieza" required />
            </label>
            <label>
              Número de empleados
              <input v-model.number="businessPartnerEmployeeCount" type="number" min="1" max="4294967295" step="1" required />
            </label>
            <label>
              Estado
              <select v-model="businessPartnerStatus" required>
                <option value="Activa">Activa</option>
                <option value="Inactiva">Inactiva</option>
              </select>
            </label>
          </template>
          <p v-if="businessPartnerType === 'Visitante'" class="directory-form-full access-none-note">
            Se guardará como Público General · categoría Visitante · RFC N/A · 1 empleado · estado No aplica.
          </p>
          <button class="button-primary workspace-submit" type="submit" :disabled="businessPartnerSaving">
            <svg class="icon"><use href="#i-plus" /></svg>
            {{ businessPartnerSaving ? "Guardando..." : editingBusinessPartnerId === null ? "Registrar empresa" : "Guardar cambios" }}
          </button>
        </form>
      </section>
    </div>

    <div
      v-if="editingAccessAccount"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
      @click.self="editingAccessAccount = null"
    >
      <section
        class="dialog workspace-dialog access-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="database-access-dialog-title"
      >
        <button
          class="dialog-close"
          type="button"
          aria-label="Cerrar"
          @click="editingAccessAccount = null"
        >
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-shield" /></svg></span>
        <h2 id="database-access-dialog-title">Editar control de acceso</h2>
        <p class="dialog-description">
          Cuenta: <strong>{{ editingAccessAccount.login }}</strong>
        </p>
        <form class="workspace-form modal-workspace-form" @submit.prevent="saveAccessAccount">
          <p class="workspace-form-section">Acceso principal</p>
          <label class="host-toggle">
            <input
              v-model="accessAccountRoleDraft"
              type="radio"
              value="administrador"
            />
            <span><strong>Administrador</strong><small>Acceso completo a la administración.</small></span>
          </label>
          <label class="host-toggle">
            <input
              v-model="accessAccountRoleDraft"
              type="radio"
              value="recepcion"
            />
            <span><strong>Recepción</strong><small>Permite utilizar las secciones de recepción.</small></span>
          </label>
          <label class="host-toggle">
            <input
              v-model="accessAccountRoleDraft"
              type="radio"
              value="anfitriones"
            />
            <span><strong>Anfitrión</strong><small>Permite consultar y gestionar las citas asignadas.</small></span>
          </label>
          <label class="host-toggle">
            <input
              v-model="accessAccountRoleDraft"
              type="radio"
              value=""
            />
            <span><strong>Sin acceso</strong><small>No podrá entrar a las secciones de la aplicación.</small></span>
          </label>
          <p class="access-none-note">
            La selección se guarda como un único perfil de acceso en la aplicación.
          </p>
          <button class="button-primary workspace-submit" type="submit" :disabled="accessAccountSaving">
            {{ accessAccountSaving ? "Guardando..." : "Guardar cambios" }}
          </button>
        </form>
      </section>
    </div>

    <div
      v-if="hostDialogOpen"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
      @click.self="hostDialogOpen = false"
    >
      <section
        class="dialog workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="host-dialog-title"
      >
        <button class="dialog-close" type="button" aria-label="Cerrar" @click="hostDialogOpen = false">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-users" /></svg></span>
        <h2 id="host-dialog-title">
          {{ editingHostId === null ? "Registrar anfitrión" : "Editar anfitrión" }}
        </h2>
        <p class="dialog-description">
          Selecciona una cuenta de Accesos para copiar sus datos; al guardarla, también tendrá acceso a la sección Anfitriones. Elige Otro para capturar los datos manualmente.
        </p>
        <form class="workspace-form modal-workspace-form host-form" @submit.prevent="submitHost">
          <div v-if="hostEligibleDepartments.length === 0" class="setup-callout">
            <p>Para registrar un anfitrión, primero crea un departamento.</p>
            <button class="button-secondary" type="button" @click="selectSection('Empresas')">
              Ir a Empresas
            </button>
          </div>
          <template v-else>
            <label>
              Nombre completo
              <select
                :value="hostAccountSelection"
                autocomplete="name"
                required
                @change="selectHostAccount(($event.target as HTMLSelectElement).value)"
              >
                <option value="" disabled>Selecciona una cuenta de Accesos</option>
                <option
                  v-for="account in selectableHostAccounts"
                  :key="account.login"
                  :value="account.login"
                >
                  {{ account.name?.trim() || account.login }} · {{ account.login }}
                </option>
                <option :value="otherHostAccountOption">Otro</option>
              </select>
            </label>
            <label v-if="hostAccountSelection === otherHostAccountOption">
              Escribe el nombre completo
              <input v-model.trim="hostName" type="text" autocomplete="name" maxlength="180" pattern=".*\S.*" required />
            </label>
            <label>
              Login (usuario)
              <input
                v-model.trim="hostLogin"
                type="text"
                autocomplete="username"
                maxlength="180"
                pattern=".*\S.*"
                :readonly="hostAccountSelection !== otherHostAccountOption"
                required
              />
            </label>
            <label>
              Correo electrónico
              <input
                v-model.trim="hostEmail"
                type="email"
                autocomplete="email"
                maxlength="254"
                :readonly="hostAccountSelection !== otherHostAccountOption"
              />
            </label>
            <label>
              Departamento
              <select v-model="hostDepartmentId" required>
                <option v-for="department in hostEligibleDepartments" :key="department.id" :value="department.id">
                  {{ department.name }}
                </option>
              </select>
            </label>
            <label>
              Puesto
              <input
                v-model.trim="hostRole"
                type="text"
                autocomplete="organization-title"
                maxlength="120"
                :readonly="hostAccountSelection !== otherHostAccountOption"
              />
            </label>
            <label>
              Teléfono
              <input
                v-model.trim="hostPhone"
                type="tel"
                autocomplete="tel"
                maxlength="30"
                :readonly="hostAccountSelection !== otherHostAccountOption"
              />
            </label>
            <button class="button-primary workspace-submit" type="submit" :disabled="hostSaving">
              {{ hostSaving ? "Guardando..." : editingHostId === null ? "Registrar anfitrión" : "Guardar cambios" }}
            </button>
          </template>
        </form>
      </section>
    </div>

    <div
      v-if="companyDialogOpen"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
      @click.self="companyDialogOpen = false"
    >
      <section
        class="dialog workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-dialog-title"
      >
        <button class="dialog-close" type="button" aria-label="Cerrar" @click="companyDialogOpen = false">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-building" /></svg></span>
        <h2 id="company-dialog-title">
          {{ editingCompanyId === null ? "Registrar empresa" : "Editar empresa" }}
        </h2>
        <p class="dialog-description">Las empresas pueden organizarse en departamentos.</p>
        <form class="workspace-form modal-workspace-form" @submit.prevent="submitCompany">
          <label>
            Nombre de la empresa
            <input
              v-model.trim="companyName"
              type="text"
              maxlength="180"
              pattern=".*\S.*"
              autocomplete="organization"
              required
            />
          </label>
          <button class="button-primary workspace-submit" type="submit" :disabled="companySaving">
            {{ companySaving ? "Guardando..." : editingCompanyId === null ? "Registrar empresa" : "Guardar cambios" }}
          </button>
        </form>
      </section>
    </div>

    <div
      v-if="companyUserDialogOpen"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
      @click.self="companyUserDialogOpen = false"
    >
      <section
        class="dialog workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-user-dialog-title"
      >
        <button class="dialog-close" type="button" aria-label="Cerrar" @click="companyUserDialogOpen = false">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-users" /></svg></span>
        <h2 id="company-user-dialog-title">
          {{ editingCompanyUserLogin === null ? "Registrar usuario de empresa" : "Editar usuario de empresa" }}
        </h2>
        <p class="dialog-description">
          Solo se pueden crear perfiles de Recepción o Anfitrión. Las cuentas nuevas tendrán cambio de contraseña obligatorio.
        </p>
        <form class="workspace-form modal-workspace-form" @submit.prevent="submitCompanyUser">
          <label>
            Usuario
            <input
              v-model.trim="companyUserLogin"
              type="text"
              maxlength="255"
              autocomplete="username"
              :readonly="editingCompanyUserLogin !== null"
              required
            />
          </label>
          <label>
            Nombre completo
            <input v-model.trim="companyUserName" type="text" maxlength="180" autocomplete="name" required />
          </label>
          <label>
            Perfil
            <select v-model="companyUserApplicationRole" required>
              <option value="recepcion">Recepción</option>
              <option value="anfitrion">Anfitrión</option>
            </select>
          </label>
          <label v-if="companyUserApplicationRole === 'anfitrion'">
            Departamento
            <select v-model="companyUserDepartmentId" required>
              <option :value="null" disabled>Selecciona un departamento</option>
              <option v-for="department in companyUserDepartments" :key="department.id" :value="department.id">
                {{ department.name }}
              </option>
            </select>
          </label>
          <label>
            Correo electrónico
            <input v-model.trim="companyUserEmail" type="email" maxlength="254" autocomplete="email" />
          </label>
          <label>
            Puesto
            <input v-model.trim="companyUserRole" type="text" maxlength="120" autocomplete="organization-title" />
          </label>
          <label>
            Teléfono
            <input v-model.trim="companyUserPhone" type="tel" maxlength="30" autocomplete="tel" />
          </label>
          <label>
            Estado de la cuenta
            <select v-model="companyUserActive" required>
              <option value="Y">Activa</option>
              <option value="N">Inactiva</option>
            </select>
          </label>
          <label v-if="editingCompanyUserLogin !== null" class="host-toggle directory-form-full">
            <input v-model="companyUserResetPassword" type="checkbox" />
            <span><strong>Generar nueva contraseña temporal</strong><small>La cuenta deberá cambiarla en su siguiente inicio de sesión.</small></span>
          </label>
          <button class="button-primary workspace-submit" type="submit" :disabled="companyUserSaving">
            {{ companyUserSaving ? "Guardando..." : editingCompanyUserLogin === null ? "Registrar usuario" : "Guardar cambios" }}
          </button>
        </form>
      </section>
    </div>

    <div
      v-if="temporaryPasswordDialogOpen"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
      @click.self="closeTemporaryPasswordDialog"
    >
      <section
        class="dialog workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temporary-password-title"
      >
        <span class="dialog-icon"><svg class="icon"><use href="#i-shield" /></svg></span>
        <h2 id="temporary-password-title">Contraseña temporal</h2>
        <p class="dialog-description">
          Cópiala y entrégala al usuario de forma segura. No volverá a mostrarse; deberá cambiarla al iniciar sesión.
        </p>
        <label class="temporary-password-value">
          <span class="sr-only">Contraseña temporal generada</span>
          <input :value="temporaryPasswordValue" type="text" readonly autocomplete="off" />
        </label>
        <button
          class="button-primary workspace-submit"
          type="button"
          @click="copyTemporaryPassword"
        >Copiar contraseña</button>
        <button
          class="button-secondary workspace-submit"
          type="button"
          @click="closeTemporaryPasswordDialog"
        >Listo, ya la guardé</button>
      </section>
    </div>

    <div
      v-if="currentUser.mustChangePassword"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
    >
      <section
        class="dialog workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="required-password-title"
      >
        <span class="dialog-icon"><svg class="icon"><use href="#i-shield" /></svg></span>
        <h2 id="required-password-title">Cambia tu contraseña</h2>
        <p class="dialog-description">
          Tu cuenta usa una contraseña temporal. Define una contraseña personal para continuar; no podrás acceder al sistema hasta cambiarla.
        </p>
        <form class="workspace-form modal-workspace-form" @submit.prevent="changeTemporaryPassword">
          <label>
            Nueva contraseña
            <input v-model="passwordChangeValue" type="password" minlength="8" maxlength="128" autocomplete="new-password" required />
          </label>
          <label>
            Confirmar contraseña
            <input v-model="passwordChangeConfirmation" type="password" minlength="8" maxlength="128" autocomplete="new-password" required />
          </label>
          <ul class="password-requirements directory-form-full" aria-label="Requisitos de la contraseña">
            <li
              v-for="requirement in passwordChangeRequirements"
              :key="requirement.label"
              :class="{ 'is-valid': requirement.valid }"
            >
              <span aria-hidden="true">{{ requirement.valid ? "✓" : "○" }}</span>
              {{ requirement.label }}
            </li>
          </ul>
          <p v-if="passwordChangeError" class="form-error directory-form-full" role="alert">
            {{ passwordChangeError }}
          </p>
          <button class="button-primary workspace-submit" type="submit" :disabled="passwordChangeSaving">
            {{ passwordChangeSaving ? "Actualizando..." : "Actualizar contraseña" }}
          </button>
        </form>
      </section>
    </div>

    <div
      v-if="administratorDialogOpen"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
      @click.self="administratorDialogOpen = false"
    >
      <section
        class="dialog workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="administrator-dialog-title"
      >
        <button class="dialog-close" type="button" aria-label="Cerrar" @click="administratorDialogOpen = false">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-shield" /></svg></span>
        <h2 id="administrator-dialog-title">
          {{ editingAdministratorLogin === null ? "Registrar administrador" : "Editar administrador" }}
        </h2>
        <p class="dialog-description">
          La cuenta será administradora únicamente dentro de la empresa seleccionada. Recibirá una contraseña temporal al registrarla.
        </p>
        <form class="workspace-form modal-workspace-form" @submit.prevent="submitAdministrator">
          <label>
            Usuario
            <input
              v-model.trim="administratorLogin"
              type="text"
              maxlength="255"
              autocomplete="username"
              :readonly="editingAdministratorLogin !== null"
              required
            />
          </label>
          <p v-if="editingAdministratorLogin === null" class="workspace-hint directory-form-full">
            Se generará una contraseña temporal de un solo uso para compartir con el administrador.
          </p>
          <label>
            Nombre completo
            <input v-model.trim="administratorName" type="text" maxlength="255" autocomplete="name" required />
          </label>
          <label>
            Empresa
            <select v-model="administratorCompanyId" required>
              <option :value="null" disabled>Selecciona una empresa</option>
              <option v-for="company in companies" :key="company.id" :value="company.id">
                {{ company.name }}
              </option>
            </select>
          </label>
          <label>
            Correo electrónico
            <input v-model.trim="administratorEmail" type="email" maxlength="255" autocomplete="email" />
          </label>
          <label>
            Puesto
            <input v-model.trim="administratorRole" type="text" maxlength="128" autocomplete="organization-title" />
          </label>
          <label>
            Teléfono
            <input v-model.trim="administratorPhone" type="tel" maxlength="64" autocomplete="tel" />
          </label>
          <label>
            Estado de la cuenta
            <select v-model="administratorActive" required>
              <option value="Y">Activa</option>
              <option value="N">Inactiva</option>
            </select>
          </label>
          <button class="button-primary workspace-submit" type="submit" :disabled="administratorSaving">
            {{ administratorSaving ? "Guardando..." : editingAdministratorLogin === null ? "Registrar administrador" : "Guardar cambios" }}
          </button>
        </form>
      </section>
    </div>

    <div
      v-if="departmentDialogOpen"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
      @click.self="departmentDialogOpen = false"
    >
      <section
        class="dialog workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="department-dialog-title"
      >
        <button class="dialog-close" type="button" aria-label="Cerrar" @click="departmentDialogOpen = false">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-organization" /></svg></span>
        <h2 id="department-dialog-title">
          {{ editingDepartmentId === null ? "Registrar departamento" : "Editar departamento" }}
        </h2>
        <p class="dialog-description">
          Captura el nombre del departamento para
          {{ companies.find((company) => company.id === departmentCompanyId)?.name ?? "la empresa seleccionada" }}.
        </p>
        <form class="workspace-form modal-workspace-form" @submit.prevent="submitDepartment">
          <label>
            Nombre del departamento
            <input v-model.trim="departmentName" type="text" maxlength="120" pattern=".*\S.*" autocomplete="organization-title" required />
          </label>
          <button class="button-primary workspace-submit" type="submit" :disabled="departmentSaving">
            {{ departmentSaving ? "Guardando..." : editingDepartmentId === null ? "Registrar departamento" : "Guardar cambios" }}
          </button>
        </form>
      </section>
    </div>

    <div
      v-if="externalStaffDialogOpen"
      class="dashboard-app dashboard-modal-backdrop modal-backdrop"
      :data-theme="dashboardTheme"
      @click.self="externalStaffDialogOpen = false"
    >
      <section
        class="dialog workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-staff-dialog-title"
      >
        <button
          class="dialog-close"
          type="button"
          aria-label="Cerrar"
          @click="externalStaffDialogOpen = false"
        ><svg class="icon"><use href="#i-close" /></svg></button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-users" /></svg></span>
        <h2 id="external-staff-dialog-title">
          {{ editingExternalStaffId === null ? "Registrar personal externo" : "Editar personal externo" }}
        </h2>
        <p class="dialog-description">Registra sus datos básicos y la empresa con la que está vinculado.</p>
        <form class="workspace-form modal-workspace-form external-staff-form" @submit.prevent="submitExternalStaff">
          <p class="workspace-form-section">Datos básicos</p>
          <label class="external-staff-full-name">
            Nombre completo
            <input
              v-model.trim="externalStaffName"
              type="text"
              autocomplete="name"
              maxlength="180"
              pattern=".*\S.*"
              placeholder="Nombre y apellidos"
              required
            />
          </label>
          <label>
            Teléfono <span class="optional-field">(opcional)</span>
            <input
              v-model.trim="externalStaffPhone"
              type="tel"
              autocomplete="tel"
              maxlength="30"
              placeholder="Número de contacto"
            />
          </label>
          <label>
            Correo electrónico <span class="optional-field">(opcional)</span>
            <input
              v-model.trim="externalStaffEmail"
              type="email"
              autocomplete="email"
              maxlength="254"
              placeholder="correo@empresa.com"
            />
          </label>
          <p class="workspace-form-section">Empresa vinculada</p>
          <label>
            Tipo de vínculo
            <select
              v-model="externalStaffRelationshipType"
              required
              @change="changeExternalStaffRelationshipType(externalStaffRelationshipType)"
            >
              <option value="Contratista">Contratista</option>
              <option value="Proveedor">Proveedor</option>
            </select>
          </label>
          <label>
            Empresa contratista o proveedora
            <select v-model.number="externalStaffBusinessPartnerId" required>
              <option value="" disabled>
                {{ businessDirectoryLoading ? "Cargando empresas..." : "Selecciona una empresa registrada" }}
              </option>
              <option
                v-for="partner in externalStaffPartnerOptions"
                :key="partner.id"
                :value="partner.id"
              >
                {{ partner.name }} · {{ partner.category }} · {{ partner.rfc }}
              </option>
            </select>
            <span v-if="!businessDirectoryLoading && externalStaffPartnerOptions.length === 0" class="field-hint">
              No hay empresas de este tipo registradas en el directorio.
            </span>
          </label>
          <button class="button-primary workspace-submit" type="submit" :disabled="externalStaffSaving">
            <svg class="icon"><use href="#i-plus" /></svg>
            {{ externalStaffSaving ? "Guardando..." : editingExternalStaffId === null ? "Registrar personal" : "Guardar cambios" }}
          </button>
        </form>
      </section>
    </div>

    </Teleport>
  </main>
</template>
