import express from 'express';
import fs from 'fs/promises';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import path from 'path';
import TurndownService from 'turndown';
import { OpenAIService } from '../Shared/OpenAIService';
import type OpenAI from 'openai';
import crypto from 'crypto';

const app = express();
const baseUrl = 'https://softo.ag3nts.org';

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});

const openaiService = new OpenAIService();

const maxDepth = 10;

const isRelativeUrl = (url: string) => {
    // Returns true if the url does NOT start with a protocol or double slash
    return !/^(?:[a-z]+:)?\/\//i.test(url);
  }

app.post('/api/se04e03/questions', async (req, res) => {
    const questions = JSON.parse(await fs.readFile(path.join(__dirname, 'questions', 'questions.json'), 'utf8')) as Record<string, string>;

    const findAnswer = async (question: string, url: string, depth: number = 0) => {
        const askQuestionToModel = async (question: string, page: string, visitedPages: string[]) => {
            const messages: ChatCompletionMessageParam[] = [
                {
                    role: "system",
                    content: `You are a helpful assistant that can answer questions about the page. 
                    You are given a question and a page. 
                    You need to answer the question based on the page. 
                    Return hasAnswer: true if you see the answer on the page and it is not a link but the precise answer for the question, false otherwise.
                    If you don't see the answer analyze all links on the page and return the link that you think is the most relevant to the question.
                    Think step by step about question and answer. Validate your answer and check if what you found is the answer to the question.
                    Do not revisit the same page more than once.
                    You have to return the answer in JSON format with the following fields:
                    - hasAnswer: boolean
                    - answer: string
                    - nextPotentialUrl: string
                    `
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: question },
                        { type: "text", text: page },
                        { type: "text", text: `You have already visited the following pages: ${visitedPages.join(', ')}` },
                    ]
                }
            ];

            const chatCompletion = await openaiService.completion(messages, "gpt-4.1-mini", false, true) as OpenAI.Chat.Completions.ChatCompletion;
            const response = chatCompletion.choices[0].message.content ?? '{}';

            return JSON.parse(response) as { hasAnswer: boolean, answer: string, nextPotentialUrl: string };
        }
        const visitedPages: string[] = [url];
        // check if page is already indexed in indexedPages
        let page: string | null = null;
        // if url is relative then add baseUrl to it otherwise use it as is
        const fullUrl = isRelativeUrl(url) ? `${baseUrl}${url}` : url;
        const filename = crypto.createHash('md5').update(fullUrl).digest('hex');
        const filePath = path.join(__dirname, 'indexedPages', `${filename}.md`);
        if (await fs.exists(filePath)) {
            console.log(`Page ${fullUrl} is already indexed`);
            page = await fs.readFile(filePath, 'utf8');
        } else {
            console.log(`Page ${fullUrl} is not indexed, fetching...`);
            const response = await fetch(fullUrl);
            const html = await response.text();
            const turndownService = new TurndownService();
            const markdown = turndownService.turndown(html);
            console.log(`Page ${fullUrl} is converted to markdown`);
            await fs.writeFile(filePath, markdown);
            console.log(`Page ${fullUrl} is indexed`);
            page = markdown;
        }

        const { hasAnswer, answer, nextPotentialUrl } = await askQuestionToModel(question, page, visitedPages);
        console.log(`Question ${question} has answer: ${hasAnswer}, answer: ${answer}, nextPotentialUrl: ${nextPotentialUrl}`);

        if (hasAnswer) {
            return answer;
        }

        if (depth > maxDepth) {
            throw new Error('Max depth reached');
        }

        return await findAnswer(question, nextPotentialUrl, depth + 1);
    }

    const answers: Record<string, string> = {};

    const sendDataToHeadquarter = async (answers: Record<string, string>) => {
        const report = {
            task: 'softo',
            apikey: process.env.PERSONAL_API_KEY,
            answer: answers,
        }

        console.log(report);

        const response = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(report)
        });

        return await response.text();
    }


    for (const [index, question] of Object.entries(questions)) {
        const answerFilePath = path.join(__dirname, 'answers', `${index}.txt`);
        if (await fs.exists(answerFilePath)) {
            answers[index] = await fs.readFile(answerFilePath, 'utf8');
            continue;
        }

        const answer = await findAnswer(question, '#');
        answers[index] = answer;

        await fs.writeFile(path.join(__dirname, 'answers', `${index}.txt`), answer);
    }

    const response = await sendDataToHeadquarter(answers);

    res.json({ message: response });
});