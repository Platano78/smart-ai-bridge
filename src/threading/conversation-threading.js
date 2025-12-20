import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

class ConversationThreading {
    constructor(dataDir = './data/conversations') {
        this.dataDir = dataDir;
        this.activeThreads = new Map();
        this.maxActiveThreads = 10;
    }

    async init() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            await this.loadActiveThreads();
            console.error(`ConversationThreading initialized with data directory: ${this.dataDir}`);
        } catch (error) {
            console.error('Failed to initialize ConversationThreading:', error);
            throw error;
        }
    }

    generateThreadId() {
        const randomBytes = crypto.randomBytes(8).toString('hex');
        const timestamp = Date.now();
        return `thread_${randomBytes}_${timestamp}`;
    }

    async startOrContinueThread(params) {
        const { thread_id, continuation_id, topic, user_id, platform } = params;

        if (continuation_id) {
            return await this.continueThread(continuation_id);
        } else if (thread_id) {
            return await this.resumeThread(thread_id);
        } else {
            return await this.createNewThread(topic, user_id, platform);
        }
    }

    async createNewThread(topic, user_id, platform) {
        const thread_id = this.generateThreadId();
        const now = new Date().toISOString();

        const thread = {
            thread_id,
            topic,
            user_id,
            platform: platform || 'claude_desktop',
            created_at: now,
            updated_at: now,
            turns: [],
            metadata: {
                total_turns: 0,
                backends_used: new Set(),
                total_tokens: 0
            }
        };

        await this.persistThread(thread);
        this.updateActiveThreads(thread);

        return {
            thread_id,
            continuation_id: `${thread_id}_turn0`,
            is_new: true
        };
    }

    async addTurn(thread_id, turn_data) {
        const thread = await this.loadThread(thread_id);
        const turn_number = thread.turns.length + 1;
        const continuation_id = `${thread_id}_turn${turn_number}`;

        const turn = {
            continuation_id,
            turn_number,
            timestamp: new Date().toISOString(),
            prompt: turn_data.prompt?.substring(0, 200) || '',
            backend_used: turn_data.backend_used || 'default',
            tokens_used: turn_data.tokens_used || 0,
            success: turn_data.success !== false
        };

        thread.turns.push(turn);
        thread.updated_at = new Date().toISOString();

        // Update metadata
        thread.metadata.total_turns = turn_number;
        thread.metadata.backends_used.add(turn.backend_used);
        thread.metadata.total_tokens += turn.tokens_used;

        await this.persistThread(thread);
        this.updateActiveThreads(thread);

        return {
            continuation_id,
            turn_number,
            thread_id
        };
    }

    async continueThread(continuation_id) {
        const [thread_id, turn_part] = continuation_id.split('_turn');
        if (!thread_id || !turn_part) {
            throw new Error(`Invalid continuation_id format: ${continuation_id}`);
        }

        const thread = await this.loadThread(thread_id);
        const current_turn = parseInt(turn_part);

        if (current_turn > thread.turns.length) {
            throw new Error(`Continuation_id ${continuation_id} references future turn`);
        }

        this.updateActiveThreads(thread);

        return {
            thread_id,
            continuation_id: `${thread_id}_turn${thread.turns.length}`,
            current_turn: thread.turns.length,
            is_new: false
        };
    }

    async resumeThread(thread_id) {
        const thread = await this.loadThread(thread_id);
        this.updateActiveThreads(thread);

        return {
            thread_id,
            continuation_id: `${thread_id}_turn${thread.turns.length}`,
            current_turn: thread.turns.length,
            is_new: false
        };
    }

    async getThreadHistory(thread_id, limit = 10) {
        const thread = await this.loadThread(thread_id);
        const recent_turns = thread.turns.slice(-limit);

        return {
            thread_id,
            topic: thread.topic,
            total_turns: thread.turns.length,
            turns: recent_turns.map(turn => ({
                turn_number: turn.turn_number,
                timestamp: turn.timestamp,
                prompt: turn.prompt,
                backend_used: turn.backend_used,
                tokens_used: turn.tokens_used,
                success: turn.success
            }))
        };
    }

    async searchConversations(query) {
        const files = await fs.readdir(this.dataDir);
        const results = [];

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            try {
                const filePath = path.join(this.dataDir, file);
                const data = await fs.readFile(filePath, 'utf8');
                const thread = JSON.parse(data);

                // Search in topic and prompts
                const topicMatch = thread.topic?.toLowerCase().includes(query.toLowerCase());
                const promptMatches = thread.turns.filter(turn =>
                    turn.prompt?.toLowerCase().includes(query.toLowerCase())
                );

                if (topicMatch || promptMatches.length > 0) {
                    results.push({
                        thread_id: thread.thread_id,
                        topic: thread.topic,
                        created_at: thread.created_at,
                        matches: {
                            topic: topicMatch,
                            prompts: promptMatches.map(turn => ({
                                turn_number: turn.turn_number,
                                prompt: turn.prompt
                            }))
                        }
                    });
                }
            } catch (error) {
                console.warn(`Failed to search file ${file}:`, error);
            }
        }

        return results.sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );
    }

    async getConversationAnalytics() {
        const files = await fs.readdir(this.dataDir);
        const analytics = {
            total_threads: 0,
            total_turns: 0,
            avg_turns_per_thread: 0,
            platform_distribution: {},
            topic_distribution: {},
            backend_usage: {},
            total_tokens: 0
        };

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            try {
                const filePath = path.join(this.dataDir, file);
                const data = await fs.readFile(filePath, 'utf8');
                const thread = JSON.parse(data);

                analytics.total_threads++;
                analytics.total_turns += thread.turns.length;
                analytics.total_tokens += thread.metadata.total_tokens || 0;

                // Platform distribution
                analytics.platform_distribution[thread.platform] =
                    (analytics.platform_distribution[thread.platform] || 0) + 1;

                // Topic distribution (simplified)
                const mainTopic = thread.topic?.split(' ')[0] || 'unknown';
                analytics.topic_distribution[mainTopic] =
                    (analytics.topic_distribution[mainTopic] || 0) + 1;

                // Backend usage
                const backends = thread.metadata.backends_used || [];
                for (const backend of backends) {
                    analytics.backend_usage[backend] =
                        (analytics.backend_usage[backend] || 0) + 1;
                }
            } catch (error) {
                console.warn(`Failed to process file ${file} for analytics:`, error);
            }
        }

        analytics.avg_turns_per_thread = analytics.total_threads > 0 ?
            analytics.total_turns / analytics.total_threads : 0;

        return analytics;
    }

    async persistThread(thread) {
        try {
            // Convert Set to Array for JSON serialization
            const threadToSave = {
                ...thread,
                metadata: {
                    ...thread.metadata,
                    backends_used: Array.from(thread.metadata.backends_used)
                }
            };

            const filePath = path.join(this.dataDir, `${thread.thread_id}.json`);
            await fs.writeFile(filePath, JSON.stringify(threadToSave, null, 2));
        } catch (error) {
            console.error(`Failed to persist thread ${thread.thread_id}:`, error);
            throw error;
        }
    }

    async loadThread(thread_id) {
        // Check active threads first
        if (this.activeThreads.has(thread_id)) {
            return this.activeThreads.get(thread_id);
        }

        try {
            const filePath = path.join(this.dataDir, `${thread_id}.json`);
            const data = await fs.readFile(filePath, 'utf8');
            const thread = JSON.parse(data);

            // Convert Array back to Set
            thread.metadata.backends_used = new Set(thread.metadata.backends_used || []);

            this.updateActiveThreads(thread);
            return thread;
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Thread ${thread_id} not found`);
            }
            console.error(`Failed to load thread ${thread_id}:`, error);
            throw error;
        }
    }

    async loadActiveThreads() {
        try {
            const files = await fs.readdir(this.dataDir);
            const recentFiles = files
                .filter(file => file.endsWith('.json'))
                .sort()
                .slice(-this.maxActiveThreads);

            for (const file of recentFiles) {
                try {
                    const filePath = path.join(this.dataDir, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const thread = JSON.parse(data);

                    // Convert Array back to Set
                    thread.metadata.backends_used = new Set(thread.metadata.backends_used || []);

                    this.activeThreads.set(thread.thread_id, thread);
                } catch (error) {
                    console.warn(`Failed to load file ${file} for active threads:`, error);
                }
            }
        } catch (error) {
            console.warn('Failed to load active threads:', error);
        }
    }

    updateActiveThreads(thread) {
        this.activeThreads.set(thread.thread_id, thread);

        // Maintain size limit
        if (this.activeThreads.size > this.maxActiveThreads) {
            const oldestKey = Array.from(this.activeThreads.keys())[0];
            this.activeThreads.delete(oldestKey);
        }
    }
}

export default ConversationThreading;
