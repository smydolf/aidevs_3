import express from 'express';
import { LangfuseService } from '../Shared/LangfuseService';
import { OpenAIService } from '../Shared/OpenAIService';
import path from 'path';
import fs from 'fs/promises';
import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'ai/prompts';
import systemPromptDefinition from './context/systemPrompt';

const app = express();
const port = 3000;

app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/se03e01/reports requests`));

const langfuseService = new LangfuseService();
const openaiService = new OpenAIService();

app.post('/api/se03e01/reports', async (req, res) => {
    console.log('Received request');
    const trace = langfuseService.createTrace({ id: `se03e01-${Date.now()}`, name: "reports", sessionId: "se03e01" });

    const analyzeFacts = async () => {
        const analyzeFact = async (fact: string) => {
            const systemPrompt = `
                You are a helpful assistant that analyzes facts and extracts the key facts.
                The key facts are: people, places, events, occupations, names of people, etc.
                Return the key facts in a structured format which is comma separated list of facts.
                It has to be in Polish.
                It has to be in nominative case.
            `;

            const userPrompt = `
                Analyze the following fact:
                ${fact}
            `;

            const response = await openaiService.completion([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]) as OpenAI.Chat.Completions.ChatCompletion;

            const contentResponse = response.choices[0].message.content ?? '';

            langfuseService.createGeneration(
                trace,
                'answer',
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                contentResponse,
                'gpt-4.1-mini'
            );

            return {
                fact,
                keyFacts: contentResponse
            }
        }

        const analyze = async (fact: string) => {
            console.log(`Analyzing fact: ${fact}`);

            if (await fs.exists(path.join(__dirname, 'reports', 'facts', 'analyzed', fact))) {
                console.log(`Fact already analyzed: ${fact}`);
                return;
            }

            const factContent = await fs.readFile(path.join(__dirname, 'reports', 'facts', fact), 'utf8');

            const analyzedFact = await analyzeFact(factContent);

            console.log(`Analyzed fact: ${analyzedFact.keyFacts}`);

            await fs.writeFile(path.join(__dirname, 'reports', 'facts', 'analyzed', fact), analyzedFact.keyFacts);
        }

        const facts = (await fs.readdir(path.join(__dirname, 'reports', 'facts'))).filter(file => file.endsWith('.txt'));

        await Promise.all(facts.map(analyze));
    }

    const analyzeReports = async () => {
        const keyWordsForReport = async (report: string, facts: { fact: string, content: string }[]) => {
            console.log(`Analyzing report: ${report}`);
            const reportContent = await fs.readFile(path.join(__dirname, 'reports', report), 'utf8');

            const systemPrompt = await systemPromptDefinition() as ChatCompletionMessageParam;

            const userPrompt = `
                Analyze the following report:
                ${reportContent}
                Report title: ${report}
                Facts: ${facts.map(fact => `Fact: ${fact.fact} - ${fact.content}`).join('\n')}
            `;

            const response = await openaiService.completion([
                systemPrompt,
                { role: 'user', content: userPrompt }
            ]) as OpenAI.Chat.Completions.ChatCompletion;

            const contentResponse = response.choices[0].message.content ?? '';

            langfuseService.createGeneration(
                trace,
                'answer',
                [
                    systemPrompt,
                    { role: 'user', content: userPrompt }
                ],
                contentResponse,
                'gpt-4.1-mini'
            );

            return contentResponse
        }

        const allFacts = (await fs.readdir(path.join(__dirname, 'reports', 'facts', 'analyzed'))).filter(file => file.endsWith('.txt'));
        const factsContent = await Promise.all(allFacts.map(async fact => ({
            fact: fact,
            content: await fs.readFile(path.join(__dirname, 'reports', 'facts', 'analyzed', fact), 'utf8')
        })));

        const reports = (await fs.readdir(path.join(__dirname, 'reports'))).filter(file => file.endsWith('.txt'));

        const keyWordsForReports = [];
        for (const report of reports) {
            const keyWords = await keyWordsForReport(report, factsContent);
            keyWordsForReports.push({
                report,
                keyWords: keyWords
            });
        }

        return keyWordsForReports;
    }

    const sendDataToHeadquarter = async (data: { report: string, keyWords: string }[]) => {


        const answer = data.sort((a, b) => a.report.localeCompare(b.report)).reduce((acc, item) => {
            acc[item.report] = item.keyWords;
            return acc;
        }, {} as Record<string, string>)
        console.log(`Sending data to headquarter: ${JSON.stringify(answer)}`);

        const report = {
            task: 'dokumenty',
            apikey: process.env.PERSONAL_API_KEY,
            answer: answer,
        }

        const headquartersResponse = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(report)
        });

        return await headquartersResponse.text();
    }

    await analyzeFacts();
    const dataForReports = await analyzeReports();
    const headquartersResponse = await sendDataToHeadquarter(dataForReports);

    res.status(200).send({ message: 'Reports analyzed', headquartersResponse: headquartersResponse });
})