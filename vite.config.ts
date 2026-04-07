import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, PluginOption } from "vite";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// Load @github/spark plugin only when available (GitHub Spark env)
let iconProxy: PluginOption | null = null
try {
  const mod = await import("@github/spark/vitePhosphorIconProxyPlugin")
  iconProxy = mod.default() as PluginOption
} catch {
  // Not in GitHub Spark environment — icons work directly via @phosphor-icons/react
}

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    ...(iconProxy ? [iconProxy] : []),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
});
