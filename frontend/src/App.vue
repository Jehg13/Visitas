<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterView } from "vue-router";

const tabletPortrait = window.matchMedia(
  "(orientation: portrait) and (min-width: 768px) and (any-pointer: coarse)",
);
const phoneLandscape = window.matchMedia(
  "(orientation: landscape) and (max-height: 500px) and (any-pointer: coarse)",
);

const isTabletPortrait = ref(tabletPortrait.matches);
const isPhoneLandscape = ref(phoneLandscape.matches);
const orientationRequired = computed(
  () => isTabletPortrait.value || isPhoneLandscape.value,
);
const webUpdateAvailable = ref(false);
const availableBuildId = ref<string | null>(null);
const dismissedBuildId = ref<string | null>(null);
let versionCheckTimer: number | undefined;
let versionCheckFailed = false;
let versionCheckInProgress = false;

function updateOrientation() {
  isTabletPortrait.value = tabletPortrait.matches;
  isPhoneLandscape.value = phoneLandscape.matches;
}

async function checkForWebUpdate() {
  if (document.visibilityState === "hidden" || versionCheckInProgress) return;
  versionCheckInProgress = true;
  try {
    const response = await fetch("/app-version.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Version check returned HTTP ${response.status}.`);
    }
    const result = await response.json() as { buildId?: unknown };
    if (typeof result.buildId !== "string" || result.buildId.length === 0) {
      throw new Error("Version check returned an invalid build ID.");
    }
    versionCheckFailed = false;
    availableBuildId.value = result.buildId;
    if (
      result.buildId !== __APP_BUILD_ID__ &&
      result.buildId !== dismissedBuildId.value
    ) {
      webUpdateAvailable.value = true;
    }
  } catch (error) {
    if (!versionCheckFailed) {
      console.warn("No se pudo comprobar si hay una actualización web:", error);
    }
    versionCheckFailed = true;
  } finally {
    versionCheckInProgress = false;
  }
}

function dismissWebUpdate() {
  dismissedBuildId.value = availableBuildId.value;
  webUpdateAvailable.value = false;
}

function applyWebUpdate() {
  window.location.reload();
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") void checkForWebUpdate();
}

onMounted(() => {
  tabletPortrait.addEventListener("change", updateOrientation);
  phoneLandscape.addEventListener("change", updateOrientation);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  updateOrientation();
  void checkForWebUpdate();
  versionCheckTimer = window.setInterval(() => {
    void checkForWebUpdate();
  }, 60_000);
});

onUnmounted(() => {
  tabletPortrait.removeEventListener("change", updateOrientation);
  phoneLandscape.removeEventListener("change", updateOrientation);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (versionCheckTimer !== undefined) window.clearInterval(versionCheckTimer);
});
</script>

<template>
  <div :inert="orientationRequired">
    <RouterView />
  </div>
  <section
    v-if="orientationRequired"
    class="orientation-lock"
    role="alert"
    aria-live="assertive"
  >
    <div class="orientation-lock__card">
      <svg
        class="orientation-lock__icon"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="17"
          y="10"
          width="30"
          height="44"
          rx="4"
          stroke="currentColor"
          stroke-width="3"
        />
        <path
          d="M25 47h14M8 24a25 25 0 0 1 43-12M56 40a25 25 0 0 1-43 12M51 5v8h-8M13 59v-8h8"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <h1>Gira tu dispositivo</h1>
      <p v-if="isTabletPortrait">
        Para continuar, coloca tu tableta en posición horizontal.
      </p>
      <p v-else>
        Para continuar, coloca tu celular en posición vertical.
      </p>
    </div>
  </section>
  <aside
    v-if="webUpdateAvailable"
    class="web-update-banner"
    role="status"
    aria-live="polite"
  >
    <div class="web-update-banner__message">
      <strong>Hay una actualización disponible.</strong>
      <span>Recarga la página para usar la versión más reciente.</span>
    </div>
    <div class="web-update-banner__actions">
      <button type="button" class="web-update-banner__later" @click="dismissWebUpdate">
        Después
      </button>
      <button type="button" class="web-update-banner__reload" @click="applyWebUpdate">
        Actualizar ahora
      </button>
    </div>
  </aside>
</template>
