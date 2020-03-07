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

  board.snakes.forEach(snake => {
    voidList = voidList.concat(snake.body.slice(1));
    if(snake.id === player.id){
      return;
    }
    if(snake.body.length < player.body.length){
      preyList.push(snake.body[0]);
    } else {
      voidList.push(snake.body[0]);
    }
  });
  
  avgFoodDistance = ((board.width * board.height)/(foodList.length + preyList.length));
  if(player.health <= avgFoodDistance){
    mood.hungry = true;
  }

  target = player.body[player.body.length - 1];
  if(mood.hungry && foodList.length > 0){
    target = foodList[0];
  }
  
  shortestFoodDistance = board.width * board.height;
  targetDistanceX = 0;
  targetDistanceY = 0;
  
  foodList.forEach( food => {
    targetDistanceX = Math.abs(food.x - player.body[0].x);
    targetDistanceY = Math.abs(food.y - player.body[0].y);
    newFoodDistance = Math.round(Math.hypot(targetDistanceX, targetDistanceY));
    if(newFoodDistance < shortestFoodDistance){
      shortestFoodDistance = newFoodDistance;
      target = food;
    }
  });

  console.log("### Summary Turn: %d ###", request.body.turn);
  if(player.health === 100){
    console.log("Current Health: 100 (I found food!)");
  } else {
    console.log("Current Health: %d", player.health);
  }
  console.log(mood);
  console.log("Avg Distance to Food: %d", avgFoodDistance);
  console.log("food :", foodList);
  console.log("prey :", preyList);
  console.log("void :", voidList);

  preferedDirections = [];
  if((target.x - player.body[0].x) != 0){
    if((target.x - player.body[0].x) < 0){
      preferedDirections.push('left');
    } else {
      preferedDirections.push('right');
    }
  }

  if((target.y - player.body[0].y) != 0){
    if((target.y - player.body[0].y) < 0){
      preferedDirections.push('up');
    } else {
      preferedDirections.push('down');
    }
  }

  console.log("--- Prefered Directions ---");
  console.log("Prefered :", preferedDirections);
  console.log("Player :", player.body[0]);
  console.log("Target :", target);
  console.log("--- Testing Directions ---");

  Object.keys(directionMap).forEach( opt => {
    nextTile = {
      'x': player.body[0].x + directionMap[opt].x,
      'y': player.body[0].y + directionMap[opt].y
    };
    if(nextTile.x < 0 || nextTile.x > board.width - 1){
      return;
    }
    if(nextTile.y < 0 || nextTile.y > board.height - 1){
      return;
    }
    console.log("--- Testing Collision ---");
    if(voidList.indexOf(nextTile) >= 0){
      console.log("> Cannot overlap");
      return;
    }
    console.log("+ Valid move (%s):", opt, nextTile);
    if(preferedDirections.indexOf(opt) >= 0){
      nextMove.unshift(opt);
    } else {
      nextMove.push(opt);
    }
  });

  console.log("Moving: ", nextMove[0]);
  console.log("###############");
  
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
