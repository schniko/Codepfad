import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: fileURLToPath(new URL("./ui/reference-entry.jsx", import.meta.url)),
      output: { entryFileNames: "reference-ui.js" },
    },
  },
});
