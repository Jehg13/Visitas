<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { apiFetch as fetch } from "../api";

type Channel = "phone" | "tablet";
type Release = {
  id: number;
  channel: Channel;
  version: string;
  build: number;
  notes: string;
  filename: string;
  size: number;
  sha256: string;
  createdBy: string;
  createdAt: string;
  downloadUrl: string;
};

const props = defineProps<{ theme: "dark" | "light" }>();
const releases = ref<Release[]>([]);
const channel = ref<Channel>("phone");
const version = ref("1.0.2");
const build = ref(3);
const notes = ref("");
const apk = ref<File | null>(null);
const loading = ref(false);
const publishing = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

const channelLabels: Record<Channel, string> = {
  phone: "Celulares · Recepción",
  tablet: "Tablets · Visitas sin cita",
};

watch([channel, releases], () => {
  const lastBuild = releases.value
    .filter((release) => release.channel === channel.value)
    .reduce((latest, release) => Math.max(latest, release.build), 0);
  build.value = lastBuild + 1;
}, { immediate: true });

async function loadReleases() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch("/api/app-releases/admin");
    const result = await response.json() as { releases?: Release[]; error?: string };
    if (!response.ok || !Array.isArray(result.releases)) {
      throw new Error(result.error ?? "No se pudo cargar el historial de versiones.");
    }
    releases.value = result.releases;
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : "No se pudo cargar el historial de versiones.";
  } finally {
    loading.value = false;
  }
}

function chooseApk(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  apk.value = input.files?.[0] ?? null;
  successMessage.value = "";
}

async function publishRelease() {
  if (!apk.value) {
    errorMessage.value = "Selecciona el archivo APK que vas a publicar.";
    return;
  }
  publishing.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const form = new FormData();
    form.set("channel", channel.value);
    form.set("version", version.value.trim());
    form.set("build", String(build.value));
    form.set("notes", notes.value.trim());
    form.set("apk", apk.value);
    const response = await fetch("/api/app-releases/admin", {
      method: "POST",
      body: form,
    });
    const result = await response.json() as { release?: Release; error?: string };
    if (!response.ok || !result.release) {
      throw new Error(result.error ?? "No se pudo publicar la versión.");
    }
    version.value = result.release.version;
    build.value = result.release.build + 1;
    notes.value = "";
    apk.value = null;
    if (fileInput.value) fileInput.value.value = "";
    successMessage.value =
      `Versión ${result.release.version} (${result.release.build}) publicada para ${channelLabels[result.release.channel]}.`;
    await loadReleases();
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : "No se pudo publicar la versión.";
  } finally {
    publishing.value = false;
  }
}

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

onMounted(loadReleases);
</script>

<template>
  <section class="mobile-release-section" :data-theme="props.theme">
    <div class="mobile-release-intro">
      <span class="mobile-release-eyebrow">DISTRIBUCIÓN ANDROID</span>
      <h2>Publica una actualización</h2>
      <p>
        Elige a qué dispositivos llegará. La aplicación notificará cuando detecte
        una compilación más reciente; cada canal mantiene su propio número de compilación.
      </p>
    </div>

    <form class="mobile-release-form" @submit.prevent="publishRelease">
      <fieldset class="mobile-release-channels">
        <legend>Canal de destino</legend>
        <label>
          <input v-model="channel" type="radio" value="phone" />
          <span><strong>Celulares</strong><small>Recepción móvil</small></span>
        </label>
        <label>
          <input v-model="channel" type="radio" value="tablet" />
          <span><strong>Tablets</strong><small>Visitas sin cita</small></span>
        </label>
      </fieldset>

      <div class="mobile-release-fields">
        <label>
          <span>Versión</span>
          <input v-model="version" type="text" inputmode="decimal" placeholder="1.0.2" required />
        </label>
        <label>
          <span>Número de compilación</span>
          <input v-model.number="build" type="number" min="1" step="1" required />
        </label>
      </div>
      <label class="mobile-release-field">
        <span>Notas de la actualización</span>
        <textarea v-model="notes" rows="3" maxlength="2000" placeholder="Describe brevemente los cambios." />
      </label>
      <label class="mobile-release-field">
        <span>Archivo APK · máximo 150 MB</span>
        <input
          ref="fileInput"
          type="file"
          accept=".apk,application/vnd.android.package-archive"
          required
          @change="chooseApk"
        />
        <small v-if="apk">{{ apk.name }} · {{ formatSize(apk.size) }}</small>
      </label>
      <p class="mobile-release-notice">
        Solo se publica para el canal seleccionado. La versión y compilación deben
        coincidir con el APK, y este debe estar firmado con la misma clave de release
        de las instalaciones actuales. Android pedirá confirmar la instalación.
      </p>
      <p v-if="errorMessage" class="mobile-release-message is-error" role="alert">
        {{ errorMessage }}
      </p>
      <p v-if="successMessage" class="mobile-release-message is-success" role="status">
        {{ successMessage }}
      </p>
      <button class="mobile-release-submit" type="submit" :disabled="publishing">
        {{ publishing ? "Publicando…" : "Publicar actualización" }}
      </button>
    </form>

    <div class="mobile-release-history">
      <div class="mobile-release-history-heading">
        <div>
          <h2>Versiones publicadas</h2>
          <p>Se conservan para consultar las publicaciones anteriores.</p>
        </div>
        <button type="button" :disabled="loading" @click="loadReleases">
          {{ loading ? "Actualizando…" : "Actualizar lista" }}
        </button>
      </div>
      <p v-if="loading && releases.length === 0" class="mobile-release-empty">
        Cargando versiones…
      </p>
      <p v-else-if="releases.length === 0" class="mobile-release-empty">
        Aún no hay versiones publicadas desde este panel.
      </p>
      <div v-else class="mobile-release-table-wrap">
        <table class="mobile-release-table">
          <thead>
            <tr>
              <th>Versión</th>
              <th>Canal</th>
              <th>Publicado</th>
              <th>APK</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="release in releases" :key="release.id">
              <td><strong>{{ release.version }}</strong><small>Compilación {{ release.build }}</small></td>
              <td>{{ channelLabels[release.channel] }}</td>
              <td>{{ formatDate(release.createdAt) }}</td>
              <td>
                <a :href="release.downloadUrl">{{ formatSize(release.size) }}</a>
                <small>{{ release.filename }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mobile-release-section {
  display: grid;
  gap: 20px;
  width: min(100%, 980px);
  margin: 0 auto;
  color: #e7eef8;
}

.mobile-release-intro,
.mobile-release-form,
.mobile-release-history {
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid #264463;
  border-radius: 16px;
  background: linear-gradient(145deg, #0d2038, #09172a);
}

.mobile-release-eyebrow {
  color: #7ab8f3;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.mobile-release-intro h2,
.mobile-release-history h2 {
  margin: 8px 0;
  font-size: 1.15rem;
}

.mobile-release-intro p,
.mobile-release-history-heading p,
.mobile-release-notice,
.mobile-release-empty {
  margin: 0;
  color: #a9bad0;
  font-size: 0.88rem;
  line-height: 1.55;
}

.mobile-release-form {
  display: grid;
  gap: 18px;
}

.mobile-release-channels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}

.mobile-release-channels legend,
.mobile-release-field > span,
.mobile-release-fields label > span {
  margin-bottom: 8px;
  color: #dce8f6;
  font-size: 0.84rem;
  font-weight: 700;
}

.mobile-release-channels legend {
  grid-column: 1 / -1;
}

.mobile-release-channels label {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 10px;
  padding: 13px;
  border: 1px solid #2a4968;
  border-radius: 11px;
  cursor: pointer;
}

.mobile-release-channels input {
  margin-top: 3px;
  accent-color: #54a7f5;
}

.mobile-release-channels span,
.mobile-release-fields label,
.mobile-release-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.mobile-release-channels small,
.mobile-release-field small,
.mobile-release-table td small {
  display: block;
  margin-top: 4px;
  color: #9db1c9;
  font-size: 0.76rem;
}

.mobile-release-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.mobile-release-fields input,
.mobile-release-field input,
.mobile-release-field textarea {
  width: 100%;
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid #355676;
  border-radius: 9px;
  background: #071629;
  color: inherit;
  font: inherit;
}

.mobile-release-field input[type="file"] {
  padding: 9px;
}

.mobile-release-field input[type="file"]::file-selector-button {
  margin-right: 10px;
  padding: 7px 10px;
  border: 0;
  border-radius: 7px;
  background: #18395b;
  color: #eff7ff;
  cursor: pointer;
}

.mobile-release-notice {
  padding: 11px 13px;
  border-left: 3px solid #529fe8;
  background: rgb(39 108 171 / 12%);
}

.mobile-release-message {
  margin: 0;
  font-size: 0.86rem;
}

.mobile-release-message.is-error {
  color: #ff9a9a;
}

.mobile-release-message.is-success {
  color: #7ee0b4;
}

.mobile-release-submit,
.mobile-release-history-heading button {
  min-height: 42px;
  padding: 10px 15px;
  border: 1px solid #3985c9;
  border-radius: 9px;
  background: #14558f;
  color: white;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
}

.mobile-release-submit:disabled,
.mobile-release-history-heading button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.mobile-release-history-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.mobile-release-table-wrap {
  overflow-x: auto;
}

.mobile-release-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.mobile-release-table th,
.mobile-release-table td {
  padding: 12px 10px;
  border-bottom: 1px solid #223c59;
  font-size: 0.82rem;
  vertical-align: top;
}

.mobile-release-table th {
  color: #a9bad0;
  font-size: 0.75rem;
}

.mobile-release-table td a {
  color: #8bc6ff;
}

.mobile-release-section[data-theme="light"] {
  color: #18334f;
}

.mobile-release-section[data-theme="light"] .mobile-release-intro,
.mobile-release-section[data-theme="light"] .mobile-release-form,
.mobile-release-section[data-theme="light"] .mobile-release-history {
  border-color: #d5e0ec;
  background: linear-gradient(145deg, #fff, #f5f8fc);
  box-shadow: 0 8px 24px rgb(34 73 111 / 6%);
}

.mobile-release-section[data-theme="light"] .mobile-release-intro p,
.mobile-release-section[data-theme="light"] .mobile-release-history-heading p,
.mobile-release-section[data-theme="light"] .mobile-release-notice,
.mobile-release-section[data-theme="light"] .mobile-release-empty,
.mobile-release-section[data-theme="light"] .mobile-release-channels small,
.mobile-release-section[data-theme="light"] .mobile-release-field small,
.mobile-release-section[data-theme="light"] .mobile-release-table td small,
.mobile-release-section[data-theme="light"] .mobile-release-table th {
  color: #62778d;
}

.mobile-release-section[data-theme="light"] .mobile-release-channels legend,
.mobile-release-section[data-theme="light"] .mobile-release-field > span,
.mobile-release-section[data-theme="light"] .mobile-release-fields label > span {
  color: #284766;
}

.mobile-release-section[data-theme="light"] .mobile-release-channels label {
  border-color: #d2dfec;
  background: #f8fbff;
}

.mobile-release-section[data-theme="light"] .mobile-release-fields input,
.mobile-release-section[data-theme="light"] .mobile-release-field input,
.mobile-release-section[data-theme="light"] .mobile-release-field textarea {
  border-color: #c9d8e6;
  background: white;
  color: #18334f;
}

.mobile-release-section[data-theme="light"] .mobile-release-table th,
.mobile-release-section[data-theme="light"] .mobile-release-table td {
  border-color: #dce5ef;
}

@media (max-width: 640px) {
  .mobile-release-channels,
  .mobile-release-fields {
    grid-template-columns: 1fr;
  }

  .mobile-release-history-heading {
    flex-direction: column;
  }

  .mobile-release-table {
    min-width: 600px;
  }
}
</style>
