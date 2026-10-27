import { defineStore } from "pinia";
import { ref } from "vue";
import type { AccessAccount, AuthenticatedUser } from "./types";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthenticatedUser | null>(null);
  const accounts = ref<AccessAccount[]>([]);

  function setSession(nextUser: AuthenticatedUser, nextAccounts: AccessAccount[]) {
    user.value = nextUser;
    accounts.value = nextAccounts;
  }

  function clearSession() {
    user.value = null;
    accounts.value = [];
  }

  return { user, accounts, setSession, clearSession };
});
