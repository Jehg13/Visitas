import { defineStore } from "pinia";
import { ref } from "vue";
export const useAuthStore = defineStore("auth", () => {
    const user = ref(null);
    const accounts = ref([]);
    function setSession(nextUser, nextAccounts) {
        user.value = nextUser;
        accounts.value = nextAccounts;
    }
    function clearSession() {
        user.value = null;
        accounts.value = [];
    }
    return { user, accounts, setSession, clearSession };
});
