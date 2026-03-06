import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    codeInspectorPlugin({
      behavior: {
        locate: true,
        /* ai: {
          codex: true,
        }, */
      },
      bundler: "vite",
      editor: 'code', // 指定 IDE 为 vscode
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
