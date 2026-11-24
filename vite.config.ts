import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  // Server code reads DATABASE_URL / OLLAMA_* from process.env (Next used to load .env).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    server: { port: 3000 },
    // Native/WASM deps must not be bundled into the SSR build.
    ssr: { external: ["@xenova/transformers", "pg"] },
    plugins: [
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  };
});
