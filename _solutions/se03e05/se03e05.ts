import fs from 'fs/promises';
import express from 'express';
import { Neo4jService } from '../Shared/Neo4jService';
import path from 'path';

const app = express();
const port = 3000;
const baseUrl = 'https://c3ntrala.ag3nts.org/apidb';

app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/se03e05/connections requests`));

const neo4jService = new Neo4jService();

interface DatabaseResponse<T> {
    reply: T[];
}

interface Person {
    id: number;
    username: string;
    access_level: string;
    is_active: string;
    lastlog: string;
}

interface Connection {
    id: number;
    user1_id: number;
    user2_id: number;
}

app.post('/api/se03e05/connections', async (req, res) => {
    const sendDataToHeadquarter = async (answer: string) => {
        const report = {
            task: 'connections',
            apikey: process.env.PERSONAL_API_KEY,
            answer: answer,
        }

        const response = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(report)
        });

        return await response.text();
    }

    const seedDatabase = async () => {
        const people = await fs.readFile(path.join(__dirname, 'data/people.txt'), 'utf8');
        const connections = await fs.readFile(path.join(__dirname, 'data/connections.txt'), 'utf8');

        const peopleArray = JSON.parse(people) as Person[];
        const connectionsArray = JSON.parse(connections) as Connection[];

        try {
            console.log('Clearing existing Neo4j data...');
            await neo4jService.clearDatabase();

            console.log('Creating person nodes...');
            for (const person of peopleArray) {
                await neo4jService.createNode('Person', {
                    user_id: person.id,
                    username: person.username,
                    access_level: person.access_level,
                    is_active: person.is_active,
                    lastlog: person.lastlog
                });
                console.log(`Created person node for user_id: ${person.id}, username: ${person.username}`);
            }

            console.log('Creating connections...');
            for (const connection of connectionsArray) {
                try {
                    await neo4jService.createRelationship(
                        'Person', { user_id: connection.user1_id },
                        'KNOWS',
                        'Person', { user_id: connection.user2_id },
                        { connection_id: connection.id }
                    );
                    console.log(`Created connection: ${connection.user1_id} -> ${connection.user2_id}`);
                } catch (error) {
                    console.error(`Failed to create connection ${connection.user1_id} -> ${connection.user2_id}:`, error);
                }
            }

            const totalNodes = await neo4jService.read('MATCH (p:Person) RETURN count(p) as count');
            const totalConnections = await neo4jService.read('MATCH ()-[r:KNOWS]->() RETURN count(r) as count');

            console.log(`Successfully created ${totalNodes[0].count} person nodes`);
            console.log(`Successfully created ${totalConnections[0].count} connections`);
        }
        catch (error) {
            console.error('Error importing data to Neo4j:', error);
            throw error;
        }
    }

    const findShortestPath = async (): Promise<string> => {
        const query = `
            MATCH (start:Person {username: 'Rafał'}), (end:Person {username: 'Barbara'})
            MATCH p = shortestPath((start)-[:KNOWS*]-(end))
            RETURN [node in nodes(p) | node.username] as path
        `;

        const result = await neo4jService.read(query);

        if (result.length === 0) {
            throw new Error('No path found between Rafał and Barbara');
        }

        const pathNodes = result[0].path as string[];
        return pathNodes.join(',');
    }

    const isConnected = await neo4jService.testConnection();
    if (!isConnected) {
        console.error('Neo4j is not connected. Please start Neo4j database.');
        return res.status(500).json({ error: 'Neo4j database not available' });
    }

    if (!await fs.exists(path.join(__dirname, 'data/people.txt'))) {
        const response = await fetch(baseUrl, {
            method: 'POST', body: JSON.stringify(
                {
                    task: 'database',
                    apikey: process.env.PERSONAL_API_KEY,
                    query: 'SELECT * FROM users'
                })
        });
        const data = await response.json() as DatabaseResponse<Person>;
        await fs.writeFile(path.join(__dirname, 'data/people.txt'), JSON.stringify(data.reply));
    }

    if (!await fs.exists(path.join(__dirname, 'data/connections.txt'))) {
        const response = await fetch(baseUrl, {
            method: 'POST', body: JSON.stringify(
                {
                    task: 'database',
                    apikey: process.env.PERSONAL_API_KEY,
                    query: 'SELECT * FROM connections'
                })
        });
        const data = await response.json() as DatabaseResponse<Connection>;
        await fs.writeFile(path.join(__dirname, 'data/connections.txt'), JSON.stringify(data.reply));
    }

    await seedDatabase();

    console.log('Finding shortest path from Rafał to Barbara...');
    const shortestPath = await findShortestPath();
    console.log('Shortest path:', shortestPath);

    const result = await sendDataToHeadquarter(shortestPath);

    res.json({
        success: true,
        shortest_path: shortestPath,
        headquarters_response: result
    });
});