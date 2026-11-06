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

function updateOrientation() {
  isTabletPortrait.value = tabletPortrait.matches;
  isPhoneLandscape.value = phoneLandscape.matches;
}

onMounted(() => {
  tabletPortrait.addEventListener("change", updateOrientation);
  phoneLandscape.addEventListener("change", updateOrientation);
  updateOrientation();
});

onUnmounted(() => {
  tabletPortrait.removeEventListener("change", updateOrientation);
  phoneLandscape.removeEventListener("change", updateOrientation);
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
</template>
