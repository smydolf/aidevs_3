import FirecrawlApp from "@mendable/firecrawl-js";
import { OpenAIService } from "../Shared/OpenAIService";
import type { ChatCompletionMessageParam } from "ai/prompts";
import systemPromptDefinition from "./question";
import type OpenAI from "openai";


export class PageScrapper {
    private firecrawlApp: FirecrawlApp;
    private openaiService: OpenAIService;


    constructor() {
        this.firecrawlApp = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY || '' });
        this.openaiService = new OpenAIService()
    }

    async findQuestion() {
        console.log('Finding question');
        const url = "https://xyz.ag3nts.org/";
        const result = await this.firecrawlApp.scrapeUrl(url, { formats: ['markdown'] });

        const question = this.extractQuestion(result.markdown);
        console.log('Question found:', question);

        return question;
    }

    async solveQuestion(question: string) {
        const systemPrompt: ChatCompletionMessageParam = await systemPromptDefinition();

        console.log('systemPrompt:', systemPrompt);


        const userPrompt: ChatCompletionMessageParam = {
            role: "user",
            content: `${question}`
        };

        console.log('userPrompt:', userPrompt);

        const response = await this.openaiService.completion([systemPrompt, userPrompt], 'gpt-4o', false, false) as OpenAI.Chat.Completions.ChatCompletion;

        const result = response.choices[0].message.content;
        console.log('response:', result);

        return result;

    }

    private extractQuestion(markdownContent: string): string | null {
        const lines = markdownContent.split('\n');

        const questionIndex = lines.findIndex(line => line.trim() === 'Question:');

        if (questionIndex === -1) return null;

        for (let i = questionIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && line.endsWith('?')) {
                return line;
            }
        }

        return null;
    }
}