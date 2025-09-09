// Empire's Edge Main Game Loop - Large Component (~15K tokens equivalent)
class GameEngine {
    constructor(config) {
        this.config = config;
        this.scenes = new Map();
        this.currentScene = null;
        this.renderer = null;
        this.inputManager = null;
        this.soundManager = null;
        this.networkManager = null;
        this.assetManager = null;
        this.gameState = 'initializing';
        this.frameCount = 0;
        this.lastFrameTime = 0;
        this.deltaTime = 0;
        this.targetFPS = 60;
        this.actualFPS = 0;
        this.performanceMetrics = {
            renderTime: 0,
            updateTime: 0,
            networkTime: 0,
            memoryUsage: 0
        };
    }

    async initialize() {
        console.log('Initializing Game Engine...');
        
        // Initialize core systems
        await this.initializeRenderer();
        await this.initializeInputManager();
        await this.initializeSoundManager();
        await this.initializeNetworkManager();
        await this.initializeAssetManager();
        
        // Set up game loop
        this.setupGameLoop();
        
        // Load initial scene
        await this.loadScene('mainMenu');
        
        this.gameState = 'running';
        console.log('Game Engine initialized successfully');
    }

    async initializeRenderer() {
        this.renderer = new RenderEngine({
            canvas: this.config.canvas,
            width: this.config.width || 1920,
            height: this.config.height || 1080,
            antialias: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        });
        
        await this.renderer.initialize();
        
        // Set up render passes
        this.renderer.addRenderPass('shadow', new ShadowMapPass());
        this.renderer.addRenderPass('geometry', new GeometryPass());
        this.renderer.addRenderPass('lighting', new LightingPass());
        this.renderer.addRenderPass('postprocess', new PostProcessPass());
        this.renderer.addRenderPass('ui', new UIPass());
    }

    async initializeInputManager() {
        this.inputManager = new InputManager({
            canvas: this.config.canvas,
            enableMouse: true,
            enableKeyboard: true,
            enableGamepad: true,
            enableTouch: this.config.mobile || false
        });
        
        // Set up input bindings
        this.inputManager.bindKey('W', 'move-forward');
        this.inputManager.bindKey('S', 'move-backward');
        this.inputManager.bindKey('A', 'move-left');
        this.inputManager.bindKey('D', 'move-right');
        this.inputManager.bindKey('SPACE', 'jump');
        this.inputManager.bindKey('SHIFT', 'run');
        this.inputManager.bindKey('ESC', 'pause');
        
        this.inputManager.bindMouseButton(0, 'primary-action');
        this.inputManager.bindMouseButton(2, 'secondary-action');
        
        await this.inputManager.initialize();
    }

    async initializeSoundManager() {
        this.soundManager = new SoundManager({
            maxSources: 32,
            enableSpatialAudio: true,
            masterVolume: 0.8,
            musicVolume: 0.6,
            sfxVolume: 0.8,
            voiceVolume: 1.0
        });
        
        await this.soundManager.initialize();
        
        // Load initial audio assets
        await this.soundManager.loadAudioBank('ui');
        await this.soundManager.loadAudioBank('ambient');
        await this.soundManager.loadAudioBank('music');
    }

    async initializeNetworkManager() {
        if (this.config.multiplayer) {
            this.networkManager = new NetworkManager({
                serverUrl: this.config.serverUrl,
                enableP2P: this.config.enableP2P || false,
                maxPlayers: this.config.maxPlayers || 4,
                tickRate: 60
            });
            
            await this.networkManager.initialize();
            
            // Set up network event handlers
            this.networkManager.on('player-joined', this.handlePlayerJoined.bind(this));
            this.networkManager.on('player-left', this.handlePlayerLeft.bind(this));
            this.networkManager.on('game-state-update', this.handleGameStateUpdate.bind(this));
        }
    }

    async initializeAssetManager() {
        this.assetManager = new AssetManager({
            baseUrl: this.config.assetUrl || './assets/',
            enableCaching: true,
            maxCacheSize: 512 * 1024 * 1024, // 512MB
            enableStreaming: true,
            compressionEnabled: true
        });
        
        await this.assetManager.initialize();
        
        // Preload critical assets
        await this.assetManager.preloadAssets([
            'textures/ui/main-menu.png',
            'models/characters/player.gltf',
            'audio/music/main-theme.ogg',
            'shaders/standard.vert',
            'shaders/standard.frag'
        ]);
    }

    setupGameLoop() {
        const gameLoop = (currentTime) => {
            if (this.gameState === 'running') {
                this.deltaTime = currentTime - this.lastFrameTime;
                this.lastFrameTime = currentTime;
                
                // Calculate FPS
                this.actualFPS = 1000 / this.deltaTime;
                
                // Update game systems
                this.update(this.deltaTime);
                
                // Render frame
                this.render();
                
                // Update frame counter
                this.frameCount++;
            }
            
            requestAnimationFrame(gameLoop);
        };
        
        requestAnimationFrame(gameLoop);
    }

    update(deltaTime) {
        const updateStartTime = performance.now();
        
        // Update input
        this.inputManager.update(deltaTime);
        
        // Update current scene
        if (this.currentScene) {
            this.currentScene.update(deltaTime);
        }
        
        // Update sound
        this.soundManager.update(deltaTime);
        
        // Update network
        if (this.networkManager) {
            this.networkManager.update(deltaTime);
        }
        
        // Update performance metrics
        this.performanceMetrics.updateTime = performance.now() - updateStartTime;
    }

    render() {
        const renderStartTime = performance.now();
        
        if (this.currentScene && this.renderer) {
            // Clear buffers
            this.renderer.clear();
            
            // Execute render passes
            this.renderer.executePass('shadow', this.currentScene);
            this.renderer.executePass('geometry', this.currentScene);
            this.renderer.executePass('lighting', this.currentScene);
            this.renderer.executePass('postprocess', this.currentScene);
            this.renderer.executePass('ui', this.currentScene);
            
            // Present frame
            this.renderer.present();
        }
        
        // Update performance metrics
        this.performanceMetrics.renderTime = performance.now() - renderStartTime;
    }

    async loadScene(sceneName) {
        console.log(`Loading scene: ${sceneName}`);
        
        // Unload current scene
        if (this.currentScene) {
            await this.currentScene.unload();
            this.currentScene = null;
        }
        
        // Load new scene
        const SceneClass = this.scenes.get(sceneName);
        if (SceneClass) {
            this.currentScene = new SceneClass(this);
            await this.currentScene.load();
            console.log(`Scene loaded: ${sceneName}`);
        } else {
            console.error(`Scene not found: ${sceneName}`);
        }
    }

    registerScene(name, sceneClass) {
        this.scenes.set(name, sceneClass);
    }

    handlePlayerJoined(playerData) {
        console.log(`Player joined: ${playerData.name}`);
        if (this.currentScene && this.currentScene.onPlayerJoined) {
            this.currentScene.onPlayerJoined(playerData);
        }
    }

    handlePlayerLeft(playerData) {
        console.log(`Player left: ${playerData.name}`);
        if (this.currentScene && this.currentScene.onPlayerLeft) {
            this.currentScene.onPlayerLeft(playerData);
        }
    }

    handleGameStateUpdate(gameState) {
        if (this.currentScene && this.currentScene.onGameStateUpdate) {
            this.currentScene.onGameStateUpdate(gameState);
        }
    }

    pause() {
        this.gameState = 'paused';
        if (this.soundManager) {
            this.soundManager.pauseAll();
        }
    }

    resume() {
        this.gameState = 'running';
        if (this.soundManager) {
            this.soundManager.resumeAll();
        }
    }

    async shutdown() {
        console.log('Shutting down Game Engine...');
        
        this.gameState = 'shutting_down';
        
        // Cleanup current scene
        if (this.currentScene) {
            await this.currentScene.unload();
        }
        
        // Shutdown systems
        if (this.networkManager) {
            await this.networkManager.shutdown();
        }
        
        if (this.soundManager) {
            await this.soundManager.shutdown();
        }
        
        if (this.inputManager) {
            await this.inputManager.shutdown();
        }
        
        if (this.assetManager) {
            await this.assetManager.shutdown();
        }
        
        if (this.renderer) {
            await this.renderer.shutdown();
        }
        
        console.log('Game Engine shutdown complete');
    }

    getPerformanceStats() {
        return {
            fps: Math.round(this.actualFPS),
            frameCount: this.frameCount,
            renderTime: this.performanceMetrics.renderTime,
            updateTime: this.performanceMetrics.updateTime,
            networkTime: this.performanceMetrics.networkTime,
            memoryUsage: this.performanceMetrics.memoryUsage
        };
    }
}

// Scene Base Class
class Scene {
    constructor(gameEngine) {
        this.gameEngine = gameEngine;
        this.entities = new Map();
        this.systems = new Map();
        this.loaded = false;
    }

    async load() {
        console.log(`Loading scene: ${this.constructor.name}`);
        // Override in subclasses
        this.loaded = true;
    }

    async unload() {
        console.log(`Unloading scene: ${this.constructor.name}`);
        
        // Cleanup entities
        for (const [id, entity] of this.entities) {
            if (entity.destroy) {
                entity.destroy();
            }
        }
        this.entities.clear();
        
        // Cleanup systems
        for (const [name, system] of this.systems) {
            if (system.shutdown) {
                await system.shutdown();
            }
        }
        this.systems.clear();
        
        this.loaded = false;
    }

    update(deltaTime) {
        if (!this.loaded) return;
        
        // Update all systems
        for (const [name, system] of this.systems) {
            if (system.update) {
                system.update(deltaTime);
            }
        }
    }

    addEntity(id, entity) {
        this.entities.set(id, entity);
    }

    removeEntity(id) {
        const entity = this.entities.get(id);
        if (entity && entity.destroy) {
            entity.destroy();
        }
        this.entities.delete(id);
    }

    addSystem(name, system) {
        this.systems.set(name, system);
        if (system.initialize) {
            system.initialize(this);
        }
    }
}

// Export classes
export { GameEngine, Scene };