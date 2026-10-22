# AGENTS.md

Proyecto en español (README, comentarios, textos de UI). Escribe código, comentarios y mensajes en español.

## Qué es

Juego tipo Pac-Man en Vanilla JS + HTML + CSS. Sin build, sin `package.json`, sin bundler, sin tests, sin linter.
No hay comandos de `npm`, `lint` ni `test` que ejecutar: la única verificación es abrir `src/index.html` en el navegador
y jugar. Añade un `package.json`/tooling solo si el usuario lo pide.

## Estructura

- `src/index.html` — canvas 560x620 (`<canvas id="game">`) + overlay DOM (`#overlay`, `#action-btn`).
- `src/css/style.css` — único stylesheet.
- `src/js/` — 4 scripts clásicos cargados en este orden en `index.html`:
  `maze.js` → `game.js` → `render.js` → `main.js`.

Los archivos se comunican **solo por globales** (`window.MAZE`, `window.createGame`, `window.update`, `window.draw`,
`window.DIRS`, `window.TUNNEL_ROW`, `window.PACMAN_START`, `window.GHOST_STARTS`). No hay módulos ES ni imports:
un archivo nuevo debe exponer su API por `window.*` y ser añadido explícitamente como `<script>` en `index.html`.

## Modelo del laberinto (maze.js)

- `MAZE_STR`: 31 strings de 28 chars. Cada char: `#` pared(1) · `.` dot(2) · ` ` vacío transitable(0) · `-` puerta del pen(3)
  · `o` power pellet(4).
- `MAZE` es la matriz numérica **prístina**: nunca la mutes. `createGame()` copia con `MAZE.map(r => r.slice())` a `game.grid`,
  que es la única que se modifica al comer dots y power pellets. Render usa `game.grid`, no `MAZE`.
- Coordenadas: celda `(x,y)`, origen arriba-izquierda, x∈[0,27], y∈[0,30]. Simetría vertical entre cols 13 y 14.
- `TILE = 20` px en render.js; 28*20=560 y 31*20=620 coinciden con el canvas.
- Constants clave: `TUNNEL_ROW = 14` (fila del túnel, bordes abiertos), `PACMAN_START = {x:13,y:23}`,
  `GHOST_STARTS` (4 fantasmas: `{x,y,kind,speed,vulnerableSpeed,releaseAt,corner,exit}`).
- La puerta (valor 3) es **infranqueable para todos los actores** (Pac-Man y fantasmas, en cualquier fase):
  `isWall(grid,x,y,actor)` la trata como muro.
- Los 4 power pellets viven en la propia matriz (valor `4`), en (1,6), (26,6), (1,26) y (26,26). No cuentan como dots:
  `dotsInitial` sigue contando solo el valor `2` y la victoria sigue siendo `dotsRemaining <= 0`.

## Reglas de juego (game.js)

- **Las velocidades deben ser fracciones `1/n`** (Pac-Man `1/8`, fantasmas `1/9`, `1/10`, `1/11`, `1/13`).
  El motor solo decide dirección, come dots y comprueba muros cuando el actor queda **exactamente alineado**
  con el centro de una celda (`aligned()`); si la velocidad no es `1/n` el actor deja de alinear y **atraviesa
  paredes**. No introduzcas velocidades decimales (0.11, 0.09…) sin reescribir el movimiento.
- **Power pellets y estado vulnerable** (SPEC 03):
  - Comer un power pellet (valor `4`) da 50 puntos y activa `game.power = { active, framesLeft, streak }`.
  - El efecto dura 600 frames (`POWER_FRAMES`); comer otro pellet durante el efecto **no reinicia** la cuenta
    atrás, pero sí reinicia la racha.
  - Mientras el efecto está activo todos los fantasmas son `vulnerable`: huyen de Pac-Man (objetivo 4 celdas en
    la dirección opuesta a la de Pac-Man, con caída a la celda de Pac-Man si es muro), se dibujan en azul y se
    mueven con `vulnerableSpeed` (la mitad de la normal: `1/18`, `1/20`, `1/22`, `1/26` — también fracciones
    `1/n`, para no romper la alineación).
  - Un fantasma `vulnerable` que choca con Pac-Man es **comido**: desaparece (`g.eaten = true`, no se dibuja ni
    colisiona) y suma 200/400/800/1600 puntos (`GHOST_POINTS`); a partir del quinto, 1600.
  - `endPower(game)` (al expirar el efecto o al perder una vida) desactiva el efecto, reinicia la racha, devuelve
    a cada fantasma su `baseSpeed` y hace reaparecer a los comidos en su celda de salida `g.exit`.
- Los actores se mueven en coordenadas fraccionarias; `aligned(v)` detecta el cruce de celda, donde se aplica
  el giro pendiente (`pacman.nextDir`) y se come el dot. El giro solo se aplica si `canMove` lo permite.
- **Cuatro fantasmas con roles** (`kind`): `hunter` persigue la celda de Pac-Man; `ambusher` apunta 4 celdas por
  delante; `patrol` alterna entre su `corner` y Pac-Man; `slow` se mueve al azar. La heurística es voraz
  (distancia Manhattan al objetivo); `slow` elige dirección al azar; nunca se elige la dirección inversa salvo
  callejón sin salida.
- **Fases de salida** (`g.phase`): solo `'pen'` (dentro de la jaula, **quieto**) y `'out'` (en el mapa).
  Al cumplirse `dotsEaten = game.dotsInitial - game.dotsRemaining >= g.releaseAt` (0 / 30 / 60 / 90 dots) el
  fantasma se coloca **directamente en el mapa** en su celda de salida `g.exit` (fila 11: cols 12, 14, 13 y 15),
  con `dir: 'left'` y `phase: 'out'` (`releaseGhost()`). No hay fase intermedia ni recorrido por la puerta.
- `PEN = { x0: 11, x1: 16, y0: 13, y1: 15 }` delimita el interior de la pen; `inPen()` es la guarda de contención:
  un fantasma en fase `'out'` no puede entrar en la pen.
- Estado del juego: `'start' | 'playing' | 'won' | 'lost'`. `main.js` solo llama `update()` cuando es `'playing'`
  y muestra el overlay al cambiar a `'won'`/`'lost'`.
- Choque = distancia < 0.5 en ambos ejes; al chocar se pierden una vida y se resetean posiciones (o `'lost'` si lives ≤ 0).
  Al resetear, los 4 fantasmas se reponen **en su celda de salida de la fila 11**, en fase `'out'` y con
  `dir: 'left'` (todos pasan al mapa, incluidos los que aún no habían cumplido su `releaseAt`).

## Render (render.js)

- Las paredes se dibujan como líneas finas (2.5px) entre centros de celdas-pared adyacentes, uniendo solo
  derecha y abajo para evitar trazos duplicados. Si añades celdas-pared, esta lógica conecta centros, no bordes.
- Colores centralizados al principio del archivo (`WALL_COLOR`, `DOOR_COLOR`, `DOT_COLOR`, `GHOST_COLORS`,
  `GHOST_VULNERABLE_COLOR`).
- Los power pellets (valor `4`) se dibujan como círculos grandes y parpadeantes (`drawPowerPellets`); los
  fantasmas `vulnerable` se dibujan en azul y los `eaten` no se dibujan.
- La boca de Pac-Man se anima con `frame`; `draw(ctx, game, frame)` recibe el contador de frames del loop.

## Convenciones de estilo

- Formato: 2 espacios, comillas simples, y **espacios dentro de los paréntesis** (`game.grid[ y ][ x ]`, `( e ) => ...`).
  Mantén ese formato al editar; hay código formateado así de forma consistente.
- Cada archivo JS empieza con un comentario de cabecera `// nombre.js` y una línea explicando de qué globals depende.
- No uses `let`/`const` fuera de la función donde se usan cuando el archivo ya expone estado por `window`.

## Flujo spec-driven (skills)

Este repo existe para aprender el flujo spec-driven; las skills viven en `.agents/skills/` (`spec`, `spec-impl`) y están
fijadas en `skills-lock.json` (fuente `Klerith/fernando-skills`). No las edites ni regeneres el lock salvo petición explícita.

- `/spec <descripción>`: redacta la spec en `specs/NN-slug.md` (aún no existe `specs/`; se crea la primera vez).
  Estados válidos: `Draft`, `In review`, `Approved`, `Implemented`, `Obsolete` (o equivalentes en español).
  Genera `specs/.spec-config.yml` con `AutoCreateBranch: true` solo si no existe; nunca lo sobrescribas.
- `/spec-impl NN-slug`: exige spec en estado "Approved"; crea la rama `spec-NN-slug` (salvo `AutoCreateBranch: false`);
  implementa paso a paso parando para revisión del diff; **nunca hace commit por su cuenta**.
- Los specs se escriben en español y el código se ajusta a ellos: si el spec y el código discrepan, el spec manda.
