import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from both the frontend dir and the repo root so AUTH_TOKEN in the
  // root .env also configures the dev proxy.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...loadEnv(mode, path.resolve(process.cwd(), '..'), '') }
  const authHeader = env.AUTH_TOKEN ? { Authorization: `Bearer ${env.AUTH_TOKEN}` } : {}

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Dev-only: replace the auth placeholder so the SPA can call the API
        // directly. Production injection is done by the backend or nginx.
        name: 'inject-auth-token',
        apply: 'serve' as const,
        transformIndexHtml(html: string) {
          return html.replace('%%AUTH_TOKEN%%', env.AUTH_TOKEN || '');
        },
      },
    ],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (env.AUTH_TOKEN && !proxyReq.getHeader('authorization')) {
                proxyReq.setHeader('Authorization', `Bearer ${env.AUTH_TOKEN}`)
              }
            })
          },
        },
        '/ws': {
          target: 'ws://127.0.0.1:8000',
          ws: true,
          changeOrigin: true,
          headers: authHeader,
        },
      },
    },
  }
})
