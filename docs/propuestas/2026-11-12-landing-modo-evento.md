# Modo evento en la landing

Fecha: 12/11/2026. Estado: **acordado con Juani, sin implementar.** Se construye cuando las pantallas de la 1.4 estén
hechas y se publica cuando la 1.4 esté en la App Store.

El diseño del modo evento vive en `rollo-app/mobile` (`docs/superpowers/specs/2026-11-12-modo-evento-design.md`): un rollo
de tipo evento con grupos, un QR único que abre `rolloproject.com/join/<CÓDIGO>`, cada invitado ve las fotos de sus grupos
y los organizadores ven todo. Primer uso real: un casamiento el 12/12/2026.

## Qué se decidió

- **Dónde:** una **sección nueva en la home**, entre "revelado" (`#revelado`) y el cierre (`#cierre`), con el mismo
  formato que las otras: texto a la izquierda y celular a la derecha (`.feature`, `data-enter`, `id="evento"`). Una
  página `/events` propia queda para la Fase 4, cuando haya precios y ejemplos; hoy sería una página casi vacía.
- **Mensaje:** un título corto y un párrafo. Punto de partida:
  - **Título:** "Un QR en la fiesta. Cada uno ve las fotos de su gente."
  - **Texto:** en un casamiento o un cumple grande, los invitados escanean un QR, eligen su grupo ("Familia de él",
    "Amigos de facu") y sacan. Cada uno ve las fotos de sus grupos; los novios, todas, mezcladas o por grupo. Y nadie ve
    nada hasta el revelado.
  - Sin precios ni cupos: los eventos todavía no se cobran.
- **Visual:** **una captura**: la pantalla de elegir grupos (portada, nombre del evento y grupos para tildar). Se hace en
  Remotion como `map.jpg` y `reveal.jpg` (`video/`, `npm run stills`), con un evento de ejemplo (portada propia, nada de
  fotos de invitados reales) y queda en `scripts/site/evento.jpg`. La galería por grupo y el QR impreso no entran por ahora.
- **Llamado a la acción:** el mismo badge de la App Store. El organizador crea el evento desde la app; no hay mail ni
  formulario aparte.
- **Hero y cierre:** el hero ya dice "el viaje, el casamiento o la última semana de facu", no cambia. El cierre ("Estrenalo
  en tu próximo viaje.") se puede abrir a "en tu próximo viaje o evento" cuando salga la sección.

## Cuándo

1. **~25/11:** con las pantallas de la 1.4 armadas, recrear la de elegir grupos en `video/` y sacar `evento.jpg`.
2. **Antes de que salga la 1.4:** sección lista en una rama, con test (la home tiene `#evento`, con su `<figure>` y su
   `aria-label`), sin mergear a `main`.
3. **Cuando la 1.4 esté en la App Store:** merge y deploy. Publicarla antes promete algo que la 1.3 no hace.

## Fuera de esta propuesta

- La página `/join/<CÓDIGO>` (tarea aparte del plan del modo evento).
- `/events` con precios y ejemplos (Fase 4).
- Una pregunta en `/support` sobre eventos ("¿Cómo me sumo a un evento?"): conviene sumarla junto con la sección.
