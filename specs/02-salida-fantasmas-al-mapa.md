# SPEC 02 — Salida de los fantasmas directamente al mapa

> **Status:** Implemented
> **Depends on:** SPEC 01
> **Date:** 2026-10-22
> **Objective:** Colocar a cada fantasma directamente en el mapa (fila 11) en el momento en que se libera, en lugar de dejarlo atrapado dentro de su jaula.

## Por qué existe este spec

Con el modelo del SPEC 01, un fantasma liberado tiene que *recorrer* el interior de la pen antes de alcanzar la
puerta y salir al corredor de la fila 11. Además, los fantasmas que todavía no cumplen su `releaseAt` **deambulan**
dentro de la jaula (`phase: 'pen'`), de modo que el jugador ve fantasmas moviéndose a los que noción en teoría
siguen atrapados. El resultado observado en partida es que los fantasmas "quedan atrapados en su jaula" y, cuando por
fin se liberan, su salida es un recorrido lento y a veces ambiguo dentro de la jaula.

Este spec sustituye ese modelo por uno más simple y legible: cuando un fantasma se libera, **aparece directamente en
el mapa**, en una celda de salida propia de la fila 11, y desde ese momento se comporta como un fantasma normal.
La jaula se conserva como punto de partida visual, pero los fantasmas que esperan en ella se quedan quietos.

> Nota de diagnóstico: la lógica de salida actual (`pen` → `exiting` → `out`) **sí funciona** — verificado con una
> simulación headless del motor, en la que los 4 fantasmas salen desde las 36 celdas del interior de la pen. El
> problema no es un bug de recorrido, sino el modelo: la espera dentro de la jaula y el trayecto hasta la puerta.

## Alcance

**Dentro del alcance:**

- Liberación directa: al cumplirse su `releaseAt`, el fantasma se coloca en el mapa, sin recorrer la jaula ni cruzar la
  puerta.
- Una celda de salida propia por fantasma, en la fila 11, declarada junto a su posición inicial.
- Eliminación de la fase intermedia `'exiting'`: las fases de un fantasma pasan a ser `'pen'` y `'out'`.
- Los fantasmas que esperan en la jaula se quedan **quietos**: no deambulan, no cambian de celda.
- La puerta del pen (valor `3` de la matriz) pasa a ser infranqueable para **todos** los actores, en cualquier fase.
- Al perder una vida, los 4 fantasmas se reponen en su celda de salida, en fase `'out'`.
- Dirección inicial `'left'` para un fantasma recién colocado en el mapa.
- Actualización de `AGENTS.md` y anotación del SPEC 01.

**Fuera de alcance (specs futuros):**

- Recalibrar los umbrales de liberación (`0 / 30 / 60 / 90` dots): se mantienen los del SPEC 01.
- Power-pellets, estado "vulnerable" y puntuación por comer fantasmas.
- Niveles adicionales o dificultad progresiva.
- Cualquier cambio en `MAZE_STR`, en el render (`render.js`), en el HUD, en los overlays o en `main.js`.
- Que los fantasmas coman dots.
- Rediseñar la jaula (tamaño, puerta, dibujo).

## Modelo de datos

### `GHOST_STARTS` en `src/js/maze.js`

Cada entrada gana un campo `exit` con la celda del mapa en la que aparece el fantasma al liberarse:

| Campo  | Tipo      | Significado |
|--------|-----------|-------------|
| `exit` | `{x,y}`   | Celda de salida del fantasma, en la fila 11. |

Valores acordados (el pen queda en las cols 11–16, filas 13–15; la fila 11 es transitable en las cols 9–18):

```js
const GHOST_STARTS = [
  { x: 12, y: 13, kind: 'hunter',   speed: 1 / 9,  releaseAt: 0,  corner: null, exit: { x: 12, y: 11 } },
  { x: 15, y: 13, kind: 'ambusher', speed: 1 / 10, releaseAt: 30, corner: null, exit: { x: 14, y: 11 } },
  { x: 12, y: 15, kind: 'patrol',   speed: 1 / 11, releaseAt: 60, corner: { x: 1,  y: 29 }, exit: { x: 13, y: 11 } },
  { x: 15, y: 15, kind: 'slow',     speed: 1 / 13, releaseAt: 90, corner: null, exit: { x: 15, y: 11 } },
];
```

Las celdas de salida son simétricas respecto al eje central: los dos fantasmas de la mitad izquierda del pen
(`hunter`, `patrol`) salen por las cols 12 y 13, y los de la mitad derecha (`ambusher`, `slow`) por las cols 14 y 15.
Las cuatro celdas son distintas, así que dos fantasmas liberados en el mismo frame nunca se solapan.

### Estado por fantasma en `src/js/game.js`

| Campo    | Valores              | Significado |
|----------|----------------------|-------------|
| `phase`  | `'pen'`, `'out'`     | `'pen'` = dentro de la jaula, quieto. `'out'` = en el mapa. |
| `exit`   | `{x,y}`              | Copia de `GHOST_STARTS[i].exit`, celda de salida. |

Se elimina la fase `'exiting'` y, con ella, la helper `nearestDoorCell()`. `phase` conserva el significado de
"¿está dentro de la jaula?" pero solo admite dos valores.

### Reglas de contención

- La puerta (valor `3` en `game.grid`) es un muro para todos los actores: Pac-Man y los fantasmas, en cualquier fase.
  La helper `isDoorCell()` desaparece.
- Con la puerta cerrada, la jaula es una región cerrada: su interior (cols 11–16, filas 13–15) solo se puede
  alcanzar a través de la puerta, de modo que un fantasma en fase `'out'` **no puede reentrar** por construcción.
- `PEN` e `inPen()` se conservan como guarda explícita en `canMove()` para los fantasmas en fase `'out'`: las celdas
  del interior de la jaula les son infranqueables aunque en el futuro cambie el laberinto.

## Plan de implementación

1. **`src/js/maze.js`** — añadir el campo `exit` a las 4 entradas de `GHOST_STARTS` con los valores de la tabla
   anterior. No se toca `MAZE_STR` ni `MAZE`. Manual: recargar la página y comprobar que no hay errores de sintaxis.
2. **`src/js/game.js` (`createGame`)** — cada fantasma creado incluye `exit: { ...g.exit }` y arranca con
   `phase: 'pen'`, `dir: 'up'` y sus coordenadas iniciales. Manual: los 4 fantasmas se ven dentro de la jaula, quietos.
3. **`src/js/game.js`** — añadir una helper `releaseGhost( game, g )` que coloca al fantasma en su celda de salida:
   `x = g.exit.x`, `y = g.exit.y`, `dir = 'left'`, `phase = 'out'`, `target = { x, y }` y
   `patrolToCorner = ( g.kind === 'patrol' )`. Manual: el helper no se invoca todavía, el juego sigue igual.
4. **`src/js/game.js` (`update`)** — sustituir el bloque de liberación: si `phase === 'pen'` y
   `dotsEaten >= g.releaseAt`, se llama a `releaseGhost( game, g )`. Se elimina la transición `'exiting'` → `'out'`
   (el bloque que comprobaba la fila 11). Manual: al comer 30 dots, el `ambusher` aparece en (14,11) y se mueve.
5. **`src/js/game.js` (`moveGhost` / `decideGhost`)** — un fantasma en fase `'pen'` no se mueve: `moveGhost` retorna
   sin tocar sus coordenadas ni su dirección. En `decideGhost` se eliminan la rama aleatoria de `'pen'` y la rama de
   `'exiting'`, y se borra `nearestDoorCell()`. Manual: los fantasmas de la jaula no se mueven hasta liberarse.
6. **`src/js/game.js` (`isWall` / `canMove`)** — el valor `3` (puerta) es muro para cualquier actor, sin mirar la fase;
   se elimina `isDoorCell()`. Se mantiene la guarda `inPen()` para los fantasmas en fase `'out'`. Manual: ningún
   fantasma ni Pac-Man cruza la puerta.
7. **`src/js/game.js` (`resetPositions`)** — al perder una vida, cada fantasma se repone en `g.exit` con
   `phase: 'out'`, `dir: 'left'`, `target = { x, y }` y `patrolToCorner = ( g.kind === 'patrol' )`. El score y los dots
   restantes no cambian. Manual: al chocar, los 4 fantasmas reaparecen en la fila 11 y siguen persiguiendo.
8. **`src/js/render.js` y `src/js/main.js`** — sin cambios: `draw()` ya dibuja cada fantasma donde indica su
   posición, y el bucle no conoce las fases. Comprobar que no hay referencias a `'exiting'`.
9. **`AGENTS.md`** — actualizar la sección "Reglas de juego (game.js)": describir las fases `'pen'` / `'out'`, la
   colocación directa en la fila 11, la puerta infranqueable y el reinicio de los fantasmas en su celda de salida.
10. **`specs/01-cuatro-fantasmas.md`** — añadir una nota al final indicando que su mecanismo de salida
    (`pen` → `exiting` → `out`, con recorrido por la puerta) queda sustituido por este SPEC 02.

## Criterios de aceptación

- [ ] Con la partida recién empezada, los 4 fantasmas están dentro de la jaula, en sus celdas iniciales, y **no se
      mueven** (sus coordenadas no cambian) hasta que se liberan.
- [ ] El `hunter` (`releaseAt: 0`) aparece en la celda (12,11) en el primer frame de la partida, con dirección
      `'left'`, y ya recorre el mapa con su comportamiento de persecución.
- [ ] El `ambusher` no aparece en el mapa hasta que se han comido 30 dots; entonces aparece en (14,11).
- [ ] El `patrol` aparece en (13,11) a los 60 dots; el `slow` en (15,11) a los 90 dots.
- [ ] Cada fantasma aparece en una celda distinta: dos fantasmas liberados nunca comparten celda.
- [ ] La puerta del pen (fila 12, cols 13 y 14) es infranqueable para Pac-Man y para los fantasmas, en cualquier fase.
- [ ] Un fantasma liberado no puede volver a entrar en la jaula.
- [ ] Perder una vida repone los 4 fantasmas en su celda de salida de la fila 11, con fase `'out'`, y la partida
      continúa con el mismo score y los mismos dots restantes.
- [ ] No queda ninguna referencia a la fase `'exiting'`, a `isDoorCell()` ni a `nearestDoorCell()` en el código.
- [ ] El juego se abre y se juega sin errores en la consola.
- [ ] `AGENTS.md` describe el nuevo modelo de salida.
- [ ] `specs/01-cuatro-fantasmas.md` contiene la nota de que su mecanismo de salida queda sustituido por el SPEC 02.

## Decisiones tomadas

| Decisión | Motivo |
|----------|--------|
| Colocación directa en el mapa al liberarse | Es el objetivo explícito del encargo: cuando un fantasma empieza a moverse, tiene que estar en el mapa. Evita el recorrido ambiguo por la jaula. |
| Se mantiene el calendario escalonado (0 / 30 / 60 / 90 dots) | El SPEC 01 lo fijó y funciona: escala la dificultad con el ritmo del jugador sin depender del framerate. |
| Los fantasmas en `'pen'` quedan quietos | Un fantasma que se mueve dentro de la jaula parece "atrapado"; uno quieto se lee como "aún no ha salido". |
| Se elimina la fase `'exiting'` | Con la colocación directa no hay recorrido intermedio que describir; un estado menos que mantener. |
| Una celda de salida por fantasma (12, 13, 14 y 15 de la fila 11) | Evita el solapamiento de dos fantasmas liberados en el mismo frame y reparte la presión sobre el mapa. |
| La puerta pasa a ser infranqueable para todos | Simplifica `isWall()` y hace imposible la reentrada por construcción (la jaula queda cerrada). |
| Al perder una vida, **todos** los fantasmas pasan al mapa | Decisión explícita del usuario: los 4 se reponen en su celda de salida, incluidos los que aún no habían cumplido su `releaseAt`. Consecuencia asumida: la persecución se intensifica tras la primera muerte. |
| `resetPositions` no reinicia el calendario de liberación | Los fantasmas vuelven ya liberados; no tiene sentido volver a esperar los dots comidos. |
| Dirección inicial `'left'` al salir | Es lo que hacen los fantasmas del arcade original al abandonar la jaula. |
| No se tocan `maze.js` (matriz), `render.js` ni `main.js` | La puerta sigue dibujándose y la jaula sigue en pantalla; el cambio es puramente de reglas de movimiento. |
| `exit` vive en `GHOST_STARTS` (`maze.js`) | La celda de salida es geometría del laberinto, igual que la posición inicial; `game.js` solo la consume. |
| Se anota el SPEC 01 en lugar de reescribirlo | El SPEC 01 está `Implemented` y describe el modelo anterior; la nota deja constancia de que su mecanismo de salida fue sustituido. |

## Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Al perder una vida todos los fantasmas pasan al mapa, incluidos los no liberados | Decision consciente del usuario y asumida; se documenta en los criterios de aceptación para que el cambio de dificultad sea visible en partida. |
| Un fantasma colocado en la fila 11 puede aparecer encima de un dot o junto a Pac-Man | La fila 11 es un corredor normal: la colisión con Pac-Man ya está cubierta por la regla existente (distancia < 0.5) y no requiere código nuevo. |
| Que la jaula quede "de adorno" con 3 fantasmas quietos | Es el comportamiento pedido; la jaula sigue mostrando la situation de partida (quiénes faltan por salir). |
| Regresión al eliminar la fase `'exiting'` | `phase` solo admite dos valores y `releaseGhost()` centraliza el cambio de estado; la comprobación en el navegador de los 4 umbrales de liberación cubre la regresión. |

## Qué **no** entra en este spec

- Recalibrar los umbrales de liberación o el número de vidas.
- Power-pellets, vulnerabilidad y puntuación por comer fantasmas.
- Niveles adicionales, laberinto ampliado o cambio de la geometría de la jaula.
- Cualquier cambio en el render, en el HUD, en los overlays o en el bucle de `main.js`.
- Que los fantasmas coman dots.

Cada uno de esos, si aterriza, va en su propio spec.
