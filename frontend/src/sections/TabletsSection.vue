<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { apiFetch as fetch } from "../api";
import { confirmUser } from "../notifications";
import type { Company } from "../stores/types";

type PairingCodeStatus = "active" | "redeemed" | "expired" | "revoked";
type PairingCode = {
  id: number;
  companyId: number;
  companyName: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  status: PairingCodeStatus;
};
type GeneratedPairingCode = {
  code: string;
  pairingCode: Pick<PairingCode, "id" | "companyId" | "companyName" | "expiresAt">;
};

const props = defineProps<{
  companies: Company[];
  theme: "dark" | "light";
}>();

const codes = ref<PairingCode[]>([]);
const selectedCompanyId = ref<number | null>(null);
const generatedCode = ref<GeneratedPairingCode | null>(null);
const loading = ref(false);
const generating = ref(false);
const revokingCodeId = ref<number | null>(null);
const deletingCodeId = ref<number | null>(null);
const errorMessage = ref("");
const successMessage = ref("");

watch(
  () => props.companies,
  (companies) => {
    if (
      selectedCompanyId.value === null ||
      !companies.some((company) => company.id === selectedCompanyId.value)
    ) {
      selectedCompanyId.value = companies[0]?.id ?? null;
    }
  },
  { immediate: true },
);

function isPairingCode(value: unknown): value is PairingCode {
  if (typeof value !== "object" || value === null) return false;
  const code = value as Record<string, unknown>;
  return typeof code.id === "number" &&
    typeof code.companyId === "number" &&
    typeof code.companyName === "string" &&
    typeof code.createdBy === "string" &&
    typeof code.createdAt === "string" &&
    typeof code.expiresAt === "string" &&
    ["active", "redeemed", "expired", "revoked"].includes(String(code.status));
}

async function loadCodes() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch("/api/tablet-pairing-codes");
    const result = await response.json() as { codes?: unknown; error?: string };
    if (
      !response.ok ||
      !Array.isArray(result.codes) ||
      !result.codes.every(isPairingCode)
    ) {
      throw new Error(result.error ?? "No se pudieron cargar los códigos.");
    }
    codes.value = result.codes;
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : "No se pudieron cargar los códigos.";
  } finally {
    loading.value = false;
  }
}

async function generateCode() {
  if (selectedCompanyId.value === null || generating.value) return;
  generating.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  generatedCode.value = null;
  try {
    const response = await fetch("/api/tablet-pairing-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: selectedCompanyId.value }),
    });
    const result = await response.json() as {
      code?: unknown;
      pairingCode?: unknown;
      error?: string;
    };
    if (
      !response.ok ||
      typeof result.code !== "string" ||
      typeof result.pairingCode !== "object" ||
      result.pairingCode === null
    ) {
      throw new Error(result.error ?? "No se pudo generar el código.");
    }
    const pairingCode = result.pairingCode as Record<string, unknown>;
    if (
      typeof pairingCode.id !== "number" ||
      typeof pairingCode.companyId !== "number" ||
      typeof pairingCode.companyName !== "string" ||
      typeof pairingCode.expiresAt !== "string"
    ) {
      throw new Error("El servidor devolvió un código con formato inválido.");
    }
    generatedCode.value = {
      code: result.code,
      pairingCode: {
        id: pairingCode.id,
        companyId: pairingCode.companyId,
        companyName: pairingCode.companyName,
        expiresAt: pairingCode.expiresAt,
      },
    };
    successMessage.value = `Código generado para ${pairingCode.companyName}.`;
    await loadCodes();
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : "No se pudo generar el código.";
  } finally {
    generating.value = false;
  }
}

async function copyCode() {
  if (!generatedCode.value) return;
  try {
    await navigator.clipboard.writeText(generatedCode.value.code);
    successMessage.value = "Código copiado.";
  } catch (error) {
    console.error("Failed to copy tablet pairing code:", error);
    errorMessage.value = "No se pudo copiar. Selecciona y copia el código manualmente.";
  }
}

async function revokeCode(code: PairingCode) {
  if (code.status !== "active") return;
  const confirmed = await confirmUser(
    `El código para ${code.companyName} dejará de poder vincular una tablet.`,
    "Revocar código",
    "¿Revocar este código?",
    "warning",
  );
  if (!confirmed) return;

  revokingCodeId.value = code.id;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const response = await fetch(`/api/tablet-pairing-codes/${code.id}/revoke`, {
      method: "POST",
    });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) {
      throw new Error(result.error ?? "No se pudo revocar el código.");
    }
    successMessage.value = result.message ?? "El código se revocó.";
    await loadCodes();
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : "No se pudo revocar el código.";
  } finally {
    revokingCodeId.value = null;
  }
}

async function deleteCode(code: PairingCode) {
  const confirmed = await confirmUser(
    `Se eliminará el código de ${code.companyName} del historial. Esta acción no se puede deshacer. Si ya se utilizó, la tablet vinculada no se desvinculará.`,
    "Eliminar código",
    "¿Eliminar este código del historial?",
    "warning",
  );
  if (!confirmed) return;

  deletingCodeId.value = code.id;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const response = await fetch(`/api/tablet-pairing-codes/${code.id}`, {
      method: "DELETE",
    });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) {
      throw new Error(result.error ?? "No se pudo eliminar el código.");
    }
    successMessage.value = result.message ?? "El código se eliminó del historial.";
    await loadCodes();
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : "No se pudo eliminar el código.";
  } finally {
    deletingCodeId.value = null;
  }
}

function statusLabel(status: PairingCodeStatus) {
  return {
    active: "Pendiente",
    redeemed: "Vinculada",
    expired: "Vencido",
    revoked: "Revocado",
  }[status];
}

function formatDate(value: string) {
  const parsedValue = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(parsedValue);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
}

onMounted(loadCodes);
</script>

<template>
  <section class="workspace-grid directory-workspace tablets-section" :data-theme="props.theme">
    <section class="panel workspace-panel directory-panel" aria-labelledby="tablets-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <span class="access-section-icon">
            <svg class="icon"><use href="#i-tablet" /></svg>
          </span>
          <div class="access-section-title-copy">
            <span class="access-section-eyebrow">Visitas sin cita</span>
            <h2 id="tablets-title">Vincular tablet</h2>
          </div>
        </div>
      </header>

      <form class="tablet-pairing-form" @submit.prevent="generateCode">
        <label class="tablet-company-field">
          <span>Empresa a la que se asignará</span>
          <select v-model.number="selectedCompanyId" required :disabled="generating || !companies.length">
            <option :value="null" disabled>Selecciona una empresa</option>
            <option v-for="company in companies" :key="company.id" :value="company.id">
              {{ company.name }}
            </option>
          </select>
        </label>
        <button
          class="button-primary"
          type="submit"
          :disabled="selectedCompanyId === null || generating"
        >
          <svg class="icon"><use href="#i-plus" /></svg>
          <span>{{ generating ? "Generando…" : "Generar código" }}</span>
        </button>
      </form>

      <p class="tablet-pairing-note">
        El código se usa una sola vez, vence en 10 minutos y queda asignado a la empresa seleccionada.
        Solo se muestra al generarlo; si se pierde, revócalo y genera otro.
        La app de tablet aún requiere una actualización para poder canjearlos; genéralo cuando la tablet ya tenga esa versión.
      </p>

      <div v-if="generatedCode" class="tablet-generated-code" role="status" aria-live="polite">
        <div>
          <span>Código para {{ generatedCode.pairingCode.companyName }}</span>
          <strong>{{ generatedCode.code }}</strong>
          <small>Vence {{ formatDate(generatedCode.pairingCode.expiresAt) }}</small>
        </div>
        <button class="button-secondary" type="button" @click="copyCode">
          Copiar código
        </button>
      </div>

      <p v-if="errorMessage" class="tablet-feedback tablet-feedback-error" role="alert">
        {{ errorMessage }}
      </p>
      <p v-else-if="successMessage" class="tablet-feedback tablet-feedback-success" role="status">
        {{ successMessage }}
      </p>
    </section>

    <section class="panel workspace-panel directory-panel" aria-labelledby="tablet-codes-title">
      <header class="panel-heading workspace-heading">
        <div class="panel-title">
          <span class="access-section-icon">
            <svg class="icon"><use href="#i-link" /></svg>
          </span>
          <div class="access-section-title-copy">
            <span class="access-section-eyebrow">Códigos recientes</span>
            <h2 id="tablet-codes-title">Historial de vinculación</h2>
          </div>
        </div>
        <button class="button-secondary" type="button" :disabled="loading" @click="loadCodes">
          {{ loading ? "Actualizando…" : "Actualizar" }}
        </button>
      </header>

      <div v-if="codes.length" class="workspace-table-scroll">
        <table class="workspace-table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Generado por</th>
              <th>Creación</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="code in codes" :key="code.id">
              <td><strong>{{ code.companyName }}</strong></td>
              <td>{{ code.createdBy }}</td>
              <td>{{ formatDate(code.createdAt) }}</td>
              <td>{{ formatDate(code.expiresAt) }}</td>
              <td>
                <span class="tablet-code-status" :class="`tablet-code-status-${code.status}`">
                  {{ statusLabel(code.status) }}
                </span>
              </td>
              <td>
                <div class="department-card-actions tablet-row-actions">
                  <button
                    v-if="code.status === 'active'"
                    class="staff-edit-button"
                    type="button"
                    :disabled="revokingCodeId === code.id || deletingCodeId === code.id"
                    @click="revokeCode(code)"
                  >
                    {{ revokingCodeId === code.id ? "Revocando…" : "Revocar" }}
                  </button>
                  <button
                    class="workspace-remove"
                    type="button"
                    :disabled="deletingCodeId === code.id || revokingCodeId === code.id"
                    :aria-label="`Eliminar código de ${code.companyName}`"
                    @click="deleteCode(code)"
                  >
                    {{ deletingCodeId === code.id ? "Eliminando…" : "Eliminar" }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="loading" class="department-empty-state">
        <strong>Cargando códigos…</strong>
      </div>
      <div v-else class="department-empty-state">
        <span class="department-card-icon">
          <svg class="icon"><use href="#i-tablet" /></svg>
        </span>
        <strong>Aún no hay códigos de vinculación</strong>
        <p>Genera un código y asígnalo a la empresa que usará la tablet.</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.tablets-section {
  gap: 1.25rem;
}

.tablet-pairing-form {
  display: flex;
  align-items: end;
  gap: 1rem;
  padding: 1.25rem;
}

.tablet-company-field {
  display: grid;
  flex: 1;
  gap: 0.5rem;
  color: var(--app-muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.tablet-company-field select {
  width: 100%;
  min-height: 2.8rem;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  padding: 0.65rem 0.8rem;
  background: var(--app-control);
  color: var(--app-text);
}

.tablet-pairing-form > button {
  min-height: 2.8rem;
  white-space: nowrap;
}

.tablet-pairing-note {
  margin: 0;
  padding: 0 1.25rem 1.25rem;
  color: var(--app-muted);
  font-size: 0.83rem;
  line-height: 1.55;
}

.tablet-generated-code {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 0 1.25rem 1.25rem;
  border: 1px solid var(--app-border);
  border-radius: 0.85rem;
  padding: 1rem;
  background: var(--app-control);
}

.tablet-generated-code > div {
  display: grid;
  gap: 0.35rem;
}

.tablet-generated-code span,
.tablet-generated-code small {
  color: var(--app-muted);
  font-size: 0.8rem;
}

.tablet-generated-code strong {
  color: var(--app-text);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: clamp(1.2rem, 3vw, 1.65rem);
  letter-spacing: 0.14em;
}

.tablet-generated-code button {
  flex-shrink: 0;
}

.tablet-feedback {
  margin: 0 1.25rem 1rem;
  font-size: 0.85rem;
}

.tablet-feedback-error {
  color: var(--ds-danger-text);
}

.tablet-feedback-success {
  color: var(--ds-success);
}

.tablet-code-status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.3rem 0.65rem;
  background: var(--app-control);
  color: var(--app-muted);
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
}

.tablet-code-status-active {
  color: #d99731;
}

.tablet-code-status-redeemed {
  color: #36ae7a;
}

.tablet-code-status-expired,
.tablet-code-status-revoked {
  color: var(--app-muted);
}

@media (max-width: 700px) {
  .tablet-pairing-form,
  .tablet-generated-code {
    align-items: stretch;
    flex-direction: column;
  }

  .tablet-pairing-form > button {
    justify-content: center;
  }
}
</style>
