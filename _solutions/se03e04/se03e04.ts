import express from 'express';
import { LangfuseService } from '../Shared/LangfuseService';
import fs from 'fs/promises';
import type OpenAI from 'openai';
import { OpenAIService } from '../Shared/OpenAIService';
import path from 'path';
import '../Shared/PolishNormalizer'; // Enable extension method


const app = express();
app.use(express.json());

const port = 3000;
const langfuseService = new LangfuseService();
const openaiService = new OpenAIService();
const personUrl = 'https://c3ntrala.ag3nts.org/people';
const placesUrl = 'https://c3ntrala.ag3nts.org/places';

app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/se03e04/data-picker requests`));

app.post('/api/se03e04/data-picker', async (req, res) => {
    console.log('Received request');
    const trace = langfuseService.createTrace({ id: `se03e04-${Date.now()}`, name: 'se03e04-data-picker', sessionId: 'se03e04-data-picker' });

    const extractPeople = async () => {
        const data = await fs.readFile(path.join(__dirname, 'data/barbara.txt'), 'utf8');

        const names = await openaiService.completion([
            {
                role: "system", content: "You are a name extractor. You are given a text and you need to extract all names from the text. " +
                    "ALWAYS change the name to nominative case. Return only comma separated names, nothing else. " +
                    "Get only names (polish ones) without last name. " +
                    "The response should be in the following format: <name1>, <name2>, <name3>, ..."
            },
            { role: "user", content: data }
        ], "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;

        return names.choices[0].message.content;
    }

    const extractPlaces = async () => {
        const data = await fs.readFile(path.join(__dirname, 'data/barbara.txt'), 'utf8');

        const places = await openaiService.completion([
            {
                role: "system", content: "You are a place extractor. You are given a text and you need to extract all places from the text. " +
                    "Return only comma separated places, nothing else. " +
                    "The response should be in the following format: <place1>, <place2>, <place3>, ..."
            },
            { role: "user", content: data }
        ], "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;

        return places.choices[0].message.content;
    }

    const sendDataToHeadquarter = async (answer: string) => {
        const report = {
            task: 'loop',
            apikey: process.env.PERSONAL_API_KEY,
            answer: answer.toUpperCase().normalizePolish()
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

    const people = (await extractPeople())?.split(', ') || [];
    const places = (await extractPlaces())?.split(', ') || [];


    for (const person of people) {
        const personResponse = await fetch(personUrl, {
            method: 'POST',
            body: JSON.stringify({
                apikey: process.env.PERSONAL_API_KEY,
                query: person.toUpperCase().normalizePolish()
            })
        });

        const personData = await personResponse.json();

        const cities = await openaiService.completion([
            {
                role: "system", content: "You are a city extractor. You are given a text and you need to extract all cities from the text. " +
                    "Return only comma separated cities, nothing else. " +
                    "The response should be in the following format: <city1>, <city2>, <city3>, ..." +
                    "If there are no cities in the text, return empty string." +
                    "NEVER return any other text than the cities and string with comma."
            },
            { role: "user", content: personData.message }
        ], "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;

        const response = cities.choices[0].message.content || '';
        console.log({ response });
        places.push(...response.split(', '));
    }

    const distinctPlaces = [...new Set(places)];

    const potentialPlaces = [];
    for (const place of distinctPlaces) {
        const placeResponse = await fetch(placesUrl, {
            method: 'POST',
            body: JSON.stringify({
                apikey: process.env.PERSONAL_API_KEY,
                query: place.toUpperCase().normalizePolish()
            })
        });

        const placeData = await placeResponse.json();

        console.log({ place, placeData });

        if (placeData.message.includes('BARBARA')) {
            console.log("Found place: ", place);
            potentialPlaces.push(place);
        }
    }

    const responses: string[] = [];
    for (const place of potentialPlaces) {
        const response = await sendDataToHeadquarter(place);
        responses.push(response);
    }

    res.status(200).send({ message: responses.join(', ') });
});
