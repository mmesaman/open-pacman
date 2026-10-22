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

// Duracion del efecto vulnerable en frames (~10 s a 60 fps).
const POWER_FRAMES = 600;
// Puntos por fantasma vulnerable comido: 200, 400, 800, 1600 (y 1600 tras eso).
const GHOST_POINTS = [ 200, 400, 800, 1600 ];

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
    // Estado del powerup: efecto vulnerable, frames restantes y racha.
    power: {
      active: false,
      framesLeft: 0,
      streak: 0,
    },
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
      // Velocidad normal, para restaurarla al terminar el efecto vulnerable.
      baseSpeed: g.speed,
      // Velocidad mientras es vulnerable (la mitad de la normal).
      vulnerableSpeed: g.vulnerableSpeed,
      kind: g.kind,
      releaseAt: g.releaseAt,
      corner: g.corner,
      // Fase: 'pen' (dentro de la jaula, quieto), 'out' (en el mapa).
      phase: 'pen',
      // Celda del mapa donde aparece al liberarse.
      exit: { ...g.exit },
      target: { x: g.x, y: g.y },
      patrolToCorner: g.kind === 'patrol',
      // Estado de powerup: vulnerable (huye) y eaten (comido, invisible).
      vulnerable: false,
      eaten: false,
    } ) ),
  };
}

// Coloca al fantasma directamente en el mapa, en su celda de salida.
function releaseGhost( game, g ) {
  g.x = g.exit.x;
  g.y = g.exit.y;
  g.dir = 'left';
  g.phase = 'out';
  g.target = { x: g.x, y: g.y };
  g.patrolToCorner = g.kind === 'patrol';
}

// Activa el efecto vulnerable: todos los fantasmas pasan a huir y a moverse
// a la mitad de velocidad. La racha de puntos se reinicia.
function activatePower( game ) {
  game.power.active = true;
  game.power.streak = 0;
  game.ghosts.forEach( ( g ) => {
    g.vulnerable = true;
    g.eaten = false;
    g.speed = g.vulnerableSpeed;
  } );
}

// Termina el efecto vulnerable: los fantasmas recuperan su comportamiento
// normal y los que estaban comidos reaparecen en su celda de salida.
function endPower( game ) {
  game.power.active = false;
  game.power.framesLeft = 0;
  game.power.streak = 0;
  game.ghosts.forEach( ( g ) => {
    const wasEaten = g.eaten;
    g.vulnerable = false;
    g.eaten = false;
    g.speed = g.baseSpeed;
    if ( wasEaten ) {
      g.x = g.exit.x;
      g.y = g.exit.y;
      g.dir = 'left';
      g.phase = 'out';
      g.target = { x: g.x, y: g.y };
      g.patrolToCorner = g.kind === 'patrol';
    }
  } );
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// La celda esta dentro del interior transitable de la pen?
function inPen( x, y ) {
  return x >= PEN.x0 && x <= PEN.x1 && y >= PEN.y0 && y <= PEN.y1;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado por pared (1) y puerta (3); la puerta nunca se cruza.
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 ) return true;
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
  if ( isGhost && actor.phase === 'out' ) {
    // Ya fuera: no puede volver a entrar en la pen por ningun lado.
    if ( inPen( tx, ty ) ) return false;
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
    // Comer power pellet: activa el efecto vulnerable. Si ya estaba activo,
    // la cuenta atras NO se reinicia (solo se reinicia la racha).
    if ( grid[ p.y ][ p.x ] === 4 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 50;
      if ( !game.power.active ) game.power.framesLeft = POWER_FRAMES;
      activatePower( game );
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

// Objetivo del fantasma segun su rol:
//   vulnerable: huye de Pac-Man (4 celdas en la direccion opuesta)
//   hunter:   la celda actual de Pac-Man
//   ambusher: 4 celdas por delante de Pac-Man (si es muro, la celda de Pac-Man)
//   patrol:   su esquina o la celda de Pac-Man, alternando
//   slow:     sin objetivo fijo (se mueve al azar)
function ghostTarget( game, g ) {
  const p = game.pacman;
  const px = Math.round( p.x );
  const py = Math.round( p.y );

  // Vulnerable: huir en la direccion contraria a la de Pac-Man. Si la celda
  // es muro, se usa la celda de Pac-Man como objetivo alternativo.
  if ( g.vulnerable ) {
    const d = DIRS[ p.dir ] || { x: 0, y: 0 };
    const tx = px - d.x * 4;
    const ty = py - d.y * 4;
    const grid = game.grid;
    const outside =
      tx < 0 || ty < 0 || ty >= grid.length || tx >= grid[ 0 ].length;
    const v = outside ? 1 : grid[ ty ][ tx ];
    if ( outside || v === 1 || v === 3 ) return { x: px, y: py };
    return { x: tx, y: ty };
  }

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

  // Vulnerable: huir de Pac-Man. Misma heuristica voraz, otro objetivo.
  if ( g.vulnerable ) {
    g.target = ghostTarget( game, g );
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

  // Un fantasma comido no se mueve hasta que termine el efecto.
  if ( g.eaten ) return;

  // En la jaula los fantasmas quedan quietos hasta ser liberados.
  if ( g.phase === 'pen' ) return;

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
  // Al perder una vida se cancela el efecto vulnerable y la racha.
  endPower( game );
  game.ghosts.forEach( ( g ) => {
    // Tras perder una vida los 4 fantasmas vuelven al mapa, cada uno en su
    // celda de salida de la fila 11, ya liberados.
    g.x = g.exit.x;
    g.y = g.exit.y;
    g.dir = 'left';
    g.phase = 'out';
    g.target = { x: g.x, y: g.y };
    g.patrolToCorner = g.kind === 'patrol';
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  // Cuenta atras del efecto vulnerable. Se decrementa antes de mover a
  // Pac-Man para que un pellet comido este frame disponga de 600 frames.
  if ( game.power.active ) {
    game.power.framesLeft--;
    if ( game.power.framesLeft <= 0 ) endPower( game );
  }

  movePacman( game );

  // Dots comidos en la partida (acumulativo, no baja al perder vidas).
  const dotsEaten = game.dotsInitial - game.dotsRemaining;

  game.ghosts.forEach( ( g ) => {
    // Liberacion escalonada: cada fantasma aparece en el mapa (fila 11)
    // tras ciertos dots comidos.
    if ( g.phase === 'pen' && dotsEaten >= g.releaseAt ) releaseGhost( game, g );
    moveGhost( game, g );
  } );

  for ( const g of game.ghosts ) {
    // Un fantasma comido no colisiona hasta que termine el efecto.
    if ( g.eaten ) continue;
    if ( collides( game.pacman, g ) ) {
      // Fantasma vulnerable: Pac-Man se lo come y gana puntos.
      if ( g.vulnerable ) {
        g.eaten = true;
        game.power.streak++;
        const idx = Math.min( game.power.streak, GHOST_POINTS.length ) - 1;
        game.score += GHOST_POINTS[ idx ];
        continue;
      }
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
