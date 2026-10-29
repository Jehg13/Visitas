<script setup lang="ts">
import AccessAccountsSection from "./AccessAccountsSection.vue";

type AccessAccount = {
  login: string;
  name: string | null;
  email: string | null;
  active: string | null;
  role: string | null;
  phone: string | null;
  picture: string;
  sectionAccess: ("recepcion" | "anfitriones" | "administrador")[];
};

defineProps<{
  accounts: AccessAccount[];
  isAdmin: boolean;
  search: string;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  editAccount: [account: AccessAccount];
}>();
</script>

<template>
  <section class="workspace-grid directory-workspace">
    <section class="panel workspace-panel directory-panel access-panel" aria-labelledby="access-title">
      <AccessAccountsSection
        :search="search"
        :accounts="accounts"
        :is-admin="isAdmin"
        @update:search="emit('update:search', $event)"
        @edit="emit('editAccount', $event)"
      />
    </section>
  </section>
</template>
