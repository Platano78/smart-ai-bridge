// Sample JavaScript file for testing enhanced bridge
function gameLoop() {
  const startTime = Date.now();
  
  // Game logic here
  updateGame();
  renderGame();
  
  const deltaTime = Date.now() - startTime;
  console.log(`Frame time: ${deltaTime}ms`);
}

function updateGame() {
  // Update game state
  for (let i = 0; i < players.length; i++) {
    players[i].update();
  }
}

function renderGame() {
  // Render game state
  clearCanvas();
  drawBackground();
  drawPlayers();
}