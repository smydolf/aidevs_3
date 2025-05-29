import express from 'express';
import { QdrantService } from '../Shared/QdrantService';
import path from 'path';
import fs from 'fs/promises';
import { OpenAIService } from '../Shared/OpenAIService';
import { LangfuseService } from '../Shared/LangfuseService';
import type { metastore } from 'googleapis/build/src/apis/metastore';

const app = express();
const port = 3000;

app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/se03e02/reports requests`));

const QUERY = "W raporcie, z którego dnia znajduje się wzmianka o kradzieży prototypu broni?";
const COLLECTION_NAME = 'se03e02-weapons';
const qdrantService = new QdrantService();
const openaiService = new OpenAIService();
const langfuseService = new LangfuseService();

app.post('/api/se03e02/weapons', async (req, res) => {
    console.log('Received request');
    const trace = langfuseService.createTrace({ id: `se03e02-${Date.now()}`, name: 'se03e02-weapons', sessionId: 'se03e02-weapons' });

    qdrantService.ensureCollection({
        name: COLLECTION_NAME,
        vectorSize: 3072,
        distance: 'Cosine'
    });

    const createEmbedding = async (text: string) => {
        const embedding = await openaiService.createEmbedding(text);

        langfuseService.createGeneration(trace, 'embedding', [
            {
                role: 'user',
                content: text
            }
        ], embedding, 'text-embedding-3-large');

        return embedding;
    }

    const createEmbeddings = async () => {
        const files = (await fs.readdir(path.join(__dirname, 'data'))).filter(file => file.endsWith('.txt'));

        for (const file of files) {
            console.log(`Creating embedding for ${file}`);
            const text = await fs.readFile(path.join(__dirname, 'data', file), 'utf8');
            const embedding = await createEmbedding(text);
            await qdrantService.insertPoints(COLLECTION_NAME, [{
                id: crypto.randomUUID(),
                vector: embedding,
                payload: {
                    createdAt: file.replace('.txt', ''),
                    filename: file
                }
            }]);
            console.log(`Created embedding for ${file}`);
        }
    }

    const findAnswer = async () => {
        console.log(`Finding answer for ${QUERY}`);
        const embedding = await openaiService.createEmbedding(QUERY);
        console.log(`Embedding created for ${QUERY}, the value is ${embedding}`);
        const results = await qdrantService.search(COLLECTION_NAME, embedding, 5);

        const answer = results.map(result => {
            return {
                filename: result.payload?.filename,
                createdAt: result.payload?.createdAt,
                text: result.payload?.text,
                score: result.score
            }
        });

        console.log("Answer from qdrant");
        console.table(answer.map(result => ({
            filename: result.filename,
            createdAt: result.createdAt,
            text: result.text,
            score: result.score
        })));

        // get the highest score
        const highestScore = answer.sort((a, b) => b.score - a.score)[0];

        return highestScore;

    }

    const sendDataToHeadquarter = async (answer: string) => {

        const report = {
            task: 'wektory',
            apikey: process.env.PERSONAL_API_KEY,
            answer : answer.replace(/_/g, '-'),
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

    // if (!await qdrantService.collectionExists(COLLECTION_NAME)) {
    //     console.log(`Collection ${COLLECTION_NAME} does not exist, creating it`);
    //     await createEmbeddings();
    // } else {
    //     console.log(`Collection ${COLLECTION_NAME} already exists, skipping creation`);
    // }

    await createEmbeddings();
    const answer = await findAnswer();
    const headquartersResponse = await sendDataToHeadquarter(answer.createdAt as string);

    res.status(200).send({ message: 'Headquarters response', headquartersResponse: headquartersResponse });
});

process.on('SIGINT', async () => {
    await langfuseService.shutdownAsync();
    process.exit(0);
});