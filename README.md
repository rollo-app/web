# Rollo — web

Sitio público de [Rollo](https://somosrollo.com): landing, soporte, privacidad, términos y las páginas que usan los links de la
app (`/entrar` y `/friends`). Es HTML estático armado con `scripts/build-site.mjs` y servido por un Cloudflare Worker.

```bash
npm install
npm test         # tests (Vitest)
npm run build    # site/dist/
npm run dev      # local con wrangler
npm run deploy   # publica en somosrollo.com (y rollo.juanifraga.com)
```

El video del hero es un proyecto [Remotion](https://www.remotion.dev) en `video/`. Los detalles están en `CLAUDE.md`.
