# SPEC 01 — Cuatro fantasmas con comportamientos distintos

> **Status:** Approved
> **Depends on:** —
> **Date:** 2026-10-22
> **Objective:** Ampliar el juego de dos a cuatro fantasmas, cada uno con un rol de persecución propio y una salida escalonada desde el pen.

## Por qué existe este spec

Hoy el juego tiene dos fantasmas: uno `hunter` que siempre persigue la celda de Pac-Man con la heurística voraz
actual, y uno `random` que elige dirección al azar. Ambos son indistinguibles en dificultad y comportamiento, y
el `random` es trivial de esquivar. El juego arcade original usa cuatro fantasmas con roles diferenciados
(el que hostiga, el que anticipa, el que patrulla y el que va errático y lento) para que la persecución tenga
variedad y para que la partida no se resuelva con una sola estrategia de esquiva.

Este spec define esos cuatro roles y el mecanismo de salida escalonada desde el pen. No introduce power-pellets
ni puntuación por comer fantasmas (ver "Fuera de alcance").

## Alcance

**Dentro del alcance:**

- Cuatro fantasmas en lugar de dos, cada uno con comportamiento, velocidad, color y momento de salida propios.
- Salida escalonada desde el pen: cada fantasma se libera según los dots comidos por Pac-Man.
- Movimiento contenido dentro del pen para los fantasmas todavía no liberados.
- Un único fantasma agresivo que persigue directamente a Pac-Man.
- Un fantasma emboscador que apunta por delante de Pac-Man.
- Un fantasma patrullero que alterna entre su esquina propia y la posición de Pac-Man.
- Un fantasma lento/errático que se mueve al azar.
- Reinicio de los fantasmas a sus posiciones del pen al perder una vida, manteniendo la métrica de liberación.

**Fuera de alcance (specs futuros):**

- Power-pellets y el estado "vulnerable" de los fantasmas.
- Puntuación extra por comer un fantasma.
- Niveles adicionales, dificultad progresiva o velocidad global por frame.
- Cualquier cambio en el laberinto, en Pac-Man, en el HUD o en las pantallas de overlay.

## Modelo de datos

### Constantes en `src/js/maze.js`

`GHOST_STARTS` pasa de 2 entradas a 4. Cada entrada es un objeto con:

| Campo       | Tipo     | Significado |
|-------------|----------|-------------|
| `x`, `y`    | number   | Celda inicial dentro del pen. |
| `kind`      | string   | Rol: `'hunter'`, `'ambusher'`, `'patrol'`, `'slow'`. |
| `speed`     | number   | Celdas por frame. |
| `releaseAt` | number   | Dots comidos por Pac-Man a partir de los cuales puede salir del pen. |
| `corner`    | `{x,y}`  | Objetivo de patrulla (solo `kind: 'patrol'`). Para los demás roles es `null`. |

Valores acordados:

```js
const GHOST_STARTS = [
  { x: 12, y: 13, kind: 'hunter',   speed: 0.11,  releaseAt: 0,  corner: null },
  { x: 15, y: 13, kind: 'ambusher', speed: 0.10,  releaseAt: 30, corner: null },
  { x: 12, y: 15, kind: 'patrol',   speed: 0.09,  releaseAt: 60, corner: { x: 1,  y: 29 } },
  { x: 15, y: 15, kind: 'slow',     speed: 0.075, releaseAt: 90, corner: null },
];
```

Distribución: dos fantasmas en la fila superior del interior del pen (y=13, columnas 12 y 15) y dos en la fila
inferior (y=15, columnas 12 y 15). Es simétrica respecto al eje vertical del laberinto (cols 13/14).

Geometría relevante del pen (verificada en `maze.js`):

- Interior transitable del pen: columnas 11–16, filas 13–15.
- Puerta (valor `3`): fila 12, columnas 13 y 14.
- Corredor de salida: fila 11 (celdas 9–18), ya transitable.

### Estado por fantasma en `game.js`

Cada fantasma de `game.ghosts` incorpora:

| Campo       | Valores                        | Significado |
|-------------|--------------------------------|-------------|
| `phase`     | `'pen'`, `'exiting'`, `'out'`   | Fase de salida. Solo `game.js` la usa. |
| `target`    | `{x,y}`                        | Objetivo actual del fantasma (celda destino). |
| `patrolToCorner` | boolean                   | `true` = el patrullero va a su esquina; `false` = va a la celda de Pac-Man. |

`phase` sustituye a la lógica implícita actual de "estar dentro del pen":

- `'pen'`: el fantasma se mueve **solo** dentro del interior del pen (cols 11–16, filas 13–15). No puede cruzar
  la puerta (fila 12, cols 13–14) ni salir por el túnel de la fila 14.
- `'exiting'`: el fantasma ya puede atravesar la puerta, pero solo en dirección hacia el corridor de la fila 11.
  Se alcanza al cumplir su `releaseAt`.
- `'out'`: el fantasma está fuera del pen. Desde este punto la puerta le es infranqueable, por lo que **no puede
  reentrar nunca**.

La métrica de liberación es la acumulativa de dots comidos en la partida. `createGame()` guarda el recuento
inicial como `game.dotsInitial` (el número de celdas con valor `2` en `game.grid` **después** de limpiar la celda de
inicio de Pac-Man, que nace sin dot; en el laberinto actual son 279 de 280 celdas-dot). Con ello:

```js
dotsEaten = game.dotsInitial - game.dotsRemaining;
```

El valor es acumulativo durante toda la partida y no baja al perder vidas. No se añade un contador nuevo de
dots comidos: se deriva de `dotsRemaining` y del `dotsInitial` guardado en `createGame()`.

### Tabla deDot (contenido del pen)

Para distinguir "dentro del interior del pen" de "en la puerta" se añade en `game.js` una constante con el rectángulo
del interior del pen:

```js
const PEN = { x0: 11, x1: 16, y0: 13, y1: 15 };
```

Una celda está en el pen si `PEN.x0 <= x <= PEN.x1 && PEN.y0 <= y <= PEN.y1`.

## Plan de implementación

1. **`src/js/maze.js`** — extender `GHOST_STARTS` a 4 entradas con los campos y valores de la tabla anterior, y
   exportarlo por `window.GHOST_STARTS` (ya lo hace). Sin cambios en `MAZE_STR` ni en `MAZE`.
2. **`src/js/game.js`** — en `createGame()`, cada fantasma se crea con `phase: 'pen'`, `target` inicializado,
   `patrolToCorner` a `true` para el patrullero, `dir: 'up'` y su `speed`/`kind` tomados de `GHOST_STARTS`.
   `resetPositions()` se actualiza para reponer también `phase`, `target` y `patrolToCorner`.
3. **`src/js/game.js`** — añadir `PEN` y helpers: `inPen(x,y)`, `isDoorCell(x,y)` y la extensión de `isWall` /
   `canMove` para que el comportamiento de la puerta dependa de la fase del fantasma:
   - `phase === 'pen'`: la puerta (valor `3`) es infranqueable; el interior del pen es transitable; los bordes del
     túnel de la fila 14 también, porque el fantasma está contenido.
   - `phase === 'exiting'`: la puerta es transitable en ambos sentidos, pero el fantasma se dirige a ella
     (objetivo = celda de puerta más cercana) y no puede alejarse por el túnel de la fila 14.
   - `phase === 'out'`: la puerta vuelve a ser infranqueable, lo que impide reentrar.
   La comprobación sigue siendo por celda destino (`canMove`), igual que ahora, de modo que no hace falta
   reescribir la lógica de movimiento fraccional.
4. **`src/js/game.js`** — sustituir `decideGhost()` por una versión que elija el objetivo según `kind`:
   - `hunter`: objetivo = celda actual de Pac-Man; elige el vecino no inverso que minimiza la distancia Manhattan
     al objetivo (la heurística voraz actual, sin cambios en el criterio).
   - `ambusher`: objetivo = 4 celdas por delante de Pac-Man en su dirección actual; si esa celda es una pared
     (o está fuera del laberinto), el objetivo pasa a ser la celda actual de Pac-Man.
   - `patrol`: alterna entre su `corner` y la celda actual de Pac-Man. El objetivo cambia a `patrolToCorner === true`
     cuando el fantasma alcanza su esquina, y a `false` cuando alcanza la celda de Pac-Man. La esquina se mantiene
     hasta alcanzarla; entonces empieza la fase de persecución.
   - `slow`: elige dirección al azar entre las legales (como el `random` actual), sin objetivo fijo.
   Todos los roles siguen la misma regla base: no se elige la dirección inversa a la actual salvo que sea un
   callejón sin salida.
5. **`src/js/game.js`** — en `update()`, antes de mover los fantasmas, resolver la liberación: si `phase === 'pen'` y
   `dotsEaten >= releaseAt`, el fantasma pasa a `phase: 'exiting'`. Al alcanzar una celda de la fila 11 (o de la
   fila 12 fuera de las columnas 13–14), pasa a `phase: 'out'`.
6. **`src/js/game.js`** — al perder una vida (`resetPositions`), todos los fantasmas vuelven a `phase: 'pen'` en
   sus celdas iniciales. Como `dotsEaten` es acumulativo, un fantasma cuyo `releaseAt` ya se cumplió vuelve a
   salir de inmediato; el resto espera a que se cumpla el suyo.
7. **`src/js/render.js`** — `GHOST_COLORS` ya tiene 4 entradas; se comprueba que el orden coincide con el orden de
   `GHOST_STARTS` para que cada rol conserve su color. No hace falta ningún otro cambio de render.
8. **`src/js/main.js`** — sin cambios previstos: los estados (`'start'`, `'playing'`, `'won'`, `'lost'`) y el loop
   siguen igual. Verificar que no hace falta nada.
9. **`AGENTS.md`** — actualizar la sección "Reglas de juego (game.js)" para que describa los cuatro roles, las
   velocidades y el mecanismo de salida escalonada, en lugar de los dos fantasmas actuales.

## Criterios de aceptación

- [ ] El juego muestra **4 fantasmas** desde el primer frame, cada uno con un color distinto.
- [ ] Los 4 fantasmas empiezan dentro del pen: dos en la fila 13 (cols 12 y 15) y dos en la fila 15 (cols 12 y 15).
- [ ] Antes de su liberación, un fantasma **no puede salir** del interior del pen (cols 11–16, filas 13–15), aunque
      el jugador se quede quieto; sí se mueve dentro del pen.
- [ ] El fantasma `hunter` sale con 0 dots comidos y **persigue directamente** la celda de Pac-Man.
- [ ] El fantasma `ambusher` no sale hasta 30 dots comidos y su objetivo se sitúa 4 celdas por delante de Pac-Man.
- [ ] El fantasma `patrol` no sale hasta 60 dots comidos y alterna entre su esquina (1,29) y la celda de Pac-Man.
- [ ] El fantasma `slow` no sale hasta 90 dots comidos y se mueve al azar.
- [ ] Las velocidades son 0.11 (hunter), 0.10 (ambusher), 0.09 (patrol) y 0.075 (slow), y son verificables en el juego:
      el `slow` es visiblemente más lento que el `hunter`.
- [ ] Ningún fantasma puede volver a entrar en el pen una vez que ha salido.
- [ ] Los 4 fantasmas no pueden cruzar la puerta del pen mientras están contenidos, ni capturar a Pac-Man dentro
      del pen.
- [ ] Perder una vida reinicia los 4 fantasmas a sus celdas iniciales del pen y mantiene el estado de la partida
      (score, dots restantes).
- [ ] Ganar o perder la partida sigue funcionando igual que antes: overlay con "GANASTE" / "PERDISTE" y botón de
      reinicio.
- [ ] El juego sigue funcionando **sin errores en la consola** al abrir `src/index.html` en el navegador y durante
      una partida completa.
- [ ] `AGENTS.md` refleja los cuatro roles y el mecanismo de liberación escalonada.

## Decisiones tomadas

| Decisión | Motivo |
|----------|--------|
| Cuatro roles tipo arcade (`hunter`, `ambusher`, `patrol`, `slow`) | Da variedad real en la persecución, como en el original. |
| Salida escalonada por **dots comidos** (0 / 30 / 60 / 90) | Escala con el ritmo del jugador, no con el reloj; evita que los 4 salgan a la vez y no depende del framerate. |
| El `hunter` es el único que persigue directamente a Pac-Man | El requisito explícito: "uno de ellos debe perseguir agresivamente". |
| Velocidades distintas por fantasma | El `slow` (0.075) se puede esquivar de forma distinta al `hunter` (0.11). |
| Heurística voraz (Manhattan) mantenida, sin BFS | Reutiliza el código existente; el BFS es un spec aparte si hace falta. |
| El patrullero alterna entre esquina fija y Pac-Man | Determinista y fácil de verificar contra la esquina acordada. |
| Los fantasmas no pueden reentrar en el pen | Simplifica el modelo de estados (3 fases) y evita casos raros. |
| Los fantasmas contenidos se mueven dentro del pen | Un fantasma estático se ve como un error visual. |
| Fase `exiting` intermedia | Permite que el contained fantasma recorra el interior hasta la puerta en lugar de "teletransportarse" al pasillo. |
| `dotsEaten` derivado de `dotsRemaining` | Evita un campo nuevo de contador de dots comidos; solo se guarda `dotsInitial`. |
| Puntos extra y power-pellets fuera de alcance | Mantiene el spec centrado en el cambio de fantasmas. |
| Al perder una vida, un fantasma ya liberado vuelve a salir de inmediato | `dotsEaten` es acumulativo; mantener un contador de liberación adicional por vida añadiría complejidad sin beneficio claro. |

## Riesgos

- **La contención en el pen puede atrapar a un fantasma.** Si la lógica de fase no permite pasar por la puerta en
  `exiting`, el fantasma podría quedarse dando vueltas por el interior indefinidamente. Mitigación: en `exiting` el
  objetivo es siempre la celda de puerta más cercana, y la puerta es transible en ambos sentidos.
- **Los fantasmas pueden capturar a Pac-Man dentro del pen.** Hoy Pac-Man no puede entrar en el pen, así que la
  colisión dentro del pen no debería ocurrir; verificar que la contención no abre una ruta nueva.
- **Regresión en la detección de alineación.** Los fantasmas salen del pen en filas donde antes solo había dos
  actores; comprobar que el giro de Pac-Man y el consumo de dots no se ven afectados.
- **El pen es simétrico respecto a cols 13/14 y la puerta ocupa 2 celdas.** Un fantasma que sale por la columna 14
  y otro por la 13 se solapan en el mismo frame en `exiting`; definir que en `exiting` la dirección preferida sea la
  celda de puerta más cercana en x.
