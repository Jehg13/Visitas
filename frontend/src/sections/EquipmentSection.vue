<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { apiFetch as fetch } from "../api";
import { confirmUser, notifyUser } from "../notifications";

const props = defineProps<{ theme: "dark" | "light"; isAdmin: boolean; isHost: boolean }>();

type PartnerOption = { id: number; name: string };
type StaffOption = { id: number; businessPartnerId: number; fullName: string; companyName: string };
type AppointmentOption = {
  id: number;
  businessPartnerId: number;
  visitorRecordId: number | null;
  visitorName: string;
  companyName: string;
  date: string;
  time: string;
};
type EquipmentItem = {
  id: number;
  itemType: "Equipo" | "Herramienta";
  quantity: number;
  product: string;
  brand: string;
  model: string;
  serialNumber: string;
  color: string;
  notes: string;
};
type InspectionRecordItem = {
  declarationItemId: number;
  declaredItemType: "Equipo" | "Herramienta";
  declaredQuantity: number;
  declaredProduct: string;
  declaredBrand: string;
  declaredModel: string;
  declaredSerialNumber: string;
  declaredColor: string;
  checkedQuantity: number;
  checkedProduct: string;
  checkedBrand: string;
  checkedModel: string;
  checkedSerialNumber: string;
  checkedColor: string;
  result: "Pendiente" | "Conforme" | "Incidencia";
  notes: string;
  keepAtReception: boolean;
  returnedToVisitor: boolean;
};
type EquipmentInspection = {
  phase: "Entrada" | "Salida";
  status: "En progreso" | "Completada";
  inspectorLogin: string;
  inspectorName: string;
  startedAt: string;
  completedAt: string | null;
  items: InspectionRecordItem[];
};
type EquipmentDeclaration = {
  id: number;
  personName: string;
  companyName: string;
  status: "Pendiente" | "Enviada";
  createdBy: string;
  createdAt: string;
  submittedAt: string | null;
  visitDate: string | null;
  visitTime: string | null;
  itemCount?: number;
  entryStatus?: string | null;
  exitStatus?: string | null;
  incidentCount?: number;
  items?: EquipmentItem[];
  inspections?: EquipmentInspection[];
};
type InspectionDraftItem = {
  declarationItemId: number;
  itemType: "Equipo" | "Herramienta";
  checked: boolean;
  quantity: number;
  product: string;
  brand: string;
  model: string;
  serialNumber: string;
  color: string;
  notes: string;
  keepAtReception: boolean;
  returnedToVisitor: boolean;
};

const declarations = ref<EquipmentDeclaration[]>([]);
const declarationsLoading = ref(false);
const declarationTotal = ref(0);
const declarationPage = ref(1);
const declarationPageSize = 7;
const declarationPages = ref(1);
const partners = ref<PartnerOption[]>([]);
const staff = ref<StaffOption[]>([]);
const appointments = ref<AppointmentOption[]>([]);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const search = ref("");
const createOpen = ref(false);
const businessPartnerId = ref<number | null>(null);
const externalStaffId = ref<number | null>(null);
const appointmentId = ref<number | null>(null);
const personName = ref("");
const createError = ref("");
const generatedLink = ref("");
const selectedDeclaration = ref<EquipmentDeclaration | null>(null);
const deletingDeclarationId = ref<number | null>(null);
const declarationItemsPage = ref(1);
const declarationItemsPageSize = 7;
const detailLoading = ref(false);
const inspectionPhase = ref<"entrada" | "salida" | null>(null);
const inspectionItems = ref<InspectionDraftItem[]>([]);
const linkMessage = ref("");
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let declarationRefreshInProgress = false;

const matchingStaff = computed(() =>
  staff.value.filter((person) => person.businessPartnerId === businessPartnerId.value),
);
const matchingAppointments = computed(() =>
  appointments.value.filter((appointment) => appointment.businessPartnerId === businessPartnerId.value),
);
const paginatedDeclarationItems = computed(() =>
  (selectedDeclaration.value?.items ?? []).slice(
    (declarationItemsPage.value - 1) * declarationItemsPageSize,
    declarationItemsPage.value * declarationItemsPageSize,
  ),
);
const declarationItemsPages = computed(() =>
  Math.max(1, Math.ceil((selectedDeclaration.value?.items?.length ?? 0) / declarationItemsPageSize)),
);
const inspectionLabel = computed(() =>
  inspectionPhase.value === "entrada" ? "entrada" : "salida",
);
const checkedInspectionItems = computed(() =>
  inspectionItems.value.filter((item) => item.checked).length,
);

function setNotice(message: string, title = "Operación completada") {
  notifyUser(message, "success", title);
}

function canDeleteDeclaration(declaration: EquipmentDeclaration) {
  return props.isAdmin || (props.isHost && declaration.status === "Pendiente");
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("No se pudo conectar con el servidor del módulo de equipo.");
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error("El servidor devolvió una respuesta de equipo inválida.");
  }
}

async function loadOptions() {
  const response = await fetch("/api/equipment/options");
  const result = await parseResponse<{
    partners?: PartnerOption[];
    staff?: StaffOption[];
    appointments?: AppointmentOption[];
    error?: string;
  }>(response);
  if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar las opciones.");
  if (!Array.isArray(result.partners) || !Array.isArray(result.staff) || !Array.isArray(result.appointments)) {
    throw new Error("El servidor devolvió opciones de equipo con formato inválido.");
  }
  partners.value = result.partners;
  staff.value = result.staff;
  appointments.value = result.appointments;
}

async function loadDeclarations() {
  const params = new URLSearchParams();
  if (search.value.trim()) params.set("q", search.value.trim());
  params.set("page", String(declarationPage.value));
  const response = await fetch(`/api/equipment/declarations?${params}`);
  const result = await parseResponse<{
    declarations?: EquipmentDeclaration[];
    total?: number;
    pages?: number;
    error?: string;
  }>(response);
  if (!response.ok) throw new Error(result.error ?? "No se pudo cargar el historial.");
  if (
    !Array.isArray(result.declarations) ||
    typeof result.total !== "number" ||
    !Number.isSafeInteger(result.total) ||
    typeof result.pages !== "number" ||
    !Number.isSafeInteger(result.pages)
  ) {
    throw new Error("El servidor devolvió declaraciones con formato inválido.");
  }
  declarationTotal.value = result.total;
  declarationPages.value = Math.max(1, result.pages);
  if (declarationPage.value > declarationPages.value) {
    declarationPage.value = declarationPages.value;
    await loadDeclarations();
    return;
  }
  declarations.value = result.declarations;
}

async function refreshDeclarations(silent = false) {
  if (declarationRefreshInProgress) return;
  declarationRefreshInProgress = true;
  declarationsLoading.value = true;
  try {
    await loadDeclarations();
    errorMessage.value = "";
  } catch (error) {
    console.error("No se pudo actualizar el historial de equipo:", error);
    errorMessage.value = "";
    if (!silent) notifyUser(error instanceof Error ? error.message : "No se pudo actualizar el historial.");
  } finally {
    declarationRefreshInProgress = false;
    declarationsLoading.value = false;
  }
}

function refreshEquipmentAfterRealtimeUpdate() {
  if (document.visibilityState !== "visible") return;
  void refreshDeclarations(true);
  void loadOptions().catch((error: unknown) => {
    console.error("No se pudieron actualizar las opciones de equipo:", error);
  });
}

onMounted(async () => {
  window.addEventListener("visitas:data-changed", refreshEquipmentAfterRealtimeUpdate);
  try {
    await Promise.all([loadOptions(), loadDeclarations()]);
  } catch (error) {
    console.error("No se pudo cargar el módulo de equipo:", error);
    errorMessage.value = "";
    notifyUser(error instanceof Error ? error.message : "No se pudo cargar el módulo de equipo.");
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  window.removeEventListener("visitas:data-changed", refreshEquipmentAfterRealtimeUpdate);
});

watch(search, () => {
  declarationPage.value = 1;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void refreshDeclarations(), 250);
});

watch(declarationPage, () => {
  void refreshDeclarations(true);
});

watch(businessPartnerId, (nextPartnerId, previousPartnerId) => {
  if (nextPartnerId !== previousPartnerId) {
    if (staff.value.find((person) => person.id === externalStaffId.value)?.businessPartnerId !== nextPartnerId) {
      externalStaffId.value = null;
    }
    const appointment = appointments.value.find((item) => item.id === appointmentId.value);
    if (appointment && appointment.businessPartnerId !== nextPartnerId) {
      appointmentId.value = null;
    } else if (!appointment) {
      personName.value = "";
    }
  }
});

watch(appointmentId, (nextAppointmentId) => {
  const appointment = appointments.value.find((item) => item.id === nextAppointmentId);
  if (!appointment) return;
  businessPartnerId.value = appointment.businessPartnerId;
  personName.value = appointment.visitorName;
  externalStaffId.value = null;
});

function openCreate() {
  businessPartnerId.value = null;
  externalStaffId.value = null;
  appointmentId.value = null;
  personName.value = "";
  generatedLink.value = "";
  createError.value = "";
  createOpen.value = true;
}

function selectAllOnFocus(event: FocusEvent) {
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.select();
}

async function createDeclaration() {
  if (saving.value) return;
  saving.value = true;
  createError.value = "";
  try {
    const response = await fetch("/api/equipment/declarations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessPartnerId: businessPartnerId.value,
        externalStaffId: externalStaffId.value,
        appointmentId: appointmentId.value,
        personName: personName.value.trim(),
      }),
    });
    const result = await parseResponse<{ id?: number; token?: string; error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo crear la declaración.");
    if (typeof result.token !== "string") throw new Error("El servidor no devolvió el enlace de declaración.");
    generatedLink.value = `${window.location.origin}/#equipo=${encodeURIComponent(result.token)}`;
    await loadDeclarations();
    setNotice("Declaración creada. Comparte el enlace con la persona externa.", "Declaración registrada");
  } catch (error) {
    console.error("No se pudo crear la declaración de equipo:", error);
    createError.value = "";
    notifyUser(error instanceof Error ? error.message : "No se pudo crear la declaración.");
  } finally {
    saving.value = false;
  }
}

async function copyLink(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    linkMessage.value = "";
    notifyUser("Enlace copiado.", "success", "Enlace copiado");
  } catch (error) {
    console.error("No se pudo copiar el enlace de equipo:", error);
    linkMessage.value = "";
    notifyUser("No se pudo copiar. Selecciona y copia el enlace manualmente.");
  }
}

async function openDetails(id: number) {
  detailLoading.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch(`/api/equipment/declarations/${id}`);
    const result = await parseResponse<{ declaration?: EquipmentDeclaration; error?: string }>(response);
    if (!response.ok || !result.declaration) {
      throw new Error(result.error ?? "No se pudo abrir la declaración.");
    }
    selectedDeclaration.value = result.declaration;
    declarationItemsPage.value = 1;
    linkMessage.value = "";
  } catch (error) {
    console.error("No se pudo consultar la declaración:", error);
    errorMessage.value = "";
    notifyUser(error instanceof Error ? error.message : "No se pudo abrir la declaración.");
  } finally {
    detailLoading.value = false;
  }
}

function getInspection(phase: "Entrada" | "Salida") {
  return selectedDeclaration.value?.inspections?.find((inspection) => inspection.phase === phase);
}

function itemKeptAtReception(declarationItemId: number) {
  return getInspection("Entrada")?.items.some(
    (item) => item.declarationItemId === declarationItemId && item.keepAtReception,
  ) ?? false;
}

function startInspection(phase: "entrada" | "salida") {
  const declaration = selectedDeclaration.value;
  if (!declaration?.items?.length) return;
  const entryItems = getInspection("Entrada")?.items ?? [];
  inspectionItems.value = declaration.items.map((item) => {
    const entryItem = entryItems.find((checked) => checked.declarationItemId === item.id);
    return {
      declarationItemId: item.id,
      itemType: item.itemType,
      checked: false,
      quantity: phase === "salida" && entryItem ? entryItem.checkedQuantity : item.quantity,
      product: phase === "salida" && entryItem ? entryItem.checkedProduct : item.product,
      brand: phase === "salida" && entryItem ? entryItem.checkedBrand : item.brand,
      model: phase === "salida" && entryItem ? entryItem.checkedModel : item.model,
      serialNumber: phase === "salida" && entryItem ? entryItem.checkedSerialNumber : item.serialNumber,
      color: phase === "salida" && entryItem ? entryItem.checkedColor : item.color,
      notes: "",
      keepAtReception: false,
      returnedToVisitor: false,
    };
  });
  inspectionPhase.value = phase;
}

async function saveInspection() {
  if (!selectedDeclaration.value || !inspectionPhase.value || saving.value) return;
  const uncheckedItem = inspectionItems.value.find((item) => !item.checked);
  if (uncheckedItem) {
    const declared = selectedDeclaration.value.items?.find(
      (item) => item.id === uncheckedItem.declarationItemId,
    );
    notifyUser(`Marca la verificación física de “${declared?.product ?? "cada artículo"}” antes de completar la revisión.`);
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch(
      `/api/equipment/declarations/${selectedDeclaration.value.id}/inspections/${inspectionPhase.value}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: inspectionItems.value.map((item) => ({ ...item, incident: false })),
        }),
      },
    );
    const result = await parseResponse<{ message?: string; error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la revisión.");
    inspectionPhase.value = null;
    await Promise.all([openDetails(selectedDeclaration.value.id), loadDeclarations()]);
    setNotice(result.message ?? "Verificación guardada.", "Checklist completado");
  } catch (error) {
    console.error("No se pudo guardar la verificación de equipo:", error);
    errorMessage.value = "";
    notifyUser(error instanceof Error ? error.message : "No se pudo guardar la revisión.");
  } finally {
    saving.value = false;
  }
}

async function refreshLink(declarationId: number) {
  linkMessage.value = "";
  try {
    const response = await fetch(`/api/equipment/declarations/${declarationId}/link`, { method: "POST" });
    const result = await parseResponse<{ token?: string; error?: string }>(response);
    if (!response.ok || typeof result.token !== "string") {
      throw new Error(result.error ?? "No se pudo generar el enlace.");
    }
    linkMessage.value = `${window.location.origin}/#equipo=${encodeURIComponent(result.token)}`;
    notifyUser("Se generó un nuevo enlace de declaración.", "success", "Enlace generado");
  } catch (error) {
    console.error("No se pudo renovar el enlace de equipo:", error);
    linkMessage.value = "";
    notifyUser(error instanceof Error ? error.message : "No se pudo generar el enlace.");
  }
}

async function revokeLink(declarationId: number) {
  if (!await confirmUser(
    "¿Revocar el enlace pendiente? La persona ya no podrá abrirlo.",
    "Revocar enlace",
    "Confirmar revocación",
    "warning",
  )) return;
  try {
    const response = await fetch(`/api/equipment/declarations/${declarationId}/revoke`, { method: "POST" });
    const result = await parseResponse<{ message?: string; error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo revocar el enlace.");
    linkMessage.value = "";
    setNotice("Enlace revocado.", "Enlace revocado");
  } catch (error) {
    console.error("No se pudo revocar el enlace de equipo:", error);
    linkMessage.value = "";
    notifyUser(error instanceof Error ? error.message : "No se pudo revocar el enlace.");
  }
}

async function deleteDeclaration(declaration: EquipmentDeclaration) {
  if (!canDeleteDeclaration(declaration) || deletingDeclarationId.value !== null) return;
  const confirmed = await confirmUser(
    `¿Eliminar la declaración de ${declaration.personName} de forma permanente? También se eliminarán sus artículos y verificaciones.`,
    "Eliminar declaración",
    "Sí, eliminar",
    "warning",
  );
  if (!confirmed) return;

  deletingDeclarationId.value = declaration.id;
  try {
    const response = await fetch(`/api/equipment/declarations/${declaration.id}`, {
      method: "DELETE",
    });
    const result = await parseResponse<{ message?: string; error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo eliminar la declaración.");
    if (selectedDeclaration.value?.id === declaration.id) selectedDeclaration.value = null;
    await loadDeclarations();
    setNotice(result.message ?? "La declaración se eliminó correctamente.", "Declaración eliminada");
  } catch (error) {
    console.error("No se pudo eliminar la declaración de equipo:", error);
    notifyUser(error instanceof Error ? error.message : "No se pudo eliminar la declaración.");
  } finally {
    deletingDeclarationId.value = null;
  }
}
</script>

<template>
  <section class="workspace-grid equipment-workspace" aria-labelledby="equipment-title">
    <section class="panel workspace-panel equipment-panel">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <svg class="icon"><use href="#i-tool" /></svg>
          <div>
            <h2 id="equipment-title">Equipo y herramientas</h2>
            <p class="equipment-subtitle">Declaraciones y verificaciones independientes de la Bitácora.</p>
          </div>
        </div>
        <div class="workspace-heading-actions">
          <span class="workspace-count">{{ declarationTotal }} declaraciones</span>
          <button class="button-primary" type="button" @click="openCreate">
            <svg class="icon"><use href="#i-plus" /></svg>
            Nueva declaración
          </button>
        </div>
      </header>

      <div class="equipment-toolbar">
        <label class="equipment-search">
          <span class="sr-only">Buscar por persona o empresa</span>
          <svg class="icon"><use href="#i-search" /></svg>
          <input v-model="search" type="search" placeholder="Buscar persona o empresa" autocomplete="off" />
        </label>
        <button class="button-secondary equipment-refresh" type="button" :disabled="loading" @click="refreshDeclarations()">
          Actualizar historial
        </button>
      </div>

      <p v-if="errorMessage && !createOpen && !selectedDeclaration" class="equipment-alert" role="alert">{{ errorMessage }}</p>
      <div class="workspace-table-scroll equipment-history">
        <table class="workspace-table equipment-history-table">
          <thead>
            <tr>
              <th>Persona / empresa</th>
              <th>Cita</th>
              <th>Declaración</th>
              <th>Verificación de entrada</th>
              <th>Verificación de salida</th>
              <th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="declaration in declarations" :key="declaration.id">
              <td>
                <strong>{{ declaration.personName }}</strong>
                <span class="equipment-company">{{ declaration.companyName }}</span>
              </td>
              <td>{{ declaration.visitDate ? `${declaration.visitDate} ${declaration.visitTime ?? ""}` : "Sin cita vinculada" }}</td>
              <td>
                <span class="equipment-status" :class="declaration.status === 'Enviada' ? 'is-complete' : 'is-pending'">
                  {{ declaration.status }}
                </span>
                <span class="equipment-company">{{ declaration.itemCount ?? 0 }} artículos</span>
              </td>
              <td>{{ declaration.entryStatus ?? "Pendiente" }}</td>
              <td>{{ declaration.exitStatus ?? "Pendiente" }}</td>
              <td class="equipment-history-actions">
                <button class="equipment-open-button" type="button" @click="openDetails(declaration.id)">Abrir</button>
                <button
                  v-if="canDeleteDeclaration(declaration)"
                  class="equipment-delete-button"
                  type="button"
                  :disabled="deletingDeclarationId !== null"
                  :aria-label="`Eliminar declaración de ${declaration.personName}`"
                  @click="deleteDeclaration(declaration)"
                >
                  <svg v-if="deletingDeclarationId !== declaration.id" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14m-7-3h4l1 3H9l1-3Z" />
                  </svg>
                  <span>{{ deletingDeclarationId === declaration.id ? "Eliminando…" : "Eliminar" }}</span>
                </button>
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="6" class="workspace-empty">Cargando historial de declaraciones…</td>
            </tr>
            <tr v-else-if="declarations.length === 0">
              <td colspan="6" class="workspace-empty">No hay declaraciones. Crea una para enviar el enlace a la persona externa.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav
        v-if="declarationTotal > declarationPageSize"
        class="directory-pagination"
        aria-label="Paginación del historial de equipo"
      >
        <span>
          Mostrando {{ (declarationPage - 1) * declarationPageSize + 1 }}–{{
            Math.min(declarationPage * declarationPageSize, declarationTotal)
          }} de {{ declarationTotal }} declaraciones
        </span>
        <div>
          <button
            class="pagination-button"
            type="button"
            :disabled="declarationPage <= 1 || declarationsLoading"
            @click="declarationPage--"
          >Anterior</button>
          <span class="pagination-current" aria-live="polite">{{ declarationPage }} / {{ declarationPages }}</span>
          <button
            class="pagination-button"
            type="button"
            :disabled="declarationPage >= declarationPages || declarationsLoading"
            @click="declarationPage++"
          >Siguiente</button>
        </div>
      </nav>
    </section>

    <Teleport to="body">
      <div
        v-if="createOpen"
        class="dashboard-app dashboard-modal-backdrop modal-backdrop equipment-create-backdrop"
        :data-theme="props.theme"
        @click.self="createOpen = false"
      >
        <section class="dialog workspace-dialog equipment-dialog" role="dialog" aria-modal="true" aria-labelledby="equipment-create-title">
          <button class="dialog-close" type="button" aria-label="Cerrar" @click="createOpen = false"><svg class="icon"><use href="#i-close" /></svg></button>
          <span class="dialog-icon"><svg class="icon"><use href="#i-tool" /></svg></span>
          <h2 id="equipment-create-title">Crear declaración de equipo</h2>
          <p class="dialog-description">Selecciona una empresa y, si existe, vincula la declaración a una cita real.</p>
          <form v-if="!generatedLink" class="workspace-form modal-workspace-form equipment-create-form" @submit.prevent="createDeclaration">
            <label class="equipment-form-wide">
              Empresa
              <select v-model.number="businessPartnerId" required>
                <option :value="null" disabled>Selecciona empresa registrada</option>
                <option v-for="partner in partners" :key="partner.id" :value="partner.id">{{ partner.name }}</option>
              </select>
            </label>
            <label class="equipment-form-wide">
              Cita vinculada <span class="optional-field">(opcional)</span>
              <select v-model.number="appointmentId">
                <option :value="null">Sin cita</option>
                <option v-for="appointment in matchingAppointments" :key="appointment.id" :value="appointment.id">
                  {{ appointment.visitorName }} · {{ appointment.date }} {{ appointment.time }}
                </option>
              </select>
            </label>
            <label class="equipment-form-wide">
              Personal externo registrado <span class="optional-field">(opcional)</span>
              <select v-model.number="externalStaffId" :disabled="!businessPartnerId || appointmentId !== null">
                <option :value="null">Escribir nombre manualmente</option>
                <option v-for="person in matchingStaff" :key="person.id" :value="person.id">{{ person.fullName }}</option>
              </select>
            </label>
            <label v-if="externalStaffId === null" class="equipment-form-wide">
              Nombre de la persona
              <input v-model.trim="personName" maxlength="180" pattern=".*\S.*" autocomplete="name" required />
            </label>
            <p v-if="createError" class="equipment-alert equipment-form-wide" role="alert">{{ createError }}</p>
            <button class="button-primary workspace-submit" type="submit" :disabled="saving || !partners.length">
              {{ saving ? "Creando…" : "Crear enlace de declaración" }}
            </button>
          </form>
          <div v-else class="equipment-link-result">
            <p>Enlace listo para compartir. Caduca en 30 días.</p>
            <label>
              Enlace de declaración
              <input :value="generatedLink" readonly @focus="selectAllOnFocus" />
            </label>
            <button class="button-primary" type="button" @click="copyLink(generatedLink)">Copiar enlace</button>
            <p v-if="linkMessage" class="equipment-link-message" role="status">{{ linkMessage }}</p>
          </div>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="selectedDeclaration"
        class="dashboard-app modal-backdrop equipment-detail-backdrop"
        :data-theme="props.theme"
        @click.self="selectedDeclaration = null"
      >
        <section class="dialog workspace-dialog equipment-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="equipment-detail-title">
          <button class="dialog-close" type="button" aria-label="Cerrar" @click="selectedDeclaration = null"><svg class="icon"><use href="#i-close" /></svg></button>
          <span class="dialog-icon"><svg class="icon"><use href="#i-briefcase" /></svg></span>
          <h2 id="equipment-detail-title">{{ selectedDeclaration.personName }}</h2>
          <p class="dialog-description">{{ selectedDeclaration.companyName }}<template v-if="selectedDeclaration.visitDate"> · {{ selectedDeclaration.visitDate }} {{ selectedDeclaration.visitTime }}</template></p>
          <p v-if="errorMessage" class="equipment-alert" role="alert">{{ errorMessage }}</p>
          <p v-if="detailLoading" class="equipment-loading">Actualizando verificación…</p>

          <div v-if="selectedDeclaration.status === 'Pendiente'" class="equipment-detail-actions">
            <p class="equipment-hint">Falta que la persona envíe su declaración. Al renovar el enlace anterior dejará de funcionar.</p>
            <button class="button-secondary" type="button" @click="refreshLink(selectedDeclaration.id)">Generar / renovar enlace</button>
            <button class="equipment-revoke-button" type="button" @click="revokeLink(selectedDeclaration.id)">Revocar enlace</button>
            <div v-if="linkMessage" class="equipment-link-message" role="status">
              <template v-if="linkMessage.startsWith('http')">
                <input :value="linkMessage" readonly @focus="selectAllOnFocus" />
                <button class="button-secondary" type="button" @click="copyLink(linkMessage)">Copiar</button>
              </template>
              <span v-else>{{ linkMessage }}</span>
            </div>
          </div>

          <template v-if="selectedDeclaration.status === 'Enviada'">
            <div class="equipment-detail-actions">
              <button
                v-if="!getInspection('Entrada')"
                class="button-primary"
                type="button"
                :disabled="!selectedDeclaration.items?.length"
                @click="startInspection('entrada')"
              >Iniciar verificación de entrada</button>
              <span v-else class="equipment-status is-complete">Entrada: {{ getInspection('Entrada')?.completedAt }}</span>
              <button
                v-if="getInspection('Entrada') && !getInspection('Salida')"
                class="button-secondary"
                type="button"
                @click="startInspection('salida')"
              >Iniciar verificación de salida</button>
              <span v-else-if="getInspection('Salida')" class="equipment-status is-complete">
                Salida: {{ getInspection('Salida')?.completedAt }}
              </span>
            </div>
            <div class="workspace-table-scroll equipment-items-scroll">
              <table class="workspace-table equipment-detail-table">
                <thead><tr><th>Tipo</th><th>Cant.</th><th>Artículo declarado</th><th>Características</th><th>Observaciones</th></tr></thead>
                <tbody>
                  <tr v-for="item in paginatedDeclarationItems" :key="item.id">
                    <td>{{ item.itemType }}</td>
                    <td>{{ item.quantity }}</td>
                    <td>{{ item.product }}</td>
                    <td>{{ [item.brand, item.model, item.serialNumber, item.color].filter(Boolean).join(" · ") || "—" }}</td>
                    <td>{{ item.notes || "—" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <nav
              v-if="(selectedDeclaration.items?.length ?? 0) > declarationItemsPageSize"
              class="directory-pagination"
              aria-label="Paginación de artículos declarados"
            >
              <span>
                Mostrando {{ (declarationItemsPage - 1) * declarationItemsPageSize + 1 }}–{{
                  Math.min(declarationItemsPage * declarationItemsPageSize, selectedDeclaration.items?.length ?? 0)
                }} de {{ selectedDeclaration.items?.length ?? 0 }} artículos
              </span>
              <div>
                <button
                  class="pagination-button"
                  type="button"
                  :disabled="declarationItemsPage <= 1"
                  @click="declarationItemsPage--"
                >Anterior</button>
                <span class="pagination-current" aria-live="polite">{{ declarationItemsPage }} / {{ declarationItemsPages }}</span>
                <button
                  class="pagination-button"
                  type="button"
                  :disabled="declarationItemsPage >= declarationItemsPages"
                  @click="declarationItemsPage++"
                >Siguiente</button>
              </div>
            </nav>
            <div v-for="inspection in selectedDeclaration.inspections" :key="inspection.phase" class="equipment-inspection-history">
              <header class="equipment-inspection-history-heading">
                <span class="equipment-inspection-history-icon" aria-hidden="true">✓</span>
                <div>
                  <h3>Checklist de {{ inspection.phase.toLowerCase() }}</h3>
                  <p>{{ inspection.inspectorName }} · {{ inspection.completedAt }}</p>
                </div>
                <span
                  class="equipment-inspection-history-count"
                  :class="{ 'has-incidents': inspection.items.some((item) => item.result === 'Incidencia') }"
                >
                  {{ inspection.items.filter((item) => item.result === "Incidencia").length }} incidencias
                </span>
              </header>
              <div class="equipment-inspection-history-list">
                <article v-for="item in inspection.items" :key="item.declarationItemId">
                  <div class="equipment-inspection-history-item-copy">
                    <span>{{ item.declaredItemType }} · {{ item.checkedQuantity }} ×</span>
                    <strong>{{ item.checkedProduct }}</strong>
                    <small>{{ [item.checkedBrand, item.checkedModel, item.checkedSerialNumber, item.checkedColor].filter(Boolean).join(" · ") || "Sin identificación adicional" }}</small>
                    <p v-if="item.notes">{{ item.notes }}</p>
                    <strong v-if="item.keepAtReception" class="equipment-retention-status">
                      Mantener en recepción
                    </strong>
                    <strong
                      v-if="inspection.phase === 'Salida' && itemKeptAtReception(item.declarationItemId)"
                      class="equipment-retention-status"
                    >
                      {{ item.returnedToVisitor ? "Devuelto al visitante" : "Permanece en recepción" }}
                    </strong>
                  </div>
                  <span class="equipment-inspection-result" :class="item.result === 'Conforme' ? 'is-complete' : 'has-incident'">
                    {{ item.result }}
                  </span>
                </article>
              </div>
            </div>
          </template>

          <form v-if="inspectionPhase" class="equipment-inspection-form" @submit.prevent="saveInspection">
            <div class="equipment-checklist-heading">
              <div>
                <h3>Checklist de {{ inspectionLabel }}</h3>
                <p>Compara cada artículo físicamente. En la entrada, elige si puede ingresar o si se queda resguardado en recepción; ambas opciones confirman que fue verificado.</p>
              </div>
              <span class="equipment-checklist-progress">
                {{ checkedInspectionItems }} / {{ inspectionItems.length }} verificados
              </span>
            </div>
            <div
              class="equipment-checklist-progress-track"
              role="progressbar"
              :aria-valuenow="checkedInspectionItems"
              :aria-valuemin="0"
              :aria-valuemax="inspectionItems.length"
              :aria-label="`${checkedInspectionItems} de ${inspectionItems.length} artículos verificados`"
            >
              <span :style="{ width: `${inspectionItems.length ? checkedInspectionItems / inspectionItems.length * 100 : 0}%` }"></span>
            </div>
            <article
              v-for="(item, index) in inspectionItems"
              :key="item.declarationItemId"
              class="equipment-check-item"
              :class="{ 'is-checked': item.checked }"
            >
              <h4>
                {{ item.itemType }} ·
                {{ selectedDeclaration.items?.find((declared) => declared.id === item.declarationItemId)?.product }}
              </h4>
              <div class="equipment-check-readonly-grid">
                <div><span>Tipo</span><strong>{{ item.itemType }}</strong></div>
                <div><span>Cantidad</span><strong>{{ item.quantity }}</strong></div>
                <div><span>Producto</span><strong>{{ item.product }}</strong></div>
                <div><span>Marca</span><strong>{{ item.brand || "—" }}</strong></div>
                <div><span>Modelo</span><strong>{{ item.model || "—" }}</strong></div>
                <div><span>Serie</span><strong>{{ item.serialNumber || "—" }}</strong></div>
                <div><span>Color</span><strong>{{ item.color || "—" }}</strong></div>
              </div>
              <label class="equipment-notes-label">
                Observación (opcional)
                <textarea v-model.trim="item.notes" maxlength="1000" rows="2" placeholder="Escribe cualquier observación sobre este artículo." />
              </label>
              <fieldset v-if="inspectionPhase === 'entrada'" class="equipment-disposition-options">
                <legend>Decisión de entrada (selecciona una opción)</legend>
                <label
                  class="equipment-checked-toggle"
                  :class="{ 'is-checked': item.checked && !item.keepAtReception }"
                >
                  <input
                    type="radio"
                    :name="`equipment-entry-${item.declarationItemId}`"
                    :checked="item.checked && !item.keepAtReception"
                    @change="item.checked = true; item.keepAtReception = false"
                  />
                  <span>Verificado para ingresar</span>
                </label>
                <label
                  class="equipment-checked-toggle"
                  :class="{ 'is-checked': item.checked && item.keepAtReception }"
                >
                  <input
                    type="radio"
                    :name="`equipment-entry-${item.declarationItemId}`"
                    :checked="item.checked && item.keepAtReception"
                    @change="item.checked = true; item.keepAtReception = true"
                  />
                  <span>Verificado y mantener en recepción</span>
                </label>
              </fieldset>
              <label
                v-if="inspectionPhase === 'salida' && itemKeptAtReception(item.declarationItemId)"
                class="equipment-retain-toggle"
              >
                <input v-model="item.returnedToVisitor" type="checkbox" />
                Se devolvió al visitante
              </label>
              <label v-if="inspectionPhase === 'salida'" class="equipment-checked-toggle" :class="{ 'is-checked': item.checked }">
                <input v-model="item.checked" type="checkbox" />
                <span>{{ item.checked ? "Artículo revisado físicamente" : "Marcar como revisado" }}</span>
              </label>
            </article>
            <div class="equipment-inspection-actions">
              <button class="button-secondary" type="button" :disabled="saving" @click="inspectionPhase = null">Cancelar</button>
              <button class="button-primary" type="submit" :disabled="saving || checkedInspectionItems !== inspectionItems.length">
                {{ saving ? "Guardando…" : `Completar checklist (${checkedInspectionItems}/${inspectionItems.length})` }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Teleport>

  </section>
</template>
