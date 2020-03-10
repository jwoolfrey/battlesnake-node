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
  debug = 2;
  directionMap = {
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
  mood = {'hungry': false, 'hunting': false, 'hiding': false};

  player = request.body.you;
  board = request.body.board;

  foodList = board.food;
  preyList = [];
  ignoreList = [];
  dangerList = [];

  preyCount = 0;

  function addCoordinates(coord_a, coord_b) {
    return {'x': coord_a.x + coord_b.x, 'y': coord_a.y + coord_b.y};
  }
  
  function coordinatesWithinBounds (coordinates) {
    if(! Array.isArray(coordinates)) {
      coordinates = [coordinates];
    }
    count = 0;
    for(i = 0; i < coordinates.length; i++) {
      if(coordinates[i].x < 0 || coordinates[i].x > board.width - 1) {
        continue;
      }
      if(coordinates[i].y < 0 || coordinates[i].y > board.height - 1) {
        continue;
      }
      count += 1;
    }
    return count;
  }

  function sameCoordinates (coord_a, coord_b) {
    if((coord_a.x - coord_b.x) != 0) {
      return false;
    }
    if((coord_a.y - coord_b.y) != 0) {
      return false;
    }
    return true;
  }

  function coordinatesInList (coordinates, list) {
    if(! Array.isArray(coordinates)) {
      coordinates = [coordinates];
    }
    count = 0;
    for(i = 0; i < coordinates.length; i++) {
        if((list.findIndex( element => sameCoordinates(coordinates[i], element))) >= 0) {
            count += 1;
        }
    }
    return count;
  }

  function findLocalTiles (source, list) {
    tileList = [];
    candidate = {};
    Object.values(list).forEach( direction => {
      candidate = addCoordinates(direction, source);
      if(coordinatesWithinBounds(candidate) < 1) {
        return;
      }
      tileList.push(Object.assign({}, candidate));
    });
    return tileList;
  }

  function findClosestTarget (source, list) {
    shortestDistance = board.width * board.height;
    destination = source;

    list.forEach( candidate => {
      if(coordinatesInList(candidate, ignoreList) > 0) {
        return;
      }
      newDistance = Math.round(Math.hypot(Math.abs(candidate.x - source.x), Math.abs(candidate.y - source.y)));
      if(newDistance < shortestDistance){
        //check for obstruction?
        shortestDistance = newDistance;
        destination = candidate;
      }
    });
    return destination;
  }

  function findVolumeSize (source, limit = 0) {
    validTiles = new Set();
    workingTiles = [];
    localTiles = findLocalTiles(source, directionMap['orth']);
    localTiles.forEach( tile => {
        if(! coordinatesInList(tile, ignoreList)) {
          // shrug
        }
    });
    return validTiles.size;
  }
  
  if(debug > 1) {console.log("! snake filtering");}
  board.snakes.forEach( snake => {
    ignoreList = ignoreList.concat(snake.body.slice(0, -1));
    localTiles = findLocalTiles(snake.body[0], directionMap['orth']);

    if(snake.body.length < player.body.length) {
      preyCount += 1;
      preyList = preyList.concat(localTiles);
    } else {
      if(snake.id != player.id) {
        dangerList = dangerList.concat(localTiles);
      }
    }
    if(coordinatesInList(localTiles, foodList) > 0) {
      ignoreList.push(snake.body[snake.body.length - 1]);
    }
  });
  
  if(debug > 1) {console.log("! mood selection");}
  // mood logic
  avgFoodDistance = Math.round((board.width * board.height)/(foodList.length + preyList.length));
  if(preyList.length < 1  || player.health <= avgFoodDistance + 5) {
    mood.hungry = true;
  } else if(preyList.length > 0) {
    mood.hunting = true;
  } else {
    mood.hiding = true;
  }

  if(debug) {console.log("! target selection");}
  target = player.body[player.body.length - 1];
  if(mood.hungry && foodList.length > 0) {
    target = findClosestTarget(player.body[0], foodList);
  } else if(mood.hunting && preyList.length > 0) {
    target = findClosestTarget(player.body[0], preyList);
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
  Object.keys(directionMap['orth']).forEach( opt => {
    nextTile = addCoordinates(player.body[0], directionMap['orth'][opt]);
    tileScore = 0;
    
    if(coordinatesWithinBounds(nextTile) < 1) {
      return;
    }
    
    if(coordinatesInList(nextTile, ignoreList) > 0) {
      return;
    }

    /*
    nextOptions = findLocalTiles(nextTile, directionMap['orth']);
    invalidTiles = coordinatesInList(nextOptions, ignoreList);
    invalidTiles += (4 - nextOptions.length);
    if(invalidTiles == 4) {
      return;
    }
    
    /*
    scoreMap = Object.Assign(directionMap['orth'], directionMap['diag']);
    scoreOrigin = addCoordinates(nextTile, directionMap['orth'][opt]);
    scoreRegion = findLocalTiles(scoreOrigin, scoreMap);

    tileScore = scoreMap.keys().length;
    tileScore += (-1 * (tileScore - scoreRegion.length));
    tileScore += (-1 * coordinatesInList(scoreRegion, ignoreList));
    tileScore += (-1 * coordinatesInList(scoreRegion, dangerList));
    */
    
    if(preferredDirections.indexOf(opt) >= 0) {
      tileScore += 1;
    }
    nextMoves.push({'direction': opt, 'score': tileScore});
  });
  
  moveScore = 0;
  nextMoves.forEach( option => {
    if(option.score > moveScore) {
      nextMove = option.direction;
      moveScore = option.score;
    }
  });

  if(debug > 0) {
    console.log("#### %s/%d ####", request.body.game.id, request.body.turn);
    console.log("ID:%s He:%d/%d Le:%d", player.id, player.health, avgFoodDistance, player.body.length);
    console.log(mood);
    console.log("Fo:%d Pr:%d/%d Ig:%d", foodList.length, preyCount, board.snakes.length - 1, ignoreList.length);
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
