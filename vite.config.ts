import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// STANDALONE=1 produces one JS chunk (no dynamic-import split for the
// #bench route) so `npm run build:standalone` output can be inlined into a
// single self-contained HTML file — used to publish this app as a Claude
// Artifact. Normal builds stay multi-chunk.
const standalone = process.env.STANDALONE === "1";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    outDir: "dist",
    sourcemap: !standalone,
    rollupOptions: standalone ? { output: { inlineDynamicImports: true } } : undefined,
  },
});
