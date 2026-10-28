<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { notifyUser } from "../notifications";

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
  visitorName: string;
  companyName: string;
  visitReason: string;
  authorizationStatus: "Pendiente" | "Autorizada" | "Rechazada";
  identificationType: string;
  visitorDeclaredIdRetained: boolean;
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

const registrations = ref<KioskRegistration[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const savingRegistrationId = ref<number | null>(null);
const selectedRegistration = ref<KioskRegistration | null>(null);
const inspectionRegistration = ref<KioskRegistration | null>(null);
const inspectionPhase = ref<"Entrada" | "Salida" | null>(null);
const inspectionDraft = ref<InspectionDraftItem[]>([]);
const extraItemDescription = ref("");
const extraItems = ref<string[]>([]);
let refreshTimer: number | undefined;

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
    if (selectedRegistration.value) {
      selectedRegistration.value =
        result.registrations.find((registration) => registration.id === selectedRegistration.value?.id) ?? null;
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
  }
}

onMounted(() => {
  void loadRegistrations();
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") void loadRegistrations(true);
  }, 30000);
});

onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
});

async function processRegistration(
  registration: KioskRegistration,
  action: "authorize" | "reject" | "receive-identification" | "return-identification",
) {
  if (savingRegistrationId.value !== null) return;
  const actionMessage = {
    authorize: "autorizar esta visita",
    reject: "rechazar esta visita",
    "receive-identification": "confirmar la recepción física de esta identificación",
    "return-identification": "registrar la devolución de esta identificación",
  }[action];
  if (!window.confirm(`¿Deseas ${actionMessage}?`)) return;

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
  <section class="daily-log-panel visitor-kiosk-inbox" aria-labelledby="visitor-kiosk-inbox-title">
    <div class="daily-log-panel-heading">
      <div>
        <span class="daily-log-panel-kicker">RECEPCIÓN · AUTORREGISTRO</span>
        <h3 id="visitor-kiosk-inbox-title">Registros del kiosco</h3>
      </div>
      <button class="daily-log-secondary-button" type="button" :disabled="loading" @click="loadRegistrations()">
        Actualizar
      </button>
    </div>
    <p v-if="errorMessage" class="equipment-alert" role="alert">
      {{ errorMessage }}
      <button type="button" @click="loadRegistrations()">Reintentar</button>
    </p>
    <div v-if="loading && registrations.length === 0" class="daily-log-loading" role="status">
      Cargando registros…
    </div>
    <div v-else-if="registrations.length === 0" class="daily-log-empty">
      <h4>Aún no hay autorregistros</h4>
      <p>Los registros enviados desde el kiosco aparecerán aquí.</p>
    </div>
    <div v-else class="daily-log-table-scroll">
      <table class="daily-log-table visitor-kiosk-table">
        <thead>
          <tr>
            <th>Folio / hora</th>
            <th>Visitante</th>
            <th>Empresa / asunto</th>
            <th>Equipo / herramientas</th>
            <th>Identificación</th>
            <th>Autorización</th>
            <th><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="registration in registrations" :key="registration.id">
            <td><strong>{{ registration.folio }}</strong><small class="daily-log-table-date">{{ registration.createdAt }}</small></td>
            <td>{{ registration.visitorName }}</td>
            <td><strong>{{ registration.companyName }}</strong><small class="daily-log-table-date">{{ registration.visitReason }}</small></td>
            <td>
              <button
                class="equipment-open-button"
                type="button"
                @click="selectedRegistration = registration"
              >{{ registration.items.length ? `Ver ${registration.items.length} artículo(s)` : "Ver revisión" }}</button>
            </td>
            <td>
              <strong>{{ registration.identificationType }}</strong>
              <small class="daily-log-table-date">
                {{ registration.visitorDeclaredIdRetained ? "Visitante declara resguardo" : "Solo verificación" }}
              </small>
              <button
                v-if="registration.visitorDeclaredIdRetained && !registration.receptionReceivedIdAt"
                class="equipment-open-button"
                type="button"
                :disabled="savingRegistrationId === registration.id"
                @click="processRegistration(registration, 'receive-identification')"
              >Confirmar recepción</button>
              <small v-else-if="registration.receptionReceivedIdAt" class="daily-log-table-date">
                Recibida por {{ registration.receptionReceivedIdBy }}
                <template v-if="registration.idReturnedAt"> · Devuelta por {{ registration.idReturnedBy }}</template>
              </small>
              <button
                v-if="registration.receptionReceivedIdAt && !registration.idReturnedAt"
                class="equipment-open-button"
                type="button"
                :disabled="savingRegistrationId === registration.id"
                @click="processRegistration(registration, 'return-identification')"
              >Registrar devolución</button>
            </td>
            <td>
              <span class="daily-log-table-status" :class="`is-${registration.authorizationStatus === 'Pendiente' ? 'pendiente' : registration.authorizationStatus === 'Autorizada' ? 'dentro' : 'retirado'}`">
                {{ registration.authorizationStatus }}
              </span>
              <small class="daily-log-table-date">
                Entrada: {{ registration.entryChecklistComplete ? "Checklist completo" : "Pendiente de revisión" }}
                · Salida: {{ registration.exitChecklistComplete ? "Checklist completo" : "Pendiente" }}
              </small>
            </td>
            <td class="visitor-kiosk-actions-cell">
              <template v-if="registration.authorizationStatus === 'Pendiente'">
                <button
                  class="daily-log-selection-action"
                  type="button"
                  :disabled="savingRegistrationId === registration.id"
                  @click="processRegistration(registration, 'authorize')"
                >Autorizar</button>
                <button
                  class="daily-log-delete"
                  type="button"
                  :disabled="savingRegistrationId === registration.id"
                  @click="processRegistration(registration, 'reject')"
                >Rechazar</button>
              </template>
              <button
                v-if="registration.authorizationStatus !== 'Rechazada' && !registration.entryChecklistComplete"
                class="daily-log-selection-action"
                type="button"
                :disabled="savingRegistrationId === registration.id"
                @click="openChecklist(registration, 'Entrada')"
              >Revisar entrada</button>
              <button
                v-else-if="registration.authorizationStatus === 'Autorizada' && !registration.exitChecklistComplete"
                class="daily-log-selection-action"
                type="button"
                :disabled="savingRegistrationId === registration.id"
                @click="openChecklist(registration, 'Salida')"
              >Revisar salida</button>
              <span v-else-if="registration.exitChecklistComplete">Salida registrada</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <div v-if="selectedRegistration" class="modal-backdrop" @click.self="selectedRegistration = null">
    <section class="dialog workspace-dialog visitor-kiosk-detail" role="dialog" aria-modal="true" aria-labelledby="visitor-kiosk-detail-title">
      <button class="dialog-close" type="button" aria-label="Cerrar" @click="selectedRegistration = null">
        <svg class="icon"><use href="#i-close" /></svg>
      </button>
      <span class="dialog-icon"><svg class="icon"><use href="#i-tool" /></svg></span>
      <h2 id="visitor-kiosk-detail-title">Equipo y herramientas · {{ selectedRegistration.folio }}</h2>
      <p class="dialog-description">{{ selectedRegistration.visitorName }} · {{ selectedRegistration.companyName }}</p>
      <div class="daily-log-table-scroll">
        <table class="workspace-table">
          <thead><tr><th>Tipo</th><th>Descripción</th><th>Cantidad</th><th>Marca / modelo / serie / color</th></tr></thead>
          <tbody>
            <tr v-for="(item, index) in selectedRegistration.items" :key="`${index}-${item.description}`">
              <td>{{ item.type }}</td>
              <td>{{ item.description }}</td>
              <td>{{ item.quantity }}</td>
              <td>{{ [item.brand, item.model, item.serialNumber, item.color].filter(Boolean).join(" · ") || "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Checklists de entrada y salida</h3>
      <p v-if="selectedRegistration.inspections.length === 0" class="dialog-description">
        Aún no se han completado revisiones de artículos.
      </p>
      <ul v-else class="visitor-kiosk-audit-list">
        <li v-for="inspection in selectedRegistration.inspections" :key="inspection.id">
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
        <li v-for="(event, index) in selectedRegistration.audit" :key="`${event.created_at}-${index}`">
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
