# SPEC 03 — Power pellets y fantasmas vulnerables

> **Status:** Approved
> **Depends on:** SPEC 01, SPEC 02
> **Date:** 2026-10-22
> **Objective:** Añadir 4 power pellets al laberinto que, al ser comidos, vuelve vulnerables a los fantasmas durante 600 frames para que Pac-Man pueda comerlos.

## Por qué existe este spec

El SPEC 01 y el SPEC 02 dejaron los fantasmas persiguiendo a Pac-Man de forma permanente y sin ninguna forma de
responder: el jugador no puede deshacerse de un fantasma, la partida solo acaba cuando choca 3 veces y el score
depende exclusivamente de comer dots. El propio SPEC 02 dejó constancia de que los power-pellets estaban
"fuera de alcance (specs futuros)".

Este spec añade el elemento que faltaba: 4 power pellets en las esquinas del laberinto que activan un estado
vulnerable durante 600 frames. En ese estado los fantasmas huyen de Pac-Man, se mueven más despacio, se dibujan
azules y pueden ser comidos, con una puntuación escalonada de 200/400/800/1600 puntos.

## Alcance

**Dentro del alcance:**

- 4 power pellets en las celdas (1,6), (26,6), (1,26) y (26,26).
- Nuevo valor de celda `4` (power pellet) en la matriz del laberinto.
- Comer un power pellet: 50 puntos y activación del estado vulnerable durante 600 frames.
- Estado vulnerable por fantasma: objetivo de huida, velocidad propia (la mitad de la normal) y color azul.
- Comer un fantasma vulnerable: 200/400/800/1600 puntos según la posición en la racha; el fantasma desaparece
  hasta que termina el efecto.
- Racha que se reinicia al expirar el efecto, al perder una vida o al comer otro power pellet.
- Al expirar el efecto: los fantasmas vuelven a su comportamiento normal y los comidos reaparecen en su celda
  de salida.
- Render: power pellets más grandes y parpadeantes; fantasmas vulnerables en azul; fantasmas comidos no se dibujan.
- Actualización de `AGENTS.md`.

**Fuera de alcance (specs futuros):**

- Niveles adicionales, dificultad progresiva o cambios en la geometría del laberinto.
- La jaula como fase de retorno del fantasma comido: el pen sigue cerrado e infranqueable.
- Recalibrar los umbrales de liberación de los fantasmas (`0 / 30 / 60 / 90` dots).
- Mostrar en el HUD el tiempo restante del efecto o el contador de racha.
- Quitar los 4 power pellets al ganar la partida o al reiniciar la vida.
- Cambios en `main.js`: el bucle y los overlays no necesitan conocer el estado vulnerable.

## Modelo de datos

### Laberinto (`src/js/maze.js`)

Nuevo carácter en `MAZE_STR` y nuevo valor numérico:

| Carácter | Valor | Significado |
|----------|-------|-------------|
| `#` | 1 | Pared |
| `.` | 2 | Dot |
| ` ` | 0 | Vacío transitable |
| `-` | 3 | Puerta del pen |
| `o` | 4 | Power pellet |

`parseTile()` reconoce `'o'` y devuelve `4`. Las 4 esquinas pasan de `'.'` a `'o'` en las columnas 1 y 26 de las
filas 6 y 26.

`MAZE` sigue siendo la matriz **prístina**: no se muta. `createGame()` copia a `game.grid` y ahí se consumen
los pellets igual que los dots.

El recuento de `dotsInitial` sigue contando **solo** el valor `2`: los power pellets no forman parte de la
condición de victoria (`dotsRemaining <= 0`). Los 4 pellets son opcionales y su consumo no suma a
`dotsRemaining`.

### Velocidades (`src/js/maze.js`, `GHOST_STARTS`)

Cada fantasma gana un campo `vulnerableSpeed`, la mitad de su velocidad normal. Ambas son fracciones `1/n`, por
lo que el actor sigue alineándose en el centro de cada celda:

| Fantasma | `speed` | `vulnerableSpeed` |
|----------|---------|--------------------|
| `hunter` | 1/9 | 1/18 |
| `ambusher` | 1/10 | 1/20 |
| `patrol` | 1/11 | 1/22 |
| `slow` | 1/13 | 1/26 |

### Estado del juego (`src/js/game.js`)

```js
game.power = {
  active: false,   // hay efecto vulnerable en curso
  framesLeft: 0,   // frames restantes del efecto
  streak: 0,       // fantasmas comidos en la racha actual (0 = ninguno comido)
};
```

### Estado por fantasma (`src/js/game.js`)

| Campo | Valores | Significado |
|-------|---------|-------------|
| `vulnerable` | `true` / `false` | Está en modo huida (solo puede ser `true` si `game.power.active`). |
| `eaten` | `true` / `false` | Ha sido comido; no se dibuja y no colisiona hasta que termine el efecto. |
| `speed` | fracción `1/n` | Velocidad actual: `vulnerableSpeed` si es vulnerable, la normal si no. |
| `baseSpeed` | fracción `1/n` | Velocidad normal, guardada al crearse, para poder restaurarla. |

Un fantasma comido conserva su `phase: 'out'` y su celda: simplemente deja de moverse, de dibujarse y de poder
chocar.

### Objetivo del fantasma vulnerable

`ghostTarget()` devuelve, en este orden:

1. Si `g.vulnerable` es `true`: la celda 4 celdas en la dirección **opuesta** a la de Pac-Man respecto a la celda
   de Pac-Man. Si esa celda es muro o está fuera del laberinto, se usa la celda de Pac-Man.
2. Si no, el objetivo según el rol, tal como se define en el SPEC 01.

La huida usa la misma heurística voraz por distancia Manhattan que el resto de fantasmas: no se introduce un
algoritmo nuevo.

### Puntuación

- Dot: 10 puntos (sin cambios).
- Power pellet: 50 puntos.
- Fantasma vulnerable: 200 puntos el primero, 400 el segundo, 800 el tercero y 1600 el cuarto. A partir del
  quinto se mantiene el valor de 1600.

La racha (`game.power.streak`) se incrementa al comer un fantasma y se reinicia a `0` cuando: expira el efecto,
se pierde una vida, o se come otro power pellet.

## Plan de implementación

1. **`src/js/maze.js`** — añadir el valor `4` a `parseTile()` (`'o'` → `4`) y cambiar a `'o'` las 4 celdas de las
   esquinas en `MAZE_STR` (filas 6 y 26, columnas 1 y 26). No se toca `MAZE`, `TUNNEL_ROW`, `PACMAN_START` ni la
   puerta. Manual: recargar y comprobar que no hay errores de sintaxis.

   > Nota de implementación: las cadenas resultantes son `'#o####.##.########.##.####o#'` (fila 6) y
   > `'#o.....##....##....##.....o#'` (fila 26). Las cadenas de ejemplo del apartado "Modelo de datos" estaban
   > desplazadas un carácter respecto a las columnas 1 y 26; prevalecen las coordenadas.
2. **`src/js/maze.js`** — añadir `vulnerableSpeed` a las 4 entradas de `GHOST_STARTS` con los valores de la tabla
   anterior. Manual: recargar y verificar que el objeto `GHOST_STARTS` incluye el campo.
3. **`src/js/game.js` (`createGame`)** — inicializar `game.power = { active: false, framesLeft: 0, streak: 0 }`.
   Cada fantasma nace con `vulnerable: false`, `eaten: false`, `baseSpeed: g.speed` y `speed: g.speed`.
   Manual: la partida arranca igual que antes, con 0 pellets consumidos.
4. **`src/js/game.js` (`movePacman`)** — al alinear en una celda, si `grid[y][x] === 4`: ponerla a `0`,
   sumar `game.score += 50`, activar `game.power.active = true`, poner `game.power.framesLeft = 600` **solo si no
   estaba ya activo** (comer un pellet durante el efecto no reinicia la cuenta atrás), y poner
   `game.power.streak = 0`. Manual: al comer el pellet de (1,6) desaparecen los 4 puntos de la esquina y el
   score sube 50.
5. **`src/js/game.js` (`ghostTarget`)** — añadir la rama vulnerable al principio de la función: objetivo de huida
   4 celdas en la dirección opuesta a Pac-Man, con caída a la celda de Pac-Man si esa celda es muro.
   Manual: al activar un pellet, los fantasmas cambian de rumbo en la siguiente celda.
6. **`src/js/game.js`** — nueva helper `endPower( game )`: pone `game.power.active = false`,
   `game.power.framesLeft = 0`, `game.power.streak = 0`, y para cada fantasma `vulnerable = false`,
   `eaten = false`, `speed = baseSpeed`; los fantasmas que estaban `eaten` reaparecen en su celda de salida
   (`g.exit`), con `phase: 'out'`, `dir: 'left'` y `target = { x, y }`. Manual: la helper no se invoca todavía.
7. **`src/js/game.js` (`update`)** — decrementar `game.power.framesLeft` en cada frame mientras esté activo; al
   llegar a 0, llamar a `endPower( game )`. Manual: el efecto dura 600 frames y luego caduca solo.
8. **`src/js/game.js` (`update`)** — al detectar una colisión con un fantasma: si el fantasma es `vulnerable`, se
   marca `eaten = true`, se incrementa `game.power.streak` y se suma a `game.score` el valor
   `200 * 2 ** ( streak - 1 )` (200, 400, 800, 1600, 1600...). Si el fantasma no es `vulnerable`, se pierde una
   vida como hasta ahora. Los fantasmas `eaten` no se comprueban en la colisión. Manual: comer un fantasma azul
   da puntos y lo hace desaparecer; chocar con uno normal resta una vida.
9. **`src/js/game.js` (`resetPositions`)** — además de reponer Pac-Man y los 4 fantasmas en sus celdas de salida,
   llamar a `endPower( game )` para que al perder una vida no quede efecto vulnerable ni racha. Manual: tras
   chocar, los fantasmas azules vuelven a su color y velocidad normales.
10. **`src/js/render.js`** — nueva constante `GHOST_VULNERABLE_COLOR = '#2121ff'`. En `drawGhost()`, si
    `g.eaten` no se dibuja; si `g.vulnerable`, se usa el color azul. Manual: el fantasma azul se ve azul y el
    comido desaparece.
11. **`src/js/render.js`** — nueva función `drawPowerPellets( ctx, grid )` que dibuja las celdas con valor `4`
    como círculos de radio 6 en `DOT_COLOR`, con parpadeo (visibles solo en los frames en los que
    `Math.floor( frame / 10 ) % 2 === 0`). Se llama desde `draw()` antes de `drawDots()`. Manual: se ven 4
    círculos grandes parpadeando en las esquinas.
12. **`AGENTS.md`** — actualizar la sección "Reglas de juego (game.js)" y la de "Modelo del laberinto (maze.js)"
    con el valor `4`, el estado vulnerable, la velocidad y las reglas de puntuación. Manual: releer el fichero.

## Criterios de aceptación

- [ ] El laberinto muestra 4 power pellets grandes y parpadeantes en (1,6), (26,6), (1,26) y (26,26).
- [ ] El valor de celda `4` no se cuenta como dot: `dotsInitial` sigue contando solo el valor `2` y la partida no
      se gana antes de tiempo por comer pellets.
- [ ] Comer un power pellet suma exactamente 50 puntos y desaparece del laberinto.
- [ ] Tras comer un power pellet, los 4 fantasmas quedan azules, se mueven a la mitad de velocidad y cambian su
      objetivo para huir de Pac-Man.
- [ ] La velocidad de un fantasma vulnerable es siempre una fracción `1/n` (1/18, 1/20, 1/22 o 1/26) y el fantasma
      sigue alineándose en el centro de las celdas (no atraviesa paredes).
- [ ] Comer un fantasma vulnerable lo hace desaparecer y suma 200, 400, 800 y 1600 puntos a los cuatro primeros
      fantasmas de la racha; el quinto y siguientes suman 1600.
- [ ] Un fantasma comido no colisiona con Pac-Man y no se dibuja hasta que termina el efecto.
- [ ] 600 frames después de comer el pellet (sin comer otro), el efecto caduca: los fantasmas recuperan su
      objetivo y su velocidad normales, los comidos reaparecen en su celda de salida y la racha se reinicia.
- [ ] Comer un segundo power pellet durante el efecto no reinicia la cuenta atrás de 600 frames, pero sí reinicia
      la racha de puntos.
- [ ] Perder una vida cancela el efecto vulnerable, reinicia la racha y devuelve a los 4 fantasmas a su celda de
      salida con su comportamiento normal.
- [ ] Chocar con un fantasma no vulnerable sigue restando una vida y repone las posiciones como antes.
- [ ] El juego se abre y se juega sin errores en la consola.
- [ ] `AGENTS.md` describe el valor de celda `4`, el estado vulnerable y las reglas de puntuación.

## Decisiones tomadas

| Decisión | Motivo |
|----------|--------|
| Nuevo valor de celda `4` en la matriz | Mantiene un único modelo de "celdas comibles" en `game.grid`, como ya hacía el valor `2` de los dots. Una lista aparte obligaría a sincronizar dos fuentes de verdad entre `game.js` y `render.js`. |
| 4 pellets en las esquinas (1,6), (26,6), (1,26), (26,26) | Son las 4 celdas ya transitable y vacías en la geometría clásica; no hace falta tocar ninguna pared ni corredor. |
| Duración de 600 frames | El bucle no tiene delta-time, así que el tiempo se mide en frames: 600 frames a 60 fps equivalen a los 10 s del arcade, sin introducir un reloj nuevo. |
| Velocidad vulnerable = mitad de la normal, con denominador duplicado | Mantiene la invariante de que toda velocidad es una fracción `1/n`; si no, los fantasmas dejarían de alinearse y atravesarían paredes. |
| La huida usa la heurística voraz ya existente | `decideGhost()` y `pickToward()` no cambian: solo cambia el objetivo que se les pasa. Menos código, menos riesgo de regresión. |
| Objetivo de huida 4 celdas en la dirección opuesta a Pac-Man | Es el comportamiento del arcade y produce una huida legible; si la celda es muro, la caída a la celda de Pac-Man evita un objetivo inalcanzable. |
| Puntuación 200/400/800/1600 | Es el escalonado del arcade y premia encadenar capturas durante el mismo efecto. |
| El fantasma comido desaparece hasta que acaba el efecto | Es lo que hace el arcade (el fantasma vuelve a la jaula); aquí la jaula es inaccesible, así que el equivalente más simple es que no exista durante el efecto. |
| Al expirar el efecto, los fantasmas comidos reaparecen en su celda de salida | La celda de salida es la única celda del mapa donde un fantasma puede reaparecer sin walledarse dentro de la jaula. |
| Comer un pellet durante el efecto no reinicia la cuenta atrás | Evita que el jugador extienda indefinidamente el efecto; el valor especial del pellet es el efecto, no su duración. |
| Al perder una vida se cancela todo el estado de power | Decisión explícita del usuario: el reinicio de posiciones devuelve a los 4 fantasmas a su estado normal, sin excepciones que explicar. |
| Los power pellets no cuentan para la victoria | La condición de victoria sigue siendo `dotsRemaining <= 0`; los 4 pellets son opcionales y no alteran el ritmo de la partida. |
| El HUD no muestra el tiempo ni la racha | `main.js` y `render.js` no necesitan cambios de estado; el efecto se lee en el color de los fantasmas. |
| La jaula sigue cerrada e infranqueable | El SPEC 02 la declaró infranqueable; este spec no la reabre. |

## Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Que un fantasma desalineado atraviese paredes al cambiar de velocidad | Las dos velocidades son fracciones `1/n` con denominador par, así que el actor sigue landing en el centro de cada celda; el motor solo decide dirección al alinear. |
| Que el cambio de velocidad a mitad de un tramo deje al fantasma desalineado | La velocidad solo cambia en el frame en que Pac-Man come el pellet; un fantasma puede quedar a mitad de celda. El motor conserva la fracción no alineada y re-deriva el redondeo al siguiente cruce, igual que ya hace con el giro pendiente de Pac-Man. |
| Que reaparecer un fantasma comido lo coloque encima de Pac-Man | La colisión con Pac-Man ya está cubierta por la regla existente (distancia < 0.5): se pierde una vida, igual que con cualquier otro fantasma. |
| Que comer el pellet a mitad de partida active el efecto con fantasmas ya en el mapa | Es el comportamiento esperado; el efecto se aplica en el frame siguiente a todos los fantasmas, estén donde estén. |
| Que `dotsRemaining` deje de cuadrar con el número de celdas comibles | `dotsInitial` se calcula sobre el valor `2` y no se toca; los pellets tienen su propio contador implícito en la matriz. |

## Qué **no** entra en este spec

- Niveles adicionales, laberinto ampliado o cualquier cambio de la geometría de `MAZE_STR` más allá del valor `4`.
- Reabrir la puerta del pen o devolver fantasmas a la jaula.
- Recalibrar los umbrales de liberación (`0 / 30 / 60 / 90` dots) o el número de vidas.
- Mostrar en el HUD el tiempo restante del efecto, la racha o los pellets restantes.
- Quitar los power pellets al ganar la partida o al perder una vida.
- Cambios en `main.js` (bucle, teclado u overlays).

Cada uno de esos, si aterriza, va en su propio spec.
