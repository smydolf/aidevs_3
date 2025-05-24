import fs from 'fs/promises';
import express from 'express';
import { OpenAIService } from '../Shared/OpenAIService';
import path from 'path';
import { LangfuseService } from '../Shared/LangfuseService';
import systemPromptDefinition from './context/systemPrompt';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type OpenAI from 'openai';

const app = express();
const port = 3000;

const langfuseService = new LangfuseService();
const openaiService = new OpenAIService();

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));


app.post('/api/se02e01/find-street', async (req, res) => {
    const trace = langfuseService.createTrace({ id: `se02e01-${Date.now()}`, name: "transcription", sessionId: "se02e01" });
    const loadAudioFile = async (filePath: string) => {
        const audioFile = await fs.readFile(filePath);
        return audioFile;
    }

    const transcribeAudioFile = async (audioFile: Buffer, name: string, type: string) => {
        const transcription = await openaiService.transcribe(audioFile, name, type);
        return transcription;
    }

    const getTranscription = async () => {
        const transcriptionPath = path.join(__dirname, 'mergedTranscription.txt');

        if (await fs.exists(transcriptionPath)) {
            const existingTranscription = await fs.readFile(transcriptionPath, 'utf-8');
            console.log("Using existing transcription file");
            return existingTranscription;
        } else {

            const interrogationsDir = path.join(__dirname, '/interrogations');
            const audioFiles = await fs.readdir(interrogationsDir);

            const transcribedFiles = await Promise.all(audioFiles.map(async (file) => {
                const audioFile = await loadAudioFile(`${interrogationsDir}/${file}`);
                console.log(`Transcribing ${file}`);
                var transcription = await transcribeAudioFile(audioFile, file, 'audio/m4a');

                langfuseService.createGeneration(
                    trace,
                    'transcription',
                    [
                        { role: 'user', content: file }
                    ],
                    transcription,
                    'whisper-1'
                );

                return {
                    file,
                    transcription,
                }
            }));

            const mergedTranscription = transcribedFiles.map((file) => {
                return `[START OF TRANSCRIPTION] [FILE NAME]${file.file} [TRANSCRIPTION]${file.transcription} [END OF TRANSCRIPTION]`;
            }).join('\n');

            await fs.writeFile(path.join(__dirname, 'mergedTranscription.txt'), mergedTranscription);

            return mergedTranscription;
        }
    }

    const transcription = await getTranscription();

    const systemPrompt = await systemPromptDefinition() as ChatCompletionMessageParam;

    console.log("Processing answer");
    const answer = await openaiService.completion([

        systemPrompt,
        {
            role: 'user',
            content: transcription
        }

    ]) as OpenAI.Chat.Completions.ChatCompletion;

    const response = answer.choices[0].message.content ?? '';

    langfuseService.createGeneration(
        trace,
        'answer',
        [
            { role: 'system', content: systemPrompt.content?.toString() ?? '' },
            { role: 'user', content: transcription }
        ],
        response,
        'gpt-4o'
    );

    console.log("Answer found by LLM is:", response);

    const report = {
        task: 'mp3',
        apikey: process.env.PERSONAL_API_KEY,
        answer: response
    }

    const headquartersResponse = await fetch('https://c3ntrala.ag3nts.org/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
    });

    console.log("Report sent");

    const headquartersResponseText = await headquartersResponse.text();
    console.log("Response from headquarters:", headquartersResponseText);


    await langfuseService.shutdownAsync();
    return res.json(headquartersResponseText)

});