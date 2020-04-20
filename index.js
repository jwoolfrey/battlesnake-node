const priorityQueue = require('priority-q')
const bodyParser = require('body-parser')
const express = require('express')
const logger = require('morgan')
const app = express()
const {
  fallbackHandler,
  notFoundHandler,
  genericErrorHandler,
  poweredByHandler
} = require('./handlers.js')

const debugLevels = {
  'Emergency':     0,
  'Alert':         1,
  'Critical':      2,
  'Error':         3,
  'Warning':       4,
  'Notice':        5,
  'Informational': 6,
  'Debug':         7
};
var debug = debugLevels.Notice;

// For deployment to Heroku, the port needs to be set using ENV, so
// we check for the port number in process.env
app.set('port', (process.env.PORT || 9001))

app.enable('verbose errors')

app.use(logger('dev'))
app.use(bodyParser.json())
app.use(poweredByHandler)

// --- SNAKE LOGIC GOES BELOW THIS LINE ---

// Handle POST request to '/start'
app.post('/start', (request, response) => {
  // NOTE: Do something here to start the game

  // Response data
  const data = {
    color: '#DFFF00',
  }

  return response.json(data)
})

// Handle POST request to '/move'
app.post('/move', (request, response) => {
  // NOTE: Do something here to generate your move
  var directionMap = {
  'orth': {
    'origin': {'x':  0, 'y':  0},
    'up'    : {'x':  0, 'y': -1},
    'right' : {'x':  1, 'y':  0},
    'down'  : {'x':  0, 'y':  1},
    'left'  : {'x': -1, 'y':  0}
  },
  'diag': {
    'origin'    : {'x':  0, 'y':  0},
    'up-right'  : {'x':  1, 'y': -1},
    'down-right': {'x':  1, 'y':  1},
    'down-left' : {'x': -1, 'y':  1},
    'up-left'   : {'x': -1, 'y': -1}
  }};

  var board = request.body.board;
  var challengers = board.snakes;
  var player = request.body.you;
  player.mood = {
    'hungry':  false,
    'hunting': false,
    'hiding':  false
  };

  let tileSets = {
    'food': request.body.board.food,
    'prey': [],
    'void': [],
    'dngr': [],
  };

  var preyCount = 0;

  class Coordinate {
    static add (coords_a, coords_b) {
      if(debug >= debugLevels.Debug) {
        console.log("func: Coordinate.add");
      }
      return {'x': coords_a.x + coords_b.x, 'y': coords_a.y + coords_b.y};
    }

    static equals (coords_a, coords_b) {
      if(debug >= debugLevels.Debug) {
        console.log("func: Coordinate.equals");
      }
      if(coords_a.x != coords_b.x) {
        return false;
      }
      if(coords_a.y != coords_b.y) {
        return false;
      }
      return true;
    }

    static lineDistance (coords_a, coords_b) {
      if(debug >= debugLevels.Debug) {
        console.log("func: Coordinate.lineDistance");
      }
      var dist_x = Math.abs(coords_a.x - coords_b.x);
      var dist_y = Math.abs(coords_a.y - coords_b.y);
      return Math.round(Math.hypot(dist_x, dist_y));
    }

    static vectorFromCoords (src, dst, clamp = false) {
      if(debug >= debugLevels.Debug) {
        console.log("func: Coordinate.vectorFromCoords");
      }
      var vector = {'x': 0, 'y': 0};
      vector.x = dst.x - src.x;
      vector.y = dst.y - src.y;
      if(clamp) {
        vector.x = Math.min(Math.max(vector.x, -1), 1);
        vector.y = Math.min(Math.max(vector.y, -1), 1);
      }
      return Object.assign({}, vector);
    }

    static withinBounds (coords) {
      if(debug >= debugLevels.Debug) {
        console.log("func: Coordinate.withinBounds");
      }
      if(! Array.isArray(coords)) {
        coords = [coords];
      }
      var count = 0;
      for(var i = 0; i < coords.length; i++) {
        if(coords[i].x < 0 || coords[i].x > (board.width - 1)) {
          continue;
        }
        if(coords[i].y < 0 || coords[i].y > (board.height - 1)) {
          continue;
        }
        count += 1;
      }
      return count;
    }

    static withinList (coords, list) {
      if(debug >= debugLevels.Debug) {
        console.log("func: Coordinate.withinList");
      }
      if(! Array.isArray(coords)) {
        coords = [coords];
      }
      var count = 0;
      if(Array.isArray(list)) {
        for(var i = 0; i < coords.length; i++) {
          if((list.findIndex( element => this.equals(coords[i], element))) >= 0) {
            count += 1;
          }
        }
      }
      return count;
    }

    static applyToList (coords, list) {
      if(debug >= debugLevels.Debug) {
        console.log("func: Coordinate.applyToList");
      }
      var finalList = [];
      for(var i = 0; i < list.length; i++) {
        var candidate = Coordinate.add(list[i], coords);
        if(this.withinBounds(candidate) < 1) {
          continue;
        }
        finalList.push(Object.assign({}, candidate));
      }
      return finalList;
    }
  }

  function closestTarget (source, list) {
    if(debug >= debugLevels.Debug) {
      console.log("func: findClosestTarget");
    }
    list.sort(function(a, b) {
        var dist_a = Coordinate.lineDistance(source, a);
        var dist_b = Coordinate.lineDistance(source, b);
        return dist_a - dist_b;
    });

    for(var i = 0; i < list.length; i++) {
      if(Coordinate.withinList(list[i], tileSets['void']) > 0) {
        continue;
      }
      if(Coordinate.withinList(list[i], tileSets['dngr']) > 0) {
        continue;
      }
      return list[i];
    }
    return null;
  }

  function pathToTarget (source, target) {
    var compare = function (a, b) {
      if(a.priority > b.priority) {return  1;}
      if(a.priority < b.priority) {return -1;}
      return 0;
    }
    var sourceString = JSON.stringify(source);
    var frontier = new priorityQueue([], compare);
    frontier.enqueue({'coords': sourceString, 'priority': 0});
    
    var path = {};
    path[sourceString] = null;
    
    var cost = {};
    cost[sourceString] = 0;
    
    var current = null;
    var next = null;
    var goal = JSON.stringify(target);
    while(frontier.length > 0) {
      current = frontier.dequeue();
      
      if(current.coords == goal) {
        break;
      }weight
      
      var neighbours = Coordinate.applyToList(JSON.parse(current.coords), Object.values(directionMap['orth']));
      for(var i = 0; i < neighbours.length; i++) {
        var neighbourString = JSON.stringify(neighbours[i]);
        var neighbourWeight = 1;
        var neighbourPriority = 0;
        if(Coordinate.withinList(neighbours[i], tileSets['void']) {
          continue;
        }
        if(Coordinate.withinList(neighbours[i], tileSets['dngr']) {
          neighbourWeight = 5;
        }
        var newCost = cost[current.coords] + neighbourWeight;
        if(!(neightbourString in Object.keys(cost)) || (newCost < cost[neighbourString])) {
          cost[neighbourString] = newCost;
          neighbourPriority = newCost + Coordinate.lineDistance(target, neighbours[i]);
          frontier.enqueue({'coords': neighbourString, 'priority': neighbourPriority});
          path[neighbourString] = current.coords;
        }
      }
    }
    return Object.assign({}, path);
  }
  
  if(debug >= debugLevels.Notice) {
    console.log("#### %s/%d ####", request.body.game.id, request.body.turn);
  }
  if(debug >= debugLevels.Debug) {
    console.log("! snake filtering");
  }
  for(var i = 0; i < challengers.length; i++) {
    //mark all snake bodies as void & find next possible moves
    tileSets['void'] = tileSets['void'].concat(challengers[i].body.slice(0, -1));
    let localTiles = Coordinate.applyToList(challengers[i].body[0], Object.values(directionMap['orth']));

    //mark smaller snakes as prey, and same/larger snakes as danger
    if(challengers[i].body.length < player.body.length) {
      preyCount += 1;
      tileSets['prey'] = tileSets['prey'].concat(localTiles);
    } else {
      if(challengers[i].id != player.id) {
        tileSets['dngr'] = tileSets['dngr'].concat(localTiles);
      }
    }
    //mark snake tails as void if they recently ate
    if(challengers[i].health == 100) {
      tileSets['void'].push(challengers[i].body[challengers[i].body.length - 1]);
    }
  }
  
  if(debug >= debugLevels.Debug) {
    console.log("! mood selection");
  }
  let avgFoodDistance = Math.round((board.width * board.height)/(tileSets['food'].length + preyCount));
  if(tileSets['prey'].length < 1  || player.health <= avgFoodDistance + 5) {
    player.mood['hungry'] = true;
  } else if(tileSets['prey'].length > 0) {
    player.mood['hunting'] = true;
  } else {
    player.mood['hiding'] = true;
  }

  if(debug >= debugLevels.Debug) {
    console.log("! target selection");
    console.log(tileSets['dngr']);
  }
  
  let target = null;
  if(player.mood['hunting'] && tileSets['prey'].length > 0) {
    target = closestTarget(player.body[0], tileSets['prey']);
  }
  if(player.mood['hungry'] && tileSets['food'].length > 0) {
    target = closestTarget(player.body[0], tileSets['food']);
  }
  if(target == null || player.mood['hiding']) {
    target = player.body[player.body.length - 1];
  }

  if(debug >= debugLevels.Debug) {
    console.log("! direction selection");
  }
  var movePreference = [];
  let targetVector = Coordinate.vectorFromCoords(player.body[0], target, true);

  if(targetVector.x < 0) {
    movePreference.push('left');
  } else if(targetVector.x > 0) {
    movePreference.push('right');
  }

  if(targetVector.y < 0) {
    movePreference.push('up');
  } else if(targetVector.y > 0) {
    movePreference.push('down');
  }

  if(debug >= debugLevels.Debug) {
    console.log("! movement filtering");
  }
  
  var nextMoves = [];
  var validMoves = ['up','right','down','left'];
  
  for(var i = 0; i < validMoves.length; i++) {
    let opt = validMoves[i];
    if(debug >= debugLevels.Debug) {
      console.log(opt);
    }
    let nextTile = Coordinate.add(player.body[0], directionMap['orth'][opt]);
    var tileScore = 0;
    
    // HARD: rejections
    if(Coordinate.withinBounds(nextTile) < 1) {
      continue;
    }
    
    if(Coordinate.withinList(nextTile, tileSets['void']) > 0) {
      continue;
    }

    let nextZone = Coordinate.applyToList(nextTile, Object.values(directionMap['orth']));
    if(Coordinate.withinList(nextZone, tileSets['void']) >= 4) {
      continue;
    }

    // SOFT: scoring
    if(movePreference.indexOf(opt) >= 0) {
      tileScore += 1;
    }
    if(debug >= debugLevels.Debug) {
      console.log("Added: %s", opt);
    }
    nextMoves.push({'direction': `${opt}`, 'priority': tileScore});
  }

  if(debug >= debugLevels.Debug) {
    console.log("! movement selection");
  }

  var nextMove = 'up';
  var moveScore = 0
  for(var i = 0; i < nextMoves.length; i++) {
    if(nextMoves[i].priority >= moveScore){
      moveScore = nextMoves[i].priority;
      nextMove = nextMoves[i].direction;
    }
  }
  
  if(debug >= debugLevels.Informational) {
    console.log("ID:%s He:%d/%d Le:%d", player.id, player.health, avgFoodDistance, player.body.length);
    console.log(player.mood);
    console.log("Fo:%d Pr:%d/%d Ig:%d", tileSets['food'].length, preyCount, board.snakes.length - 1, tileSets['void'].length);
  }
  if(debug >= debugLevels.Notice) {
    console.log("Pl:%s Ta:%s", player.body[0], target);
    console.log("Mv: %s Pr: %s Op: %d", nextMove, movePreference, nextMoves.length);
  }
  
  // Response data
  const data = {
    move: nextMove, // one of: ['up','down','left','right']
  }

  return response.json(data)
})

app.post('/end', (request, response) => {
  // NOTE: Any cleanup when a game is complete.
  if(debug >= debugLevels.Notice) {
    console.log("#### %s/%d ####", request.body.game.id, request.body.turn);
    if(request.body.board.snakes[0].id == request.body.you.id) {
        console.log("* We've won! *");
    } else {
        console.log("* We didn't make it... *");
    }
  }
  return response.json({})
})

app.post('/ping', (request, response) => {
  // Used for checking if this snake is still alive.
  return response.json({});
})

// --- SNAKE LOGIC GOES ABOVE THIS LINE ---

app.use('*', fallbackHandler)
app.use(notFoundHandler)
app.use(genericErrorHandler)

app.listen(app.get('port'), () => {
  console.log('Server listening on port %s', app.get('port'))
})
