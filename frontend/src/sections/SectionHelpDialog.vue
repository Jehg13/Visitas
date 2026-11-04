<script setup lang="ts">
type HelpSection = {
  title: string;
  text?: string;
  steps?: string[];
};

defineProps<{
  title: string;
  introduction: string;
  sections: HelpSection[];
  theme: "dark" | "light";
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      class="dashboard-app modal-backdrop section-help-backdrop"
      :data-theme="theme"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <section
        class="dialog workspace-dialog section-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-help-title"
      >
        <button class="dialog-close" type="button" aria-label="Cerrar ayuda" @click="emit('close')">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
        <div class="section-help-heading">
          <span class="dialog-icon">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.8 9a2.3 2.3 0 1 1 3.9 1.7c-1.1 1-1.7 1.4-1.7 2.8M12 17h.01" />
            </svg>
          </span>
          <div class="section-help-title-copy">
            <span class="section-help-eyebrow">GUÍA RÁPIDA</span>
            <h2 id="section-help-title">{{ title }}</h2>
          </div>
        </div>
        <p class="dialog-description">{{ introduction }}</p>
        <slot name="before-content" />
        <div class="section-help-content">
          <article
            v-for="(section, index) in sections"
            :key="`${index}-${section.title}`"
            class="section-help-card"
          >
            <header class="section-help-card-heading">
              <span class="section-help-card-number" aria-hidden="true">{{ String(index + 1).padStart(2, "0") }}</span>
              <h3>{{ section.title }}</h3>
            </header>
            <p v-if="section.text">{{ section.text }}</p>
            <ol v-if="section.steps?.length" class="section-help-steps">
              <li v-for="(step, stepIndex) in section.steps" :key="`${stepIndex}-${step}`">{{ step }}</li>
            </ol>
          </article>
        </div>
        <button class="button-primary section-help-done" type="button" @click="emit('close')">Entendido</button>
      </section>
    </div>
  </Teleport>
</template>
