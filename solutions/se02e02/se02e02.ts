import express, { response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { LangfuseService } from '../Shared/LangfuseService';
import { OpenAIService } from '../Shared/OpenAIService';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type OpenAI from 'openai';
import findCityMapPrompt from './context/findCityMapPrompt';
import describeFragmentsPrompt from './context/describeFragmentsPrompt';

const app = express();
const port = 3000;
app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/chat requests`));

const langfuseService = new LangfuseService();
const openaiService = new OpenAIService();


app.post('/api/se02e02/describe-fragments', async (req, res) => {
    console.log('Received request');
    const trace = langfuseService.createTrace({ id: `se02e02-${Date.now()}`, name: "map_fragment_description", sessionId: "se02e01" });

    const describeFragment = async (fragment: string) => {
        const systemPrompt = await describeFragmentsPrompt() as ChatCompletionMessageParam;

        const mapFragment = await fs.readFile(path.join(__dirname, 'maps', 'fragments', fragment));
        const mapImageBase64 = mapFragment.toString('base64');

        const messages: ChatCompletionMessageParam[] = [
            systemPrompt,
            {
                role: "user",
                content: [
                    { type: "image_url", image_url: { url: `data:image/png;base64,${mapImageBase64}`, detail: "high" } },
                    { type: "text", text: "Describe the maps' fragments in a way that can be used to identify the city." }
                ]
            }
        ];

        console.log("Describing fragment: ", fragment);
        const chatCompletion = await openaiService.completion(messages, "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;

        const response = chatCompletion.choices[0].message.content ?? '';

        return response;
    }


    const fragments = await fs.readdir(path.join(__dirname, 'maps', 'fragments'));

    for (const fragment of fragments) {
        const description = await describeFragment(fragment);

        await fs.writeFile(path.join(__dirname, 'maps', 'fragments_descriptions', `${fragment}.txt`), description);
    }

    await langfuseService.shutdownAsync();

    return res.json({ message: "Fragments described successfully" });
});


app.post('/api/se02e02/find-city', async (req, res) => {
    console.log('Received request');
    const trace = langfuseService.createTrace({ id: `se02e02-${Date.now()}`, name: "find_city", sessionId: "se002" });

    const getMapDescription = async (fragment: string) => {
        console.log('Getting map description for fragment: ', fragment);
        const mapDescription = await fs.readFile(path.join(__dirname, 'maps', 'fragments_descriptions', fragment), 'utf8');
        return mapDescription;
    }

    const fragments = await fs.readdir(path.join(__dirname, 'maps', 'fragments_descriptions'));

    const fragmentDescriptions = await Promise.all(fragments.map(async (fragment) => {
        const description = await getMapDescription(fragment);
        return { fragment, description };
    }));

    console.log("Merging fragment descriptions");
    const fragmentDescriptionsString = fragmentDescriptions.map((fragment) => `${fragment.fragment}: ${fragment.description}`).join('\n');

    const systemPrompt = await findCityMapPrompt() as ChatCompletionMessageParam;

    const messages: ChatCompletionMessageParam[] = [
        systemPrompt,
        {
            role: "user",
            content: fragmentDescriptionsString
        }
    ];

    const chatCompletion = await openaiService.completion(messages, "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;

    const response = chatCompletion.choices[0].message.content ?? '';

    await langfuseService.createGeneration(
        trace,
        'answer',
        messages,
        response,
        'gpt-4o'
    );
    await langfuseService.shutdownAsync();

    return res.json({ response });
});
