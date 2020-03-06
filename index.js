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
  console.log(request);
  var direction = 'up';
  var food = request.body.food;
  var prey = [];
  var self = request.body.you;
  
  console.log('Our head is at [%s,%s]', self.body.x, self.body.y);
  request.body.snakes.forEach(snake => {
    if(snake.id === self.id){
        return;
    }
    if(snake.body.length < self.body.length){
        prey.push(snake);
    }
  });
    
  var target = food[0];
  var target_dist = request.body.board.width * request.body.board.height;
  var x_dist = 0;
  var y_dist = 0;
  
  food.forEach(f => {
    x_dist = Math.abs(f.x - self.body[0].x);
    y_dist = Math.abs(f.y - self.body[0].y);
    var new_dist = Math.round(Math.sqrt(Math.pow(x_dist,2) + Math.pow(y_dist,2)));
    if(new_dist < target_dist){
      target_dist = new_dist;
      target = f;
    }
  });
  console.log('Food found at [%s,%s]', target.x, target.y);
  
  if(x_dist > y_dist){
    direction = 'right';
    if((target.x - self.body[0].x) < 0){
      direction = 'left';
    }
  } else {
    direction = 'down';
    if((target.y - self.body[0].y) < 0){
      direction = 'up';
    }
  }
  console.log('Moving in direction: %s', direction);
  
  // Response data
  const data = {
    move: direction, // one of: ['up','down','left','right']
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
