// Network System - Large Component (~10K tokens equivalent)
class NetworkManager {
    constructor(config) {
        this.config = {
            serverUrl: 'ws://localhost:8080',
            enableP2P: false,
            maxPlayers: 4,
            tickRate: 60,
            timeout: 5000,
            reconnectAttempts: 3,
            reconnectDelay: 1000,
            enableCompression: true,
            enableEncryption: false,
            ...config
        };
        
        this.socket = null;
        this.connectionState = 'disconnected';
        this.playerId = null;
        this.sessionId = null;
        this.serverInfo = null;
        this.players = new Map();
        this.rooms = new Map();
        this.currentRoom = null;
        
        this.messageQueue = [];
        this.pendingMessages = new Map();
        this.messageId = 0;
        this.lastPingTime = 0;
        this.pingInterval = null;
        this.reconnectTimeout = null;
        this.reconnectAttempts = 0;
        
        this.eventHandlers = new Map();
        this.messageHandlers = new Map();
        
        this.stats = {
            bytesSent: 0,
            bytesReceived: 0,
            messagesSent: 0,
            messagesReceived: 0,
            ping: 0,
            packetLoss: 0,
            connectionTime: 0
        };
        
        this.setupDefaultHandlers();
    }

    setupDefaultHandlers() {
        this.messageHandlers.set('ping', this.handlePing.bind(this));
        this.messageHandlers.set('pong', this.handlePong.bind(this));
        this.messageHandlers.set('player-joined', this.handlePlayerJoined.bind(this));
        this.messageHandlers.set('player-left', this.handlePlayerLeft.bind(this));
        this.messageHandlers.set('room-created', this.handleRoomCreated.bind(this));
        this.messageHandlers.set('room-joined', this.handleRoomJoined.bind(this));
        this.messageHandlers.set('room-left', this.handleRoomLeft.bind(this));
        this.messageHandlers.set('game-state-update', this.handleGameStateUpdate.bind(this));
        this.messageHandlers.set('error', this.handleError.bind(this));
    }

    async initialize() {
        console.log('Initializing Network Manager...');
        
        // Generate unique player ID
        this.playerId = this.generatePlayerId();
        
        console.log(`Network Manager initialized. Player ID: ${this.playerId}`);
    }

    async connect() {
        if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
            console.warn('Already connected or connecting');
            return;
        }
        
        this.connectionState = 'connecting';
        console.log(`Connecting to server: ${this.config.serverUrl}`);
        
        try {
            await this.establishConnection();
            this.connectionState = 'connected';
            this.stats.connectionTime = Date.now();
            this.reconnectAttempts = 0;
            
            // Start ping monitoring
            this.startPingMonitoring();
            
            console.log('Connected to server successfully');
            this.emit('connected');
            
        } catch (error) {
            this.connectionState = 'disconnected';
            console.error('Failed to connect:', error);
            this.emit('connection-failed', error);
            
            // Attempt reconnection
            this.attemptReconnection();
        }
    }

    async establishConnection() {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.config.serverUrl);
            
            const connectTimeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, this.config.timeout);
            
            this.socket.onopen = () => {
                clearTimeout(connectTimeout);
                this.setupSocketHandlers();
                
                // Send initial handshake
                this.sendMessage('handshake', {
                    playerId: this.playerId,
                    version: '1.0.0'
                });
                
                resolve();
            };
            
            this.socket.onerror = (error) => {
                clearTimeout(connectTimeout);
                reject(error);
            };
        });
    }

    setupSocketHandlers() {
        this.socket.onmessage = (event) => {
            this.handleIncomingMessage(event.data);
        };
        
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', error);
        };
        
        this.socket.onclose = (event) => {
            this.handleDisconnection(event);
        };
    }

    handleIncomingMessage(data) {
        try {
            const message = this.deserializeMessage(data);
            this.stats.messagesReceived++;
            this.stats.bytesReceived += data.length;
            
            // Handle message acknowledgments
            if (message.ack && this.pendingMessages.has(message.ack)) {
                this.pendingMessages.delete(message.ack);
            }
            
            // Route message to appropriate handler
            const handler = this.messageHandlers.get(message.type);
            if (handler) {
                handler(message.data, message);
            } else {
                console.warn(`No handler for message type: ${message.type}`);
            }
            
        } catch (error) {
            console.error('Failed to handle incoming message:', error);
        }
    }

    sendMessage(type, data, options = {}) {
        if (this.connectionState !== 'connected') {
            if (options.queue) {
                this.messageQueue.push({ type, data, options });
            }
            return;
        }
        
        const messageId = ++this.messageId;
        const message = {
            id: messageId,
            type,
            data,
            timestamp: Date.now(),
            playerId: this.playerId
        };
        
        if (options.reliable) {
            message.reliable = true;
            this.pendingMessages.set(messageId, message);
            
            // Set up retransmission timer
            setTimeout(() => {
                if (this.pendingMessages.has(messageId)) {
                    this.retransmitMessage(messageId);
                }
            }, 1000);
        }
        
        try {
            const serialized = this.serializeMessage(message);
            this.socket.send(serialized);
            
            this.stats.messagesSent++;
            this.stats.bytesSent += serialized.length;
            
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    retransmitMessage(messageId) {
        const message = this.pendingMessages.get(messageId);
        if (message && message.retries < 3) {
            message.retries = (message.retries || 0) + 1;
            
            try {
                const serialized = this.serializeMessage(message);
                this.socket.send(serialized);
                
                // Schedule another retransmission
                setTimeout(() => {
                    if (this.pendingMessages.has(messageId)) {
                        this.retransmitMessage(messageId);
                    }
                }, 2000 * message.retries);
                
            } catch (error) {
                console.error('Failed to retransmit message:', error);
                this.pendingMessages.delete(messageId);
            }
        } else {
            // Give up after 3 retries
            this.pendingMessages.delete(messageId);
        }
    }

    serializeMessage(message) {
        let serialized = JSON.stringify(message);
        
        if (this.config.enableCompression) {
            // Simple compression for demo
            serialized = this.compressString(serialized);
        }
        
        if (this.config.enableEncryption) {
            serialized = this.encryptString(serialized);
        }
        
        return serialized;
    }

    deserializeMessage(data) {
        let processed = data;
        
        if (this.config.enableEncryption) {
            processed = this.decryptString(processed);
        }
        
        if (this.config.enableCompression) {
            processed = this.decompressString(processed);
        }
        
        return JSON.parse(processed);
    }

    compressString(str) {
        // Placeholder for compression implementation
        return str;
    }

    decompressString(str) {
        // Placeholder for decompression implementation
        return str;
    }

    encryptString(str) {
        // Placeholder for encryption implementation
        return str;
    }

    decryptString(str) {
        // Placeholder for decryption implementation
        return str;
    }

    startPingMonitoring() {
        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, 5000);
    }

    sendPing() {
        this.lastPingTime = Date.now();
        this.sendMessage('ping', { timestamp: this.lastPingTime });
    }

    handlePing(data) {
        // Respond to ping
        this.sendMessage('pong', { timestamp: data.timestamp });
    }

    handlePong(data) {
        // Calculate ping
        const now = Date.now();
        this.stats.ping = now - data.timestamp;
    }

    handlePlayerJoined(data) {
        console.log(`Player joined: ${data.name}`);
        this.players.set(data.playerId, data);
        this.emit('player-joined', data);
    }

    handlePlayerLeft(data) {
        console.log(`Player left: ${data.name}`);
        this.players.delete(data.playerId);
        this.emit('player-left', data);
    }

    handleRoomCreated(data) {
        console.log(`Room created: ${data.roomId}`);
        this.rooms.set(data.roomId, data);
        this.emit('room-created', data);
    }

    handleRoomJoined(data) {
        console.log(`Joined room: ${data.roomId}`);
        this.currentRoom = data;
        this.emit('room-joined', data);
    }

    handleRoomLeft(data) {
        console.log(`Left room: ${data.roomId}`);
        if (this.currentRoom && this.currentRoom.roomId === data.roomId) {
            this.currentRoom = null;
        }
        this.emit('room-left', data);
    }

    handleGameStateUpdate(data) {
        this.emit('game-state-update', data);
    }

    handleError(data) {
        console.error('Network error:', data);
        this.emit('error', data);
    }

    handleDisconnection(event) {
        console.log('Disconnected from server');
        this.connectionState = 'disconnected';
        
        // Clear ping monitoring
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        this.emit('disconnected', event);
        
        // Attempt reconnection if not intentional
        if (event.code !== 1000) {
            this.attemptReconnection();
        }
    }

    attemptReconnection() {
        if (this.reconnectAttempts >= this.config.reconnectAttempts) {
            console.log('Maximum reconnection attempts reached');
            this.emit('reconnection-failed');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.config.reconnectDelay * this.reconnectAttempts;
        
        console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.config.reconnectAttempts} in ${delay}ms`);
        
        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, delay);
    }

    disconnect() {
        console.log('Disconnecting from server...');
        
        this.connectionState = 'disconnecting';
        
        // Clear timeouts
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        // Close socket
        if (this.socket) {
            this.socket.close(1000, 'Normal closure');
            this.socket = null;
        }
        
        // Clear state
        this.players.clear();
        this.rooms.clear();
        this.currentRoom = null;
        this.messageQueue = [];
        this.pendingMessages.clear();
        
        this.connectionState = 'disconnected';
        console.log('Disconnected');
    }

    createRoom(roomConfig) {
        this.sendMessage('create-room', roomConfig, { reliable: true });
    }

    joinRoom(roomId) {
        this.sendMessage('join-room', { roomId }, { reliable: true });
    }

    leaveRoom() {
        if (this.currentRoom) {
            this.sendMessage('leave-room', { roomId: this.currentRoom.roomId }, { reliable: true });
        }
    }

    sendGameData(data) {
        this.sendMessage('game-data', data);
    }

    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9);
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            }
        }
    }

    update(deltaTime) {
        // Process queued messages
        if (this.connectionState === 'connected' && this.messageQueue.length > 0) {
            const queue = [...this.messageQueue];
            this.messageQueue = [];
            
            for (const { type, data, options } of queue) {
                this.sendMessage(type, data, options);
            }
        }
    }

    getStats() {
        return {
            ...this.stats,
            connectionState: this.connectionState,
            playersConnected: this.players.size,
            currentRoom: this.currentRoom?.roomId || null,
            pendingMessages: this.pendingMessages.size,
            queuedMessages: this.messageQueue.length
        };
    }

    async shutdown() {
        console.log('Shutting down Network Manager...');
        this.disconnect();
        console.log('Network Manager shutdown complete');
    }
}

export { NetworkManager };