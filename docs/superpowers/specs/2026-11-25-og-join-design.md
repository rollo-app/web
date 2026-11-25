# Imagen dinámica para los links de invitación (`/join/<CÓDIGO>`)

## Para qué

Cuando alguien pega `https://rolloproject.com/join/<CÓDIGO>` en WhatsApp, iMessage, Instagram u otra app, la vista previa
tiene que mostrar la tarjeta de **ese** rollo (portada, nombre, fecha) y no la imagen fija del sitio (`og.png`). Es la
versión "link" de la tarjeta de invitación de Stories que la app ya arma con Skia.

## Objetivos y no-objetivos

- **Sí:** imagen 1200×630 por código + `og:title`, `og:description`, `og:url` y `og:image` por código, servidos desde el
  servidor (los crawlers no corren JS). Rollos comunes y eventos.
- **No:** cambiar la página `/join` que ve la persona (sigue igual, con su JS), tocar el backend, ni la app.
- **Anti-objetivo:** que `/join` deje de andar si el backend está lento o caído. Ante cualquier falla se sirve la página
  de siempre con `og.png`.

## Privacidad

Ya está decidida: la API en `develop` publica la vista previa de cualquier rollo con `?any=1` (rollo-app/backend#86) y
la página `/join` ya muestra nombre, portada y descripción. La imagen expone lo mismo; la diferencia es que WhatsApp y Meta
la guardan en su caché. El código no se dibuja en la imagen.

## Enfoques considerados

1. **Dos funciones de Vercel, sin middleware (elegido).** `vercel.json` reescribe `/join/:code` a la función `api/join`,
   que lee el `join/index.html` del build, pide la vista previa y reemplaza las etiquetas. La imagen la dibuja otra función,
   `api/og/join/[code]`, con `@vercel/og`. Todo testeable como funciones puras.
2. **Routing Middleware.** Igual, pero intercepta y se pide a sí mismo el HTML estático: un pedido interno más en cada
   visita y más difícil de probar en local.
3. **Dibujar en el Worker de Cloudflare.** Descartado: el plan gratis da 10 ms de CPU, poco para satori + resvg. Servir
   HTML distinto solo a crawlers por User-Agent: descartado, frágil.

## Diseño de la imagen (opción A, aprobada con mockup)

- **Fondo:** la portada a sangre (`object-fit: cover`, centrada), con un velo oscuro que va de la izquierda (≈72 %) a
  transparente (≈80 % del ancho).
- **Sin portada:** el degradé cobalto de la tarjeta de Stories (`#3155F5` → `#0b1a5c`, diagonal).
- **Arriba a la izquierda:** la marca, los tres círculos del logo en cobalto + "Rollo Project" en blanco. Sin portada,
  los círculos van en blanco para que se vean sobre el cobalto.
- **Abajo a la izquierda, apilado:** "Te invitaron a" (chico, 85 % de opacidad), el **nombre** (grande, bold, hasta 2
  líneas con "…"), y la línea de abajo: fecha y, si `memberCount` es un número (≥5), "· N personas".
- **Fecha** en la zona horaria del rollo: "12 de diciembre" si empieza y termina el mismo día, "3 al 8 de enero" en el
  mismo mes, "28 de diciembre al 3 de enero" si cambia. *Decisión mía:* sin año.
- **Rollo revelado:** misma tarjeta sin la cantidad de gente. *Decisión mía.*
- **Tipografía:** Inter (OFL) Regular y Bold empaquetada con la función (`@fontsource/inter`, archivos `.woff`). *Decisión
  mía:* es lo más cercano a la San Francisco de la tarjeta de la app.

## Etiquetas por código (`api/join`)

- Código válido (`^[A-Za-z0-9]{6}$`, en mayúsculas) y vista previa OK:
  - `<title>`: "<nombre> · Rollo Project".
  - `og:title`: el nombre.
  - `og:description`: la descripción del rollo (cortada a ~200 caracteres) o, si no tiene, "Te invitaron a este rollo en
    Rollo." / "…a este evento en Rollo." según `type`. *Decisión mía.*
  - `og:url`: `https://rolloproject.com/join/<CÓDIGO>`. Hoy apunta a `/join` para todos, y Meta agrupa por `og:url`:
    con la URL compartida todos los links mostrarían la misma vista previa.
  - `og:image`: `https://rolloproject.com/api/og/join/<CÓDIGO>?v=<hash>`. El hash sale de nombre, portada, fechas,
    `memberCount` y `revealed`, así que si cambia algo la URL cambia y las apps piden la imagen de nuevo.
  - Todo texto escapado para HTML.
- Código inválido, 404, 429, error o más de ~1,5 s: la página tal cual sale del build (etiquetas genéricas con
  `og.png`). Siempre status 200: la página misma se encarga de decir "código inválido".
- **Caché del HTML:** `s-maxage=300, stale-while-revalidate=86400` en el CDN de Vercel (no hay nada por usuario).
- **Cómo encuentra el HTML:** el build marca el bloque de etiquetas `og:*` con `<!--og-->…<!--/og-->`, y la función lo
  reemplaza junto con `<title>` y `meta description`. La función empaqueta `dist/join/index.html` con `includeFiles`
  en `vercel.json`.

## Imagen (`api/og/join/[code]`)

- Pide la vista previa (mismo límite de tiempo) y la portada (`https://api.rolloproject.com` + `coverUrl`, validada con la
  misma regex que la página), y la pasa como data URI.
- **Si la portada falla:** dibuja el degradé.
- **Si la vista previa falla o el código no existe:** redirect 302 a `/og.png` con caché corta (60 s).
- **Caché:** con imagen OK, `public, max-age=31536000, immutable` (la URL ya lleva `v`). Sin portada por error de red,
  caché corta, para no congelar una imagen degradada.

## Restricciones y riesgos

- **Límite por IP del backend.** La API limita por IP (300/min) y bloquea 60 s una IP con más de 20 códigos inválidos por
  minuto. Las funciones de Vercel salen por pocas IPs, así que un bot probando códigos podría hacer caer las vistas
  previas a la genérica por un rato.
  - **Mitigación en este PR:** validar el formato antes de llamar a la API, más la caché del CDN para el HTML y la imagen.
  - **Si pasa en la práctica:** un header secreto que el backend exceptúe (otro PR, en el backend).
- **Despliegue:** sin desplegar `develop` del backend a producción, los rollos comunes devuelven 404 y caen a la imagen
  genérica. Los eventos ya andan.

## Qué queda para quien lo construya

- Ajustes finos de tamaños, márgenes y opacidad del velo mirando el PNG real.
- Detalles de la API de `@vercel/og` en una función que no es Next (handler Web estándar `GET(request)`).

## Pruebas

- Vitest, en `scripts/__tests__/` (o `api/_lib/__tests__/`): reemplazo de etiquetas (escape, fallback, hash), formato de
  fecha, validación de código y portada, y que el build deje los marcadores. La función de la imagen se prueba renderizando
  un PNG con datos de ejemplo (dimensiones 1200×630).
- A mano: `vercel dev`, o `vercel build` + servir, pidiendo el HTML de un código real y la URL de la imagen.
