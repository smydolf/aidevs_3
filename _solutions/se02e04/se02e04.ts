import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { LangfuseService } from '../Shared/LangfuseService';
import { OpenAIService } from '../Shared/OpenAIService';
import type { ChatCompletion, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type OpenAI from 'openai';
import systemPromptDefinition from './context/systemPrompt';

const app = express();
const port = 3000;
app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/create-report requests`));

const langfuseService = new LangfuseService();
const openaiService = new OpenAIService();


app.post('/api/se02e04/create-report', async (req, res) => {
    const trace = langfuseService.createTrace({ id: `se02e04-${Date.now()}`, name: "create-report", sessionId: "se02e04" });

    const processImageReports = async () => {
        console.log('Starting to process image reports');
        const images = await fs.readdir(path.join(__dirname, 'reports'));
        const imageFiles = images.filter(file => file.endsWith('.png'));

        for (const image of imageFiles) {
            const processedImageFileName = `${image}.txt`;
            if (await fs.exists(path.join(__dirname, 'processed_reports', processedImageFileName))) {
                console.log(`Image file ${image} already processed`);
                continue;
            }

            const imageBuffer = await fs.readFile(path.join(__dirname, 'reports', image));
            const imageBase64 = imageBuffer.toString('base64');

            const messages: ChatCompletionMessageParam[] = [
                {
                    role: "system",
                    content: "You are a helpful assistant that can read text from images."
                },
                {
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
                        { type: "text", text: "Read all text from the image and return it as a string. If the text in not in English, translate it and return ONLY the translated text." }
                    ]
                }
            ];

            const chatCompletion = await openaiService.completion(messages, "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;
            const response = chatCompletion.choices[0].message.content ?? '';
            console.log(`Successfully processed image file: ${image}`);

            langfuseService.createGeneration(
                trace,
                'answer',
                messages,
                response,
                'gpt-4o'
            );
            await fs.writeFile(path.join(__dirname, 'processed_reports', processedImageFileName), response);
        };
    }

    const processAudioReports = async () => {
        console.log('Starting to process audio reports');
        const audioFiles = (await fs.readdir(path.join(__dirname, 'reports'))).filter(file => file.endsWith('.mp3'));

        for (const audio of audioFiles) {
            const processedAudioFileName = `${audio}.txt`;
            if (await fs.exists(path.join(__dirname, 'processed_reports', processedAudioFileName))) {
                console.log(`Audio file ${audio} already processed`);
                continue;
            }

            const audioBuffer = await fs.readFile(path.join(__dirname, 'reports', audio));
            const transcription = await openaiService.transcribe(audioBuffer, audio, 'audio/mpeg');
            console.log(`Successfully transcribed audio file: ${audio}`);

            langfuseService.createGeneration(
                trace,
                'answer',
                [],
                transcription,
                'whisper-1'
            );
            await fs.writeFile(path.join(__dirname, 'processed_reports', processedAudioFileName), transcription);
        }
    }

    const processTextReports = async () => {
        console.log('Starting to process text reports');
        const textFiles = (await fs.readdir(path.join(__dirname, 'reports'))).filter(file => file.endsWith('.txt'));

        for (const text of textFiles) {
            const processedTextFileName = `${text}.txt`;
            if (await fs.exists(path.join(__dirname, 'processed_reports', processedTextFileName))) {
                console.log(`Text file ${text} already processed`);
                continue;
            }

            const textBuffer = await fs.readFile(path.join(__dirname, 'reports', text));

            const messages: ChatCompletionMessageParam[] = [
                {
                    role: "system",
                    content: "You are a helpful assistant that can translate text to English."
                },
                {
                    role: "user",
                    content: textBuffer.toString()
                }
            ]

            const chatCompletion = await openaiService.completion(messages, "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;
            const response = chatCompletion.choices[0].message.content ?? '';
            console.log(`Successfully processed text file: ${text}`);

            langfuseService.createGeneration(
                trace,
                'answer',
                messages,
                response,
                'gpt-4o'
            );
            await fs.writeFile(path.join(__dirname, 'processed_reports', processedTextFileName), response);
        }
    }

    const categorizeReports = async () => {
        console.log('Starting to categorize reports');
        const processedReports = (await fs.readdir(path.join(__dirname, 'processed_reports'))).filter(file => file.endsWith('.txt'));

        const categories = {
            people: [] as string[],
            hardware: [] as string[],
        }

        for (const report of processedReports) {
            const reportBuffer = await fs.readFile(path.join(__dirname, 'processed_reports', report));

            // import system prompt
            const systemPrompt = await systemPromptDefinition() as ChatCompletionMessageParam;

            const messages: ChatCompletionMessageParam[] = [
                systemPrompt,
                {
                    role: "user",
                    content: reportBuffer.toString()
                }
            ]

            const chatCompletion = await openaiService.completion(messages, "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;
            const response = chatCompletion.choices[0].message.content ?? '';

            langfuseService.createGeneration(
                trace,
                'answer',
                messages,
                response,
                'gpt-4o'
            );

            if (response.toLowerCase().includes('people')) {
                categories.people.push(report.replace('.txt', ''));
            }
            if (response.toLowerCase().includes('hardware')) {
                categories.hardware.push(report.replace('.txt', ''));
            }

            console.log(`Successfully categorized report: ${report}, got category: ${response}`);
        }

        return categories;
    }

    const sendReportToHeadquarter = async (categories: { people: string[], hardware: string[] }) => {
        console.log('Starting to send reports to headquarters');

        categories.people.sort();
        categories.hardware.sort();

        const report = {
            task: 'kategorie',
            apikey: process.env.PERSONAL_API_KEY,
            answer: categories
        }

        console.log(report);

        const headquartersResponse = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(report)
        });



        return headquartersResponse.text();
    }

    await processImageReports();
    await processAudioReports();
    await processTextReports();

    const categories = await categorizeReports();
    const headquartersResponse = await sendReportToHeadquarter(categories);
    await langfuseService.shutdownAsync();

    console.log('Reports processed successfully');
    return res.json({ message: "Reports processed successfully", headquartersResponse: headquartersResponse });
});