import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { LangfuseService } from '../Shared/LangfuseService';
import { OpenAIService } from '../Shared/OpenAIService';
import type { ChatCompletion, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type OpenAI from 'openai';
import systemPromptDefinition, { describeDefinitionPrompt } from './context/systemPrompt';

const app = express();
const port = 3000;
app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/chat requests`));

const langfuseService = new LangfuseService();
const openaiService = new OpenAIService();


app.post('/api/se02e02/describe-map', async (req, res) => {
    console.log('Received request');
    const trace = langfuseService.createTrace({ id: `se02e02-${Date.now()}`, name: "transcription", sessionId: "se02e01" });

    const mapImage = await fs.readFile(path.join(__dirname, 'maps', 'map.jpeg'));
    const mapImageBase64 = mapImage.toString('base64');

    const systemPrompt = await describeDefinitionPrompt() as ChatCompletionMessageParam;

    const messages: ChatCompletionMessageParam[] = [
        systemPrompt,
        {
            role: "user",
            content: [
                { type: "image_url", image_url: { url: `data:image/png;base64,${mapImageBase64}`, detail: "high" } },
                { type: "text", text: "Describe the maps' fragments in a way that can be used to identify the city." },
            ]
        }
    ];

    const chatCompletion = await openaiService.completion(messages, "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;

    const response = chatCompletion.choices[0].message.content ?? '';

    langfuseService.createGeneration(
        trace,
        'answer',
        messages,
        response,
        'gpt-4o'
    );


    await fs.writeFile(path.join(__dirname, 'maps', 'map-description.txt'), response);

    res.json({ response });
});


app.post('/api/se02e02/find-city', async (req, res) => {
    const trace = langfuseService.createTrace({ id: `se02e02-${Date.now()}`, name: "transcription", sessionId: "se002" });

    const mapDescription = await fs.readFile(path.join(__dirname, 'maps', 'map-description.txt'), 'utf8');

    const systemPrompt = await systemPromptDefinition() as ChatCompletionMessageParam;
    const userPrompt = {
        role: "user",
        content: mapDescription
    } as ChatCompletionMessageParam;

    const messages: ChatCompletionMessageParam[] = [
        systemPrompt,
        userPrompt
    ];

    const chatCompletion = await openaiService.completion(messages, "gpt-4o", false, false, 0.1, 1024) as OpenAI.Chat.Completions.ChatCompletion;

    const response = chatCompletion.choices[0].message.content ?? '';

    langfuseService.createGeneration(
        trace,
        'answer',
        messages,
        response,
        'gpt-4o'
    );

    await langfuseService.shutdownAsync();

    return res.json({ response });
}
);
