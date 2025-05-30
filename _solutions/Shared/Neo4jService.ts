import neo4j, { Driver, Session, Result } from 'neo4j-driver';

export interface Neo4jConfig {
    uri?: string;
    username?: string;
    password?: string;
    database?: string;
}

export class Neo4jService {
    private driver: Driver;
    private config: Neo4jConfig;

    constructor(config: Neo4jConfig = {}) {
        this.config = {
            uri: config.uri || 'bolt://localhost:7687',
            username: config.username || 'neo4j',
            password: config.password || 'password',
            database: config.database || 'neo4j'
        };

        this.driver = neo4j.driver(
            this.config.uri!,
            neo4j.auth.basic(this.config.username!, this.config.password!)
        );
    }

    /**
     * Test connection to Neo4j
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.driver.verifyConnectivity();
            return true;
        } catch (error) {
            console.error('Neo4j connection failed:', error);
            return false;
        }
    }

    /**
     * Execute a raw Cypher query
     */
    async query(cypher: string, parameters: Record<string, any> = {}): Promise<Result> {
        const session = this.getSession();
        try {
            const result = await session.run(cypher, parameters);
            return result;
        } finally {
            await session.close();
        }
    }

    /**
     * Execute a read-only query
     */
    async read(cypher: string, parameters: Record<string, any> = {}): Promise<any[]> {
        const session = this.getSession();
        try {
            const result = await session.executeRead(tx => tx.run(cypher, parameters));
            return result.records.map(record => record.toObject());
        } finally {
            await session.close();
        }
    }

    /**
     * Execute a write query
     */
    async write(cypher: string, parameters: Record<string, any> = {}): Promise<any[]> {
        const session = this.getSession();
        try {
            const result = await session.executeWrite(tx => tx.run(cypher, parameters));
            return result.records.map(record => record.toObject());
        } finally {
            await session.close();
        }
    }

    /**
     * Create a node
     */
    async createNode(label: string, properties: Record<string, any> = {}): Promise<any> {
        const cypher = `CREATE (n:${label} $properties) RETURN n`;
        const result = await this.write(cypher, { properties });
        return result[0]?.n || null;
    }

    /**
     * Find nodes by label and properties
     */
    async findNodes(label: string, properties: Record<string, any> = {}): Promise<any[]> {
        const whereClause = Object.keys(properties).length > 0 
            ? 'WHERE ' + Object.keys(properties).map(key => `n.${key} = $${key}`).join(' AND ')
            : '';
        
        const cypher = `MATCH (n:${label}) ${whereClause} RETURN n`;
        const result = await this.read(cypher, properties);
        return result.map(record => record.n);
    }

    /**
     * Update node properties
     */
    async updateNode(label: string, findProperties: Record<string, any>, updateProperties: Record<string, any>): Promise<any> {
        const whereClause = Object.keys(findProperties).map(key => `n.${key} = $find_${key}`).join(' AND ');
        const setClause = Object.keys(updateProperties).map(key => `n.${key} = $update_${key}`).join(', ');
        
        const cypher = `MATCH (n:${label}) WHERE ${whereClause} SET ${setClause} RETURN n`;
        
        const parameters = {
            ...Object.fromEntries(Object.entries(findProperties).map(([k, v]) => [`find_${k}`, v])),
            ...Object.fromEntries(Object.entries(updateProperties).map(([k, v]) => [`update_${k}`, v]))
        };
        
        const result = await this.write(cypher, parameters);
        return result[0]?.n || null;
    }

    /**
     * Delete nodes
     */
    async deleteNodes(label: string, properties: Record<string, any> = {}): Promise<number> {
        const whereClause = Object.keys(properties).length > 0 
            ? 'WHERE ' + Object.keys(properties).map(key => `n.${key} = $${key}`).join(' AND ')
            : '';
        
        const cypher = `MATCH (n:${label}) ${whereClause} DELETE n`;
        const result = await this.write(cypher, properties);
        return result.length;
    }

    /**
     * Create a relationship between two nodes
     */
    async createRelationship(
        fromLabel: string, 
        fromProperties: Record<string, any>,
        relationshipType: string,
        toLabel: string,
        toProperties: Record<string, any>,
        relationshipProperties: Record<string, any> = {}
    ): Promise<any> {
        const fromWhere = Object.keys(fromProperties).map(key => `from.${key} = $from_${key}`).join(' AND ');
        const toWhere = Object.keys(toProperties).map(key => `to.${key} = $to_${key}`).join(' AND ');
        
        const cypher = `
            MATCH (from:${fromLabel}) WHERE ${fromWhere}
            MATCH (to:${toLabel}) WHERE ${toWhere}
            CREATE (from)-[r:${relationshipType} $relProperties]->(to)
            RETURN r
        `;
        
        const parameters = {
            ...Object.fromEntries(Object.entries(fromProperties).map(([k, v]) => [`from_${k}`, v])),
            ...Object.fromEntries(Object.entries(toProperties).map(([k, v]) => [`to_${k}`, v])),
            relProperties: relationshipProperties
        };
        
        const result = await this.write(cypher, parameters);
        return result[0]?.r || null;
    }

    /**
     * Get all labels in the database
     */
    async getLabels(): Promise<string[]> {
        const result = await this.read('CALL db.labels()');
        return result.map(record => record.label);
    }

    /**
     * Get database info
     */
    async getDatabaseInfo(): Promise<any> {
        const result = await this.read('CALL dbms.components()');
        return result;
    }

    /**
     * Clear entire database (use with caution!)
     */
    async clearDatabase(): Promise<void> {
        await this.write('MATCH (n) DETACH DELETE n');
    }

    /**
     * Get a session with the configured database
     */
    private getSession(): Session {
        return this.driver.session({ database: this.config.database });
    }

    /**
     * Close the driver connection
     */
    async close(): Promise<void> {
        await this.driver.close();
    }
} 