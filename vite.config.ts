import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  envPrefix: [],
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: false,
    rollupOptions: {
      input: {
        fake: resolve(projectRoot, "fake/index.html"),
        index: resolve(projectRoot, "index.html"),
        spotify: resolve(projectRoot, "spotify/index.html"),
      },
    },
  },
});
