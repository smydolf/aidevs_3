import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import TurndownService from 'turndown';
import { parse as htmlParse, HTMLElement } from 'node-html-parser';
import { LangfuseService } from '../Shared/LangfuseService';
import { OpenAIService } from '../Shared/OpenAIService';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import type OpenAI from 'openai';
import systemPromptDefinition from './context/systemPrompt';

const app = express();
const port = 3000;

app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/se02e05/arxiv requests`));

const baseUrl = 'https://c3ntrala.ag3nts.org/dane/';
const articleUrl = `${baseUrl}/arxiv-draft.html`;
const headquarterQuestionsUrl = `https://c3ntrala.ag3nts.org/data/${process.env.PERSONAL_API_KEY}/arxiv.txt`;

const langfuseService = new LangfuseService();
const openaiService = new OpenAIService();

async function directoryExists(dirPath: string): Promise<boolean> {
    try {
        const stats = await fs.stat(dirPath);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

const convertHTMLToMarkdown = async (html: string, images: { imageName: string, description: string }[], audios: { audioName: string, transcription: string }[]) => {
    if (await fs.exists(path.join(__dirname, 'article', 'arxiv-draft.md'))) {
        console.log('Markdown file already exists');
        return await fs.readFile(path.join(__dirname, 'article', 'arxiv-draft.md'), 'utf8');
    }

    const turndownService = new TurndownService();
    let markdown = turndownService.turndown(html);

    for (const image of images) {
        markdown = markdown.replace(`![](i/${image.imageName})`, `![${image.description}](${image.imageName})`);
    }

    for (const audio of audios) {
        const escapedAudioName = audio.audioName.replace('_', '\\_');
        markdown = markdown.replace(
            `[${escapedAudioName}](i/${audio.audioName})`,
            `Audio transcription: ${audio.transcription}`
        );
    }

    await fs.writeFile(path.join(__dirname, 'article', 'arxiv-draft.md'), markdown);

    return markdown;
}

app.post('/api/se02e05/arxiv', async (req, res) => {
    console.log('Received request');
    const trace = langfuseService.createTrace({ id: `se02e05-${Date.now()}`, name: "arxiv", sessionId: "se02e05" });

    const getArticle = async () => {

        if (!await directoryExists(path.join(__dirname, 'article'))) {
            await fs.mkdir(path.join(__dirname, 'article'), { recursive: true });
        }

        if (await fs.exists(path.join(__dirname, 'article', 'arxiv-draft.html'))) {
            return await fs.readFile(path.join(__dirname, 'article', 'arxiv-draft.html'), 'utf8');
        }

        const response = await fetch(articleUrl);
        const data = await response.text();

        await fs.writeFile(path.join(__dirname, 'article', 'arxiv-draft.html'), data);

        return data;
    }

    const getQuestions = async () => {
        if (!await directoryExists(path.join(__dirname, 'questions'))) {
            await fs.mkdir(path.join(__dirname, 'questions'), { recursive: true });
        }

        if (await fs.exists(path.join(__dirname, 'questions', 'arxiv.txt'))) {
            return await fs.readFile(path.join(__dirname, 'questions', 'arxiv.txt'), 'utf8');
        }

        const response = await fetch(headquarterQuestionsUrl);
        const data = await response.text();

        await fs.writeFile(path.join(__dirname, 'questions', 'arxiv.txt'), data);

        return data;
    }

    const processArticle = async () => {
        const article = await getArticle();
        const root = htmlParse(article);
        const getImagesFromArticle = async (root: HTMLElement) => {
            const images = root.querySelectorAll('img');
            return images.map(img => img.getAttribute('src') || '');
        }
        const getAudioFromArticle = async (root: HTMLElement) => {
            const audio = root.querySelectorAll('audio source');
            return audio.map(audio => audio.getAttribute('src') || '');
        }
        const transcriptAudio = async (filePath: string) => {
            console.log(`Transcripting audio: ${filePath}`);

            if (!await directoryExists(path.join(__dirname, 'audio_transcripts'))) {
                await fs.mkdir(path.join(__dirname, 'audio_transcripts'), { recursive: true });
            }

            if (await fs.exists(path.join(__dirname, 'audio_transcripts', `${filePath}.txt`))) {
                console.log(`Audio transcription already exists`);
                return await fs.readFile(path.join(__dirname, 'audio_transcripts', `${filePath}.txt`), 'utf8');
            }

            const audioBuffer = await fs.readFile(path.join(__dirname, 'audio', filePath));
            const transcription = await openaiService.transcribe(audioBuffer, filePath, 'audio/mpeg');

            await fs.writeFile(path.join(__dirname, 'audio_transcripts', `${filePath}.txt`), transcription);

            langfuseService.createGeneration(
                trace,
                'answer',
                [],
                transcription,
                'whisper-1'
            );

            return transcription;
        }
        const describeImageAsText = async (filePath: string) => {
            console.log(`Describing image: ${filePath}`);

            if (!await directoryExists(path.join(__dirname, 'image_descriptions'))) {
                await fs.mkdir(path.join(__dirname, 'image_descriptions'), { recursive: true });
            }

            if (await fs.exists(path.join(__dirname, 'image_descriptions', `${filePath}.txt`))) {
                console.log(`Image description already exists`);
                return await fs.readFile(path.join(__dirname, 'image_descriptions', `${filePath}.txt`), 'utf8');
            }

            const imageBuffer = await fs.readFile(path.join(__dirname, 'images', filePath));
            const imageBase64 = imageBuffer.toString('base64');

            const messages: ChatCompletionMessageParam[] = [
                {
                    role: "system",
                    content: "You are a helpful assistant that can describe images as text."
                },
                {
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
                        { type: "text", text: "Describe the image as text what is visible in the image and what can be seen. Return ONLY the description, no other text. Describe the image in Polish." }
                    ]
                }
            ];

            const chatCompletion = await openaiService.completion(messages, "gpt-4o", false, false) as OpenAI.Chat.Completions.ChatCompletion;
            const response = chatCompletion.choices[0].message.content ?? '';

            await fs.writeFile(path.join(__dirname, 'image_descriptions', `${filePath}.txt`), response);

            langfuseService.createGeneration(
                trace,
                'answer',
                messages,
                response,
                'gpt-4o'
            );

            return response;
        }
        const downloadAudio = async (audio: string[]) => {
            return Promise.all(audio.map(async (audio) => {
                if (await fs.exists(path.join(__dirname, 'audio', audio))) {
                    console.log(`Audio ${audio} already downloaded`);
                    return;
                }

                console.log(`Downloading audio: ${audio}`);
                const response = await fetch(`${baseUrl}${audio}`);
                const audioBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(audioBuffer);

                const audioName = audio.replace('i/', '');

                if (!await directoryExists(path.join(__dirname, 'audio'))) {
                    await fs.mkdir(path.join(__dirname, 'audio'), { recursive: true });
                }

                await fs.writeFile(path.join(__dirname, 'audio', audioName), buffer);
            }));
        }
        const downloadImages = async (images: string[]) => {
            return Promise.all(images.map(async (imageUrlPath) => {
                const imageName = imageUrlPath.replace('i/', '');
                console.log(`Downloading image: ${imageUrlPath}`);

                if (await fs.exists(path.join(__dirname, 'images', imageName))) {
                    console.log(`Image ${imageName} already downloaded`);
                    return;
                }

                const response = await fetch(`${baseUrl}${imageUrlPath}`);
                const imageBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(imageBuffer);

                if (!await directoryExists(path.join(__dirname, 'images'))) {
                    await fs.mkdir(path.join(__dirname, 'images'), { recursive: true });
                }

                await fs.writeFile(path.join(__dirname, 'images', imageName), buffer);
            }));
        }
        const processAudioFiles = async (audioFiles: string[]) => {
            return Promise.all(audioFiles.map(async (audio) => {
                const audioName = audio.replace('i/', '');
                const transcription = await transcriptAudio(audioName);
                return { audioName, transcription };
            }));
        }
        const processImageFiles = async (imageFiles: string[]) => {
            return Promise.all(imageFiles.map(async (image) => {
                const imageName = image.replace('i/', '');
                const description = await describeImageAsText(imageName);
                return { imageName, description };
            }));
        }

        const imagesFromArticle = await getImagesFromArticle(root);
        const audioFromArticle = await getAudioFromArticle(root);

        await downloadImages(imagesFromArticle);
        await downloadAudio(audioFromArticle);

        const images = await processImageFiles(imagesFromArticle);
        const audio = await processAudioFiles(audioFromArticle);

        const markdown = await convertHTMLToMarkdown(article, images, audio);

        return markdown;
    }

    const answerQuestions = async (article: string, questions: string): Promise<Record<string, string>> => {

        const systemPrompt = await systemPromptDefinition() as ChatCompletionMessageParam;
        const messages: ChatCompletionMessageParam[] = [
            systemPrompt,
            {
                role: "user",
                content: [
                    { type: "text", text: `Article: ${article}` },
                    { type: "text", text: `Answer the following questions: ${questions}` }
                ]
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

        // return 
        const answers = response.split('\n').map(line => {
            const [question, answer] = line.split('=');
            return { question, answer };
        });

        const answersObject = answers.reduce((acc, answer) => {
            acc[answer.question] = answer.answer;
            return acc;
        }, {} as Record<string, string>);

        return answersObject;

    }

    const sendReportToHeadquarter = async (answers: Record<string, string>) => {
        console.log('Starting to send reports to headquarters');

        const report = {
            task: 'arxiv',
            apikey: process.env.PERSONAL_API_KEY,
            answer: answers
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


    const article = await processArticle();
    const questions = await getQuestions();

    const answer = await answerQuestions(article, questions);
    const headquartersResponse = await sendReportToHeadquarter(answer);

    return res.json({ message: "Reports processed successfully", headquartersResponse: headquartersResponse });
});