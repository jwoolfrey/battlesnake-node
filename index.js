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
  var debug = 1;
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
  var challengers = request.body.board.snakes;
  var player = request.body.you;
  player['mood'] = {
    'hungry': false,
    'hunting': false,
    'hiding': false
  };

  var tileSets = {
    'food': board.food,
    'prey': [],
    'void': [],
    'dngr': [],
  };

  preyCount = 0;

  class Coordinate {
    static toString (coords) {
      return `(${coords.x}, ${coords.y})`;
    }

    static add (coords_a, coords_b) {
      return {'x': coords_a.x + coords_b.x, 'y': coords_a.y + coords_b.y};
    }

    static equals (coords_a, coords_b) {
      if((coords_a.x - coords_b.x) != 0) {
        return false;
      }
      if((coords_a.y - coords_b.y) != 0) {
        return false;
      }
      return true;
    }

    static lineDistance (coords_a, coords_b) {
      dist_x = Math.abs(coords_a.x - coords_b.x);
      dist_y = Math.abs(coords_a.y - coords_b.y);
      return Math.round(Math.hypot(dist_x, dist_y));
    }

    static withinBounds (coords) {
      if(! Array.isArray(coords)) {
        coords = [coords];
      }
      for(count = 0,i = 0; i < coords.length; i++) {
        if(coords.x < 0 || coords.x > board.width - 1) {
          continue;
        }
        if(coords.y < 0 || coords.y > board.height - 1) {
          continue;
        }
        count += 1;
      }
      return count;
    }

    static withinList (coords, list) {
      if(! Array.isArray(coords)) {
        coords = [coords];
      }
      for(count = 0, i = 0; i < coords.length; i++) {
        if((list.findIndex( e => this.equals(coords[i], element))) >= 0) {
          count += 1;
        }
      }
      return count;
    }

    static applyToList (coords, list) {
      finalList = [];
      for(i = 0; i < list.length; i++) {
        candidate = Coordinate.add(list[i], coords)
        if(this.withinBounds(candidate) < 1) {
          continue;
        }
        finalList.push(Object.assign({}, candidate));
      }
      return finalList;
    }
  }

  function findClosestTarget (source, list) {
    shortestDistance = board.width * board.height;
    destination = source;

    list.forEach( candidate => {
      if(Coordinate.withinList(candidate, tileSets['void']) > 0) {
        return;
      }
      if(Coordinate.withinList(candidate, tileSets['dngr']) > 0) {
        return;
      }
      newDistance = Coordinate.lineDistance(candidate, source);
      if(newDistance < shortestDistance){
        //check for obstruction?
        shortestDistance = newDistance;
        destination = candidate;
      }
    });
    return destination;
  }

  function pathToTarget(source, target) {
    var compare = function (a,b) {
      if(a.priority > b.priority) {return  1}
      if(a.priority < b.priority) {return -1}
      return 0;
    }
    
    path = {};
    path[Coordinate.toString(source)] = null;
    totalCost = {};
    totalCost[Coordinate.toString(source)] = 0;

    frontier = new priorityQueue([], compare);
    frontier.enqueue({'coordinates': source, 'priority': 0});

    while(frontier.length > 0) {
      current = (frontier.dequeue()).coordinates;
      if(Coordinate.equals(current, target)) {
        break;
      }

      (Coordinate.applyToList(current, directionMap['orth'])).forEach( next => {
        if(Coordinate.withinList(next, tileSets['void']) > 0) {
          return;
        }
        if(Coordinate.withinList(next, tileSets['dngr']) > 0) {
          tileCost = 5;
        } else {
          tileCost = 1;
        }
        cost = totalCost[Coordinate.toString(current)] + tileCost;
        if(Coordinate.toString(next) in totalCost && totalCost[Coordinate.toString(next)] < cost) {
          return;
        }

        totalCost[Coordinate.toString(next)] = cost;
        frontier.enqueue({'coordinates': next, 'priority': cost + Coordinate.lineDistance(next, target)});
        path[Coordinate.toString(next)] = Coordinate.toString(current);
      });
    }
    return Object.assign({}, path);
  }
  
  if(debug > 1) {console.log("! snake filtering");}
  challengers.forEach( snake => {
    tileSets['void'] = tileSets['void'].concat(snake.body.slice(0, -1));
    localTiles = Coordinate.applyToList(snake.body[0], directionMap['orth']);

    if(snake.body.length < player.body.length) {
      preyCount += 1;
      tileSets['prey'] = tileSets['prey'].concat(localTiles);
    } else {
      if(snake.id != player.id) {
        tileSets['dngr'] = tileSets['dngr'].concat(localTiles);
      }
    }
    if(Coordinate.withinList(localTiles, tileSets['food']) > 0) {
      tileSets['void'].push(snake.body[snake.body.length - 1]);
    }
  });
  
  if(debug > 1) {console.log("! mood selection");}
  // mood logic
  avgFoodDistance = Math.round((board.width * board.height)/(tileSets['food'].length + tileSets['prey'].length));
  if(tileSets['prey'].length < 1  || player.health <= avgFoodDistance + 5) {
    player.mood.hungry = true;
  } else if(tileSets['prey'].length > 0) {
    player.mood.hunting = true;
  } else {
    player.mood.hiding = true;
  }

  if(debug > 1) {console.log("! target selection");}
  target = player.body[player.body.length - 1];
  if(player.mood.hungry && tileSets['food'].length > 0) {
    target = findClosestTarget(player.body[0], tileSets['food']);
  } else if(player.mood.hunting && tileSets['prey'].length > 0) {
    target = findClosestTarget(player.body[0], tileSets['prey']);
  }

  preferredDirections = [];
  if((target.x - player.body[0].x) != 0) {
    if((target.x - player.body[0].x) < 0) {
      preferredDirections.push('left');
    } else {
      preferredDirections.push('right');
    }
  }

  if((target.y - player.body[0].y) != 0) {
    if((target.y - player.body[0].y) < 0) {
      preferredDirections.push('up');
    } else {
      preferredDirections.push('down');
    }
  }

  if(debug > 1) {console.log("! movement filtering");}
  var compare = function (a,b) {
    if(a.priority < b.priority) {return  1}
    if(a.priority > b.priority) {return -1}
    return 0;
  }
  
  nextMoves = new priorityQueue([], compare);
  Object.keys(directionMap['orth']).forEach( opt => {
    nextTile = Coordinate.add(player.body[0], directionMap['orth'][opt]);
    tileScore = 0;
    
    // HARD: rejections
    if(Coordinate.withinBounds(nextTile) < 1) {
      return;
    }
    
    if(Coordinate.withinList(nextTile, tileSets['void']) > 0) {
      return;
    }

    nextZone = Coordinate.applyToList(nextTile, directionMap['orth']);
    if(Coordinate.withinList(nextTile, tileSets['void']) = 4) {
      return;
    }
    
    /*
    playerTail = player.body[player.body.length - 1];
    playerPath = Object.values(pathToTarget(nextTile, playerTail));
    if(playerPath.indexOf(`${playerTail.x},${playerTail.y}`) < 0) {
      //return;
    }
    */
    
    // SOFT: scoring
    scoreMap = Object.assign(directionMap['orth'], directionMap['diag']);
    scoreOrigin = Coordinate.add(nextTile, directionMap['orth'][opt]);
    scoreRegion = Coordinate.applyToList(scoreOrigin, scoreMap);

    tileScore = Object.keys(scoreMap).length;
    tileScore += (-1 * (tileScore - scoreRegion.length));
    tileScore += (-1 * Coordinate.withinList(scoreRegion, tileSets['void']));
    tileScore += (-1 * Coordinate.withinList(scoreRegion, tileSets['dngr']));
    tileScore += ( 1 * Coordinate.withinList(scoreRegion, tileSets['food']));

    if(preferredDirections.indexOf(opt) >= 0) {
      tileScore += 1;
    }

    nextMoves.enqueue({'direction': opt, 'priority': tileScore});
  });
  
  nextMove = (nextMoves.dequeue()).direction;
  
  if(debug > 0) {
    console.log("#### %s/%d ####", request.body.game.id, request.body.turn);
    console.log("ID:%s He:%d/%d Le:%d", player.id, player.health, avgFoodDistance, player.body.length);
    console.log(mood);
    console.log("Fo:%d Pr:%d/%d Ig:%d", tileSets['food'].length, preyCount, board.snakes.length - 1, tileSets['void'].length);
    console.log("Pl:%s Ta:%s", player.body[0], target);
    console.log("Mv: %s Pr: %s", nextMove, preferredDirections);
  }
  
  // Response data
  const data = {
    move: nextMove, // one of: ['up','down','left','right']
  }

  return response.json(data)
})

app.post('/end', (request, response) => {
  // NOTE: Any cleanup when a game is complete.
  if(debug > 0) {
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
