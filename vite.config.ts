import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { codeInspectorPlugin } from 'code-inspector-plugin';

export default defineConfig({
  plugins: [
    vue(),
    codeInspectorPlugin({
      bundler: 'vite',
    })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  }
});
