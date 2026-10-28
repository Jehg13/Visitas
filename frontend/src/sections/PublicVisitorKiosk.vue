<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type KioskItem = {
  type: "Equipo" | "Herramienta";
  description: string;
  brand: string;
  model: string;
  serialNumber: string;
  color: string;
  quantity: number;
};

type RegistrationResult = {
  folio: string;
  visitorName: string;
};

const identificationTypes = [
  "INE",
  "Gafete",
  "Pasaporte",
  "Licencia de conducir",
  "Otra identificación",
];
const existingCompanies = ref<string[]>([]);
const step = ref(0);
const sending = ref(false);
const errorMessage = ref("");
const fieldErrors = ref<Record<string, string>>({});
const visitorName = ref("");
const companyName = ref("");
const visitReason = ref("");
const carriesItems = ref<boolean | null>(null);
const items = ref<KioskItem[]>([]);
const itemDraft = ref<KioskItem>(newItem());
const identificationType = ref("");
const declaresIdRetained = ref<boolean | null>(null);
const informationConfirmed = ref(false);
const completed = ref<RegistrationResult | null>(null);
const completedStatus = ref<"waiting" | "entered" | "rejected">("waiting");
const completedStatusError = ref("");
const requestIdempotencyKey = ref(crypto.randomUUID());
let resetTimer: number | undefined;
let statusPollingTimer: number | undefined;
let statusRequestInProgress = false;

const progress = computed(() => Math.min(step.value, 4));
const hasValidDraft = computed(() =>
  itemDraft.value.description.trim().length > 0 &&
  Number.isSafeInteger(itemDraft.value.quantity) &&
  itemDraft.value.quantity >= 1 &&
  itemDraft.value.quantity <= 999,
);

function newItem(): KioskItem {
  return {
    type: "Equipo",
    description: "",
    brand: "",
    model: "",
    serialNumber: "",
    color: "",
    quantity: 1,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("No se pudo conectar con el servicio de registro.");
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error("El servidor devolvió una respuesta inválida.");
  }
}

onMounted(async () => {
  try {
    const response = await fetch("/api/visitor-kiosk/options");
    const result = await parseResponse<{ companies?: string[]; error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar las empresas.");
    if (!Array.isArray(result.companies) || !result.companies.every((company) => typeof company === "string")) {
      throw new Error("La lista de empresas recibida no es válida.");
    }
    existingCompanies.value = result.companies;
  } catch (error) {
    console.error("No se pudieron cargar las opciones públicas del kiosco:", error);
    errorMessage.value = error instanceof Error
      ? error.message
      : "No se pudieron cargar las empresas. Puedes continuar como público general.";
  }
});

onBeforeUnmount(() => {
  if (resetTimer !== undefined) window.clearTimeout(resetTimer);
  if (statusPollingTimer !== undefined) window.clearInterval(statusPollingTimer);
});

function clearErrors() {
  fieldErrors.value = {};
  errorMessage.value = "";
}

function validateVisitor() {
  const errors: Record<string, string> = {};
  if (!visitorName.value.trim()) errors.visitorName = "Escribe tu nombre completo.";
  else if (visitorName.value.trim().length > 180) errors.visitorName = "Usa máximo 180 caracteres.";
  if (!visitReason.value.trim()) errors.visitReason = "Indica el asunto o motivo de tu visita.";
  else if (visitReason.value.trim().length > 500) errors.visitReason = "Usa máximo 500 caracteres.";
  if (!companyName.value.trim()) errors.companyName = "Selecciona o escribe una empresa, o indica que eres público general.";
  else if (companyName.value.trim().length > 180) errors.companyName = "Usa máximo 180 caracteres.";
  fieldErrors.value = errors;
  return Object.keys(errors).length === 0;
}

function continueStep() {
  clearErrors();
  if (step.value === 1 && !validateVisitor()) return;
  if (step.value === 2) {
    if (carriesItems.value === null) {
      fieldErrors.value = { carriesItems: "Selecciona una de las opciones para continuar." };
      return;
    }
    if (carriesItems.value && items.value.length === 0) {
      fieldErrors.value = { items: "Agrega al menos un equipo o herramienta, o selecciona que no llevas artículos." };
      return;
    }
  }
  if (step.value === 3) {
    const errors: Record<string, string> = {};
    if (!identificationTypes.includes(identificationType.value)) {
      errors.identificationType = "Selecciona el tipo de identificación presentada.";
    }
    if (declaresIdRetained.value === null) {
      errors.declaresIdRetained = "Indica si declaras haber entregado tu identificación para resguardo.";
    }
    fieldErrors.value = errors;
    if (Object.keys(errors).length > 0) return;
  }
  step.value = Math.min(step.value + 1, 4);
}

function previousStep() {
  clearErrors();
  step.value = Math.max(step.value - 1, 0);
}

function addItem() {
  if (!hasValidDraft.value) {
    fieldErrors.value = {
      item: "Escribe la descripción del artículo y una cantidad válida (1 a 999).",
    };
    return;
  }
  items.value.push({
    ...itemDraft.value,
    description: itemDraft.value.description.trim(),
    brand: itemDraft.value.brand.trim(),
    model: itemDraft.value.model.trim(),
    serialNumber: itemDraft.value.serialNumber.trim(),
    color: itemDraft.value.color.trim(),
  });
  itemDraft.value = newItem();
  fieldErrors.value = {};
}

function removeItem(index: number) {
  items.value.splice(index, 1);
}

function resetKiosk() {
  if (sending.value) return;
  if (resetTimer !== undefined) {
    window.clearTimeout(resetTimer);
    resetTimer = undefined;
  }
  if (statusPollingTimer !== undefined) {
    window.clearInterval(statusPollingTimer);
    statusPollingTimer = undefined;
  }
  visitorName.value = "";
  companyName.value = "";
  visitReason.value = "";
  carriesItems.value = null;
  items.value = [];
  itemDraft.value = newItem();
  identificationType.value = "";
  declaresIdRetained.value = null;
  informationConfirmed.value = false;
  completed.value = null;
  completedStatus.value = "waiting";
  completedStatusError.value = "";
  requestIdempotencyKey.value = crypto.randomUUID();
  step.value = 0;
  clearErrors();
  window.history.replaceState(null, "", "/registro");
}

async function refreshCompletedStatus() {
  if (!completed.value || statusRequestInProgress) return;
  statusRequestInProgress = true;
  try {
    const response = await fetch("/api/visitor-kiosk/status", {
      headers: { "Idempotency-Key": requestIdempotencyKey.value },
    });
    const result = await parseResponse<{
      authorizationStatus?: "Pendiente" | "Autorizada" | "Rechazada";
      entryChecklistComplete?: boolean;
      entered?: boolean;
      error?: string;
    }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo consultar la revisión de recepción.");
    if (
      !["Pendiente", "Autorizada", "Rechazada"].includes(String(result.authorizationStatus)) ||
      typeof result.entryChecklistComplete !== "boolean" ||
      typeof result.entered !== "boolean"
    ) {
      throw new Error("El servidor devolvió un estado de revisión inválido.");
    }
    completedStatusError.value = "";
    if (result.authorizationStatus === "Rechazada") {
      completedStatus.value = "rejected";
    } else if (result.authorizationStatus === "Autorizada" && result.entryChecklistComplete && result.entered) {
      completedStatus.value = "entered";
    }
    if (completedStatus.value !== "waiting") {
      if (statusPollingTimer !== undefined) {
        window.clearInterval(statusPollingTimer);
        statusPollingTimer = undefined;
      }
      if (resetTimer !== undefined) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(resetKiosk, 30000);
    }
  } catch (error) {
    console.error("No se pudo actualizar el estado del autorregistro:", error);
    completedStatusError.value =
      error instanceof Error ? error.message : "No se pudo actualizar el estado de la revisión.";
  } finally {
    statusRequestInProgress = false;
  }
}

async function submitRegistration() {
  if (sending.value || !validateVisitor()) {
    step.value = 1;
    return;
  }
  if (!identificationTypes.includes(identificationType.value) || declaresIdRetained.value === null) {
    fieldErrors.value = {
      identificationType: "Revisa los datos de identificación.",
    };
    step.value = 3;
    return;
  }
  if (!informationConfirmed.value) {
    fieldErrors.value = { informationConfirmed: "Confirma que los datos son correctos antes de enviar." };
    return;
  }

  sending.value = true;
  clearErrors();
  try {
    const response = await fetch("/api/visitor-kiosk/registrations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdempotencyKey.value,
      },
      body: JSON.stringify({
        visitorName: visitorName.value,
        companyName: companyName.value,
        visitReason: visitReason.value,
        carriesItems: carriesItems.value,
        items: carriesItems.value ? items.value : [],
        identificationType: identificationType.value,
        declaresIdRetained: declaresIdRetained.value,
      }),
    });
    const result = await parseResponse<RegistrationResult & { error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el registro. Inténtalo de nuevo.");
    if (typeof result.folio !== "string" || typeof result.visitorName !== "string") {
      throw new Error("El servidor no confirmó el registro.");
    }
    completed.value = result;
    completedStatus.value = "waiting";
    step.value = 5;
    void refreshCompletedStatus();
    statusPollingTimer = window.setInterval(() => void refreshCompletedStatus(), 3000);
    resetTimer = window.setTimeout(resetKiosk, 120000);
  } catch (error) {
    console.error("No se pudo enviar el autorregistro:", error);
    errorMessage.value = error instanceof Error
      ? error.message
      : "No se pudo guardar el registro. Inténtalo de nuevo.";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <main class="visitor-kiosk">
    <header class="visitor-kiosk-header">
      <a class="visitor-kiosk-brand" href="/registro" aria-label="CyMEZ Recep, registro de visitantes">
        <img src="/images/cymez-visitor-logo.png" alt="CyMEZ" />
        <span>
          <strong>CYMEZ <em>RECEP</em></strong>
          <small>VISITAS · CONTROL · SEGURIDAD</small>
        </span>
      </a>
      <span class="visitor-kiosk-header-label">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20m7-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7.7a4 4 0 0 1 0 7.4m5 9.3v-1.6a4 4 0 0 0-3-3.9" /></svg>
        <span>REGISTRO DE VISITANTES</span>
      </span>
    </header>

    <section v-if="step === 0" class="visitor-kiosk-welcome">
      <img class="visitor-kiosk-neon-frame" src="/images/visitor-kiosk-neon-frame.png" alt="" />
      <div class="visitor-kiosk-welcome-main">
        <div class="visitor-kiosk-welcome-copy">
          <p class="visitor-kiosk-eyebrow">
            <span class="visitor-kiosk-welcome-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48"><path d="M24 5 8 11v12c0 9 6.8 15.7 16 20 9.2-4.3 16-11 16-20V11L24 5Z" /><path d="m17 24 5 5 10-11" /></svg>
            </span>
            CONTROL DE ACCESO
          </p>
          <h1>Bienvenido a nuestras <span>instalaciones</span></h1>
          <span class="visitor-kiosk-welcome-accent" aria-hidden="true"></span>
          <p class="visitor-kiosk-intro">Para ingresar, completa tu registro de visitante.</p>
          <button class="visitor-kiosk-primary" type="button" @click="step = 1; clearErrors()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm2 5 2 2 4-4" /></svg>
            Comenzar registro
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
          </button>
        </div>
        <div class="visitor-kiosk-welcome-visual" aria-hidden="true">
          <img class="visitor-kiosk-tablet" src="/images/visitor-kiosk-tablet.png" alt="" />
        </div>
      </div>
      <div class="visitor-kiosk-features">
        <div>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-3 8h7L8 22l3-9H5l8-11Z" /></svg>
          <span><strong>Proceso rápido</strong><small>En pocos minutos</small></span>
        </div>
        <div>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></svg>
          <span><strong>Seguro y confiable</strong><small>Tu información protegida</small></span>
        </div>
        <div>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-1-15.8a4 4 0 0 1 0 7.7" /></svg>
          <span><strong>Acceso controlado</strong><small>Para tu seguridad</small></span>
        </div>
      </div>
    </section>

    <section v-else-if="step >= 1 && step <= 4" class="visitor-kiosk-card">
      <div class="visitor-kiosk-progress" aria-label="Progreso del registro">
        <span>PASO {{ step }} DE 4</span>
        <div><span :style="{ width: `${progress * 25}%` }"></span></div>
      </div>
      <header class="visitor-kiosk-step-heading">
        <p class="visitor-kiosk-eyebrow">{{ step === 1 ? "IDENTIFICACIÓN DE VISITA" : step === 2 ? "DECLARACIÓN DE ARTÍCULOS" : step === 3 ? "CONTROL DE IDENTIDAD" : "ÚLTIMA REVISIÓN" }}</p>
        <h1>{{ step === 1 ? "Datos del visitante" : step === 2 ? "Equipo y herramientas" : step === 3 ? "Identificación" : "Revisa tu registro" }}</h1>
        <p v-if="step === 2">Indica si ingresas con equipo, herramientas u otros artículos que deban registrarse.</p>
        <p v-else-if="step === 3">Selecciona el tipo de identificación presentada. No captures números ni fotografías del documento.</p>
      </header>

      <form v-if="step === 1" class="visitor-kiosk-form" @submit.prevent="continueStep">
        <label>
          <span class="visitor-kiosk-label-title">Nombre completo <span aria-hidden="true">*</span></span>
          <input v-model.trim="visitorName" type="text" autocomplete="name" maxlength="180" placeholder="Escribe tu nombre completo" required :aria-invalid="!!fieldErrors.visitorName" />
          <small v-if="fieldErrors.visitorName" class="visitor-kiosk-field-error">{{ fieldErrors.visitorName }}</small>
        </label>
        <label>
          <span class="visitor-kiosk-label-title">Empresa o procedencia <span aria-hidden="true">*</span></span>
          <input
            v-model.trim="companyName"
            type="text"
            list="visitor-kiosk-company-list"
            maxlength="180"
            placeholder="Escribe o selecciona una empresa"
            required
            :aria-invalid="!!fieldErrors.companyName"
          />
          <datalist id="visitor-kiosk-company-list">
            <option v-for="company in existingCompanies" :key="company" :value="company" />
          </datalist>
          <small class="visitor-kiosk-field-hint">
            Si no perteneces a una empresa o vienes por un asunto personal o ajeno a una empresa, selecciona:
          </small>
          <button class="visitor-kiosk-text-button" type="button" @click="companyName = 'Público general'">
            Soy público general
          </button>
          <small v-if="fieldErrors.companyName" class="visitor-kiosk-field-error">{{ fieldErrors.companyName }}</small>
        </label>
        <label>
          <span class="visitor-kiosk-label-title">Asunto o motivo de la visita <span aria-hidden="true">*</span></span>
          <textarea v-model.trim="visitReason" rows="3" maxlength="500" placeholder="Describe el motivo de tu visita" required :aria-invalid="!!fieldErrors.visitReason"></textarea>
          <small v-if="fieldErrors.visitReason" class="visitor-kiosk-field-error">{{ fieldErrors.visitReason }}</small>
        </label>
        <div class="visitor-kiosk-actions">
          <button class="visitor-kiosk-secondary" type="button" @click="previousStep">Anterior</button>
          <button class="visitor-kiosk-primary" type="submit">Continuar</button>
        </div>
      </form>

      <div
        v-else-if="step === 2"
        class="visitor-kiosk-form"
        :class="{ 'visitor-kiosk-equipment-form': carriesItems }"
      >
        <div
          class="visitor-kiosk-equipment-content"
          :class="{ 'has-equipment-list': carriesItems }"
        >
          <div class="visitor-kiosk-choice-group" role="group" aria-label="¿Llevas equipo o herramientas?">
            <button type="button" :class="{ 'is-selected': carriesItems === true }" @click="carriesItems = true; fieldErrors = {}">
              <strong>Sí, llevo equipo o herramientas</strong>
              <span>Agrega los artículos que ingresarás.</span>
            </button>
            <button type="button" :class="{ 'is-selected': carriesItems === false }" @click="carriesItems = false; items = []; fieldErrors = {}">
              <strong>No llevo equipo ni herramientas</strong>
              <span>Continuarás sin declarar artículos.</span>
            </button>
          </div>
          <small v-if="fieldErrors.carriesItems || fieldErrors.items" class="visitor-kiosk-field-error">{{ fieldErrors.carriesItems || fieldErrors.items }}</small>
          <template v-if="carriesItems">
            <div class="visitor-kiosk-item-editor">
              <label>
                Tipo
                <select v-model="itemDraft.type">
                  <option>Equipo</option>
                  <option>Herramienta</option>
                </select>
              </label>
              <label class="visitor-kiosk-item-description">
                <span class="visitor-kiosk-label-title">Nombre o descripción <span aria-hidden="true">*</span></span>
                <input v-model.trim="itemDraft.description" type="text" maxlength="180" required />
              </label>
              <label>
                Cantidad
                <input v-model.number="itemDraft.quantity" type="number" min="1" max="999" step="1" required />
              </label>
              <label>Marca <input v-model.trim="itemDraft.brand" type="text" maxlength="120" /></label>
              <label>Modelo <input v-model.trim="itemDraft.model" type="text" maxlength="120" /></label>
              <label>Número de serie <input v-model.trim="itemDraft.serialNumber" type="text" maxlength="180" /></label>
              <label>Color <input v-model.trim="itemDraft.color" type="text" maxlength="80" /></label>
              <button class="visitor-kiosk-add-item" type="button" @click="addItem">Agregar artículo</button>
            </div>
            <small v-if="fieldErrors.item" class="visitor-kiosk-field-error">{{ fieldErrors.item }}</small>
            <ul v-if="items.length" class="visitor-kiosk-item-list">
              <li v-for="(item, index) in items" :key="`${index}-${item.description}`">
                <span><strong>{{ item.type }} · {{ item.description }}</strong><small>Cantidad: {{ item.quantity }}<template v-if="item.brand"> · {{ item.brand }}</template><template v-if="item.model"> · {{ item.model }}</template></small></span>
                <button type="button" :aria-label="`Eliminar ${item.description}`" @click="removeItem(index)">Quitar</button>
              </li>
            </ul>
          </template>
          <p v-else-if="carriesItems === false" class="visitor-kiosk-empty-choice">Has indicado que no llevas artículos.</p>
        </div>
        <div class="visitor-kiosk-actions">
          <button class="visitor-kiosk-secondary" type="button" @click="previousStep">Anterior</button>
          <button class="visitor-kiosk-primary" type="button" @click="continueStep">Continuar</button>
        </div>
      </div>

      <div v-else-if="step === 3" class="visitor-kiosk-form">
        <label>
          <span class="visitor-kiosk-label-title">Tipo de identificación presentada <span aria-hidden="true">*</span></span>
          <select v-model="identificationType" :aria-invalid="!!fieldErrors.identificationType">
            <option value="" disabled>Selecciona una opción</option>
            <option v-for="type in identificationTypes" :key="type">{{ type }}</option>
          </select>
          <small v-if="fieldErrors.identificationType" class="visitor-kiosk-field-error">{{ fieldErrors.identificationType }}</small>
        </label>
        <fieldset class="visitor-kiosk-id-question">
          <legend>¿Declaras que tu identificación fue entregada a recepción para resguardo?</legend>
          <label><input v-model="declaresIdRetained" type="radio" :value="true" /> Sí, la entregué para resguardo</label>
          <label><input v-model="declaresIdRetained" type="radio" :value="false" /> No, solo la presenté para verificación</label>
          <small v-if="fieldErrors.declaresIdRetained" class="visitor-kiosk-field-error">{{ fieldErrors.declaresIdRetained }}</small>
        </fieldset>
        <p class="visitor-kiosk-notice">Esta respuesta es una declaración tuya y no confirma que recepción haya recibido físicamente el documento. No escribas el número de identificación.</p>
        <div class="visitor-kiosk-actions">
          <button class="visitor-kiosk-secondary" type="button" @click="previousStep">Anterior</button>
          <button class="visitor-kiosk-primary" type="button" @click="continueStep">Continuar</button>
        </div>
      </div>

      <div v-else class="visitor-kiosk-form">
        <dl class="visitor-kiosk-summary">
          <div><dt>Nombre</dt><dd>{{ visitorName }}</dd></div>
          <div><dt>Empresa o procedencia</dt><dd>{{ companyName }}</dd></div>
          <div><dt>Asunto</dt><dd>{{ visitReason }}</dd></div>
          <div><dt>Equipo y herramientas</dt><dd>{{ carriesItems ? items.map((item) => `${item.type}: ${item.description} (cantidad ${item.quantity})`).join("; ") : "No lleva artículos" }}</dd></div>
          <div><dt>Identificación</dt><dd>{{ identificationType }}</dd></div>
          <div><dt>Declaración de resguardo</dt><dd>{{ declaresIdRetained ? "Declara que la entregó para resguardo" : "Declara que solo la presentó para verificación" }}</dd></div>
        </dl>
        <label class="visitor-kiosk-confirmation">
          <input v-model="informationConfirmed" type="checkbox" />
          Confirmo que la información proporcionada es correcta.
        </label>
        <small v-if="fieldErrors.informationConfirmed" class="visitor-kiosk-field-error">{{ fieldErrors.informationConfirmed }}</small>
        <div v-if="errorMessage" class="visitor-kiosk-error" role="alert">
          <div class="visitor-kiosk-error-copy">
            <strong>No se pudo enviar el registro</strong>
            <span>{{ errorMessage }}</span>
          </div>
          <button type="button" :disabled="sending" @click="submitRegistration">Reintentar</button>
        </div>
        <div class="visitor-kiosk-actions">
          <button class="visitor-kiosk-secondary" type="button" :disabled="sending" @click="previousStep">Anterior</button>
          <button class="visitor-kiosk-primary" type="button" :disabled="sending" @click="submitRegistration">
            {{ sending ? "Enviando registro…" : "Enviar registro" }}
          </button>
        </div>
      </div>
    </section>

    <section v-else-if="step === 5 && completed" class="visitor-kiosk-welcome visitor-kiosk-success" role="status">
      <div class="visitor-kiosk-welcome-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" /><path d="m14 24 7 7 14-15" /></svg>
      </div>
      <p class="visitor-kiosk-eyebrow">
        {{ completedStatus === "entered" ? "REVISIÓN COMPLETADA" : completedStatus === "rejected" ? "REVISIÓN RECHAZADA" : "REGISTRO RECIBIDO" }}
      </p>
      <h1>
        {{ completedStatus === "entered" ? "Tu ingreso fue registrado" : completedStatus === "rejected" ? "Acude con recepción" : "Esperando revisión de recepción" }}
      </h1>
      <div class="visitor-kiosk-folio"><span>FOLIO</span><strong>{{ completed.folio }}</strong></div>
      <p class="visitor-kiosk-success-name">{{ completed.visitorName }}</p>
      <p class="visitor-kiosk-intro">
        {{ completedStatus === "entered"
          ? "Recepción completó el checklist de entrada y registró tu ingreso en la bitácora."
          : completedStatus === "rejected"
            ? "Recepción no autorizó el registro. Solicita asistencia antes de ingresar."
            : "Tu llegada ya quedó anotada. Espera mientras recepción revisa el checklist de equipos y autoriza el ingreso." }}
      </p>
      <div v-if="completedStatus === 'waiting'" class="visitor-kiosk-waiting" role="status">
        <span class="visitor-kiosk-waiting-indicator" aria-hidden="true"></span>
        <span>Esperando que recepción revise tu registro…</span>
      </div>
      <p v-if="completedStatusError" class="visitor-kiosk-status-error" role="alert">
        {{ completedStatusError }}. El sistema volverá a consultar automáticamente.
      </p>
      <button class="visitor-kiosk-secondary" type="button" @click="resetKiosk">Finalizar</button>
    </section>
  </main>
</template>
