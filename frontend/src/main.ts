import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./style.css";
import "./dashboard-design-system.css";
import { router } from "./router";

createApp(App).use(createPinia()).use(router).mount("#app");
