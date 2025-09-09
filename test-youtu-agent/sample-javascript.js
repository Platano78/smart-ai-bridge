/**
 * Sample JavaScript File for YoutAgent Testing
 * This file contains various JavaScript patterns to test file analysis
 */

// ES6 Class with async methods
class GameEngine {
  constructor(options = {}) {
    this.fps = options.fps || 60;
    this.width = options.width || 1920;
    this.height = options.height || 1080;
    this.entities = new Map();
    this.isRunning = false;
    this.lastFrameTime = 0;
  }

  // Async initialization with error handling
  async initialize() {
    try {
      console.log('Initializing Game Engine...');
      await this.loadAssets();
      await this.setupRenderer();
      this.bindEvents();
      console.log('Game Engine initialized successfully!');
      return true;
    } catch (error) {
      console.error('Failed to initialize game engine:', error);
      throw new Error(`Initialization failed: ${error.message}`);
    }
  }

  // Promise-based asset loading
  async loadAssets() {
    const assetPaths = [
      '/assets/textures/player.png',
      '/assets/sounds/bgm.mp3',
      '/assets/data/levels.json'
    ];

    const loadPromises = assetPaths.map(path => 
      new Promise((resolve, reject) => {
        setTimeout(() => {
          Math.random() > 0.1 ? resolve(path) : reject(new Error(`Failed to load ${path}`));
        }, Math.random() * 1000);
      })
    );

    return Promise.allSettled(loadPromises);
  }

  // Complex game loop with performance monitoring
  async startGameLoop() {
    this.isRunning = true;
    const targetFrameTime = 1000 / this.fps;
    
    const gameLoop = (currentTime) => {
      if (!this.isRunning) return;

      const deltaTime = currentTime - this.lastFrameTime;
      
      if (deltaTime >= targetFrameTime) {
        this.update(deltaTime);
        this.render();
        this.lastFrameTime = currentTime;
      }
      
      requestAnimationFrame(gameLoop);
    };

    requestAnimationFrame(gameLoop);
  }

  // Entity management with Map operations
  addEntity(id, entity) {
    if (this.entities.has(id)) {
      console.warn(`Entity with ID ${id} already exists. Replacing...`);
    }
    
    entity.id = id;
    entity.createdAt = Date.now();
    this.entities.set(id, entity);
    
    return entity;
  }

  // Functional programming with array methods
  getEntitiesByType(type) {
    return Array.from(this.entities.values())
      .filter(entity => entity.type === type)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  // Modern JavaScript features: destructuring, spread, optional chaining
  updateEntity(id, updates = {}) {
    const entity = this.entities.get(id);
    if (!entity) return null;

    const updatedEntity = {
      ...entity,
      ...updates,
      lastUpdated: Date.now()
    };

    // Optional chaining example
    const healthChanged = entity.stats?.health !== updatedEntity.stats?.health;
    if (healthChanged) {
      this.emit('health-changed', { id, oldHealth: entity.stats?.health, newHealth: updatedEntity.stats?.health });
    }

    this.entities.set(id, updatedEntity);
    return updatedEntity;
  }
}

// Arrow functions and higher-order functions
const createPlayer = (name, level = 1) => ({
  type: 'player',
  name,
  level,
  stats: {
    health: 100,
    mana: 50,
    experience: 0
  },
  inventory: [],
  position: { x: 0, y: 0, z: 0 }
});

// Export for module systems
export { GameEngine, createPlayer };

// CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameEngine, createPlayer };
}

// Test data for analysis
const testScenarios = [
  { name: 'Performance Test', entities: 1000 },
  { name: 'Memory Test', entities: 10000 },
  { name: 'Stress Test', entities: 100000 }
];

console.log('Sample JavaScript file loaded for YoutAgent testing!');