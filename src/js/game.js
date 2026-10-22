// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames

// Interior de la pen: columnas 11-16, filas 13-15. La puerta (fila 12,
// cols 13-14) queda fuera de este rectangulo.
const PEN = { x0: 11, x1: 16, y0: 13, y1: 15 };

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    dotsInitial: dots,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: g.speed,
      kind: g.kind,
      releaseAt: g.releaseAt,
      corner: g.corner,
      // Fase de salida: 'pen' (contenido en el interior de la pen),
      // 'exiting' (cruza la puerta), 'out' (ya no puede reentrar).
      phase: 'pen',
      target: { x: g.x, y: g.y },
      patrolToCorner: g.kind === 'patrol',
    } ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// La celda esta dentro del interior transitable de la pen?
function inPen( x, y ) {
  return x >= PEN.x0 && x <= PEN.x1 && y >= PEN.y0 && y <= PEN.y1;
}

// La celda es una de las dos puertas de la pen (fila 12, cols 13 y 14)?
function isDoorCell( x, y ) {
  return y === PEN.y0 - 1 && ( x === 13 || x === 14 );
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado por pared (1); la puerta (3) solo se cruza en fase
//           'exiting', por lo que un fantasma ya salido no puede reentrar.
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 ) {
    if ( actor === 'pacman' ) return true;
    if ( actor.phase !== 'exiting' ) return true;
  }
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
// actor es 'pacman' o el propio fantasma (para conocer su fase).
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  const isGhost = actor !== 'pacman';
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) {
    // Un fantasma contenido en la pen no puede escaparse por el tunel.
    return !isGhost || actor.phase !== 'pen';
  }
  if ( isGhost ) {
    if ( actor.phase === 'pen' ) {
      // Contenido: solo se mueve dentro del interior de la pen.
      if ( !inPen( tx, ty ) ) return false;
    } else if ( actor.phase === 'exiting' ) {
      // Salida: dentro de la pen, por la puerta y hasta el corredor (fila 11).
      const DOOR_ROW = PEN.y0 - 1;
      if ( ty < PEN.y0 - 2 ) return false;
      if ( ty === DOOR_ROW && !isDoorCell( tx, ty ) ) return false;
      if ( ty > DOOR_ROW && !inPen( tx, ty ) ) return false;
    } else {
      // Ya fuera: no puede volver a entrar en la pen por ningun lado.
      if ( inPen( tx, ty ) ) return false;
    }
  }
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

// Celda de la puerta (fila 12) mas cercana en x al fantasma.
function nearestDoorCell( g ) {
  const cx = Math.round( g.x );
  const x = Math.abs( cx - 13 ) <= Math.abs( cx - 14 ) ? 13 : 14;
  return { x, y: PEN.y0 - 1 };
}

// Objetivo del fantasma segun su rol:
//   hunter:   la celda actual de Pac-Man
//   ambusher: 4 celdas por delante de Pac-Man (si es muro, la celda de Pac-Man)
//   patrol:   su esquina o la celda de Pac-Man, alternando
//   slow:     sin objetivo fijo (se mueve al azar)
function ghostTarget( game, g ) {
  const p = game.pacman;
  const px = Math.round( p.x );
  const py = Math.round( p.y );

  if ( g.kind === 'ambusher' ) {
    const d = DIRS[ p.dir ] || { x: 0, y: 0 };
    const tx = px + d.x * 4;
    const ty = py + d.y * 4;
    const grid = game.grid;
    const outside =
      tx < 0 || ty < 0 || ty >= grid.length || tx >= grid[ 0 ].length;
    const v = outside ? 1 : grid[ ty ][ tx ];
    if ( outside || v === 1 || v === 3 ) return { x: px, y: py };
    return { x: tx, y: ty };
  }

  if ( g.kind === 'patrol' ) {
    if ( g.patrolToCorner ) return { x: g.corner.x, y: g.corner.y };
    return { x: px, y: py };
  }

  return { x: px, y: py };
}

// Elige, entre las direcciones legales, la que mas se acerca al objetivo.
function pickToward( choices, target, from ) {
  let best = choices[ 0 ];
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const nx = from.x + d.x;
    const ny = from.y + d.y;
    const dist = Math.abs( nx - target.x ) + Math.abs( ny - target.y );
    if ( dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  return best;
}

function decideGhost( game, g ) {
  const grid = game.grid;
  const p = game.pacman;

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, g )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ '' + OPPOSITE[ g.dir ] ];

  // Contenido en la pen: deambula al azar dentro de su interior.
  if ( g.phase === 'pen' ) {
    g.dir = choices[ Math.floor( Math.random() * choices.length ) ];
    return;
  }

  // Saliendo: se dirige a la puerta mas cercana y de ahi al corredor.
  if ( g.phase === 'exiting' ) {
    const door = nearestDoorCell( g );
    const atDoor = Math.round( g.x ) === door.x && Math.round( g.y ) === door.y;
    g.target = atDoor ? { x: door.x, y: PEN.y0 - 2 } : door;
    g.dir = pickToward( choices, g.target, g );
    return;
  }

  // Fuera de la pen: cada rol decide su objetivo.
  if ( g.kind === 'slow' ) {
    g.dir = choices[ Math.floor( Math.random() * choices.length ) ];
    return;
  }

  if ( g.kind === 'patrol' ) {
    const cx = Math.round( g.x );
    const cy = Math.round( g.y );
    if ( g.patrolToCorner ) {
      // Alcanzada la esquina, ahora persigue a Pac-Man.
      if ( cx === g.corner.x && cy === g.corner.y ) g.patrolToCorner = false;
    } else if ( cx === Math.round( p.x ) && cy === Math.round( p.y ) ) {
      // Alcanzado Pac-Man, vuelve a su esquina.
      g.patrolToCorner = true;
    }
  }

  g.target = ghostTarget( game, g );
  g.dir = pickToward( choices, g.target, g );
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    decideGhost( game, g );
    if ( !canMove( grid, g.x, g.y, g.dir, g ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.ghosts.forEach( ( g, i ) => {
    g.x = GHOST_STARTS[ i ].x;
    g.y = GHOST_STARTS[ i ].y;
    g.dir = 'up';
    // Tras perder una vida los fantasmas vuelven a la pen. Como dotsEaten
    // es acumulativo, los que ya cumplieron su releaseAt saldran de inmediato.
    g.phase = 'pen';
    g.target = { x: g.x, y: g.y };
    g.patrolToCorner = g.kind === 'patrol';
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  movePacman( game );

  // Dots comidos en la partida (acumulativo, no baja al perder vidas).
  const dotsEaten = game.dotsInitial - game.dotsRemaining;

  game.ghosts.forEach( ( g ) => {
    // Liberacion escalonada: cada fantasma sale tras certain dots comidos.
    if ( g.phase === 'pen' && dotsEaten >= g.releaseAt ) g.phase = 'exiting';
    moveGhost( game, g );
    // Al alcanzar el corredor (fila 11) el fantasma queda fuera y ya no
    // puede reentrar en la pen.
    if ( g.phase === 'exiting' && Math.round( g.y ) <= PEN.y0 - 2 ) {
      g.phase = 'out';
    }
  } );

  for ( const g of game.ghosts ) {
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
