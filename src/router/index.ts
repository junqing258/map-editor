import { createRouter, createWebHistory } from "vue-router";

import MapEditorPage from "@/pages/MapEditorPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "map-editor",
      component: MapEditorPage,
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

export default router;
