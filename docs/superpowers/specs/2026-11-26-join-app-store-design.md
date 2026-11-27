# Link de invitación: directo al App Store si no tenés la app

## Para qué

Quien toca `https://rolloproject.com/join/<CÓDIGO>` sin tener Rollo cae hoy en la página del sitio y tiene que tocar el
badge del App Store. Juani quiere que llegue al App Store directo (pedido del 26/11/2026, con la app 1.5.0 ya publicada y
los links circulando por WhatsApp).

## Cómo sabemos que no tiene la app

El sitio no puede preguntar si la app está instalada. Pero con la app instalada iOS abre el link en la app (Universal
Links) y esta página no se llega a cargar. Si la página se carga en un navegador de verdad en un iPhone, casi seguro la app
no está. Las excepciones: alguien pegó el link en la barra, tiene apagados los Universal Links para el sitio, o usa un build
1.3.0 o anterior (que de todos modos no sabe abrir links `/join`).

## Objetivos

- En iPhone, en un navegador (Safari, Chrome, Firefox…), la página salta sola al App Store cuando alguien abre la
  invitación.
- La página queda atrás completa (nombre, portada, código y "Abrir Rollo"), por si la persona vuelve después de instalar.

## No-objetivos

- **Android y computadoras:** no hay app, la página queda como hoy.
- **iPad con Safari:** se presenta como una Mac, y a una Mac Apple le contesta con la ficha web del App Store en vez de
  abrir la app. La página queda como hoy, con el badge. (Un iPad que pide el sitio móvil dice `iPad` y sí salta.) La app es
  solo para iPhone.
- **Navegador interno de Instagram y Facebook:** ahí la página se carga aunque tengas la app, porque iOS no llega a probar
  el Universal Link. Saltar mandaría al App Store a quien ya la tiene, así que queda como hoy. *Decisión mía;* si Juani
  quiere el salto también ahí, hay que probar "abrir la app y, si no pasa nada, ir al App Store" en su teléfono.
- **Que la app recién instalada recupere sola la invitación:** el App Store no le pasa nada a la app. Es otro proyecto
  (app + backend + sitio) y se diseña aparte.

## Anti-objetivos

- Un loop: volver a Safari y que salte otra vez.
- Dejar a alguien sin la invitación: saltar a una página de la que no se puede volver.
- Tocar la vista previa del link (WhatsApp, iMessage): las etiquetas no cambian.
- Mandar datos nuevos a algún lado o sumar analytics: el código del path es una credencial.

## Enfoques

1. **Salto desde el script de la página (elegido).** Quien arma la vista previa no corre scripts, así que la tarjeta no se
   toca; la página sigue ahí atrás; se prueba con el mismo navegador falso de los tests de hoy.
2. **Redirect del servidor según el User-Agent.** Un poco más rápido, pero WhatsApp e iMessage piden la página desde el
   mismo iPhone: equivocarse con un User-Agent rompe la tarjeta que se acaba de arreglar, y la página con el código deja de
   existir en iPhone. Descartado.
3. **Dejar la página con el botón más grande o un Smart App Banner.** No abre el App Store solo, que es lo pedido.
   Descartado.

## Diseño

Todo en el script inline de `/join` (`joinScript` en `scripts/build-site.mjs`).

**Quién salta** (se decide cuando corre el script):

- El User-Agent dice `iPhone` o `iPad`, tiene `Safari/` (Safari, Chrome, Firefox y Edge lo tienen; casi ningún navegador
  interno) y no tiene `Instagram` ni `FBAN` (Facebook y Messenger).
- Es una visita nueva: `performance.navigation.type === 0`. Si el navegador ya no trae esa API, vale
  `performance.getEntriesByType("navigation")[0].type === "navigate"`; si no trae ninguna, no salta. Una recarga, "atrás" y
  una pestaña que el navegador restaura no son visitas nuevas. Lo último importa: iOS cierra Safari seguido mientras se
  instala y se abre otra app, y la pestaña vuelve sin su `sessionStorage`, pero dice `back_forward`.
- La pestaña no saltó antes: marca `rollo.store` en `sessionStorage`, que se escribe justo antes de saltar. Si
  `sessionStorage` no se puede leer o escribir, no salta (mejor la página que un loop).

**Cuándo salta:** al final, cuando ya está en la página lo que se va a ver al volver. Espera a que conteste la API (o
falle), a que cargue la portada (o falle) y al `load` de la página. Tope: 1,5 s desde que corre el script. Dos motivos:

- Al irse, el navegador cancela lo que todavía se está cargando: saltando primero, atrás quedaba una página sin nombre ni
  portada.
- Una navegación hecha por script antes del `load` reemplaza la entrada del historial; después del `load` suma una, y
  "atrás" vuelve a la invitación.

**Código que la API no conoce (404):** no salta; la página dice que el código no es válido, como hoy. Si la API falla o
limita (429), salta igual.

**A dónde:** `storeHref`, el mismo link del badge (`https://apps.apple.com/app/id6825843502`; en modo beta, TestFlight), con
`location.href`. El hash del script en el CSP se calcula en el build, así que se actualiza solo.

## Qué hace Apple con ese link (medido el 26/11/2026)

- A un User-Agent de iPhone, o de iPad con el sitio móvil, `https://apps.apple.com/app/id…` le contesta un 301 a
  `itms-appss://…`: es el traspaso a la app del App Store. La página de la invitación no se reemplaza.
- A un User-Agent de Mac le contesta la ficha web.
- Esperable en un iPhone, sin verificar: que iOS pregunte "¿Abrir en App Store?" antes de salir de Safari, porque nadie
  tocó nada. Con el salto al final, lo que se ve detrás de esa pregunta es la invitación completa.

## Lo que no se puede probar acá

Hay que mirarlo en un iPhone de verdad:

- Si abre el App Store directo o pregunta antes.
- Al volver a Safari: que estén el nombre, la portada, el código, "Abrir Rollo" y el badge.
- Cerrar Safari a la fuerza y volver a abrirlo: que no salte de nuevo. Es el único eslabón inferido: en WebKit, restaurar
  una pestaña da `back_forward`; no se vio a Safari hacerlo. Si saltara, queda en reserva una marca en `localStorage` con
  una ventana de tiempo.

Cómo probar: **tocando** el link desde WhatsApp. Pegarlo en la barra de Safari no es lo mismo: una navegación hecha por
script hereda el permiso para abrir otra app de cómo se abrió la página. Y con Rollo instalado el link de producción abre
la app, así que hace falta una de estas dos:

- un iPhone sin Rollo, con el link de producción;
- el link del preview de Vercel, que no abre la app porque ese host no está asociado. Pide iniciar sesión en Vercel, y
  ahí la API no contesta (CORS), así que no se ven el nombre ni la portada.

Cada prueba en una pestaña nueva: la marca queda en la pestaña.

## Pruebas

Vitest, en `scripts/__tests__/build-site-links.test.ts`, corriendo el script del build contra un navegador falso que
controla el orden de las cosas (cuándo contesta la API, cuándo llega el `load`, cuándo carga la portada, el paso del
tiempo):

- iPhone con Safari y con Chrome, e iPad con el sitio móvil: saltan.
- Mac, iPad que dice Macintosh, Android, Instagram y Facebook (con y sin `Safari/`) y TikTok: no saltan.
- Espera a la API, al `load` y a la portada; a los 1,5 s salta igual; salta una sola vez.
- Al saltar, el nombre del rollo ya está en la página.
- 404: no salta. API caída o con 429: salta.
- Recarga y pestaña restaurada: no saltan. Segunda visita en la misma pestaña: no salta.
- `sessionStorage` roto o de solo lectura: no salta y la página funciona.
- Con una sola de las dos API de navegación distingue visita nueva de recarga; sin ninguna, no salta.
- Código mal formado: no salta.

## Cambios después de la revisión de la rama

La primera versión saltaba apenas corría el script, una vez por pestaña, e incluía al iPad que dice Macintosh. Un revisor
aparte corrió el script del build en un WKWebView y encontró tres cosas, las tres corregidas:

1. **La página quedaba a medio llenar detrás del salto.** Saltar cancelaba el pedido a la API. Ahora el salto va al final.
2. **"Una vez por pestaña" no sobrevivía a que iOS cerrara Safari.** La pestaña restaurada no trae `sessionStorage`. Ahora
   además tiene que ser una visita nueva.
3. **En iPad podía dejar a la persona en la ficha web sin "atrás".** El iPad que dice Macintosh ya no salta, y el salto va
   después del `load`.
