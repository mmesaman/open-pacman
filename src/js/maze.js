// maze.js
// Laberinto 28x31 fiel a la geometria del nivel 1 de Pac-Man.
// Se escribe como 31 strings de 28 chars (legible) y se parsea a numeros.
//   '#' pared(1) · '.' dot(2) · ' ' vacio transitable(0) · '-' puerta pen(3)
// Coordenadas: celda (x,y), origen arriba-izquierda. x in [0,27], y in [0,30].
// Simetrico respecto al eje vertical central (entre cols 13 y 14).

const MAZE_STR = [
  '############################', // 0  borde
  '#............##............#', // 1
  '#.####.#####.##.#####.####.#', // 2
  '#.####.#####.##.#####.####.#', // 3
  '#.####.#####.##.#####.####.#', // 4
  '#..........................#', // 5
  '#.####.##.########.##.####.#', // 6
  '#.####.##.########.##.####.#', // 7
  '#......##....##....##......#', // 8
  '######.#####.##.#####.######', // 9
  '######.#####.##.#####.######', // 10
  '######.##..........##.######', // 11
  '######.##.###--###.##.######', // 12  puerta pen cols 13-14
  '######.##.#      #.##.######', // 13  interior pen
  '          #      #          ', // 14  tunel (extremos abiertos) + pen
  '######.##.#      #.##.######', // 15  interior pen
  '######.##.########.##.######', // 16  fondo pen
  '######.##..........##.######', // 17
  '######.#####.##.#####.######', // 18
  '######.#####.##.#####.######', // 19
  '#............##............#', // 20
  '#.####.#####.##.#####.####.#', // 21
  '#.####.#####.##.#####.####.#', // 22
  '#...##................##...#', // 23  fila inicio Pacman (13,23)
  '###.##.##.########.##.##.###', // 24
  '###.##.##.########.##.##.###', // 25
  '#......##....##....##......#', // 26
  '#.##########.##.##########.#', // 27
  '#.##########.##.##########.#', // 28
  '#..........................#', // 29
  '############################', // 30  borde
];

function parseTile( ch ) {
  if ( ch === '#' ) return 1;
  if ( ch === '.' ) return 2;
  if ( ch === '-' ) return 3;
  return 0; // espacio = vacio transitable
}

// Matriz numerica pristina (no se muta; cada partida copia esto).
const MAZE = MAZE_STR.map( ( row ) => row.split( '' ).map( parseTile ) );

const TUNNEL_ROW = 14;
const PACMAN_START = { x: 13, y: 23 };
// Cuatro fantasmas, cada uno con rol, velocidad y momento de salida propios.
//   kind: 'hunter'   persigue la celda de Pac-Man
//   kind: 'ambusher' apunta 4 celdas por delante de Pac-Man
//   kind: 'patrol'   alterna entre su esquina y la celda de Pac-Man
//   kind: 'slow'     se mueve al azar, con la menor velocidad
//   releaseAt: dots comidos por Pac-Man a partir de los cuales puede salir
//   corner: objetivo de patrulla (solo 'patrol')
//   exit: celda del mapa (fila 11) donde aparece el fantasma al liberarse
// Las velocidades son 1/n para que el actor aterrice exactamente en el centro
// de cada celda: el motor de movimiento decide direccion solo al alinear.
const GHOST_STARTS = [
  { x: 12, y: 13, kind: 'hunter', speed: 1 / 9, releaseAt: 0, corner: null, exit: { x: 12, y: 11 } }, // fila superior izq.
  { x: 15, y: 13, kind: 'ambusher', speed: 1 / 10, releaseAt: 30, corner: null, exit: { x: 14, y: 11 } }, // fila superior der.
  { x: 12, y: 15, kind: 'patrol', speed: 1 / 11, releaseAt: 60, corner: { x: 1, y: 29 }, exit: { x: 13, y: 11 } }, // fila inferior izq.
  { x: 15, y: 15, kind: 'slow', speed: 1 / 13, releaseAt: 90, corner: null, exit: { x: 15, y: 11 } }, // fila inferior der.
];

window.MAZE = MAZE;
window.TUNNEL_ROW = TUNNEL_ROW;
window.PACMAN_START = PACMAN_START;
window.GHOST_STARTS = GHOST_STARTS;
