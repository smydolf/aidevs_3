import express from 'express';
import fs from 'fs';
import { OpenAIService } from '../Shared/OpenAIService';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import systemPromptDefinition from "./context/systemPrompt";
import type OpenAI from 'openai';
import { LangfuseService } from '../Shared/LangfuseService';

const app = express();
const port = 3000;
app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));

interface AnonymizedDataReport {
    task: 'CENZURA',
    apikey: string,
    answer: string
}

class DataAnonymizationService {
    private openaiService: OpenAIService;
    private langfuseService: LangfuseService;
    private trace: any;
    private apiKey: string;
    constructor() {
        this.openaiService = new OpenAIService();
        this.langfuseService = new LangfuseService();
        this.trace = this.langfuseService.createTrace({
            id: `se01e05-${Date.now()}`,
            name: 'cenzura-anonymization',
            sessionId: 'se01e05'
        });
        this.apiKey = process.env.PERSONAL_API_KEY || "";
    }


    private async anonymizeWithAi(data: string): Promise<string> {
        const systemPrompt = await systemPromptDefinition() as ChatCompletionMessageParam;
        const userPrompt = {
            role: "user",
            content: JSON.stringify(data)
        } as ChatCompletionMessageParam;

        const aiResponse = await this.openaiService.completion(
            [systemPrompt, userPrompt],
            'gpt-4o',
            false,
            false
        ) as OpenAI.Chat.Completions.ChatCompletion;

        this.langfuseService.createGeneration(
            this.trace,
            'question-analysis',
            [systemPrompt, userPrompt],
            aiResponse.choices[0].message.content,
            'gpt-4o',
            {
                temperature: 0,
                response_format: { type: "text" }
            }
        );

        const anonymized = aiResponse.choices[0].message.content ?? "";
        console.log("anonymized", anonymized);
        return anonymized;
    }


    private async submitReport(report: AnonymizedDataReport): Promise<string> {
        const reportString = JSON.stringify(report, null, 2);
        fs.writeFileSync('solutions/se01e05/final-report.json', reportString);
        const response = await fetch('https://c3ntrala.ag3nts.org/report ', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: reportString
        });
        return response.text();
    }

    public async anonymize(): Promise<string> {
        try {
            const data = await this.readFile();

            const anonimizedData = await this.anonymizeWithAi(data);

            const report: AnonymizedDataReport = {
                task: "CENZURA",
                apikey: this.apiKey,
                answer: anonimizedData
            };

            const result = await this.submitReport(report);
            await this.langfuseService.shutdownAsync();
            return result;

        } catch (error) {
            console.error('Error anonymizing data:', error);
            throw error;
        }
    }
    private async readFile() {
        const response = await fetch(`https://c3ntrala.ag3nts.org/data/${this.apiKey}/cenzura.txt`);
        const data = await response.text();
        console.log("data", data);
        return data;
    }
}

app.post('/api/se01e05/anonymize-data', async (req, res) => {
    try {
        const dataAnonymizationService = new DataAnonymizationService();
        const result = await dataAnonymizationService.anonymize();
        res.json({ status: 'success', result });
    } catch (error) {
        res.status(500).json({ error: 'Failed to anonymize data' });
    }
});
