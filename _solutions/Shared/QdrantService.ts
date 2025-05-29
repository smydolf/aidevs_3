import { QdrantClient } from '@qdrant/js-client-rest';

export interface QdrantConfig {
    host?: string;
    port?: number;
    apiKey?: string;
}

export interface CollectionConfig {
    name: string;
    vectorSize: number;
    distance?: 'Cosine' | 'Euclid' | 'Dot';
}

export class QdrantService {
    private client: QdrantClient;

    constructor(config: QdrantConfig = {}) {
        const host = config.host || 'localhost';
        const port = config.port || 6333;

        this.client = new QdrantClient({
            url: `http://${host}:${port}`,
            apiKey: config.apiKey
        });
    }

    /**
     * Check if Qdrant is accessible
     */
    async isRunning(): Promise<boolean> {
        try {
            await this.client.getCollections();
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if a collection exists
     */
    async collectionExists(name: string): Promise<boolean> {
        try {
            await this.client.getCollection(name);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Create a collection
     */
    async createCollection(config: CollectionConfig): Promise<void> {
        await this.client.createCollection(config.name, {
            vectors: {
                size: config.vectorSize,
                distance: config.distance || 'Cosine'
            }
        });
    }

    /**
     * Create collection if it doesn't exist
     */
    async ensureCollection(config: CollectionConfig): Promise<void> {
        const exists = await this.collectionExists(config.name);
        if (!exists) {
            await this.createCollection(config);
        }
    }

    /**
     * Insert points into a collection
     */
    async insertPoints(collectionName: string, points: any[]): Promise<void> {
        try {
        await this.client.upsert(collectionName, {
                wait: true,
                points: points
            });
        } catch (error: any) {
            console.error('Qdrant insert points error details:');
            console.error('Error message:', error.message);
            console.error('Status:', error.status);
            console.error('Response data:', JSON.stringify(error.data, null, 2));
            throw error;
        }
    }

    /**
     * Search for similar vectors
     */
    async search(collectionName: string, vector: number[], limit: number = 10) {
        try {
            return await this.client.search(collectionName, {
                vector: vector,
                limit: limit,
                with_payload: true,
                with_vector: false
            });
        } catch (error: any) {
            console.error('Qdrant search error details:');
            console.error('Error message:', error.message);
            console.error('Status:', error.status);
            console.error('Response data:', JSON.stringify(error.data, null, 2));
            
            // Log the search parameters for debugging
            console.error('Search parameters:');
            console.error('- Collection:', collectionName);
            console.error('- Vector length:', vector.length);
            console.error('- Vector sample:', vector.slice(0, 5));
            console.error('- Limit:', limit);
            
            throw error;
        }
    }

    /**
     * Get all collections
     */
    async getCollections(): Promise<string[]> {
        const response = await this.client.getCollections();
        return response.collections.map(collection => collection.name);
    }

    /**
     * Delete a collection
     */
    async deleteCollection(name: string): Promise<void> {
        await this.client.deleteCollection(name);
    }

    /**
     * Get collection info for debugging
     */
    async getCollectionInfo(name: string) {
        try {
            return await this.client.getCollection(name);
        } catch (error: any) {
            console.error('Error getting collection info:', error.message);
            throw error;
        }
    }

    /**
     * Count points in a collection
     */
    async countPoints(collectionName: string): Promise<number> {
        try {
            const response = await this.client.count(collectionName);
            return response.count;
        } catch (error: any) {
            console.error('Error counting points:', error.message);
            throw error;
        }
    }

    /**
     * Check if collection has any data
     */
    async hasData(collectionName: string): Promise<boolean> {
        try {
            const count = await this.countPoints(collectionName);
            return count > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get sample points from collection (for debugging)
     */
    async getSamplePoints(collectionName: string, limit: number = 5) {
        try {
            const response = await this.client.scroll(collectionName, {
                limit: limit,
                with_payload: true,
                with_vector: false
            });
            return response.points;
        } catch (error: any) {
            console.error('Error getting sample points:', error.message);
            throw error;
        }
    }

    /**
     * Get all point IDs in a collection
     */
    async getAllPointIds(collectionName: string): Promise<string[]> {
        try {
            const response = await this.client.scroll(collectionName, {
                limit: 10000, // Adjust based on your needs
                with_payload: false,
                with_vector: false
            });
            return response.points.map(point => point.id.toString());
        } catch (error: any) {
            console.error('Error getting point IDs:', error.message);
            throw error;
        }
    }

    /**
     * Get a specific point by ID
     */
    async getPoint(collectionName: string, pointId: string | number) {
        try {
            const response = await this.client.retrieve(collectionName, {
                ids: [pointId],
                with_payload: true,
                with_vector: true
            });
            return response[0] || null;
        } catch (error: any) {
            console.error('Error getting point:', error.message);
            throw error;
        }
    }

    /**
     * Get the underlying client for advanced operations
     */
    getClient(): QdrantClient {
        return this.client;
    }
} 