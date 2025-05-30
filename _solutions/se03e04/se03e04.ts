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
                    "Get only names (polish ones) without last name or last name when it is mentioned alone (without first name). " +
                    "The response should be in the following format: <name1>, <name2>, <name3>, ..."
            },
            { role: "user", content: data }
        ], "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;

        langfuseService.createGeneration(trace, 'extractPeople', [
            {
                role: 'user',
                content: data
            }
        ], names.choices[0].message.content, 'gpt-4o');

        return names.choices[0].message.content;
    }

    const extractPlaces = async () => {
        const data = await fs.readFile(path.join(__dirname, 'data/barbara.txt'), 'utf8');

        const systemPrompt = "You are a place extractor. You are given a text and you need to extract all places from the text. " +
            "Return only comma separated places, nothing else. " +
            "The response should be in the following format: <place1>, <place2>, <place3>, ..." +
            "If there are no places in the text, return empty string." +
            "Return names in nominative case." +
            "NEVER return any other text than the places and string with comma."

        const places = await openaiService.completion([
            { role: "system", content: systemPrompt },
            { role: "user", content: data }
        ], "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;

        langfuseService.createGeneration(trace, 'extractPlaces', [
            { role: "system", content: systemPrompt },
            {
                role: 'user',
                content: data
            }
        ], places.choices[0].message.content, 'gpt-4o');

        return places.choices[0].message.content || '';
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

        return await response.json();
    }

    const people = new Set((await extractPeople())?.split(', ') || []);
    const places = new Set((await extractPlaces())?.split(', ') || []);

    console.log({ places });
    console.log({ people });

    let i = 0;
    while (i < people.size) {
        const person = Array.from(people)[i];
        const personResponse = await fetch(personUrl, {
            method: 'POST',
            body: JSON.stringify({
                apikey: process.env.PERSONAL_API_KEY,
                query: person.toUpperCase().normalizePolish()
            })
        });

        const personData = await personResponse.json();
        console.log(`Person ${person}:`, personData);

        const systemPrompt = "You are a city extractor. You are given a text and you need to extract all cities from the text. " +
            "Return only comma separated cities, nothing else. " +
            "The response should be in the following format: <city1>, <city2>, <city3>, ..." +
            "If there are no cities in the text, return empty string." +
            "NEVER return any other text than the cities and string with comma."

        const cities = await openaiService.completion([
            {
                role: "system", content: systemPrompt
            },
            { role: "user", content: personData.message }
        ], "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;

        langfuseService.createGeneration(trace, 'extractCities', [
            {
                role: "system", content: systemPrompt
            },
            { role: "user", content: personData.message }
        ], cities.choices[0].message.content, 'gpt-4o');

        const response = cities.choices[0].message.content || '';
        for (const city of response.toUpperCase().normalizePolish().split(', ')) {
            if (city !== '' && city !== 'KRAKOW') {
                places.add(city);
            }
        }

        for (const place of places) {
            const placeResponse = await fetch(placesUrl, {
                method: 'POST',
                body: JSON.stringify({
                    apikey: process.env.PERSONAL_API_KEY,
                    query: place.toUpperCase().normalizePolish()
                })
            });

            const placeData = await placeResponse.json();
            const newPeople = placeData.message.toUpperCase().normalizePolish().split(' ');
            console.log(`Place ${place}:`, placeData);
            if (placeData.message.includes('BARBARA') && place !== 'KRAKOW') {
                const response = await sendDataToHeadquarter(place);
                if (response.code === 0) {
                    return res.status(200).send({ message: response.message });
                }
            }
            else {
                for (const newPerson of newPeople) {
                    if (newPerson !== '' && newPerson.toUpperCase().normalizePolish() !== 'BARBARA') {
                        people.add(newPerson);
                    }
                }
            }
        }
        i++;
    }
});
