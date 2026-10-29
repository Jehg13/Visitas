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
  visitorDeclaredIdRetained: boolean;
  receptionIdClaimStatus: "No aplica" | "Pendiente" | "Confirmada" | "No confirmada";
  receptionReceivedIdAt: string | null;
  receptionReceivedIdBy: string | null;
  idReturnedAt: string | null;
  idReturnedBy: string | null;
  entryChecklistComplete: boolean;
  exitChecklistComplete: boolean;
  createdAt: string;
  items: KioskItem[];
  audit: AuditEvent[];
  inspections: KioskInspection[];
};
type InspectionDraftItem = {
  itemId: number;
  result: "" | "Coincide" | "Faltante" | "Dañado";
  notes: string;
};

const props = defineProps<{
  selectedVisitorRecordId: number | null;
}>();
const emit = defineEmits<{
  movementSaved: [];
}>();

const registrations = ref<KioskRegistration[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const savingRegistrationId = ref<number | null>(null);
const registrationDetails = ref<KioskRegistration | null>(null);
const inspectionRegistration = ref<KioskRegistration | null>(null);
const inspectionPhase = ref<"Entrada" | "Salida" | null>(null);
const inspectionDraft = ref<InspectionDraftItem[]>([]);
const extraItemDescription = ref("");
const extraItems = ref<string[]>([]);
let registrationRequestInProgress = false;
const selectedRegistration = computed(() =>
  registrations.value.find(
    (registration) => registration.visitorRecordId === props.selectedVisitorRecordId,
  ) ?? null,
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
  action: "authorize" | "reject" | "receive-identification" | "deny-identification" | "return-identification",
) {
  if (savingRegistrationId.value !== null) return;
  const actionMessage = {
    authorize: "autorizar esta visita",
    reject: "rechazar esta visita",
    "receive-identification": "confirmar la recepción física de esta identificación",
    "deny-identification": "registrar que recepción no pudo confirmar el resguardo de esta identificación",
    "return-identification": "registrar la devolución de esta identificación",
  }[action];
  if (!await confirmUser(`¿Deseas ${actionMessage}?`, action === "deny-identification" ? "Registrar no confirmado" : "Confirmar acción")) return;

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
  inspectionRegistration.value = registration;
  inspectionPhase.value = phase;
  extraItemDescription.value = "";
  extraItems.value = [];
  inspectionDraft.value = registration.items.map((item) => ({
    itemId: item.id,
    result: "",
    notes: "",
  }));
}

function addExtraItem() {
  const description = extraItemDescription.value.trim();
  if (!description) {
    notifyUser("Describe el artículo extra antes de agregarlo.");
    return;
  }
  if (inspectionDraft.value.length + extraItems.value.length >= 100) {
    notifyUser("El checklist permite revisar hasta 100 artículos entre declarados y adicionales.");
    return;
  }
  if (description.length > 1000) {
    notifyUser("La descripción del artículo extra no debe superar 1000 caracteres.");
    return;
  }
  extraItems.value.push(description);
  extraItemDescription.value = "";
}

function closeChecklist() {
  inspectionPhase.value = null;
  inspectionRegistration.value = null;
  inspectionDraft.value = [];
  extraItems.value = [];
  extraItemDescription.value = "";
}

function checklistItem(itemId: number) {
  return inspectionRegistration.value?.items.find((item) => item.id === itemId);
}

async function completeChecklist(registration: KioskRegistration) {
  const phase = inspectionPhase.value;
  if (!phase || savingRegistrationId.value !== null) return;
  const uncheckedItem = inspectionDraft.value.find((item) => !item.result);
  if (uncheckedItem) {
    notifyUser("Revisa todos los artículos antes de completar el checklist.");
    return;
  }
  if (extraItemDescription.value.trim()) {
    notifyUser("Agrega o elimina el artículo extra escrito antes de completar el checklist.");
    return;
  }
  savingRegistrationId.value = registration.id;
  try {
    const response = await fetch(`/api/visitor-kiosk/registrations/${registration.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: phase === "Entrada" ? "complete-entry-checklist" : "complete-exit-checklist",
        items: [
          ...inspectionDraft.value.map((item) => ({
            itemId: item.itemId,
            result: item.result,
            notes: item.notes,
          })),
          ...extraItems.value.map((description) => ({
            itemId: null,
            result: "Extra" as const,
            notes: description,
          })),
        ],
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
      <div>
        <span class="daily-log-panel-kicker">REGISTRO MANUAL · FOLIO {{ selectedRegistration.folio }}</span>
        <h3 id="visitor-kiosk-inbox-title">Acciones de recepción</h3>
      </div>
      <button class="daily-log-secondary-button" type="button" :disabled="loading" @click="loadRegistrations()">
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
          <small>
            {{ selectedRegistration.visitorDeclaredIdRetained
              ? selectedRegistration.receptionIdClaimStatus === "Pendiente"
                ? "Pendiente de confirmar por recepción."
                : selectedRegistration.receptionIdClaimStatus === "No confirmada"
                  ? "Recepción no confirmó el resguardo; la visita sigue pendiente de autorización."
                  : `Recibida por ${selectedRegistration.receptionReceivedIdBy}${selectedRegistration.idReturnedAt ? ` · Devuelta por ${selectedRegistration.idReturnedBy}` : ""}`
              : "Presentada solo para verificación." }}
          </small>
        </div>
        <button
          v-if="selectedRegistration.visitorDeclaredIdRetained && selectedRegistration.receptionIdClaimStatus === 'Pendiente'"
          class="visitor-kiosk-reception-button is-identification"
          type="button"
          :disabled="savingRegistrationId === selectedRegistration.id"
          @click="processRegistration(selectedRegistration, 'receive-identification')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7" /></svg>
          Confirmar recepción
        </button>
        <button
          v-if="selectedRegistration.visitorDeclaredIdRetained && selectedRegistration.receptionIdClaimStatus === 'Pendiente'"
          class="visitor-kiosk-reception-button is-reject"
          type="button"
          :disabled="savingRegistrationId === selectedRegistration.id"
          @click="processRegistration(selectedRegistration, 'deny-identification')"
        >No se confirmó</button>
        <button
          v-if="selectedRegistration.receptionReceivedIdAt && !selectedRegistration.idReturnedAt"
          class="visitor-kiosk-reception-button is-identification"
          type="button"
          :disabled="savingRegistrationId === selectedRegistration.id"
          @click="processRegistration(selectedRegistration, 'return-identification')"
        >
          Registrar devolución
        </button>
      </div>
      <div
        v-if="selectedRegistration.authorizationStatus === 'Pendiente' &&
          (!selectedRegistration.visitorDeclaredIdRetained || selectedRegistration.receptionIdClaimStatus !== 'Pendiente')"
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
        <button class="daily-log-secondary-button" type="button" @click="registrationDetails = selectedRegistration">
          Ver detalle
        </button>
      </div>
      <ul>
        <li v-for="item in selectedRegistration.items" :key="item.id">
          <span>{{ item.type }} · {{ item.description }}</span>
          <small>Cantidad: {{ item.quantity }}</small>
        </li>
      </ul>
      <div class="daily-log-selection-action-group">
        <button
          v-if="selectedRegistration.authorizationStatus !== 'Rechazada' && !selectedRegistration.entryChecklistComplete"
          class="daily-log-selection-action"
          type="button"
          :disabled="savingRegistrationId === selectedRegistration.id"
          @click="openChecklist(selectedRegistration, 'Entrada')"
        >Revisar checklist de entrada</button>
        <button
          v-else-if="selectedRegistration.authorizationStatus === 'Autorizada' && !selectedRegistration.exitChecklistComplete"
          class="daily-log-selection-action is-exit"
          type="button"
          :disabled="savingRegistrationId === selectedRegistration.id"
          @click="openChecklist(selectedRegistration, 'Salida')"
        >Revisar checklist de salida</button>
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

  <div v-if="registrationDetails" class="modal-backdrop" @click.self="registrationDetails = null">
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
            <tr v-for="(item, index) in registrationDetails.items" :key="`${index}-${item.description}`">
              <td>{{ item.type }}</td>
              <td>{{ item.description }}</td>
              <td>{{ item.quantity }}</td>
              <td>{{ [item.brand, item.model, item.serialNumber, item.color].filter(Boolean).join(" · ") || "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
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

  <div v-if="inspectionPhase && inspectionRegistration" class="modal-backdrop" @click.self="savingRegistrationId === null && closeChecklist()">
    <section class="dialog workspace-dialog visitor-kiosk-detail" role="dialog" aria-modal="true" aria-labelledby="visitor-kiosk-checklist-title">
      <button class="dialog-close" type="button" aria-label="Cerrar" :disabled="savingRegistrationId !== null" @click="closeChecklist">
        <svg class="icon"><use href="#i-close" /></svg>
      </button>
      <span class="dialog-icon"><svg class="icon"><use href="#i-tool" /></svg></span>
      <h2 id="visitor-kiosk-checklist-title">Checklist de {{ inspectionPhase.toLowerCase() }}</h2>
      <p class="dialog-description">
        Revisa físicamente los artículos declarados antes de registrar {{ inspectionPhase === "Entrada" ? "el ingreso" : "la salida" }}.
      </p>
      <div v-if="inspectionDraft.length === 0" class="daily-log-empty">
        <p>El visitante declaró que no lleva equipos ni herramientas. Confirma la revisión para continuar.</p>
      </div>
      <div v-else class="visitor-kiosk-checklist-list">
        <article v-for="item in inspectionDraft" :key="item.itemId" class="visitor-kiosk-checklist-item">
          <div>
            <strong>{{ checklistItem(item.itemId)?.description }}</strong>
            <span>
              {{ checklistItem(item.itemId)?.type }}
              · Cantidad declarada:
              {{ checklistItem(item.itemId)?.quantity }}
            </span>
          </div>
          <label>
            Resultado
            <select v-model="item.result" required>
              <option value="" disabled>Selecciona</option>
              <option value="Coincide">Coincide</option>
              <option value="Faltante">Faltante</option>
              <option value="Dañado">Dañado</option>
            </select>
          </label>
          <label class="directory-form-full">
            Observaciones (opcional)
            <textarea v-model.trim="item.notes" maxlength="1000" rows="2"></textarea>
          </label>
        </article>
      </div>
      <div class="visitor-kiosk-extra-items">
        <label>
          Artículo adicional encontrado
          <input
            v-model="extraItemDescription"
            type="text"
            maxlength="1000"
            placeholder="Describe el equipo o herramienta extra"
            @keydown.enter.prevent="addExtraItem"
          />
        </label>
        <button class="button-secondary" type="button" @click="addExtraItem">Agregar artículo extra</button>
        <ul v-if="extraItems.length">
          <li v-for="(item, index) in extraItems" :key="`${index}-${item}`">
            <span>{{ item }}</span>
            <button type="button" :aria-label="`Quitar artículo extra ${item}`" @click="extraItems.splice(index, 1)">Quitar</button>
          </li>
        </ul>
      </div>
      <div class="equipment-inspection-actions">
        <button class="button-secondary" type="button" :disabled="savingRegistrationId !== null" @click="closeChecklist">Cancelar</button>
        <button
          class="button-primary"
          type="button"
          :disabled="savingRegistrationId !== null"
          @click="inspectionRegistration && completeChecklist(inspectionRegistration)"
        >{{ savingRegistrationId !== null ? "Guardando checklist…" : "Completar checklist" }}</button>
      </div>
    </section>
  </div>
</template>
