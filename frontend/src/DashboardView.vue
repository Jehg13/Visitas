<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import QRCode from "qrcode";
import { confirmUser, notifyUser, type AppAlertType } from "./notifications";
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
import type {
  AccessAccount,
  Appointment,
  BusinessPartner,
  BusinessPartnerStatus,
  BusinessPartnerType,
  Department,
  ExternalStaff,
  ExternalStaffType,
  GeneralVisitor,
  Host,
  HostAccountOption,
  AuthenticatedUser,
  SectionAccess,
  SystemAccessRole,
} from "./stores/types";

type AccessRoleDraft = "administrador" | "recepcion" | "";
const otherAppointmentVisitor = "__otro__";

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
  "Anfitriones",
  "Accesos",
  "Departamento",
  "Personal de externos",
  "Contratistas, proveedores y visitantes",
  "Equipo y herramientas",
  "Bitácora diaria",
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
hosts.value = getStoredHosts();
const allowedDashboardSections = computed(() => {
  if (currentUser.value.isAdmin) return dashboardSections;
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
const isReception = computed(
  () => !currentUser.value.isAdmin && currentUser.value.sectionAccess.includes("recepcion"),
);
const isHost = computed(
  () =>
    !currentUser.value.isAdmin &&
    currentUser.value.sectionAccess.includes("anfitriones") &&
    !currentUser.value.sectionAccess.includes("recepcion"),
);
if (isHost.value) appointmentFilter.value = "all";
const currentRoleLabel = computed(() =>
  currentUser.value.isAdmin
    ? "Programador"
    : isReception.value
      ? "Recepción"
      : "Anfitrión",
);
const drawerOpen = ref(false);
const privateMenuOpen = ref(false);
const appointmentDialogOpen = ref(false);
const editingAppointmentId = ref<number | null>(null);
const qrDialogOpen = ref(false);
const qrAppointment = ref<Appointment | null>(null);
const qrExternalStaff = ref<ExternalStaff | null>(null);
const qrDataUrl = ref("");
const qrGenerating = ref(false);
const qrDispatchAppointment = ref<Appointment | null>(null);
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
const appointmentsPage = ref(1);
const appointmentsPerPage = 5;
const calendarMonth = ref(getLocalDate().slice(0, 7));
const externalStaffSearch = ref("");
const externalStaffName = ref("");
const externalStaffPhone = ref("");
const externalStaffEmail = ref("");
const externalStaffRelationshipType = ref<ExternalStaffType>("Contratista");
const externalStaffBusinessPartnerId = ref<number | null>(null);
const departmentDialogOpen = ref(false);
const editingDepartmentId = ref<number | null>(null);
const departmentName = ref("");
const departmentSaving = ref(false);
const hostRole = ref("");
const hostDialogOpen = ref(false);
const editingHostId = ref<number | null>(null);
const hostSaving = ref(false);
const nextHostId = ref(Math.max(0, ...hosts.value.map((host) => host.id)));
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
        ...(sections.includes("anfitriones") ? ["Anfitriones" as const] : []),
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

watch(hosts, (storedHosts) => {
  try {
    localStorage.setItem("visitas:hosts", JSON.stringify(storedHosts));
  } catch (error) {
    console.error("No se pudieron guardar los anfitriones locales:", error);
    showToast("No se pudieron guardar los anfitriones en este navegador.");
  }
}, { deep: true });

const selectableHostAccounts = computed(() =>
  hostAccountOptions.value.filter((account) =>
    !hosts.value.some((host) =>
      host.login.toLocaleLowerCase() === account.login.toLocaleLowerCase() &&
      host.id !== editingHostId.value,
    ),
  ),
);
const externalStaffPartnerOptions = computed(() =>
  businessPartners.value.filter(
    (partner): partner is BusinessPartner & { type: ExternalStaffType } =>
      partner.type !== "Visitante" &&
      partner.type === externalStaffRelationshipType.value,
  ),
);

let realtimeEvents: EventSource | null = null;

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
  if (activeSection.value === "Anfitriones" && currentUser.value.isAdmin) {
    void loadHostAccounts(true);
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

onMounted(() => {
  if (currentUser.value.isAdmin || isReception.value) void loadDepartments();
  if (currentUser.value.isAdmin || isReception.value || isHost.value) {
    void loadBusinessDirectory();
    void loadAppointments();
  }
  if (currentUser.value.isAdmin) {
    void loadHostAccounts();
  }
  realtimeEvents = new EventSource("/api/events");
  realtimeEvents.onopen = refreshAfterRealtimeUpdate;
  realtimeEvents.onmessage = refreshAfterRealtimeUpdate;
  document.addEventListener("visibilitychange", refreshAfterRealtimeUpdate);
});

onBeforeUnmount(() => {
  realtimeEvents?.close();
  realtimeEvents = null;
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
  if (appointmentsRequestInProgress) return;
  appointmentsRequestInProgress = true;
  if (!silent) appointmentLoading.value = true;
  try {
    const response = await fetch("/api/appointments");
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
        authStore.user = {
          ...currentUser.value,
          isAdmin: updatedAccount.sectionAccess.includes("administrador"),
          sectionAccess: updatedAccount.sectionAccess,
        };
        if (!authStore.user.isAdmin) {
          const nextSection = updatedAccount.sectionAccess.includes("recepcion")
            ? "Bitácora diaria"
            : updatedAccount.sectionAccess.includes("anfitriones")
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
    showToast(`Se actualizaron las secciones autorizadas para ${account.login}.`, "success");
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

const pageTitle = computed(() =>
  !activeSection.value
    ? "Sin acceso asignado"
    : activeSection.value === "Inicio"
      ? "Panel de control"
      : activeSection.value,
);
const hostEligibleDepartments = computed(() => departments.value);
const appointmentCompanyOptions = computed(() =>
  [...businessPartners.value]
    .filter((partner) => partner.type !== "Visitante")
    .sort((first, second) =>
    first.name.localeCompare(second.name, "es"),
  ),
);
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
    : [...hosts.value].sort((first, second) => first.name.localeCompare(second.name, "es")),
);
const appointmentVisitorOptions = computed(() =>
  externalStaff.value
    .filter((staff) => staff.businessPartnerId === visitorCompanyId.value)
    .sort((first, second) => first.fullName.localeCompare(second.fullName, "es")),
);
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

function showToast(message: string, type: AppAlertType = "error") {
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
  } catch (error) {
    console.error("Failed to log out:", error);
    showToast("No se pudo conectar con el servidor para cerrar la sesión.");
  }
}

async function createAppointmentQr(appointment: Appointment, staff?: ExternalStaff) {
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

async function openQrDialog(appointment: Appointment) {
  qrExternalStaff.value = null;
  qrAppointment.value = appointment;
  qrDataUrl.value = "";
  qrGenerating.value = true;
  qrDialogOpen.value = true;
  try {
    qrDataUrl.value = await createAppointmentQr(appointment);
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
  const confirmed = await confirmUser(
    receivesEquipmentLink
      ? `Se enviará el QR de ${staff.fullName} a ${staff.email}. Si la declaración aún está pendiente, este correo incluirá el enlace para declarar equipo y herramientas. Ese enlace solo puede usarse una vez y se desactiva al enviar la declaración; solo esta persona lo recibe. ¿Continuar?`
      : `Se enviará el QR de ${staff.fullName} a ${staff.email}. El enlace de declaración de equipo se envía únicamente a ${equipmentRecipient?.fullName ?? "la primera persona con correo válido"}. ¿Continuar?`,
    "Enviar QR",
  );
  if (!confirmed) return;

  sendingExternalQrStaffId.value = staff.id;
  try {
    const response = await fetch(`/api/appointments/${appointment.id}/send-qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: staff.id }),
    });
    const result = await response.json() as { message?: string; error?: string };
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
  } catch (error) {
    console.error("Failed to send external staff appointment QR:", error);
    showToast("No se pudo conectar con el servidor para enviar el QR.");
  } finally {
    sendingExternalQrStaffId.value = null;
  }
}

function clearQrDispatch() {
  qrDispatchAppointment.value = null;
}

function openAppointmentDialog(appointment?: Appointment) {
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

function openHomeAppointmentDialog(date: string) {
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
  const visitor = appointmentVisitorOptions.value.find(
    (staff) => String(staff.id) === visitorSelection.value,
  );
  visitorName.value = visitor?.fullName ?? "";
  visitorEmail.value = visitor?.email ?? "";
}

function changeCalendarMonth(offset: number) {
  const [year, month] = calendarMonth.value.split("-").map(Number);
  const nextMonth = new Date(year, month - 1 + offset, 1);
  calendarMonth.value = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
}

function openDepartmentDialog(department?: Department) {
  editingDepartmentId.value = department?.id ?? null;
  departmentName.value = department?.name ?? "";
  departmentDialogOpen.value = true;
}

async function submitDepartment() {
  const name = departmentName.value.trim();
  if (!name || departmentSaving.value) return;

  const duplicate = departments.value.some(
    (department) =>
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
        body: JSON.stringify({ name }),
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
    departmentDialogOpen.value = false;
    editingDepartmentId.value = null;
    departmentName.value = "";
    showToast(departmentId === null ? "El departamento se guardó correctamente." : "El departamento se actualizó.", "success");
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
    showToast("El departamento se eliminó.", "success");
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

  let hostSectionAccess: SectionAccess[] = selectedAccount
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
      const result = await response.json() as {
        sectionAccess?: SectionAccess[];
        error?: string;
      };
      if (!response.ok) {
        showToast(result.error ?? "No se pudo asignar el acceso a Anfitriones.");
        return;
      }
      if (
        !Array.isArray(result.sectionAccess) ||
        !result.sectionAccess.every(
          (section) => section === "recepcion" || section === "anfitriones",
        )
      ) {
        console.error("La API devolvió permisos de anfitrión con formato inválido.");
        showToast("Se guardó el permiso, pero no se pudo actualizar el registro.");
        return;
      }
      hostSectionAccess = result.sectionAccess;
      accessAccounts.value = accessAccounts.value.map((account) =>
        account.login === login
          ? { ...account, sectionAccess: hostSectionAccess }
          : account,
      );
    } catch (error) {
      console.error("Failed to assign host section access:", error);
      showToast("No se pudo conectar con el servidor para asignar el acceso a Anfitriones.");
      return;
    } finally {
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
        ...(hostSectionAccess.includes("recepcion") ? ["Recepción" as const] : []),
        ...(hostSectionAccess.includes("anfitriones") ? ["Anfitriones" as const] : []),
      ]
      : editingHostId.value === null
        ? []
        : (hosts.value.find((host) => host.id === editingHostId.value)?.accessRoles ?? []),
  };

  if (editingHostId.value === null) {
    hosts.value.unshift({ id: ++nextHostId.value, ...hostData });
    showToast("El anfitrión se registró con los datos de Accesos.", "success");
  } else {
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

function removeHost(id: number) {
  hosts.value = hosts.value.filter((host) => host.id !== id);
  showToast("El anfitrión se eliminó del registro de demostración.", "success");
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
  const company = businessPartners.value.find(
    (partner) => partner.id === visitorCompanyId.value,
  );
  const host = isHost.value
    ? {
        login: currentUser.value.login,
        name: currentUser.value.name?.trim() || currentUser.value.login,
      }
    : hosts.value.find((candidate) => candidate.login === visitorHostLogin.value);
  const selectedVisitor =
    visitorSelection.value === otherAppointmentVisitor
      ? null
      : appointmentVisitorOptions.value.find(
          (staff) => String(staff.id) === visitorSelection.value,
        );
  const appointmentVisitorName =
    visitorSelection.value === otherAppointmentVisitor
      ? visitorName.value.trim()
      : selectedVisitor?.fullName ?? "";
  const email = visitorEmail.value.trim();
  let appointmentEmail =
    visitorSelection.value === otherAppointmentVisitor
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
    const response = await fetch(
      appointmentId === null ? "/api/appointments" : `/api/appointments/${appointmentId}`,
      {
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
      },
    );
    const result = await response.json() as {
      appointments?: Appointment[];
      message?: string;
      error?: string;
    };
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
    showToast(
      result.message ?? (appointmentId === null ? "La cita se guardó en la agenda." : "La cita se actualizó en la agenda."),
      "success",
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

function downloadAppointmentQr(
  appointment: Appointment,
  dataUrl = qrDataUrl.value,
  staff = qrExternalStaff.value,
) {
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

async function deleteAppointment(appointment: Appointment) {
  if (appointment.status !== "Cancelada") {
    showToast("Para eliminar una cita, primero debes cancelarla.");
    return;
  }
  if (
    deletingAppointmentId.value !== null ||
    !window.confirm(`¿Quitar de la agenda la cita cancelada de ${appointment.visitor}? Se conservará en el historial.`)
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
    showToast("La cita se eliminó de la agenda.", "success");
  } catch (error) {
    console.error("Failed to delete appointment:", error);
    showToast("No se pudo conectar con el servidor para eliminar la cita.");
  } finally {
    deletingAppointmentId.value = null;
  }
}

async function cancelAppointment(appointment: Appointment) {
  if (appointment.status === "Cancelada" || appointment.status === "Retirado") return;
  if (!await confirmUser(`¿Cancelar la cita de ${appointment.visitor}?`, "Cancelar cita")) return;

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
    showToast(`Se canceló la cita de ${appointment.visitor}.`, "success");
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
    );
  } catch (error) {
    console.error("Failed to save external staff:", error);
    showToast("No se pudo conectar con el servidor para guardar al trabajador externo.");
  } finally {
    externalStaffSaving.value = false;
  }
}

async function removeExternalStaff(id: number) {
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
    showToast("El trabajador externo se eliminó.", "success");
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
    showToast(partnerId === null ? "La empresa se registró correctamente." : "Los datos de la empresa se actualizaron.", "success");
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
    showToast("La empresa se eliminó.", "success");
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
          <img class="brand-mark" src="/images/cymez-mark.png" alt="" />
          <span class="brand-recep">RECEP</span>
        </a>
        <span class="brand-divider" aria-hidden="true"></span>
        <span class="brand-product">CONTROL DE<br />VISITANTES</span>
      </div>

      <div class="topbar-account">
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
              <small>{{ currentRoleLabel }} · Acceso corporativo</small>
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
        <span>{{ currentRoleLabel.toLocaleUpperCase("es-MX") }}<br /><small>Acceso corporativo</small></span>
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
          <p v-else-if="activeSection === 'Personal de externos'">
            Personal vinculado a contratistas y proveedores registrados en MySQL
          </p>
          <p v-else-if="activeSection === 'Anfitriones'">
            Registro de anfitriones de la organización · datos de demostración
          </p>
          <p v-else-if="activeSection === 'Accesos'">
            Asigna quién puede entrar al sistema y qué áreas puede utilizar · datos de demostración
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
        @update:page="appointmentsPage = $event"
        @create="openAppointmentDialog"
        @cancel="cancelAppointment"
        @open-qr="openQrDialog"
        @send-company-qrs="openCompanyQrDispatch"
        @delete="deleteAppointment"
        @edit="openAppointmentDialog"
        @change-month="changeCalendarMonth"
        @select-day="selectCalendarDay"
      />

      <HostsSection
        v-else-if="activeSection === 'Anfitriones'"
        v-model:search="hostSearch"
        :hosts="hosts"
        :filtered-hosts="filteredHosts"
        :departments="departments"
        :eligible-department-count="hostEligibleDepartments.length"
        @create="openHostDialog()"
        @edit="openHostDialog"
        @remove="removeHost"
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

      <ExternalStaffSection
        v-else-if="activeSection === 'Personal de externos'"
        v-model:search="externalStaffSearch"
        :companies="externalStaffPartnerOptions"
        :staff="externalStaff"
        :loading="businessDirectoryLoading"
        :dispatch-appointment="qrDispatchAppointment"
        :sending-staff-id="sendingExternalQrStaffId"
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
        @create-partner="openBusinessPartnerDialog()"
        @edit-partner="openBusinessPartnerDialog"
        @remove-partner="removeBusinessPartner"
      />

      <EquipmentSection
        v-else-if="activeSection === 'Equipo y herramientas'"
        :theme="dashboardTheme"
      />

      <DailyLogSection
        v-else-if="activeSection === 'Bitácora diaria'"
        :initial-range="dailyLogInitialRange"
        :is-admin="currentUser.isAdmin"
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
        @create-appointment="openHomeAppointmentDialog"
        @edit-appointment="openAppointmentDialog"
        @cancel-appointment="cancelAppointment"
        @delete-appointment="deleteAppointment"
        @open-qr="openQrDialog"
        @send-company-qrs="openCompanyQrDispatch"
        @open-log="openDailyLogRange"
        @open-appointments="selectSection('Agenda de citas')"
        @open-equipment="selectSection('Equipo y herramientas')"
      />
      <div v-else class="panel workspace-panel access-none-panel">
        <h2>Sin secciones asignadas</h2>
        <p>Solicita al administrador que te otorgue acceso a una sección de la aplicación.</p>
      </div>
    </section>

    <div v-if="appointmentDialogOpen" class="modal-backdrop" @click.self="appointmentDialogOpen = false">
      <section class="dialog appointment-dialog" role="dialog" aria-modal="true" aria-labelledby="appointment-dialog-title">
        <button class="dialog-close" type="button" aria-label="Cerrar" @click="appointmentDialogOpen = false"><svg class="icon"><use href="#i-close" /></svg></button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-calendar" /></svg></span>
        <h2 id="appointment-dialog-title">{{ editingAppointmentId === null ? "Nueva cita" : "Editar cita" }}</h2>
        <p class="dialog-description">{{ editingAppointmentId === null ? "Agrega una visita a la agenda." : "Actualiza los datos de la visita." }}</p>
        <form class="appointment-form" @submit.prevent="submitAppointment">
          <label>
            Empresa
            <select
              v-model.number="visitorCompanyId"
              required
              @change="changeAppointmentCompany"
            >
              <option :value="null" disabled>Selecciona una empresa</option>
              <option
                v-for="company in appointmentCompanyOptions"
                :key="company.id"
                :value="company.id"
              >
                {{ company.name }} · {{ company.type }}
              </option>
            </select>
          </label>
          <label>
            Visitante
            <select
              v-model="visitorSelection"
              required
              :disabled="visitorCompanyId === null"
              @change="changeAppointmentVisitor"
            >
              <option value="" disabled>
                {{ visitorCompanyId === null ? "Primero selecciona una empresa" : "Selecciona el nombre del visitante" }}
              </option>
              <option
                v-for="person in appointmentVisitorOptions"
                :key="person.id"
                :value="String(person.id)"
              >
                {{ person.fullName }}
              </option>
              <option :value="otherAppointmentVisitor">Otro (escribir nombre)</option>
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
              v-else-if="visitorCompanyId !== null && appointmentVisitorOptions.length === 0"
              class="appointment-field-hint"
            >
              Esta empresa aún no tiene personal registrado; selecciona “Otro” para capturar el nombre.
            </span>
          </label>
          <label>
            Anfitrión
            <select v-model="visitorHostLogin" required :disabled="isHost">
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

    <div v-if="qrDialogOpen" class="modal-backdrop" @click.self="qrDialogOpen = false">
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
      class="modal-backdrop"
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
      class="modal-backdrop"
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
              value=""
            />
            <span><strong>Sin acceso</strong><small>No podrá entrar a las secciones de la aplicación.</small></span>
          </label>
          <p class="access-none-note">
            La selección se guarda en las secciones autorizadas de la aplicación. El acceso de anfitrión se conserva por separado.
          </p>
          <button class="button-primary workspace-submit" type="submit" :disabled="accessAccountSaving">
            {{ accessAccountSaving ? "Guardando..." : "Guardar cambios" }}
          </button>
        </form>
      </section>
    </div>

    <div
      v-if="hostDialogOpen"
      class="modal-backdrop"
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
            <button class="button-secondary" type="button" @click="selectSection('Departamento')">
              Ir a Departamentos
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
      v-if="departmentDialogOpen"
      class="modal-backdrop"
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
        <p class="dialog-description">Captura el nombre del departamento.</p>
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
      class="modal-backdrop"
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

  </main>
</template>
