<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { confirmUser, notifyUser } from "../notifications";

type KioskItem = {
  id: number;
  type: "Equipo" | "Herramienta";
  description: string;
  brand: string;
  model: string;
  serialNumber: string;
  color: string;
  quantity: number;
};

type AuditEvent = {
  action: string;
  actor_name: string;
  details: string | null;
  created_at: string;
};
type KioskInspectionResult = {
  itemId: number | null;
  description: string;
  result: "Coincide" | "Faltante" | "Dañado" | "Extra" | "Conforme" | "Incidencia";
  notes: string;
  keepAtReception: boolean;
  returnedToVisitor: boolean;
};
type KioskInspection = {
  id: number;
  phase: "Entrada" | "Salida";
  inspectorName: string;
  completedAt: string;
  items: KioskInspectionResult[];
};

type KioskRegistration = {
  id: number;
  folio: string;
  visitorRecordId: number;
  visitorName: string;
  companyName: string;
  visitReason: string;
  authorizationStatus: "Pendiente" | "Autorizada" | "Rechazada";
  identificationType: string;
  entryChecklistComplete: boolean;
  exitChecklistComplete: boolean;
  createdAt: string;
  items: KioskItem[];
  audit: AuditEvent[];
  inspections: KioskInspection[];
};
type InspectionDraftItem = {
  itemId: number;
  notes: string;
  checked: boolean;
  keepAtReception: boolean;
  returnedToVisitor: boolean;
};

const props = defineProps<{
  selectedVisitorRecordId: number | null;
  isAdmin: boolean;
  theme: "dark" | "light";
}>();
const emit = defineEmits<{
  movementSaved: [];
}>();

const registrations = ref<KioskRegistration[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const savingRegistrationId = ref<number | null>(null);
const registrationDetails = ref<KioskRegistration | null>(null);
const registrationItemsPage = ref(1);
const registrationItemsPageSize = 7;
const inspectionRegistration = ref<KioskRegistration | null>(null);
const inspectionPhase = ref<"Entrada" | "Salida" | null>(null);
const inspectionDraft = ref<InspectionDraftItem[]>([]);
const entryPolicyConfirmed = ref(false);
let registrationRequestInProgress = false;
const selectedRegistration = computed(() =>
  registrations.value.find(
    (registration) => registration.visitorRecordId === props.selectedVisitorRecordId,
  ) ?? null,
);
const selectedRegistrationIsReadOnly = computed(() =>
  Boolean(
    selectedRegistration.value &&
    !props.isAdmin &&
    selectedRegistration.value.createdAt.slice(0, 10) !== getLocalDate(),
  ),
);
function getLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function itemKeptAtReception(registration: KioskRegistration | null, itemId: number) {
  return registration?.inspections
    .find((inspection) => inspection.phase === "Entrada")
    ?.items.some((item) => item.itemId === itemId && item.keepAtReception) ?? false;
}
function checklistItemKeptAtReception(itemId: number) {
  return inspectionRegistration.value?.inspections
    .find((inspection) => inspection.phase === "Entrada")
    ?.items.some((item) => item.itemId === itemId && item.keepAtReception) ?? false;
}
const checkedInspectionItems = computed(() =>
  inspectionDraft.value.filter((item) => item.checked).length,
);
const paginatedRegistrationItems = computed(() =>
  (registrationDetails.value?.items ?? []).slice(
    (registrationItemsPage.value - 1) * registrationItemsPageSize,
    registrationItemsPage.value * registrationItemsPageSize,
  ),
);
const registrationItemsPages = computed(() =>
  Math.max(1, Math.ceil((registrationDetails.value?.items.length ?? 0) / registrationItemsPageSize)),
);
async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("No se pudo conectar con el módulo de autorregistro.");
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error("El servidor devolvió una respuesta de autorregistro inválida.");
  }
}

async function loadRegistrations(silent = false) {
  if (registrationRequestInProgress) return;
  registrationRequestInProgress = true;
  try {
    const response = await fetch("/api/visitor-kiosk/registrations");
    const result = await parseResponse<{
      registrations?: KioskRegistration[];
      error?: string;
    }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar los autorregistros.");
    if (!Array.isArray(result.registrations)) {
      throw new Error("El servidor devolvió una lista de autorregistros inválida.");
    }
    registrations.value = result.registrations;
    errorMessage.value = "";
    if (registrationDetails.value) {
      registrationDetails.value =
        result.registrations.find((registration) => registration.id === registrationDetails.value?.id) ?? null;
    }
    if (inspectionRegistration.value) {
      inspectionRegistration.value =
        result.registrations.find((registration) => registration.id === inspectionRegistration.value?.id) ?? null;
      if (!inspectionRegistration.value) inspectionPhase.value = null;
    }
  } catch (error) {
    console.error("No se pudieron cargar los registros del kiosco:", error);
    if (!silent) {
      errorMessage.value = error instanceof Error ? error.message : "No se pudieron cargar los autorregistros.";
    }
  } finally {
    loading.value = false;
    registrationRequestInProgress = false;
  }
}

function refreshRegistrationsAfterRealtimeUpdate() {
  if (document.visibilityState === "visible") void loadRegistrations(true);
}

onMounted(() => {
  void loadRegistrations();
  window.addEventListener("visitas:data-changed", refreshRegistrationsAfterRealtimeUpdate);
});

onBeforeUnmount(() => {
  window.removeEventListener("visitas:data-changed", refreshRegistrationsAfterRealtimeUpdate);
});

async function processRegistration(
  registration: KioskRegistration,
  action: "authorize" | "reject",
) {
  if (savingRegistrationId.value !== null || selectedRegistrationIsReadOnly.value) return;
  const actionMessage = {
    authorize: "autorizar esta visita",
    reject: "rechazar esta visita",
  }[action];
  if (!await confirmUser(`¿Deseas ${actionMessage}?`, "Confirmar acción")) return;

  savingRegistrationId.value = registration.id;
  try {
    const response = await fetch(`/api/visitor-kiosk/registrations/${registration.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await parseResponse<{ error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo procesar el registro.");
    await loadRegistrations();
    emit("movementSaved");
    notifyUser("La acción se registró correctamente.", "success");
  } catch (error) {
    console.error("No se pudo procesar el autorregistro:", error);
    notifyUser(error instanceof Error ? error.message : "No se pudo procesar el registro.");
  } finally {
    savingRegistrationId.value = null;
  }
}

function openChecklist(registration: KioskRegistration, phase: "Entrada" | "Salida") {
  if (selectedRegistrationIsReadOnly.value) return;
  inspectionRegistration.value = registration;
  inspectionPhase.value = phase;
  entryPolicyConfirmed.value = false;
  inspectionDraft.value = registration.items.map((item) => ({
    itemId: item.id,
    notes: "",
    checked: false,
    keepAtReception: false,
    returnedToVisitor: false,
  }));
}

function closeChecklist() {
  inspectionPhase.value = null;
  inspectionRegistration.value = null;
  inspectionDraft.value = [];
  entryPolicyConfirmed.value = false;
}

function checklistItem(itemId: number) {
  return inspectionRegistration.value?.items.find((item) => item.id === itemId);
}

async function completeChecklist(registration: KioskRegistration) {
  const phase = inspectionPhase.value;
  if (!phase || savingRegistrationId.value !== null || selectedRegistrationIsReadOnly.value) return;
  const uncheckedItem = inspectionDraft.value.find((item) => !item.checked);
  if (uncheckedItem) {
    notifyUser("Marca la verificación física de todos los artículos antes de completar el checklist.");
    return;
  }
  if (phase === "Entrada" && !entryPolicyConfirmed.value) {
    notifyUser("Confirma que no ingresará equipo ni herramientas que no estén registrados.");
    return;
  }
  savingRegistrationId.value = registration.id;
  try {
    const response = await fetch(`/api/visitor-kiosk/registrations/${registration.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: phase === "Entrada" ? "complete-entry-checklist" : "complete-exit-checklist",
        items: inspectionDraft.value.map((item) => ({
          itemId: item.itemId,
          result: "Coincide",
          notes: item.notes,
          checked: item.checked,
          keepAtReception: phase === "Entrada" && item.keepAtReception,
          returnedToVisitor: phase === "Salida" && item.returnedToVisitor,
        })),
      }),
    });
    const result = await parseResponse<{ error?: string; message?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo completar el checklist.");
    closeChecklist();
    await loadRegistrations();
    emit("movementSaved");
    notifyUser(
      result.message ?? `Checklist de ${phase.toLowerCase()} completado.`,
      "success",
    );
  } catch (error) {
    console.error("No se pudo guardar el checklist del visitante:", error);
    notifyUser(error instanceof Error ? error.message : "No se pudo completar el checklist.");
  } finally {
    savingRegistrationId.value = null;
  }
}
</script>

<template>
  <section
    v-if="selectedRegistration"
    class="daily-log-panel visitor-kiosk-inbox"
    aria-labelledby="visitor-kiosk-inbox-title"
  >
    <div class="daily-log-panel-heading">
      <div class="visitor-kiosk-inbox-title-copy">
        <div class="visitor-kiosk-inbox-meta">
          <span class="daily-log-panel-kicker">REGISTRO MANUAL</span>
          <span class="visitor-kiosk-inbox-folio">Folio {{ selectedRegistration.folio }}</span>
        </div>
        <h2 id="visitor-kiosk-inbox-title">Acciones de recepción</h2>
      </div>
      <button class="daily-log-secondary-button visitor-kiosk-inbox-refresh" type="button" :disabled="loading" @click="loadRegistrations()">
        Actualizar
      </button>
    </div>
    <p v-if="errorMessage" class="equipment-alert" role="alert">
      {{ errorMessage }}
      <button type="button" @click="loadRegistrations()">Reintentar</button>
    </p>
    <div class="visitor-kiosk-reception-summary">
      <div class="visitor-kiosk-reception-overview">
        <div>
          <span class="visitor-kiosk-reception-label">Estado de autorización</span>
          <span
            class="daily-log-table-status"
            :class="`is-${selectedRegistration.authorizationStatus === 'Pendiente' ? 'pendiente' : selectedRegistration.authorizationStatus === 'Autorizada' ? 'dentro' : 'retirado'}`"
          >{{ selectedRegistration.authorizationStatus }}</span>
        </div>
        <div>
          <span class="visitor-kiosk-reception-label">Procedencia</span>
          <strong>{{ selectedRegistration.companyName }}</strong>
        </div>
        <div>
          <span class="visitor-kiosk-reception-label">Motivo de visita</span>
          <strong>{{ selectedRegistration.visitReason }}</strong>
        </div>
      </div>
      <div class="visitor-kiosk-reception-identification">
        <span class="visitor-kiosk-reception-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16a3 3 0 0 1 6 0m3-5h3m-3 3h3" /></svg>
        </span>
        <div class="visitor-kiosk-reception-identification-copy">
          <span class="visitor-kiosk-reception-label">Identificación presentada</span>
          <strong>{{ selectedRegistration.identificationType }}</strong>
        </div>
      </div>
      <p v-if="selectedRegistrationIsReadOnly" class="daily-log-readonly-notice" role="status">
        <span class="daily-log-readonly-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        </span>
        <span class="daily-log-readonly-copy">
          <strong>Registro anterior en modo lectura</strong>
          <span>Solo Administración puede modificar autorizaciones y checklists de días anteriores.</span>
        </span>
      </p>
      <div
        v-if="selectedRegistration.authorizationStatus === 'Pendiente' && !selectedRegistrationIsReadOnly"
        class="visitor-kiosk-reception-authorization"
      >
        <span class="visitor-kiosk-reception-label">Revisión de recepción</span>
        <div class="visitor-kiosk-reception-actions">
          <button
            class="visitor-kiosk-reception-button is-authorize"
            type="button"
            :disabled="savingRegistrationId === selectedRegistration.id"
            @click="processRegistration(selectedRegistration, 'authorize')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
            Autorizar visita
          </button>
          <button
            class="visitor-kiosk-reception-button is-reject"
            type="button"
            :disabled="savingRegistrationId === selectedRegistration.id"
            @click="processRegistration(selectedRegistration, 'reject')"
          >Rechazar</button>
        </div>
      </div>
    </div>
    <div v-if="selectedRegistration.items.length > 0" class="visitor-kiosk-reception-equipment">
      <div class="visitor-kiosk-reception-equipment-heading">
        <div>
          <strong>Equipo y herramientas</strong>
          <small>{{ selectedRegistration.items.length }} artículo(s) declarado(s)</small>
        </div>
        <button
          class="daily-log-secondary-button"
          type="button"
          @click="registrationDetails = selectedRegistration; registrationItemsPage = 1"
        >
          Ver detalle
        </button>
      </div>
      <ul>
        <li v-for="item in selectedRegistration.items" :key="item.id">
          <span>
            {{ item.type }} · {{ item.description }}
            <small v-if="itemKeptAtReception(selectedRegistration, item.id)" class="equipment-retention-status">
              Mantener en recepción
            </small>
          </span>
          <small>Cantidad: {{ item.quantity }}</small>
        </li>
      </ul>
      <div class="daily-log-selection-action-group">
        <button
          v-if="selectedRegistration.authorizationStatus === 'Autorizada' && !selectedRegistration.entryChecklistComplete && !selectedRegistrationIsReadOnly"
          class="daily-log-selection-action"
          type="button"
          :disabled="savingRegistrationId === selectedRegistration.id"
          @click="openChecklist(selectedRegistration, 'Entrada')"
        >Revisar checklist de entrada</button>
        <span v-else-if="selectedRegistration.authorizationStatus === 'Pendiente'">
          Autoriza la visita para habilitar el checklist de entrada.
        </span>
        <button
          v-else-if="selectedRegistration.authorizationStatus === 'Autorizada' && !selectedRegistration.exitChecklistComplete && !selectedRegistrationIsReadOnly"
          class="daily-log-selection-action is-exit"
          type="button"
          :disabled="savingRegistrationId === selectedRegistration.id"
          @click="openChecklist(selectedRegistration, 'Salida')"
        >Revisar checklist de salida</button>
        <span v-else-if="selectedRegistrationIsReadOnly">
          Registro de un día anterior: consulta únicamente.
        </span>
        <span v-else-if="selectedRegistration.exitChecklistComplete">Checklists completados</span>
      </div>
    </div>
  </section>
  <p v-else-if="selectedVisitorRecordId !== null && loading" class="daily-log-loading" role="status">
    Cargando las acciones del registro manual…
  </p>
  <p v-else-if="selectedVisitorRecordId !== null && errorMessage" class="equipment-alert" role="alert">
    {{ errorMessage }}
    <button type="button" @click="loadRegistrations()">Reintentar</button>
  </p>

  <Teleport to="body">
    <div
      v-if="registrationDetails"
      class="dashboard-app modal-backdrop visitor-kiosk-detail-backdrop"
      :data-theme="props.theme"
      @click.self="registrationDetails = null"
    >
      <section class="dialog workspace-dialog visitor-kiosk-detail" role="dialog" aria-modal="true" aria-labelledby="visitor-kiosk-detail-title">
        <button class="dialog-close" type="button" aria-label="Cerrar" @click="registrationDetails = null">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <span class="dialog-icon"><svg class="icon"><use href="#i-tool" /></svg></span>
        <h2 id="visitor-kiosk-detail-title">Equipo y herramientas · {{ registrationDetails.folio }}</h2>
        <p class="dialog-description">{{ registrationDetails.visitorName }} · {{ registrationDetails.companyName }}</p>
        <div class="daily-log-table-scroll">
          <table class="workspace-table">
            <thead><tr><th>Tipo</th><th>Descripción</th><th>Cantidad</th><th>Marca / modelo / serie / color</th></tr></thead>
            <tbody>
              <tr v-for="(item, index) in paginatedRegistrationItems" :key="`${index}-${item.description}`">
                <td>{{ item.type }}</td>
                <td>{{ item.description }}</td>
                <td>{{ item.quantity }}</td>
                <td>{{ [item.brand, item.model, item.serialNumber, item.color].filter(Boolean).join(" · ") || "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <nav
          v-if="registrationDetails.items.length > registrationItemsPageSize"
          class="directory-pagination"
          aria-label="Paginación de artículos del registro"
        >
          <span>
            Mostrando {{ (registrationItemsPage - 1) * registrationItemsPageSize + 1 }}–{{
              Math.min(registrationItemsPage * registrationItemsPageSize, registrationDetails.items.length)
            }} de {{ registrationDetails.items.length }} artículos
          </span>
          <div>
            <button
              class="pagination-button"
              type="button"
              :disabled="registrationItemsPage <= 1"
              @click="registrationItemsPage--"
            >Anterior</button>
            <span class="pagination-current" aria-live="polite">{{ registrationItemsPage }} / {{ registrationItemsPages }}</span>
            <button
              class="pagination-button"
              type="button"
              :disabled="registrationItemsPage >= registrationItemsPages"
              @click="registrationItemsPage++"
            >Siguiente</button>
          </div>
        </nav>
        <h3>Checklists de entrada y salida</h3>
        <p v-if="registrationDetails.inspections.length === 0" class="dialog-description">
          Aún no se han completado revisiones de artículos.
        </p>
        <ul v-else class="visitor-kiosk-audit-list">
          <li v-for="inspection in registrationDetails.inspections" :key="inspection.id">
            <strong>Checklist de {{ inspection.phase.toLowerCase() }}</strong>
            <span>{{ inspection.inspectorName }} · {{ inspection.completedAt }}</span>
            <small v-if="inspection.items.length === 0">Sin artículos; revisión confirmada.</small>
            <ul v-else class="visitor-kiosk-inspection-results">
              <li v-for="(item, index) in inspection.items" :key="`${inspection.id}-${index}`">
                <strong>{{ item.description }}</strong>
                <span>{{ item.result }}<template v-if="item.notes"> · {{ item.notes }}</template></span>
                <small v-if="item.keepAtReception" class="equipment-retention-status">
                  Mantener en recepción
                </small>
                <small
                  v-if="inspection.phase === 'Salida' && itemKeptAtReception(registrationDetails, item.itemId ?? 0)"
                  class="equipment-retention-status"
                >
                  {{ item.returnedToVisitor ? "Devuelto al visitante" : "Permanece en recepción" }}
                </small>
              </li>
            </ul>
          </li>
        </ul>
        <h3>Historial de acciones</h3>
        <ul class="visitor-kiosk-audit-list">
          <li v-for="(event, index) in registrationDetails.audit" :key="`${event.created_at}-${index}`">
            <strong>{{ event.action }}</strong>
            <span>{{ event.actor_name }} · {{ event.created_at }}</span>
            <small v-if="event.details">{{ event.details }}</small>
          </li>
        </ul>
      </section>
    </div>
  </Teleport>

  <Teleport to="body">
  <div
    v-if="inspectionPhase && inspectionRegistration"
    class="dashboard-app dashboard-modal-backdrop modal-backdrop visitor-kiosk-checklist-backdrop"
    :data-theme="props.theme"
    @click.self="savingRegistrationId === null && closeChecklist()"
  >
    <section class="dialog workspace-dialog visitor-kiosk-detail visitor-kiosk-checklist-dialog" role="dialog" aria-modal="true" aria-labelledby="visitor-kiosk-checklist-title">
      <button class="dialog-close" type="button" aria-label="Cerrar" :disabled="savingRegistrationId !== null" @click="closeChecklist">
        <svg class="icon"><use href="#i-close" /></svg>
      </button>
      <header class="visitor-kiosk-checklist-header">
        <span class="dialog-icon"><svg class="icon"><use href="#i-tool" /></svg></span>
        <div class="visitor-kiosk-checklist-title-copy">
          <span class="visitor-kiosk-checklist-eyebrow">CONTROL DE EQUIPO Y HERRAMIENTAS</span>
          <h2 id="visitor-kiosk-checklist-title">Checklist de {{ inspectionPhase.toLowerCase() }}</h2>
          <div class="visitor-kiosk-checklist-visitor">
            <strong>{{ inspectionRegistration.visitorName }}</strong>
            <span>Folio {{ inspectionRegistration.folio }}</span>
          </div>
        </div>
      </header>
      <form class="equipment-inspection-form visitor-kiosk-inspection-form" @submit.prevent="completeChecklist(inspectionRegistration)">
        <div class="equipment-checklist-heading">
          <span class="visitor-kiosk-checklist-section-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
          </span>
          <div>
            <h3>Verificación de {{ inspectionPhase.toLowerCase() }}</h3>
            <p>Compara cada artículo declarado con el equipo físico antes de continuar.</p>
          </div>
          <span class="equipment-checklist-progress">
            {{ checkedInspectionItems }} / {{ inspectionDraft.length }} verificados
          </span>
        </div>
        <p class="visitor-kiosk-checklist-notice">
          <template v-if="inspectionPhase === 'Entrada'">
            Solo puede ingresar equipo o herramientas registrados. Después de verificar cada artículo, elige una opción: permitir su ingreso o mantenerlo resguardado en recepción.
          </template>
          <template v-else>
            Verifica cada artículo a la salida. Si quedó bajo resguardo en recepción, confirma si ya fue devuelto al visitante.
          </template>
        </p>
        <div
          class="equipment-checklist-progress-track"
          role="progressbar"
          :aria-valuenow="checkedInspectionItems"
          :aria-valuemin="0"
          :aria-valuemax="inspectionDraft.length"
          :aria-label="`${checkedInspectionItems} de ${inspectionDraft.length} artículos verificados`"
        >
          <span :style="{ width: `${inspectionDraft.length ? checkedInspectionItems / inspectionDraft.length * 100 : 0}%` }"></span>
        </div>
        <article
          v-for="item in inspectionDraft"
          :key="item.itemId"
          class="equipment-check-item"
          :class="{ 'is-checked': item.checked }"
        >
          <h4>{{ checklistItem(item.itemId)?.type }} · {{ checklistItem(item.itemId)?.description }}</h4>
          <div class="equipment-check-readonly-grid">
            <div><span>Tipo</span><strong>{{ checklistItem(item.itemId)?.type }}</strong></div>
            <div><span>Cantidad</span><strong>{{ checklistItem(item.itemId)?.quantity }}</strong></div>
            <div><span>Artículo</span><strong>{{ checklistItem(item.itemId)?.description }}</strong></div>
            <div><span>Marca</span><strong>{{ checklistItem(item.itemId)?.brand || "—" }}</strong></div>
            <div><span>Modelo</span><strong>{{ checklistItem(item.itemId)?.model || "—" }}</strong></div>
            <div><span>Serie</span><strong>{{ checklistItem(item.itemId)?.serialNumber || "—" }}</strong></div>
            <div><span>Color</span><strong>{{ checklistItem(item.itemId)?.color || "—" }}</strong></div>
          </div>
          <label class="equipment-notes-label">
            Observación (opcional)
            <textarea v-model.trim="item.notes" maxlength="1000" rows="2" placeholder="Escribe cualquier observación sobre este artículo." />
          </label>
          <fieldset v-if="inspectionPhase === 'Entrada'" class="equipment-disposition-options">
            <legend>Decisión de entrada (selecciona una opción)</legend>
            <label
              class="equipment-checked-toggle"
              :class="{ 'is-checked': item.checked && !item.keepAtReception }"
            >
              <input
                type="radio"
                :name="`visitor-entry-${item.itemId}`"
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
                :name="`visitor-entry-${item.itemId}`"
                :checked="item.checked && item.keepAtReception"
                @change="item.checked = true; item.keepAtReception = true"
              />
              <span>Verificado y mantener en recepción</span>
            </label>
          </fieldset>
          <label
            v-else-if="checklistItemKeptAtReception(item.itemId)"
            class="equipment-retain-toggle"
          >
            <input v-model="item.returnedToVisitor" type="checkbox" />
            Se devolvió al visitante
          </label>
          <label v-if="inspectionPhase === 'Salida'" class="equipment-checked-toggle" :class="{ 'is-checked': item.checked }">
            <input v-model="item.checked" type="checkbox" />
            <span>{{ item.checked ? "Artículo revisado físicamente" : "Marcar como revisado" }}</span>
          </label>
        </article>
        <label
          v-if="inspectionPhase === 'Entrada'"
          class="equipment-checked-toggle"
          :class="{ 'is-checked': entryPolicyConfirmed }"
        >
          <input v-model="entryPolicyConfirmed" type="checkbox" />
          <span>Confirmo que no ingresará equipo ni herramientas que no estén registrados.</span>
        </label>
        <div class="equipment-inspection-actions">
          <button class="button-secondary" type="button" :disabled="savingRegistrationId !== null" @click="closeChecklist">Cancelar</button>
          <button
            class="button-primary"
            type="submit"
            :disabled="savingRegistrationId !== null || checkedInspectionItems !== inspectionDraft.length || (inspectionPhase === 'Entrada' && !entryPolicyConfirmed)"
          >{{ savingRegistrationId !== null ? "Guardando checklist…" : `Completar checklist (${checkedInspectionItems}/${inspectionDraft.length})` }}</button>
        </div>
      </form>
    </section>
  </div>
  </Teleport>
</template>
