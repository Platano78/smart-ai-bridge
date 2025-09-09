// Asset Management System - Large Component (~12K tokens equivalent)
class AssetManager {
    constructor(config) {
        this.config = {
            baseUrl: './assets/',
            enableCaching: true,
            maxCacheSize: 512 * 1024 * 1024,
            enableStreaming: true,
            compressionEnabled: true,
            enableLOD: true,
            preloadBatchSize: 10,
            ...config
        };
        
        this.cache = new Map();
        this.loadingQueue = new Map();
        this.preloadQueue = [];
        this.totalCacheSize = 0;
        this.loadedAssets = new Set();
        this.assetMetadata = new Map();
        this.compressionWorkers = [];
        this.streamingLoaders = new Map();
        
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            bytesLoaded: 0,
            bytesFromCache: 0,
            averageLoadTime: 0
        };
    }

    async initialize() {
        console.log('Initializing Asset Manager...');
        
        // Initialize compression workers
        if (this.config.compressionEnabled) {
            await this.initializeCompressionWorkers();
        }
        
        // Initialize asset metadata
        await this.loadAssetMetadata();
        
        // Set up cache cleanup interval
        this.setupCacheCleanup();
        
        console.log('Asset Manager initialized');
    }

    async initializeCompressionWorkers() {
        const workerCount = Math.min(navigator.hardwareConcurrency || 4, 8);
        
        for (let i = 0; i < workerCount; i++) {
            const worker = new Worker('/workers/compression-worker.js');
            this.compressionWorkers.push({
                worker,
                busy: false,
                queue: []
            });
        }
    }

    async loadAssetMetadata() {
        try {
            const response = await fetch(`${this.config.baseUrl}manifest.json`);
            const manifest = await response.json();
            
            for (const asset of manifest.assets) {
                this.assetMetadata.set(asset.id, {
                    path: asset.path,
                    size: asset.size,
                    compressed: asset.compressed || false,
                    dependencies: asset.dependencies || [],
                    tags: asset.tags || [],
                    lastModified: asset.lastModified,
                    checksum: asset.checksum
                });
            }
            
            console.log(`Loaded metadata for ${manifest.assets.length} assets`);
        } catch (error) {
            console.warn('Failed to load asset metadata:', error);
        }
    }

    setupCacheCleanup() {
        setInterval(() => {
            if (this.totalCacheSize > this.config.maxCacheSize * 0.8) {
                this.performCacheCleanup();
            }
        }, 60000); // Check every minute
    }

    async loadAsset(assetId, options = {}) {
        const startTime = performance.now();
        this.stats.totalRequests++;
        
        // Check cache first
        if (this.cache.has(assetId)) {
            const cached = this.cache.get(assetId);
            if (this.isAssetValid(cached)) {
                this.stats.cacheHits++;
                this.stats.bytesFromCache += cached.size;
                return cached.data;
            } else {
                // Remove invalid cached asset
                this.removeCachedAsset(assetId);
            }
        }
        
        this.stats.cacheMisses++;
        
        // Check if asset is already being loaded
        if (this.loadingQueue.has(assetId)) {
            return this.loadingQueue.get(assetId);
        }
        
        // Start loading
        const loadPromise = this.performAssetLoad(assetId, options);
        this.loadingQueue.set(assetId, loadPromise);
        
        try {
            const asset = await loadPromise;
            
            // Cache the asset
            if (this.config.enableCaching) {
                this.cacheAsset(assetId, asset);
            }
            
            // Update stats
            const loadTime = performance.now() - startTime;
            this.updateLoadTimeStats(loadTime);
            this.stats.bytesLoaded += asset.size;
            this.loadedAssets.add(assetId);
            
            return asset.data;
            
        } finally {
            this.loadingQueue.delete(assetId);
        }
    }

    async performAssetLoad(assetId, options) {
        const metadata = this.assetMetadata.get(assetId);
        if (!metadata) {
            throw new Error(`Asset metadata not found: ${assetId}`);
        }
        
        const url = `${this.config.baseUrl}${metadata.path}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load asset: ${assetId} (${response.status})`);
        }
        
        let data;
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.startsWith('image/')) {
            data = await this.loadImageAsset(response, metadata, options);
        } else if (contentType.startsWith('audio/')) {
            data = await this.loadAudioAsset(response, metadata, options);
        } else if (contentType.includes('json')) {
            data = await this.loadJsonAsset(response, metadata, options);
        } else if (contentType.includes('text')) {
            data = await this.loadTextAsset(response, metadata, options);
        } else {
            data = await this.loadBinaryAsset(response, metadata, options);
        }
        
        return {
            id: assetId,
            data,
            size: metadata.size,
            loadedAt: Date.now(),
            metadata
        };
    }

    async loadImageAsset(response, metadata, options) {
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Create canvas for processing if needed
                if (options.processImage) {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    
                    if (options.generateMipmaps) {
                        resolve(this.generateMipmaps(canvas));
                    } else {
                        resolve(canvas);
                    }
                } else {
                    resolve(img);
                }
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    async loadAudioAsset(response, metadata, options) {
        const arrayBuffer = await response.arrayBuffer();
        
        if (window.AudioContext) {
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } else {
            return arrayBuffer;
        }
    }

    async loadJsonAsset(response, metadata, options) {
        return await response.json();
    }

    async loadTextAsset(response, metadata, options) {
        return await response.text();
    }

    async loadBinaryAsset(response, metadata, options) {
        return await response.arrayBuffer();
    }

    generateMipmaps(canvas) {
        const mipmaps = [canvas];
        let currentCanvas = canvas;
        
        while (currentCanvas.width > 1 || currentCanvas.height > 1) {
            const nextWidth = Math.max(1, Math.floor(currentCanvas.width / 2));
            const nextHeight = Math.max(1, Math.floor(currentCanvas.height / 2));
            
            const nextCanvas = document.createElement('canvas');
            const nextCtx = nextCanvas.getContext('2d');
            nextCanvas.width = nextWidth;
            nextCanvas.height = nextHeight;
            
            nextCtx.drawImage(currentCanvas, 0, 0, nextWidth, nextHeight);
            mipmaps.push(nextCanvas);
            currentCanvas = nextCanvas;
        }
        
        return mipmaps;
    }

    async preloadAssets(assetIds) {
        console.log(`Preloading ${assetIds.length} assets...`);
        
        const batches = [];
        for (let i = 0; i < assetIds.length; i += this.config.preloadBatchSize) {
            batches.push(assetIds.slice(i, i + this.config.preloadBatchSize));
        }
        
        for (const batch of batches) {
            const promises = batch.map(id => this.loadAsset(id).catch(error => {
                console.warn(`Failed to preload asset: ${id}`, error);
                return null;
            }));
            
            await Promise.all(promises);
        }
        
        console.log('Preloading complete');
    }

    cacheAsset(assetId, asset) {
        // Check if we have space
        if (this.totalCacheSize + asset.size > this.config.maxCacheSize) {
            this.performCacheCleanup(asset.size);
        }
        
        this.cache.set(assetId, asset);
        this.totalCacheSize += asset.size;
    }

    removeCachedAsset(assetId) {
        const cached = this.cache.get(assetId);
        if (cached) {
            this.cache.delete(assetId);
            this.totalCacheSize -= cached.size;
            
            // Clean up blob URLs
            if (cached.data instanceof HTMLImageElement) {
                URL.revokeObjectURL(cached.data.src);
            }
        }
    }

    performCacheCleanup(requiredSpace = 0) {
        console.log('Performing cache cleanup...');
        
        const targetSize = this.config.maxCacheSize * 0.7; // Clean to 70% capacity
        const neededSpace = this.totalCacheSize - targetSize + requiredSpace;
        
        // Sort cached assets by last access time (LRU)
        const sortedAssets = Array.from(this.cache.entries())
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        
        let freedSpace = 0;
        for (const [assetId, asset] of sortedAssets) {
            if (freedSpace >= neededSpace) break;
            
            this.removeCachedAsset(assetId);
            freedSpace += asset.size;
        }
        
        console.log(`Cache cleanup freed ${freedSpace} bytes`);
    }

    isAssetValid(asset) {
        const metadata = this.assetMetadata.get(asset.id);
        if (!metadata) return false;
        
        // Check if asset has expired (optional)
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (Date.now() - asset.loadedAt > maxAge) {
            return false;
        }
        
        // Check checksum if available
        if (metadata.checksum && asset.checksum !== metadata.checksum) {
            return false;
        }
        
        return true;
    }

    updateLoadTimeStats(loadTime) {
        this.stats.averageLoadTime = (this.stats.averageLoadTime * (this.stats.totalRequests - 1) + loadTime) / this.stats.totalRequests;
    }

    async loadAssetBundle(bundleId) {
        const metadata = this.assetMetadata.get(bundleId);
        if (!metadata || !metadata.bundle) {
            throw new Error(`Asset bundle not found: ${bundleId}`);
        }
        
        const assets = {};
        const promises = metadata.assets.map(async (assetId) => {
            assets[assetId] = await this.loadAsset(assetId);
        });
        
        await Promise.all(promises);
        return assets;
    }

    getAssetInfo(assetId) {
        return this.assetMetadata.get(assetId);
    }

    isAssetLoaded(assetId) {
        return this.loadedAssets.has(assetId);
    }

    unloadAsset(assetId) {
        this.removeCachedAsset(assetId);
        this.loadedAssets.delete(assetId);
    }

    getStats() {
        return {
            ...this.stats,
            cacheSize: this.totalCacheSize,
            cachedAssets: this.cache.size,
            loadedAssets: this.loadedAssets.size,
            cacheHitRatio: this.stats.cacheHits / this.stats.totalRequests
        };
    }

    async shutdown() {
        console.log('Shutting down Asset Manager...');
        
        // Clear cache
        this.cache.clear();
        this.totalCacheSize = 0;
        
        // Terminate compression workers
        for (const workerData of this.compressionWorkers) {
            workerData.worker.terminate();
        }
        this.compressionWorkers = [];
        
        console.log('Asset Manager shutdown complete');
    }
}

// Streaming Asset Loader for large assets
class StreamingAssetLoader {
    constructor(assetManager) {
        this.assetManager = assetManager;
        this.activeStreams = new Map();
    }

    async loadStreamingAsset(assetId, onProgress) {
        if (this.activeStreams.has(assetId)) {
            return this.activeStreams.get(assetId);
        }
        
        const metadata = this.assetManager.assetMetadata.get(assetId);
        if (!metadata) {
            throw new Error(`Streaming asset metadata not found: ${assetId}`);
        }
        
        const streamPromise = this.performStreamingLoad(assetId, metadata, onProgress);
        this.activeStreams.set(assetId, streamPromise);
        
        try {
            const result = await streamPromise;
            return result;
        } finally {
            this.activeStreams.delete(assetId);
        }
    }

    async performStreamingLoad(assetId, metadata, onProgress) {
        const url = `${this.assetManager.config.baseUrl}${metadata.path}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load streaming asset: ${assetId}`);
        }
        
        const contentLength = parseInt(response.headers.get('content-length') || '0');
        let receivedLength = 0;
        const chunks = [];
        
        const reader = response.body.getReader();
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            chunks.push(value);
            receivedLength += value.length;
            
            if (onProgress) {
                onProgress(receivedLength / contentLength);
            }
        }
        
        // Combine chunks
        const combinedArray = new Uint8Array(receivedLength);
        let position = 0;
        for (const chunk of chunks) {
            combinedArray.set(chunk, position);
            position += chunk.length;
        }
        
        return combinedArray.buffer;
    }
}

export { AssetManager, StreamingAssetLoader };