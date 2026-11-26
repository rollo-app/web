# Link de invitación: directo al App Store si no tenés la app

## Para qué

Quien toca `https://rolloproject.com/join/<CÓDIGO>` sin tener Rollo cae hoy en la página del sitio y tiene que tocar el
badge del App Store. Juani quiere que llegue al App Store directo (pedido del 26/11/2026, con la app 1.5.0 ya publicada y
los links circulando por WhatsApp).

## Cómo sabemos que no tiene la app

El sitio no puede preguntar si la app está instalada. Pero con la app instalada iOS abre el link en la app (Universal
Links) y esta página no se llega a cargar. Si la página se carga en un navegador de verdad en un iPhone, casi seguro la app
no está.

## Objetivos

- En iPhone y iPad, en un navegador (Safari, Chrome, Firefox…), la página salta sola al App Store apenas carga.
- La página queda atrás con el código y "Abrir Rollo", por si la persona vuelve después de instalar.

## No-objetivos

- **Android y computadoras:** no hay app, la página queda como hoy.
- **Navegador interno de Instagram y Facebook:** ahí la página se carga aunque tengas la app, porque iOS no llega a probar
  el Universal Link. Saltar mandaría al App Store a quien ya la tiene, así que queda como hoy. *Decisión mía;* si Juani
  quiere el salto también ahí, hay que probar "abrir la app y, si no pasa nada, ir al App Store" en su teléfono.
- **Que la app recién instalada recupere sola la invitación:** el App Store no le pasa nada a la app. Es otro proyecto
  (app + backend + sitio) y se diseña aparte.

## Anti-objetivos

- Un loop: volver a Safari y que salte otra vez.
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

Todo en el script inline de `/join` (`joinScript` en `scripts/build-site.mjs`), después de mostrar el código y antes de
pedir el rollo a la API (la página queda completa atrás).

- **Cuándo salta:** código con formato válido, y el navegador es iOS de verdad:
  - iOS: el User-Agent dice `iPhone`, `iPad` o `iPod`, o dice `Macintosh` con `navigator.maxTouchPoints > 1` (un iPad se
    presenta como Mac).
  - Navegador de verdad: el User-Agent tiene `Safari/` (Safari, Chrome, Firefox y Edge lo tienen; los navegadores internos
    no) y no tiene `Instagram`, `FBAN` ni `FBAV`.
- **A dónde:** `storeHref`, el mismo link del badge (`https://apps.apple.com/app/id6825843502`; en modo beta, TestFlight).
- **Una vez por pestaña:** marca en `sessionStorage` (`rollo.store`). Si la persona vuelve y Safari recarga la pestaña, no
  salta de nuevo. Si `sessionStorage` falla, no salta (mejor la página que un loop).
- **Con `location.href`, no `replace`:** "atrás" vuelve a la invitación.
- **Código mal formado:** no salta; la página dice que el código no es válido, como hoy.
- El hash del script en el CSP se calcula en el build, así que se actualiza solo.

## Lo que no se puede probar acá

Que Safari abra la app del App Store con una navegación que no viene de un toque. Lo prueba Juani en su iPhone pegando el
link en la barra de Safari (pegado no usa Universal Links, así que la página se carga aunque tenga la app). Si Safari
mostrara la ficha web del App Store en vez de abrir la app, ver `itms-apps://`.

## Pruebas

Vitest, en `scripts/__tests__/build-site-links.test.ts`, corriendo el script del build contra un navegador falso:

- iPhone con Safari: salta una vez; la segunda carga en la misma pestaña no salta.
- iPad (Macintosh con pantalla táctil) y Chrome en iPhone: saltan.
- Mac, Android, Instagram y Facebook: no saltan.
- Código mal formado y `sessionStorage` roto: no saltan.
- Después de saltar, la página igual muestra el código, "Abrir Rollo" y pide el rollo.
