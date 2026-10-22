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

- `MAZE_STR`: 31 strings de 28 chars. Cada char: `#` pared(1) · `.` dot(2) · ` ` vacío transitable(0) · `-` puerta del pen(3).
- `MAZE` es la matriz numérica **prístina**: nunca la mutes. `createGame()` copia con `MAZE.map(r => r.slice())` a `game.grid`,
  que es la única que se modifica al comer dots. Render usa `game.grid`, no `MAZE`.
- Coordenadas: celda `(x,y)`, origen arriba-izquierda, x∈[0,27], y∈[0,30]. Simetría vertical entre cols 13 y 14.
- `TILE = 20` px en render.js; 28*20=560 y 31*20=620 coinciden con el canvas.
- Constants clave: `TUNNEL_ROW = 14` (fila del túnel, bordes abiertos), `PACMAN_START = {x:13,y:23}`,
  `GHOST_STARTS` (2 fantasmas dentro del pen, uno `hunter` y otro `random`).
- La puerta (valor 3) bloquea a Pac-Man pero no a los fantasmas (`isWall(grid,x,y,actor)`).

## Reglas de juego (game.js)

- Velocidades en celdas/frame: Pac-Man `0.125` (1/8, alinea cada 8 frames), fantasmas `0.1` (1/10).
- Los actores se mueven en coordenadas fraccionarias; `aligned(v)` detecta el cruce de celda, donde se aplica
  el giro pendiente (`pacman.nextDir`) y se come el dot. El giro solo se aplica si `canMove` lo permite.
- Estado del juego: `'start' | 'playing' | 'won' | 'lost'`. `main.js` solo llama `update()` cuando es `'playing'`
  y muestra el overlay al cambiar a `'won'`/`'lost'`.
- Choque = distancia < 0.5 en ambos ejes; al chocar se pierden una vida y se resetean posiciones (o `'lost'` si lives ≤ 0).

## Render (render.js)

- Las paredes se dibujan como líneas finas (2.5px) entre centros de celdas-pared adyacentes, uniendo solo
  derecha y abajo para evitar trazos duplicados. Si añades celdas-pared, esta lógica conecta centros, no bordes.
- Colores centralizados al principio del archivo (`WALL_COLOR`, `DOOR_COLOR`, `DOT_COLOR`, `GHOST_COLORS`).
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
