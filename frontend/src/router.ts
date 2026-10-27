import { createRouter, createWebHistory } from "vue-router";
import AppShell from "./AppShell.vue";
import { dashboardSectionPaths } from "./dashboardRoutes";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: AppShell },
    ...Object.values(dashboardSectionPaths).map((path) => ({
      path,
      component: AppShell,
    })),
    { path: "/:pathMatch(.*)*", component: AppShell },
  ],
});
