# Rollo — web

Sitio público de [Rollo](https://somosrollo.com): landing, soporte, privacidad, términos y las páginas que usan los links de la
app (`/entrar` y `/friends`). Es HTML estático armado con `scripts/build-site.mjs` y publicado en Vercel (cada push a `main` va a producción).

```bash
npm install
npm test         # tests (Vitest)
npm run build    # dist/
npm run preview  # build + servirlo en local
```

El video del hero es un proyecto [Remotion](https://www.remotion.dev) en `video/`. Los detalles están en `CLAUDE.md`.
