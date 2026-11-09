<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiFetch as fetch } from "../api";

const props = withDefaults(defineProps<{ showTablet?: boolean }>(), {
  showTablet: false,
});

type Channel = "phone" | "tablet";
type DownloadRelease = { version: string; build: number; downloadUrl: string };
type DownloadOption = {
  channel: Channel;
  title: string;
  description: string;
  release: DownloadRelease | null;
};

const downloads = ref<DownloadOption[]>([
  {
    channel: "phone",
    title: "Celulares",
    description: "Recepción móvil",
    release: null,
  },
  ...(props.showTablet
    ? [{
        channel: "tablet" as const,
        title: "Tablets",
        description: "Visitas sin cita",
        release: null,
      }]
    : []),
]);

async function loadRelease(channel: Channel) {
  const response = await fetch(`/api/app-releases/latest?channel=${channel}&build=0`);
  const result = await response.json() as {
    release?: DownloadRelease | null;
    error?: string;
  };
  if (!response.ok) throw new Error(result.error ?? `No se pudo consultar el canal ${channel}.`);
  return result.release ?? null;
}

onMounted(async () => {
  try {
    const channels: Channel[] = props.showTablet ? ["phone", "tablet"] : ["phone"];
    const releases = await Promise.all(channels.map(loadRelease));
    downloads.value = downloads.value.map((download) => ({
      ...download,
      release: releases[channels.indexOf(download.channel)] ?? null,
    }));
  } catch (error) {
    console.error("Could not load mobile app download versions:", error);
  }
});
</script>

<template>
  <section class="app-download-card" aria-label="Descargas de la aplicación Android">
    <div class="app-download-card-heading">
      <span class="app-download-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 3v12m-5-5 5 5 5-5" />
          <path d="M5 16v4h14v-4" />
        </svg>
      </span>
      <span class="app-download-card-copy">
        <strong>Descargar app para Android</strong>
        <span>
          {{ props.showTablet
            ? "Selecciona la versión para celulares o tablets."
            : "Disponible para celulares." }}
        </span>
      </span>
    </div>
    <div class="app-download-card-releases">
      <a
        v-for="download in downloads"
        :key="download.channel"
        class="app-download-card-release"
        :href="download.release?.downloadUrl ?? '/downloads/recep-movil.apk?v=1.0.2-3'"
        :download="download.release ? undefined : 'CyMEZ-Recepcion-1.0.2.apk'"
      >
        <span class="app-download-card-release-copy">
          <strong>{{ download.title }}</strong>
          <small>{{ download.description }}</small>
        </span>
        <span class="app-download-card-release-version">
          {{ download.release ? `v${download.release.version} · ${download.release.build}` : "Descargar" }}
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 10h12m-5-5 5 5-5 5" />
          </svg>
        </span>
      </a>
    </div>
  </section>
</template>
