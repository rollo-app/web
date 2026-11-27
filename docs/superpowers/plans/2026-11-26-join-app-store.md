# Link de invitación directo al App Store: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En iPhone y iPad, la página `/join/<CÓDIGO>` salta sola al App Store la primera vez que se carga en un navegador.

**Architecture:** Un bloque nuevo en el script inline de la página (`joinScript` en `scripts/build-site.mjs`), entre mostrar el código y pedir el rollo a la API. No se toca el servidor (`api/`), ni el `<head>`, ni `vercel.json`.

**Tech Stack:** JavaScript ES5 dentro de un template literal de Node (las barras de las regex van dobles), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-join-app-store-design.md`

## Global Constraints

- Código, comentarios y nombres de tests en inglés; textos del sitio, commits y PR en español.
- El script queda sin `innerHTML` y sin pedidos nuevos: el único pedido sigue siendo `GET /events/<CÓDIGO>?any=1`.
- Destino del salto: `storeHref` (ya definido en `build-site.mjs`; con el build por defecto es `https://apps.apple.com/app/id6825843502`).
- Clave de `sessionStorage`: `rollo.store`, valor `"1"`.
- Navega con `location.href = …`, nunca `location.replace`.
- Los tests se corren con `npx vitest run --exclude '.claude/**'` (el worktree `reel` anidado mete tests ajenos).

## Review Focus

- **Safari recarga la pestaña al volver del App Store:** no tiene que saltar de nuevo; se ve la página con el código.
- **Alguien con la app abre el link dentro de Instagram:** no salta; sigue viendo "Abrir Rollo".
- **Android con Chrome** (su User-Agent también dice `Safari/`): no salta.
- **`sessionStorage` bloqueado** (modo privado viejo, políticas): no salta y la página funciona igual.
- **Link con minúsculas o barra final** (`/join/ab3k9z/`): salta igual que el link normal.

---

### Task 1: Salto al App Store en el script de `/join`

**Files:**
- Modify: `scripts/build-site.mjs` (`joinScript`, entre `$("ok").hidden = false;` y el `fetch`)
- Modify: `scripts/__tests__/build-site-links.test.ts` (`describe("the /join page (event link)")`)
- Modify: `CLAUDE.md` (viñeta "Evento `/join/<CÓDIGO>`": una oración sobre el salto)

**Interfaces:**
- Consumes: `storeHref` (string, `build-site.mjs`), el helper de test `openJoin(pathname, response)`.
- Produces: `openJoin(pathname, response?, browser?)` con `browser?: { userAgent: string; maxTouchPoints?: number; storage?: Storage-like | "broken" }`; devuelve además `location` (con `href` si saltó) y `storage` (un `Map`).

- [ ] **Step 1: Ampliar `openJoin` y escribir los tests que fallan**

`openJoin` pasa al script dos parámetros más, `navigator` y `sessionStorage`. Sin `browser`, `navigator.userAgent` es `"node"` y nada salta, así que los tests de hoy no cambian. `"broken"` es un `sessionStorage` cuyos métodos tiran.

User-Agents de los tests:

```ts
const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 358.0.0.30.99 (iPhone15,3; iOS 18_1; es_LA; es; scale=3.00; 1290x2796; 665322158)",
  facebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/487.0.0.44.108;FBBV/665322158;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBID/phone;FBLC/es_LA;FBOP/5]",
  // An in-app browser that keeps the Safari token: the name alone has to stop the jump.
  instagramWithSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1 Instagram 358.0.0.30.99",
};
const STORE = "https://apps.apple.com/app/id6825843502";
const ROLLO = { status: 200, json: { name: "X", revealed: false } };
```

Tests (nombres y qué afirman):

| Test | Arrange | Assert |
|---|---|---|
| `jumps to the App Store on an iPhone browser, once per tab` | `iphoneSafari`, dos `openJoin` con el mismo `storage` | 1.ª: `location.href === STORE` y `storage.get("rollo.store") === "1"`; 2.ª: `location.href` sin definir |
| `still fills the page behind the jump` | `iphoneSafari` | `els.code.textContent === "AB3K9Z"`, `els.open.href === "rollo://join/AB3K9Z"`, `fetchMock` llamado con `…/events/AB3K9Z?any=1`, `els.name.textContent === "X"` |
| `jumps on Chrome for iPhone and on an iPad (it says Macintosh, with touch)` | `iphoneChrome`; `mac` con `maxTouchPoints: 5` | ambos `location.href === STORE` |
| `jumps for a lowercase code with a trailing slash` | `iphoneSafari`, `/join/ab3k9z/` | `location.href === STORE` |
| `does not jump on a Mac, on Android, nor inside Instagram or Facebook` | `mac` (`maxTouchPoints: 0`), `android`, `instagram`, `facebook`, `instagramWithSafari` | en todos `location.href` sin definir y `storage.size === 0` |
| `does not jump for a malformed code` | `iphoneSafari`, `/join/abc` | `location.href` sin definir, `els.bad.hidden === false` |
| `does not jump when sessionStorage is unavailable, and the page still works` | `iphoneSafari`, `storage: "broken"` | `location.href` sin definir, `els.code.textContent === "AB3K9Z"`, `fetchMock` llamado |

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `npx vitest run --exclude '.claude/**' scripts/__tests__/build-site-links.test.ts`
Expected: fallan los tres que esperan el salto (`expected undefined to be 'https://apps.apple.com/app/id6825843502'`); los de "no salta" pasan desde ya.

- [ ] **Step 3: Implementar el salto en `joinScript`**

Suma `var STORE = ${JSON.stringify(storeHref)};` junto a `var API`. Después de `$("ok").hidden = false;`:

- `ios`: `/iPhone|iPad|iPod/` en `navigator.userAgent`, o `/Macintosh/` con `navigator.maxTouchPoints > 1`.
- navegador de verdad: `/Safari\//` y no `/Instagram|FBAN|FBAV/`.
- dentro de un `try/catch` vacío: si `sessionStorage.getItem("rollo.store")` no tiene valor, lo guarda en `"1"` y hace `location.href = STORE`.

Un comentario en inglés explica el porqué de cada condición (Universal Links, una vez por pestaña, navegadores internos).

- [ ] **Step 4: Correr todo y ver que pasa**

Run: `npx vitest run --exclude '.claude/**'`
Expected: 6 archivos, 208 tests en verde (194 + 14; ver "Cambios durante la implementación"). El test del CSP sigue pasando: el hash sale del script nuevo.

- [ ] **Step 5: Documentar y commitear**

En `CLAUDE.md`, viñeta "Evento `/join/<CÓDIGO>`", una oración: en iPhone y iPad, en un navegador de verdad, el script salta una vez por pestaña al App Store (con la app instalada la página no se carga); dentro de Instagram y Facebook, en Android y en computadoras se ve la página.

```bash
git add scripts/build-site.mjs scripts/__tests__/build-site-links.test.ts CLAUDE.md docs/superpowers
git commit -m "Join: en iPhone salta directo al App Store"
```

## Cambios durante la implementación

- Los 7 tests de la tabla quedaron en 14 casos: los de "salta en…" y "no salta en…" van con `it.each`, un comportamiento por
  nombre.
- No se afirma la clave ni el valor de `sessionStorage`: lo que se prueba es que la segunda carga en la misma pestaña no
  salta. "Una vez por pestaña" y "llena la página atrás" afirman también el salto, así fallan sin la función.
- Se sumó el caso de un navegador interno sin `Safari/` en el User-Agent (el de TikTok): al mutar el script, sacar esa regla
  no hacía fallar ningún test.
- Cada condición del salto se mutó a mano (sin token, sin lista, Mac sin táctil, sin iPad, sin "una vez", sin `catch`, URL
  mal, `return` después del salto, saltar siempre) y cada mutación la atrapa al menos un test.
- `openJoin` no devuelve `storage`: devuelve los controles de la página (ver abajo).

## Después de la revisión de la rama

Un revisor aparte corrió el script del build en un WKWebView y marcó tres problemas importantes (están en la spec, "Cambios
después de la revisión de la rama"). La corrección cambió el diseño de la tarea 1:

- El salto va al final: espera a la API, a la portada y al `load`, con tope de 1,5 s. Un 404 no salta.
- "Una vez" es visita nueva (`performance.navigation.type`, con la API nueva de respaldo) más la marca en
  `sessionStorage`.
- Salta con `iPhone` o `iPad` en el User-Agent; el iPad que dice Macintosh quedó afuera, igual que `iPod` y `FBAV`
  (redundantes).
- Los tests usan `startJoin(pathname, browser)`, que devuelve controles (`load()`, `answer(response)`, `cover(evento)`,
  `wait(ms)`) y la lista `jumps` con lo que mostraba la página al irse. `openJoin` corre todo hasta el final.
- Quedaron 31 casos del salto, 225 tests en total. Se mutaron 26 condiciones del script y cada una la atrapa al menos un
  test.
