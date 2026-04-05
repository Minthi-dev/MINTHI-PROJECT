import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, PluginOption } from "vite";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// Load @github/spark icon proxy plugin only if available (dev environment)
let iconProxyPlugin: PluginOption | undefined
try {
  const { default: createIconImportProxy } = await import("@github/spark/vitePhosphorIconProxyPlugin")
  iconProxyPlugin = createIconImportProxy() as PluginOption
} catch {
  // Not available (e.g. Vercel build) — skip
}

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    ...(iconProxyPlugin ? [iconProxyPlugin] : []),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
});
