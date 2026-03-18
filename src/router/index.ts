import { createRouter, createWebHistory } from "vue-router";

import MapEditorPage from "@/pages/MapEditorPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/maps/:mapId?",
      name: "map-editor",
      component: MapEditorPage,
    },
    {
      path: "/",
      redirect: "/maps",
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/maps",
    },
  ],
});

export default router;
