<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { notifyUser } from "../notifications";

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

type KioskSessionDraft = {
  version: 1;
  step: number;
  requestIdempotencyKey: string;
  visitorName: string;
  companyName: string;
  visitReason: string;
  carriesItems: boolean | null;
  items: KioskItem[];
  itemDraft: KioskItem;
  editingItemIndex: number | null;
  identificationTypesSelected: IdentificationType[];
  declaresIdRetained: boolean | null;
  informationConfirmed: boolean;
};

type PendingKioskRegistration = {
  version: 1;
  completed: RegistrationResult;
  requestIdempotencyKey: string;
  carriesItems: boolean | null;
  declaresIdRetained: boolean;
  expiresAt: number;
};

const identificationTypes = [
  "INE",
  "Gafete",
  "Pasaporte",
  "Licencia de conducir",
  "Otra identificación",
] as const;
type IdentificationType = (typeof identificationTypes)[number];
const step = ref(0);
const sending = ref(false);
const errorMessage = ref("");
const showRestoreNotice = ref(false);
const fieldErrors = ref<Record<string, string>>({});
const visitorName = ref("");
const companyName = ref("");
const visitReason = ref("");
const carriesItems = ref<boolean | null>(null);
const items = ref<KioskItem[]>([]);
const itemDraft = ref<KioskItem>(newItem());
const editingItemIndex = ref<number | null>(null);
const identificationTypesSelected = ref<IdentificationType[]>([]);
const declaresIdRetained = ref<boolean | null>(null);
const informationConfirmed = ref(false);
const completed = ref<RegistrationResult | null>(null);
const completedStatus = ref<
  "reference" | "awaiting-id-check" | "awaiting-entry-authorization" |
  "awaiting-entry-checklist" | "entered" | "rejected"
>("reference");
const completedStatusError = ref("");
const pendingRegistration = ref<PendingKioskRegistration | null>(null);
const needsReceptionIdCheck = computed(() => declaresIdRetained.value === true);
const waitingMessage = computed(() => {
  if (completedStatus.value === "awaiting-id-check") {
    return "Esperando que recepción confirme la entrega de identificación…";
  }
  if (completedStatus.value === "awaiting-entry-authorization") {
    return "Identificación revisada. Esperando autorización de entrada…";
  }
  if (completedStatus.value === "awaiting-entry-checklist") {
    return "Entrada autorizada. Recepción debe completar el checklist de equipo…";
  }
  return "";
});
const requestIdempotencyKey = ref<string>(crypto.randomUUID());
const draftStorageKey = "visitas:visitor-kiosk:draft:v1";
const pendingStorageKey = "visitas:visitor-kiosk:pending:v1";
let resetTimer: number | undefined;
let statusEventSource: EventSource | null = null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKioskItem(value: unknown): value is KioskItem {
  if (!isRecord(value)) return false;
  return (
    (value.type === "Equipo" || value.type === "Herramienta") &&
    typeof value.description === "string" &&
    value.description.length <= 180 &&
    typeof value.brand === "string" &&
    value.brand.length <= 120 &&
    typeof value.model === "string" &&
    value.model.length <= 120 &&
    typeof value.serialNumber === "string" &&
    value.serialNumber.length <= 180 &&
    typeof value.color === "string" &&
    value.color.length <= 80 &&
    Number.isSafeInteger(value.quantity) &&
    Number(value.quantity) >= 1 &&
    Number(value.quantity) <= 999
  );
}

function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIdentificationType(value: unknown): value is IdentificationType {
  return typeof value === "string" && identificationTypes.some((type) => type === value);
}

function isKioskSessionDraft(value: unknown): value is KioskSessionDraft {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    Number.isInteger(value.step) &&
    Number(value.step) >= 1 &&
    Number(value.step) <= 4 &&
    isIdempotencyKey(value.requestIdempotencyKey) &&
    typeof value.visitorName === "string" &&
    value.visitorName.length <= 180 &&
    typeof value.companyName === "string" &&
    value.companyName.length <= 180 &&
    typeof value.visitReason === "string" &&
    value.visitReason.length <= 500 &&
    (typeof value.carriesItems === "boolean" || value.carriesItems === null) &&
    Array.isArray(value.items) &&
    value.items.length <= 50 &&
    value.items.every(isKioskItem) &&
    isKioskItem(value.itemDraft) &&
    (value.editingItemIndex === null ||
      (Number.isInteger(value.editingItemIndex) &&
        Number(value.editingItemIndex) >= 0 &&
        Number(value.editingItemIndex) < value.items.length)) &&
    Array.isArray(value.identificationTypesSelected) &&
    value.identificationTypesSelected.every(isIdentificationType) &&
    (typeof value.declaresIdRetained === "boolean" || value.declaresIdRetained === null) &&
    typeof value.informationConfirmed === "boolean"
  );
}

function isPendingKioskRegistration(value: unknown): value is PendingKioskRegistration {
  if (!isRecord(value) || !isRecord(value.completed)) return false;
  return (
    value.version === 1 &&
    typeof value.completed.folio === "string" &&
    /^\d{8}$/.test(value.completed.folio) &&
    typeof value.completed.visitorName === "string" &&
    value.completed.visitorName.length <= 180 &&
    isIdempotencyKey(value.requestIdempotencyKey) &&
    (typeof value.carriesItems === "boolean" || value.carriesItems === null) &&
    typeof value.declaresIdRetained === "boolean" &&
    Number.isSafeInteger(value.expiresAt)
  );
}

function persistDraft() {
  if (step.value < 1 || step.value > 4 || completed.value) {
    sessionStorage.removeItem(draftStorageKey);
    return;
  }
  const draft: KioskSessionDraft = {
    version: 1,
    step: step.value,
    requestIdempotencyKey: requestIdempotencyKey.value,
    visitorName: visitorName.value,
    companyName: companyName.value,
    visitReason: visitReason.value,
    carriesItems: carriesItems.value,
    items: items.value,
    itemDraft: itemDraft.value,
    editingItemIndex: editingItemIndex.value,
    identificationTypesSelected: identificationTypesSelected.value,
    declaresIdRetained: declaresIdRetained.value,
    informationConfirmed: informationConfirmed.value,
  };
  sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
}

function scheduleKioskReset(delay: number) {
  if (resetTimer !== undefined) window.clearTimeout(resetTimer);
  if (pendingRegistration.value) {
    pendingRegistration.value.expiresAt = Date.now() + delay;
    try {
      sessionStorage.setItem(pendingStorageKey, JSON.stringify(pendingRegistration.value));
    } catch (error) {
      console.error("No se pudo actualizar la vigencia del folio en esta pestaña:", error);
      completedStatusError.value = "No se pudo conservar este folio al recargar la página.";
    }
  }
  resetTimer = window.setTimeout(resetKiosk, delay);
}

function resumePendingStatus() {
  if (!completed.value) return;
  closeStatusEventSource();
  statusEventSource = new EventSource(
    `/api/visitor-kiosk/events?key=${encodeURIComponent(requestIdempotencyKey.value)}`,
  );
  statusEventSource.onopen = () => void refreshCompletedStatus();
  statusEventSource.onmessage = () => void refreshCompletedStatus();
  statusEventSource.onerror = () => {
    completedStatusError.value = "Actualización instantánea interrumpida; verificando automáticamente…";
  };
  statusPollingTimer = window.setInterval(() => void refreshCompletedStatus(), 5000);
  void refreshCompletedStatus();
}

function restoreKioskSession() {
  try {
    const savedPending = sessionStorage.getItem(pendingStorageKey);
    if (savedPending) {
      const parsed: unknown = JSON.parse(savedPending);
      if (isPendingKioskRegistration(parsed) && parsed.expiresAt > Date.now()) {
        pendingRegistration.value = parsed;
        completed.value = parsed.completed;
        carriesItems.value = parsed.carriesItems;
        declaresIdRetained.value = parsed.declaresIdRetained;
        requestIdempotencyKey.value = parsed.requestIdempotencyKey;
        step.value = 5;
        resetTimer = window.setTimeout(
          resetKiosk,
          Math.max(parsed.expiresAt - Date.now(), 0),
        );
        resumePendingStatus();
        return;
      }
      sessionStorage.removeItem(pendingStorageKey);
    }

    const savedDraft = sessionStorage.getItem(draftStorageKey);
    if (!savedDraft) return;
    const parsed: unknown = JSON.parse(savedDraft);
    if (!isKioskSessionDraft(parsed)) {
      sessionStorage.removeItem(draftStorageKey);
      errorMessage.value = "El borrador guardado no es válido. Inicia un registro nuevo.";
      return;
    }
    step.value = parsed.step;
    requestIdempotencyKey.value = parsed.requestIdempotencyKey;
    visitorName.value = parsed.visitorName;
    companyName.value = parsed.companyName;
    visitReason.value = parsed.visitReason;
    carriesItems.value = parsed.carriesItems;
    items.value = parsed.items;
    itemDraft.value = parsed.itemDraft;
    editingItemIndex.value = parsed.editingItemIndex;
    identificationTypesSelected.value = parsed.identificationTypesSelected;
    declaresIdRetained.value = parsed.declaresIdRetained;
    informationConfirmed.value = parsed.informationConfirmed;
    showRestoreNotice.value = true;
  } catch (error) {
    console.error("No se pudo restaurar el avance del registro de visitante:", error);
    errorMessage.value = "No se pudo recuperar el registro guardado en esta pestaña.";
  }
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

watch(
  [
    step,
    visitorName,
    companyName,
    visitReason,
    carriesItems,
    items,
    itemDraft,
    editingItemIndex,
    identificationTypesSelected,
    declaresIdRetained,
    informationConfirmed,
    requestIdempotencyKey,
    completed,
  ],
  () => {
    try {
      persistDraft();
    } catch (error) {
      console.error("No se pudo guardar el borrador del registro de visitante:", error);
      errorMessage.value = "No se pudo guardar el avance en esta pestaña.";
    }
  },
  { deep: true },
);

onMounted(() => {
  restoreKioskSession();
});

onBeforeUnmount(() => {
  if (resetTimer !== undefined) window.clearTimeout(resetTimer);
  statusEventSource?.close();
});

function closeStatusEventSource() {
  statusEventSource?.close();
  statusEventSource = null;
  if (statusPollingTimer !== undefined) {
    window.clearInterval(statusPollingTimer);
    statusPollingTimer = undefined;
  }
}

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
    if (editingItemIndex.value !== null) {
      fieldErrors.value = { item: "Guarda o cancela los cambios del artículo antes de continuar." };
      return;
    }
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
    if (
      identificationTypesSelected.value.length === 0 ||
      identificationTypesSelected.value.some((type) => !identificationTypes.includes(type))
    ) {
      errors.identificationType = "Selecciona al menos un tipo de identificación.";
    }
    if (declaresIdRetained.value === null) {
      errors.declaresIdRetained = "Indica si declaras haber entregado tu identificación para resguardo.";
    }
    fieldErrors.value = errors;
    if (Object.keys(errors).length > 0) return;
  }
  step.value = Math.min(step.value + 1, 4);
}

function toggleIdentificationType(type: IdentificationType) {
  if (!identificationTypes.includes(type)) return;
  identificationTypesSelected.value = identificationTypesSelected.value.includes(type)
    ? identificationTypesSelected.value.filter((selectedType) => selectedType !== type)
    : [...identificationTypesSelected.value, type];
  if (identificationTypesSelected.value.length > 0) delete fieldErrors.value.identificationType;
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
  const item = {
    ...itemDraft.value,
    description: itemDraft.value.description.trim(),
    brand: itemDraft.value.brand.trim(),
    model: itemDraft.value.model.trim(),
    serialNumber: itemDraft.value.serialNumber.trim(),
    color: itemDraft.value.color.trim(),
  };
  if (editingItemIndex.value === null) items.value.push(item);
  else items.value.splice(editingItemIndex.value, 1, item);
  itemDraft.value = newItem();
  editingItemIndex.value = null;
  fieldErrors.value = {};
}

function editItem(index: number) {
  const item = items.value[index];
  if (!item) return;
  itemDraft.value = { ...item };
  editingItemIndex.value = index;
  fieldErrors.value = {};
  document.querySelector(".visitor-kiosk-item-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelItemEdit() {
  itemDraft.value = newItem();
  editingItemIndex.value = null;
  fieldErrors.value = {};
}

function removeItem(index: number) {
  items.value.splice(index, 1);
  if (editingItemIndex.value === index) cancelItemEdit();
  else if (editingItemIndex.value !== null && index < editingItemIndex.value) editingItemIndex.value -= 1;
}

function resetKiosk() {
  if (sending.value) return;
  if (resetTimer !== undefined) {
    window.clearTimeout(resetTimer);
    resetTimer = undefined;
  }
  closeStatusEventSource();
  try {
    sessionStorage.removeItem(draftStorageKey);
    sessionStorage.removeItem(pendingStorageKey);
  } catch (error) {
    console.error("No se pudo limpiar el estado guardado del registro:", error);
    notifyUser("No se pudo limpiar el avance guardado en esta pestaña.");
  }
  pendingRegistration.value = null;
  visitorName.value = "";
  companyName.value = "";
  visitReason.value = "";
  carriesItems.value = null;
  items.value = [];
  itemDraft.value = newItem();
  editingItemIndex.value = null;
  identificationTypesSelected.value = [];
  declaresIdRetained.value = null;
  informationConfirmed.value = false;
  showRestoreNotice.value = false;
  completed.value = null;
  completedStatus.value = "reference";
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
      receptionIdClaimStatus?: "No aplica" | "Pendiente" | "Confirmada" | "No confirmada";
      entryChecklistComplete?: boolean;
      entered?: boolean;
      error?: string;
    }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo consultar la revisión de recepción.");
    if (
      !["Pendiente", "Autorizada", "Rechazada"].includes(String(result.authorizationStatus)) ||
      !["No aplica", "Pendiente", "Confirmada", "No confirmada"].includes(String(result.receptionIdClaimStatus)) ||
      typeof result.entryChecklistComplete !== "boolean" ||
      typeof result.entered !== "boolean"
    ) {
      throw new Error("El servidor devolvió un estado de revisión inválido.");
    }
    completedStatusError.value = "";
    if (result.authorizationStatus === "Rechazada") {
      completedStatus.value = "rejected";
    } else if (result.authorizationStatus === "Autorizada" && result.entered) {
      completedStatus.value = "entered";
    } else if (result.authorizationStatus === "Autorizada" && !result.entryChecklistComplete) {
      completedStatus.value = "awaiting-entry-checklist";
    } else if (result.receptionIdClaimStatus === "Confirmada" || result.receptionIdClaimStatus === "No confirmada") {
      completedStatus.value = "awaiting-entry-authorization";
    } else if (result.receptionIdClaimStatus === "No aplica") {
      completedStatus.value = "awaiting-entry-authorization";
    } else {
      completedStatus.value = "awaiting-id-check";
    }
    if (completedStatus.value === "entered" || completedStatus.value === "rejected") {
      closeStatusEventSource();
      scheduleKioskReset(30000);
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
  if (
    identificationTypesSelected.value.length === 0 ||
    identificationTypesSelected.value.some((type) => !identificationTypes.includes(type)) ||
    declaresIdRetained.value === null
  ) {
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
    try {
      persistDraft();
    } catch (storageError) {
      console.error("No se pudo conservar el borrador antes del envío:", storageError);
    }
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
        identificationTypes: identificationTypesSelected.value,
        declaresIdRetained: declaresIdRetained.value,
      }),
    });
    const result = await parseResponse<RegistrationResult & { error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el registro. Inténtalo de nuevo.");
    if (typeof result.folio !== "string" || typeof result.visitorName !== "string") {
      throw new Error("El servidor no confirmó el registro.");
    }
    pendingRegistration.value = {
      version: 1,
      completed: result,
      requestIdempotencyKey: requestIdempotencyKey.value,
      carriesItems: carriesItems.value,
      declaresIdRetained: declaresIdRetained.value,
      expiresAt: Date.now() + 120000,
    };
    try {
      sessionStorage.setItem(pendingStorageKey, JSON.stringify(pendingRegistration.value));
      sessionStorage.removeItem(draftStorageKey);
    } catch (storageError) {
      console.error("No se pudo conservar el folio del registro en esta pestaña:", storageError);
      notifyUser("El registro se guardó, pero no se pudo conservar el folio en esta pestaña.");
    }
    completed.value = result;
    completedStatus.value = declaresIdRetained.value ? "awaiting-id-check" : "reference";
    step.value = 5;
    resumePendingStatus();
    scheduleKioskReset(120000);
  } catch (error) {
    console.error("No se pudo enviar el autorregistro:", error);
    errorMessage.value = error instanceof Error
      ? error.message
      : "No se pudo guardar el registro. Inténtalo de nuevo.";
    notifyUser(errorMessage.value);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <main class="visitor-kiosk">
    <header class="visitor-kiosk-header">
      <a class="visitor-kiosk-brand" href="/registro">
        <img src="/images/cymez-visitor-logo.webp" alt="CyMEZ" width="160" height="179" decoding="async" />
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
      <img class="visitor-kiosk-neon-frame" src="/images/visitor-kiosk-neon-frame.webp" alt="" width="1527" height="738" decoding="async" />
      <div class="visitor-kiosk-welcome-main">
        <div class="visitor-kiosk-welcome-copy">
          <p class="visitor-kiosk-eyebrow">
            <span class="visitor-kiosk-welcome-mark" aria-hidden="true">
              <img src="/images/visitor-kiosk-access-icon.webp" alt="" width="128" height="110" decoding="async" />
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
          <img
            class="visitor-kiosk-tablet"
            src="/images/visitor-kiosk-tablet.webp"
            srcset="/images/visitor-kiosk-tablet-600.webp 600w, /images/visitor-kiosk-tablet-850.webp 850w, /images/visitor-kiosk-tablet.webp 1102w"
            sizes="(max-width: 720px) 92vw, 500px"
            alt=""
            width="1102"
            height="768"
            fetchpriority="high"
            decoding="async"
          />
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
        <div v-if="step === 1" class="visitor-kiosk-step-title">
          <span class="visitor-kiosk-step-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48"><path d="M24 5 8 11v12c0 9 6.8 15.7 16 20 9.2-4.3 16-11 16-20V11L24 5Z" /><circle cx="24" cy="19" r="5" /><path d="M14.5 34c1.7-5 5-7.5 9.5-7.5s7.8 2.5 9.5 7.5" /></svg>
          </span>
          <h1>Datos del <span>visitante</span></h1>
        </div>
        <h1 v-else>{{ step === 2 ? "Equipo y herramientas" : step === 3 ? "Identificación" : "Revisa tu registro" }}</h1>
        <p v-if="step === 2" class="visitor-kiosk-equipment-rule" role="note">Declara todo el equipo y las herramientas que ingresarás a las instalaciones. Solo se permite el ingreso de artículos registrados; lo que no registres no podrá ingresar.</p>
        <p v-else-if="step === 3">Selecciona el tipo de identificación presentada. No captures números ni fotografías del documento.</p>
      </header>
      <p v-if="showRestoreNotice" class="visitor-kiosk-save-notice" role="status">
        Recuperamos tu avance. Si vuelves a recargar esta pestaña, se conservará.
      </p>

      <form v-if="step === 1" class="visitor-kiosk-form" @submit.prevent="continueStep">
        <label>
          <span class="visitor-kiosk-label-title">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
            Nombre completo <span aria-hidden="true">*</span>
          </span>
          <span class="visitor-kiosk-field-control">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
            <input v-model.trim="visitorName" type="text" autocomplete="name" maxlength="180" placeholder="Escribe tu nombre completo" required :aria-invalid="!!fieldErrors.visitorName" />
          </span>
          <small v-if="fieldErrors.visitorName" class="visitor-kiosk-field-error">{{ fieldErrors.visitorName }}</small>
        </label>
        <label>
          <span class="visitor-kiosk-label-title">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4v18m7 0V11l-7-4" /><path d="M8 9v1m0 3v1m0 3v1m8-5v1m0 3v1" /></svg>
            Empresa o procedencia <span aria-hidden="true">*</span>
          </span>
          <span class="visitor-kiosk-field-control">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4v18m7 0V11l-7-4" /><path d="M8 9v1m0 3v1m0 3v1m8-5v1m0 3v1" /></svg>
            <input
              v-model.trim="companyName"
              type="text"
              maxlength="180"
              placeholder="Escribe el nombre de tu empresa"
              required
              :aria-invalid="!!fieldErrors.companyName"
            />
          </span>
          <small class="visitor-kiosk-field-hint">
            Si no perteneces a una empresa o vienes por un asunto personal o ajeno a una empresa, selecciona:
          </small>
          <button class="visitor-kiosk-text-button" type="button" @click="companyName = 'Público general'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            Soy público general
            <svg class="visitor-kiosk-text-button-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
          </button>
          <small v-if="fieldErrors.companyName" class="visitor-kiosk-field-error">{{ fieldErrors.companyName }}</small>
        </label>
        <label>
          <span class="visitor-kiosk-label-title">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 17 2 2a2 2 0 1 0 3-3" /><path d="m14 14 2 2a2 2 0 1 0 3-3l-3.5-3.5a2 2 0 0 0-3 0L12 10a3 3 0 0 1-3 0l-.5-.5a2 2 0 0 0-3 0L2 13a2 2 0 0 0 3 3l2.5-2.5" /><path d="m7 13 3 3m4-2 2 2" /></svg>
            Asunto o motivo de la visita <span aria-hidden="true">*</span>
          </span>
          <span class="visitor-kiosk-field-control is-multiline">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 9h8m-8 4h6" /></svg>
            <textarea v-model.trim="visitReason" rows="3" maxlength="500" placeholder="Describe el motivo de tu visita" required :aria-invalid="!!fieldErrors.visitReason"></textarea>
          </span>
          <small v-if="fieldErrors.visitReason" class="visitor-kiosk-field-error">{{ fieldErrors.visitReason }}</small>
        </label>
        <div class="visitor-kiosk-actions">
          <button class="visitor-kiosk-secondary" type="button" @click="previousStep">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7 7-7-7 7-7" /></svg>
            Anterior
          </button>
          <button class="visitor-kiosk-primary" type="submit">
            Continuar
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
          </button>
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
              <svg class="visitor-kiosk-choice-icon" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M28 7a10 10 0 0 0 12 12L27 32l-7-7L33 12a10 10 0 0 0-5-5Z" />
                <path d="m20 25-6-6a10 10 0 0 0-7-12l6 6-1 5-5 1-6-6a10 10 0 0 0 12 12l6 6m-6-6L5 39a4 4 0 0 0 6 6l12-12" />
              </svg>
              <span class="visitor-kiosk-choice-copy">
                <strong>Sí, llevo equipo o herramientas</strong>
                <small>Agrega los artículos que ingresarás.</small>
              </span>
            </button>
            <button type="button" :class="{ 'is-selected': carriesItems === false }" @click="carriesItems = false; items = []; itemDraft = newItem(); editingItemIndex = null; fieldErrors = {}">
              <svg class="visitor-kiosk-choice-icon is-no" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="17" />
                <path d="m12 12 24 24" />
              </svg>
              <span class="visitor-kiosk-choice-copy">
                <strong>No llevo equipo ni herramientas</strong>
                <small>Continuarás sin declarar artículos.</small>
              </span>
            </button>
          </div>
          <small v-if="fieldErrors.carriesItems || fieldErrors.items" class="visitor-kiosk-field-error">{{ fieldErrors.carriesItems || fieldErrors.items }}</small>
          <template v-if="carriesItems">
            <div class="visitor-kiosk-item-editor">
              <label>
                <span>Tipo</span>
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
                <span>Cantidad</span>
                <input v-model.number="itemDraft.quantity" type="number" min="1" max="999" step="1" required />
              </label>
              <label><span>Marca</span><input v-model.trim="itemDraft.brand" type="text" maxlength="120" /></label>
              <label><span>Modelo</span><input v-model.trim="itemDraft.model" type="text" maxlength="120" /></label>
              <label><span>Número de serie</span><input v-model.trim="itemDraft.serialNumber" type="text" maxlength="180" /></label>
              <label><span>Color</span><input v-model.trim="itemDraft.color" type="text" maxlength="80" /></label>
              <div class="visitor-kiosk-item-form-actions">
                <button class="visitor-kiosk-add-item" type="button" @click="addItem">
                  <svg v-if="editingItemIndex === null" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-7-7h14" /></svg>
                  {{ editingItemIndex === null ? "Agregar artículo" : "Guardar cambios" }}
                </button>
                <button
                  v-if="editingItemIndex !== null"
                  class="visitor-kiosk-cancel-item-edit"
                  type="button"
                  @click="cancelItemEdit"
                >
                  Cancelar
                </button>
              </div>
            </div>
            <small v-if="fieldErrors.item" class="visitor-kiosk-field-error">{{ fieldErrors.item }}</small>
            <ul v-if="items.length" class="visitor-kiosk-item-list">
              <li v-for="(item, index) in items" :key="`${index}-${item.description}`">
                <span><strong>{{ item.type }} · {{ item.description }}</strong><small>Cantidad: {{ item.quantity }}<template v-if="item.brand"> · {{ item.brand }}</template><template v-if="item.model"> · {{ item.model }}</template></small></span>
                <span class="visitor-kiosk-item-actions">
                  <button class="is-edit" type="button" :aria-label="`Editar ${item.description}`" @click="editItem(index)">Editar</button>
                  <button type="button" :aria-label="`Eliminar ${item.description}`" @click="removeItem(index)">Quitar</button>
                </span>
              </li>
            </ul>
          </template>
          <p v-else-if="carriesItems === false" class="visitor-kiosk-empty-choice">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>
            Has indicado que no llevas artículos.
          </p>
        </div>
        <div class="visitor-kiosk-actions">
          <button class="visitor-kiosk-secondary" type="button" @click="previousStep">Anterior</button>
          <button class="visitor-kiosk-primary" type="button" @click="continueStep">Continuar</button>
        </div>
      </div>

      <div v-else-if="step === 3" class="visitor-kiosk-form">
        <div class="visitor-kiosk-identification-field">
          <span class="visitor-kiosk-label-title">Tipo de identificación presentada <span aria-hidden="true">*</span></span>
          <div class="visitor-kiosk-identification-options" role="group" aria-label="Tipos de identificación; puedes elegir varias">
            <button
              v-for="(type, index) in identificationTypes"
              :key="type"
              class="visitor-kiosk-identification-option"
              :class="{ 'is-selected': identificationTypesSelected.includes(type) }"
              type="button"
              :aria-pressed="identificationTypesSelected.includes(type)"
              @click="toggleIdentificationType(type)"
            >
              <svg v-if="index === 0" viewBox="0 0 32 32" aria-hidden="true">
                <rect x="3.5" y="6" width="25" height="20" rx="3" /><circle cx="11" cy="14" r="3" /><path d="M6.5 22a5 5 0 0 1 9 0m4-8h5m-5 5h5" />
              </svg>
              <svg v-else-if="index === 1" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M16 3 27 7v8c0 7-4.7 11.6-11 14-6.3-2.4-11-7-11-14V7l11-4Z" /><circle cx="16" cy="13" r="3" /><path d="M10 22a6 6 0 0 1 12 0" />
              </svg>
              <svg v-else-if="index === 2" viewBox="0 0 32 32" aria-hidden="true">
                <rect x="6" y="4" width="20" height="24" rx="3" /><path d="M11 4v5h10V4m-10 11h10m-10 5h7" /><circle cx="21.5" cy="23" r="1" />
              </svg>
              <svg v-else-if="index === 3" viewBox="0 0 32 32" aria-hidden="true">
                <rect x="4" y="7" width="24" height="18" rx="4" /><circle cx="12" cy="15" r="3" /><path d="M7.5 22a5 5 0 0 1 9 0m3-9h7m-7 5h7m-7 4h5" />
              </svg>
              <svg v-else viewBox="0 0 32 32" aria-hidden="true">
                <path d="M16 3 27 7v8c0 7-4.7 11.6-11 14-6.3-2.4-11-7-11-14V7l11-4Z" /><path d="M16 10v12m-5-6h10" />
              </svg>
              <span>{{ type }}</span>
              <svg class="visitor-kiosk-identification-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
            </button>
          </div>
          <small v-if="fieldErrors.identificationType" class="visitor-kiosk-field-error">{{ fieldErrors.identificationType }}</small>
        </div>
        <fieldset class="visitor-kiosk-id-question">
          <legend>¿Declaras que tus identificaciones fueron entregadas a recepción para resguardo?</legend>
          <label><input v-model="declaresIdRetained" type="radio" :value="true" /> Sí, las entregué para resguardo</label>
          <label><input v-model="declaresIdRetained" type="radio" :value="false" /> No, solo las presenté para verificación</label>
          <small v-if="fieldErrors.declaresIdRetained" class="visitor-kiosk-field-error">{{ fieldErrors.declaresIdRetained }}</small>
        </fieldset>
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
          <div><dt>Identificación</dt><dd>{{ identificationTypesSelected.join(", ") }}</dd></div>
          <div><dt>Declaración de resguardo</dt><dd>{{ declaresIdRetained ? "Declara que las entregó para resguardo" : "Declara que solo las presentó para verificación" }}</dd></div>
        </dl>
        <label class="visitor-kiosk-confirmation">
          <input v-model="informationConfirmed" type="checkbox" />
          <span class="visitor-kiosk-confirmation-copy">
            <strong>Confirmo que la información proporcionada es correcta.</strong>
            <small>Verifica tus datos antes de enviar el registro.</small>
          </span>
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
      <img class="visitor-kiosk-neon-frame" src="/images/visitor-kiosk-neon-frame.webp" alt="" width="1527" height="738" decoding="async" />
      <div class="visitor-kiosk-success-content">
        <div class="visitor-kiosk-success-mark" :class="`is-${completedStatus}`" aria-hidden="true">
          <svg v-if="completedStatus === 'entered'" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" /><path d="m14 24 7 7 14-15" /></svg>
          <svg v-else-if="completedStatus === 'rejected'" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" /><path d="m17 17 14 14m0-14L17 31" /></svg>
          <svg v-else-if="completedStatus === 'reference'" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" /><path d="M17 13h10l6 6v16H17z" /><path d="M27 13v7h6m-12 5h8m-8 5h8" /></svg>
          <svg v-else viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" /><path d="M24 13v12l8 5" /></svg>
        </div>
        <p class="visitor-kiosk-eyebrow">
          {{ completedStatus === "entered"
            ? "REVISIÓN COMPLETADA"
            : completedStatus === "rejected"
              ? "REVISIÓN RECHAZADA"
              : completedStatus === "reference"
                ? "REGISTRO RECIBIDO"
                : completedStatus === "awaiting-id-check"
                  ? "VALIDACIÓN DE IDENTIFICACIÓN"
                  : "AUTORIZACIÓN EN PROCESO" }}
        </p>
        <h1>
          {{ completedStatus === "entered"
            ? "Tu ingreso fue registrado"
            : completedStatus === "rejected"
              ? "Acude con recepción"
              : completedStatus === "reference"
                ? "Tu código de referencia"
                : completedStatus === "awaiting-id-check"
                  ? "Recepción verificará tu identificación"
                  : completedStatus === "awaiting-entry-checklist"
                    ? "Completa la revisión de equipo"
                    : "Esperando autorización de entrada" }}
        </h1>
        <span class="visitor-kiosk-success-accent" aria-hidden="true"></span>
        <div class="visitor-kiosk-folio">
          <span>FOLIO DE VISITANTE</span>
          <strong>{{ completed.folio }}</strong>
        </div>
        <p v-if="completedStatus !== 'reference'" class="visitor-kiosk-success-name">{{ completed.visitorName }}</p>
        <p class="visitor-kiosk-intro">
          {{ completedStatus === "entered"
            ? "Recepción completó el checklist de entrada y registró tu ingreso en la bitácora."
            : completedStatus === "rejected"
              ? "Recepción no autorizó el registro. Solicita asistencia antes de ingresar."
              : completedStatus === "reference"
                ? "Presenta este folio a recepción para continuar con la autorización de entrada."
                : completedStatus === "awaiting-id-check"
                  ? "Tu llegada está registrada. Recepción debe confirmar primero que recibió tu identificación para resguardo."
                  : completedStatus === "awaiting-entry-checklist"
                    ? "Recepción autorizó tu entrada. El checklist de equipo debe completarse antes de registrar el ingreso."
                    : completedStatus === "awaiting-entry-authorization"
                      ? "La declaración de resguardo ya fue revisada. Espera la decisión de recepción sobre tu entrada."
                      : carriesItems
                        ? "Tu llegada quedó anotada. Espera mientras recepción revisa el checklist de equipos y autoriza el ingreso."
                        : "Tu llegada quedó anotada. Espera mientras recepción revisa y autoriza el ingreso." }}
        </p>
        <div v-if="waitingMessage" class="visitor-kiosk-waiting" role="status">
          <span class="visitor-kiosk-waiting-indicator" aria-hidden="true"></span>
          <span>{{ waitingMessage }}</span>
        </div>
        <p v-if="completedStatusError" class="visitor-kiosk-status-error" role="status">
          {{ completedStatusError }}. El sistema volverá a consultar automáticamente.
        </p>
        <button class="visitor-kiosk-secondary" type="button" @click="resetKiosk">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /></svg>
          Inicio
          <svg class="visitor-kiosk-home-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </button>
      </div>
    </section>
  </main>
</template>
