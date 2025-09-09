class MonitoringTestDataStructure {
    constructor() {
        this.monitoringQueue = new Map();
        this.processedItems = [];
        this.maxQueueSize = 100;
    }
    
    addToMonitoringQueue(itemId, data, priority = 0) {
        if (this.monitoringQueue.size >= this.maxQueueSize) {
            console.warn('Monitoring queue at capacity, removing oldest item');
            const firstKey = this.monitoringQueue.keys().next().value;
            this.monitoringQueue.delete(firstKey);
        }
        
        this.monitoringQueue.set(itemId, {
            data: data,
            priority: priority,
            timestamp: Date.now(),
            processed: false
        });
        
        console.log(`Added item ${itemId} to monitoring queue`);
    }
    
    processMonitoringQueue() {
        const sortedItems = Array.from(this.monitoringQueue.entries())
            .sort((a, b) => b[1].priority - a[1].priority);
            
        for (const [itemId, itemData] of sortedItems) {
            if (!itemData.processed) {
                this.processMonitoringItem(itemId, itemData);
                itemData.processed = true;
            }
        }
    }
    
    processMonitoringItem(itemId, itemData) {
        console.log(`Processing monitoring item: ${itemId}`);
        this.processedItems.push({
            id: itemId,
            processedAt: Date.now(),
            originalData: itemData.data
        });
    }
}