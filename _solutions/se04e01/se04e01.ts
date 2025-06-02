import fs from 'fs/promises';
import express from 'express';
import { LangfuseService } from '../Shared/LangfuseService';
import { OpenAIService } from '../Shared/OpenAIService';
import type OpenAI from 'openai';
import path from 'path';

const app = express();

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});

type Action = 'REPAIR' | 'BRIGHTEN' | 'DARKEN';
const baseUrl = 'https://centrala.ag3nts.org/dane/barbara/';
const langfuseService = new LangfuseService();
const openaiService = new OpenAIService();

const extractPhotoNames = (text: string): string[] => {
    const photoRegex = /IMG_\d+.*?\.PNG/g;
    const matches = text.match(photoRegex);
    return matches || [];
};

app.post('/api/se04e01/barbara', async (req, res) => {
    console.log('Request received');
    const trace = langfuseService.createTrace({ id: `se04e01-${Date.now()}`, name: 'se04e01-photos', sessionId: 'se04e01-photos' });

    const sendDataToHeadquarter = async (barbaraDescription: string) => {
        const report = {
            task: 'photos',
            apikey: process.env.PERSONAL_API_KEY,
            answer: barbaraDescription,
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

    const getInitialPhotos = async () => {
        const report = {
            task: 'photos',
            apikey: process.env.PERSONAL_API_KEY,
            answer: 'START',
        }

        const response = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(report)
        });

        const data = await response.json();

        return data.message;
    }

    const makeAction = async (action: Action, photoName: string) => {
        const report = {
            task: 'photos',
            apikey: process.env.PERSONAL_API_KEY,
            answer: `${action} ${photoName}`,
        }

        console.log("Making action", `${action} for: ${photoName}`);

        const response = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(report)
        });

        const data = await response.json();

        return data.message as string;

    }

    const analyzePhoto = async (photoName: string) => {
        console.log('Analyzing photo', photoName);
        const handlePhotoAction = async (action: Action | 'SAVE', photoName: string) => {
            switch (action) {
                case 'REPAIR':
                    return await makeAction('REPAIR', photoName);
                case 'BRIGHTEN':
                    return await makeAction('BRIGHTEN', photoName);
                case 'DARKEN':
                    return await makeAction('DARKEN', photoName);
                case 'SAVE':
                    console.log('Saving photo', photoName);
                    const photo = await fetch(`${baseUrl}/${photoName}`).then(res => res.arrayBuffer());
                    await fs.writeFile(path.join(__dirname, 'photos', 'fixed', photoName), Buffer.from(photo));
                    return 'OK';
            }
        }
        const analyzeResponseAndDecide = async (response: string, previousAction?: Action | 'SAVE', previousAnalysis?: string) => {
            console.log('Analyzing response', response);
            const newPhotoName = extractPhotoNames(response)[0];
            console.log('New photo name', newPhotoName);
            const fetchPhoto = await fetch(`${baseUrl}/${newPhotoName}`).then(res => res.arrayBuffer());
            const photo = Buffer.from(fetchPhoto);
            const base64Photo = photo.toString('base64');
            const modelResponse = await openaiService.completion([
                {
                    role: 'system', content: `You are response analyzer.
                    You are given a response from API and you need to analyze it and decide if the action was successful or not. 
                    Based on your previous analysis of the photo, you need to decide if the action was successful or not. 
                    You need to return only one of the following actions: REPAIR, BRIGHTEN, DARKEN, SAVE.
                    User might also include the processed photo when API has returned it. You need to analyze it and decide if the action was successful or not and based on that analyze if more actions are needed needed.
                    You need to return only the action, nothing else. If the action was successful, return SAVE.
                    Previous action: ${previousAction}, Previous analysis: ${previousAnalysis}`
                },
                {
                    role: 'system', content: `Previous action: ${previousAction}, Previous analysis: ${previousAnalysis}`
                },
                {
                    role: 'user', content: [
                        { type: 'text', text: `Response: ${response}` },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Photo}`, detail: 'high' } },
                    ]
                }
            ]) as OpenAI.Chat.Completions.ChatCompletion;

            const action = modelResponse.choices[0].message.content as Action | 'SAVE';
            if (newPhotoName !== undefined) {
                return { action, newPhotoName };
            }
            return { action };
        }
        const performAction = async (action: Action | 'SAVE', photoName: string, previousAction?: Action | 'SAVE', previousAnalysis?: string) => {
            const response = await handlePhotoAction(action, photoName);
            console.log('Response', response);
            if (response === 'OK') {
                return;
            }
            const { action: newAction, newPhotoName } = await analyzeResponseAndDecide(response, previousAction, previousAnalysis);
            await performAction(newAction, newPhotoName ?? photoName, newAction, response);
        }
        const fetchPhoto = await fetch(`${baseUrl}/${photoName}`).then(res => res.arrayBuffer());
        const photo = Buffer.from(fetchPhoto);
        const base64Photo = photo.toString('base64');

        const response = await openaiService.completion([
            {
                role: 'system', content: 'You are a photo analyzer. You are given a photo and you need to analyze it and decide what to do with it. You need to return only one of the following actions: REPAIR, BRIGHTEN, DARKEN, SAVE. You need to return only the action, nothing else.',
            },
            {
                role: 'user', content: [
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Photo}`, detail: 'high' } },
                    { type: 'text', text: 'Analyze the photo and decide what to do with it.' }
                ]
            }
        ]) as OpenAI.Chat.Completions.ChatCompletion;

        const action = response.choices[0].message.content as Action | 'SAVE';

        langfuseService.createGeneration(trace, photoName, [
            {
                role: 'user', content: [
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Photo}`, detail: 'high' } },
                    { type: 'text', text: 'Analyze the photo and decide what to do with it.' }
                ]
            }
        ], action, 'gpt-4o');

        await performAction(action, photoName);

    }

    const photos = extractPhotoNames(await getInitialPhotos());
    for (const photo of photos) {
        await analyzePhoto(photo);
    }

    const getPhotoDescription = async () => {
        const photos = await fs.readdir(path.join(__dirname, 'photos', 'fixed'));

        const photosPrompts = await Promise.all(photos.map(async (photo) => {
            const photoBuffer = await fs.readFile(path.join(__dirname, 'photos', 'fixed', photo));
            const base64Photo = photoBuffer.toString('base64');
            return { type: 'image_url' as const, image_url: { url: `data:image/png;base64,${base64Photo}`, detail: 'high' as const } };
        }));

        const response = await openaiService.completion([
            {
                role: 'system', content: 'You are a photo description generator. You are given a list of photos and you need to describe them. We are looking for a description of the photo that will help us to identify the person in the photo. We are looking for a woman. Make it as detailed as possible. The description should be in Polish. Return only the description, nothing else. If the photo does not contain a woman, omit the photo from the description.'
            },
            {
                role: 'user', content: [
                    { type: 'text' as const, text: 'Describe the photos.' },
                    ...photosPrompts
                ]
            }
        ], 'gpt-4o') as OpenAI.Chat.Completions.ChatCompletion;
        return response.choices[0].message.content ?? '';
    }

    const photoDescription = await getPhotoDescription();
    const response = await sendDataToHeadquarter(photoDescription);
    console.log('Response', response);

});