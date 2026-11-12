# Rollo — web

Contexto para Claude Code. Respondé en español rioplatense (voseo), conciso y con recomendaciones directas.
Los textos del sitio también van en rioplatense con voseo.

Es el **sitio público** de Rollo (app iOS de fotos en grupo que nadie ve hasta el revelado): la landing, soporte, los legales
y las dos páginas que usan los links que manda la app (`/login` y `/friends`). Vivía en `rollo-app/mobile` hasta el
11/11/2026 (la historia vieja está ahí); se separó junto con la mudanza al dominio propio
(decisión en `rollo-app/backend`, `docs/decisiones/0003-dominio-propio.md`). La app vive en
[rollo-app/mobile](https://github.com/rollo-app/mobile) y la API en [rollo-app/backend](https://github.com/rollo-app/backend).

## Dominios

- **`rolloproject.com`** (canónico; la marca es "Rollo Project": `SITE_URL` en `scripts/build-site.mjs`, `og:url`, `og:image`, links entre páginas).
- **`somosrollo.com`** (primer dominio propio, usado unas horas el 11/11/2026): redirige a `rolloproject.com` desde Vercel.
- **`rollo.juanifraga.com`** sirve **lo mismo** y no se saca: los builds de la app ya instalados declaran ese dominio para
  Universal Links, y los mails y links de amistad ya mandados apuntan ahí. Los dos son dominios del mismo proyecto de Vercel
  y publican el mismo `/.well-known/apple-app-site-association`. El DNS sigue en Cloudflare (registros en "DNS only", sin el
  proxy naranja, apuntando a Vercel).

## Deploy (Vercel)

Proyecto de Vercel conectado a este repo (misma cuenta que `front-admin`): cada push a `main` publica en producción y cada
PR tiene su preview. La config está en `vercel.json` (sin framework: `npm ci`, `npm run build`, sirve `dist/` tal cual) y el
header `Content-Type: application/json` del archivo de Universal Links, que no tiene extensión. Vercel sirve los estáticos
con soporte de rangos (lo que necesita Safari para reproducir el video del hero). Hasta el 11/11/2026 el sitio corría en un
Worker de Cloudflare (`rollo-site`).

## Qué hay

Solo archivos estáticos: la home es la **landing** corta (hero con el video del celular + 2 secciones, mapa y revelado,
con una captura de la app cada una + cierre; badge oficial "Descárgalo en el App Store"), `/support` (preguntas frecuentes y
contacto; `/#soporte` cae en el link a esa página), `/privacy`, `/terms`, `/friends` (respaldo del link de amistad:
código, "Abrir Rollo" y bajar la app, sin redirigir) y `/login` (el link mágico del mail; script inline, sin pedidos a ningún
lado, con su CSP; solo abre `rollo://login?token=…&email=…` y borra el fragmento de la barra). Los textos legales se escriben
**solo** en `docs/legal/*.md`; `scripts/build-site.mjs` arma el HTML en `dist/` (la home vive en `scripts/site/home.mjs`,
los tokens de color en `scripts/site/tokens.mjs`). Son las URLs de privacidad (`/privacy`), soporte (`/support`) y marketing de App Store Connect. **Las rutas van en inglés**; las viejas en español (`/entrar`, `/soporte`, `/privacidad`, `/terminos`) redirigen (308, `redirects` de `vercel.json`) porque las usan mails ya mandados y builds de la app hasta la 1.3.0.

- **Botón de la home:** la app está en la App Store, así que `STORE_MODE` es `"appstore"` por defecto (`SITE_STORE_MODE=beta`
  vuelve al botón de TestFlight). El botón es el badge oficial de Apple (`scripts/site/app-store-badge.svg`, negro, es-MX, bajado de
  `toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/es-mx`; no se dibuja a mano) y apunta a
  `APP_STORE_URL` (`https://apps.apple.com/app/id6825843502`, sin país). Sin el badge o sin `APP_STORE_URL` el build falla; la ruta
  del badge se puede pisar con `SITE_APP_STORE_BADGE` (lo usa el test). El deploy no setea `SITE_STORE_MODE`.
- **Video del hero:** proyecto Remotion en `video/` (paquete aparte, con su `package.json`): escenas que recrean la app con las
  fotos del viaje de Juani (cámara, mapa real, revelado, galería, perfil y momento). Las fotos no entran al repo
  (`npm run photos -- <zip>` en `video/` las prepara en una carpeta ignorada). `npm run render` deja `hero.mp4`, `hero.webm`,
  `hero-poster.jpg`, `map.jpg` y `reveal.jpg` en `scripts/site/` (se commitean); `npm run stills` solo las dos capturas. Con
  "Reducir movimiento" queda el póster. El mapa usa **una copia** del estilo de la app (`video/src/map/style.ts` +
  `positron.json`, de `mobile/src/features/map/`): si cambia la paleta de la app, copiar los dos archivos de nuevo.
- **Animaciones:** Motion (`animate`, `inView`) empaquetado con esbuild en `/motion.js` (servido desde el sitio, sin CDN) +
  `scripts/site/landing.js`. Con "Reducir movimiento" o sin JS la página queda en su estado final. Ojo: en Motion no animar a
  `transform: "none"` (lo vuelve una matriz de escala 0); usar `y`.
- **Analytics:** Cloudflare Web Analytics (sin cookies, solo vistas). El token (público) está en `CF_ANALYTICS_TOKEN` de
  `build-site.mjs`; `SITE_CF_ANALYTICS_TOKEN=""` arma sin beacon (lo usan los tests). El beacon va en todas las páginas menos
  `/login`; en `/friends` el CSP suma `static.cloudflareinsights.com` solo cuando hay token. **Pendiente:** el sitio de Web
  Analytics está dado de alta para `rollo.juanifraga.com`; sumar `rolloproject.com`.
- **QR en desktop:** el hero lleva un QR inline (`qrcode`, generado en el build) con "Escaneá con tu iPhone"; solo en pantallas
  anchas con mouse (`hover:hover` + `pointer:fine`).
- **Smart App Banner:** con `STORE_MODE === "appstore"` la home suma `apple-itunes-app` (app-id 6825843502).
- **Imagen para compartir:** `npm run og` regenera `scripts/site/og.png` (1200×630, `scripts/build-og.mjs`); se commitea.
- **Universal Links:** `/.well-known/apple-app-site-association` (`application/json` vía `_headers`) con el app ID
  `UXHNAR4HYC.com.juanifraga.rollo.app`, para `/login` y `/friends`.

Contacto: `support@rolloproject.com` (Email Routing de Cloudflare → Gmail de Juani).

## Cómo trabajamos

- **Idioma:** código, comentarios y descripciones de tests en **inglés**; textos del sitio, commits y PRs en español.
- **TDD:** primero el test, verlo fallar, código mínimo. Tests en `scripts/__tests__/` con **Vitest** (`npm test`; arman el sitio
  en una carpeta temporal y miran el HTML). Los del video: `npm test` dentro de `video/`.
- **Ramas:** `develop` es la default; features en `feature/*`, vuelven por PR con CI en verde. `main` es lo publicado.
- `.npmrc` con `legacy-peer-deps=true`, como en los otros repos.

```bash
npm test          # tests del sitio
npm run build     # arma dist/
npm run preview   # build + servirlo en local (npx serve)
npm run og        # regenera la imagen para compartir
```
