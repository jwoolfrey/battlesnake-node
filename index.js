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
  directionMap = {
    'up'   : {'x':  0, 'y': -1},
    'right': {'x':  1, 'y':  0},
    'down' : {'x':  0, 'y':  1},
    'left' : {'x': -1, 'y':  0}
  };
  nextMove = [];
  mood = {'hungry': false, 'hunting': false, 'hiding': false};

  player = request.body.you;
  board = request.body.board;

  foodList = board.food;
  preyList = [];
  voidList = [];
  
  playerVector = {
    'x': player.body[0].x - player.body[1].x,
    'y': player.body[0].y - player.body[1].y
  };

  function withinBoardBounds (source) {
    if(source.x < 0 || source.x > board.width - 1) {
      return false;
    }
    if(source.y < 0 || source.y > board.height - 1) {
      return false;
    }
    return true;
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
    if((list.findIndex( element => (
      coordinates.x == element.x && coordinates.y == element.y
    ))) < 0) {
      return false;
    }
    return true;
  }

  function findLocalTiles (source, step = 1, banned = null) {
    tileList = [];
    candidate = {'x': 0, 'y': 0};
    Object.values(directionMap).forEach( direction => {
      candidate.x = direction.x + source.x;
      candidate.y = direction.y + source.y;
      if(!withinBoardBounds(candidate)) {
        return;
      }
      if(banned != null && sameCoordinates(candidate, banned)) {
        return;
      }
      tileList.push(candidate);
      if(step > 1) {
        tileList.concat(findLocalTiles(candidate, step - 1, source));
      }
    });
    return tileList;
  }

  function findClosestTarget (source, list) {
    shortestDistance = board.width * board.height;
    destination = source;

    list.forEach( candidate => {
      if(coordinatesInList(candidate, voidList)) {
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

  board.snakes.forEach( snake => {
    voidList = voidList.concat(snake.body.slice(0, -1));
    localTiles = findLocalTiles(snake.body[0]);

    if(snake.body.length < player.body.length) {
      preyList = preyList.concat(localTiles);
    } else {
      if(snake.id != player.id) {
        voidList = voidList.concat(localTiles);
      }
    }
    likelyToGrow = false;
    for(i = 0; i < localTiles.length; i++) {
      if(coordinatesInList(localTiles[i], foodList)) {
        likelyToGrow = true;
      }
    }
    if(likelyToGrow) {
      voidList.push(snake.body[snake.body.length - 1]);
    }
  });
  
  // mood logic
  avgFoodDistance = ((board.width * board.height)/(foodList.length + preyList.length));
  if(preyList.length < 1  || player.health <= avgFoodDistance + 5) {
    mood.hungry = true;
  } else if(preyList.length > 0) {
    mood.hunting = true;
  } else {
    mood.hiding = true;
  }

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

  Object.keys(directionMap).forEach( opt => {
    nextTile = {
      'x': player.body[0].x + directionMap[opt].x,
      'y': player.body[0].y + directionMap[opt].y
    };

    if(!withinBoardBounds(nextTile)) {
      return;
    }
    if(coordinatesInList(nextTile, voidList)) {
      return;
    }
    nextOptions = findLocalTiles(nextTile);
    if(preferredDirections.indexOf(opt) >= 0) {
      nextMove.unshift(opt);
    } else {
      nextMove.push(opt);
    }
  });

  console.log("#### %s:%d ####", request.body.game.id, request.body.turn);
  console.log("Snake: %s", player.id);
  console.log(mood);
  if(player.health === 100) {
    console.log("Health : 100 (I found food!)");
  } else {
    console.log("Health : %d", player.health);
  }
  console.log("Length: %d", player.body.length);
  console.log("Threshold : %d", avgFoodDistance);
  console.log("food :", foodList.length);
  console.log("prey :", preyList.length);
  console.log("void :", voidList);

  console.log("--- Movement ---");
  console.log("Preferred :", preferredDirections);
  console.log("Player :", player.body[0]);
  if(mood.hungry) {
    console.log("Target (Food) :", target);
  } else if(mood.hunting) {
    console.log("Target (Snake) :", target);
  } else {
    console.log("Target (Tail) :", target);
  }
  
  console.log("Moving: ", nextMove[0]);
  console.log("########################");
  
  // Response data
  const data = {
    move: nextMove[0], // one of: ['up','down','left','right']
  }

  return response.json(data)
})

app.post('/end', (request, response) => {
  // NOTE: Any cleanup when a game is complete.
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
