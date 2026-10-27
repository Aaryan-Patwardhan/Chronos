import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Local stand-in for Vercel: runs api/<name>.ts for /api/<name> during
// `pnpm dev`, so the server-side ranking works without `vercel dev`.
function localApi(): Plugin {
  return {
    name: 'local-vercel-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const match = url.pathname.match(/^\/api\/([a-z]+)$/)
        if (!match) return next()
        let raw = ''
        for await (const chunk of req) raw += chunk
        const vreq = Object.assign(req, {
          query: Object.fromEntries(url.searchParams),
          body: raw ? JSON.parse(raw) : undefined,
        })
        const vres = Object.assign(res, {
          status(code: number) { res.statusCode = code; return vres },
          json(data: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) },
        })
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`)
          await mod.default(vreq, vres)
        } catch (e) {
          console.error(e)
          if (!res.writableEnded) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Not found' })) }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return { plugins: [react(), tailwindcss(), localApi()] }
})
