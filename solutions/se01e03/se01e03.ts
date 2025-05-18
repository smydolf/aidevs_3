import express from 'express';
import fs from 'fs';
import { evaluate } from 'mathjs';
import { OpenAIService } from '../Shared/OpenAIService';
import { LangfuseService } from './LangfuseService';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import systemPromptDefinition from "./context/systemPrompt";
import type OpenAI from 'openai';

const app = express();
const port = 3000;
app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));

interface BasicQuestion {
    id: number;
    question: string,
    answer: number
}

interface ExtendedQuestion extends BasicQuestion {
    test: {
        q: string,
        a: string
    }
}

interface CalibrationFile {
    apikey: string,
    description: string,
    copyright: string,
    'test-data': (BasicQuestion | ExtendedQuestion)[]
}

interface FinalReport {
    task: string,
    apikey: string,
    answer: CalibrationFile
}

class CalibrationService {
    private openaiService: OpenAIService;
    private langfuseService: LangfuseService;
    private trace: any;

    constructor() {
        this.openaiService = new OpenAIService();
        this.langfuseService = new LangfuseService();
        this.trace = this.langfuseService.createTrace({
            id: `se01e03-${Date.now()}`,
            name: 'android-calibration-analysis',
            sessionId: 'se01e03'
        });
    }

    private isExtendedQuestion(test: BasicQuestion | ExtendedQuestion): test is ExtendedQuestion {
        return 'test' in test;
    }

    private readCalibrationFile(filePath: string): CalibrationFile {
        const file = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(file) as CalibrationFile;
        data.apikey = process.env.PERSONAL_API_KEY || "";
        return data;
    }

    private async evaluateQuestions(data: CalibrationFile) {
        const questions: ExtendedQuestion[] = [];

        data['test-data'].forEach((test, index) => {
            test.id = index;
            test.answer = evaluate(test.question);

            if (this.isExtendedQuestion(test)) {
                questions.push({ ...test });
            }
        });

        const aiResults = await this.analyzeQuestionsWithAI(questions);

        return this.updateCalibrationData(data, aiResults.response);

    }

    private async analyzeQuestionsWithAI(questions: ExtendedQuestion[]): Promise<{ response: ExtendedQuestion[] }> {
        const systemPrompt = await systemPromptDefinition() as ChatCompletionMessageParam;
        const userPrompt = {
            role: "user",
            content: JSON.stringify(questions)
        } as ChatCompletionMessageParam;

        const aiResponse = await this.openaiService.completion(
            [systemPrompt, userPrompt],
            'gpt-4o',
            false,
            true
        ) as OpenAI.Chat.Completions.ChatCompletion;

        this.langfuseService.createGeneration(
            this.trace,
            'question-analysis',
            [systemPrompt, userPrompt],
            aiResponse.choices[0].message.content,
            'gpt-4o',
            {
                temperature: 0,
                response_format: { type: "json_object" }
            }
        );

        return JSON.parse(aiResponse.choices[0].message.content || '{}') as { response: ExtendedQuestion[] };
    }

    private updateCalibrationData(data: CalibrationFile, aiResults: ExtendedQuestion[]) {
        data['test-data'] = data['test-data'].map(test => {
            if (this.isExtendedQuestion(test)) {
                const result = aiResults.find(question => question.id === test.id);
                if (result) {
                    return {
                        question: result.question,
                        answer: result.answer,
                        test: result.test
                    } as ExtendedQuestion;
                }
            }
            return {
                question: test.question,
                answer: test.answer
            } as BasicQuestion;
        });

        return data;
    }
    private async submitReport(report: FinalReport): Promise<string> {
        fs.writeFileSync('solutions/se01e03/final-report.json', JSON.stringify(report, null, 2));
        const response = await fetch('https://c3ntrala.ag3nts.org/report ', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report)
        });
        return response.text();
    }

    public async processCalibrationFile(): Promise<string> {
        try {
            const data = this.readCalibrationFile('solutions/se01e03/android-calibration-file.json');

            const updatedData = await this.evaluateQuestions(data);

            const report: FinalReport = {
                task: "JSON",
                apikey: updatedData.apikey,
                answer: updatedData
            };

            fs.writeFileSync('solutions/se01e03/final-report.json', JSON.stringify(report, null, 2));

            const result = await this.submitReport(report);
            await this.langfuseService.shutdownAsync();
            return result;

        } catch (error) {
            console.error('Error processing calibration file:', error);
            throw error;
        }
    }
}

app.post('/api/se01e03/parse-android-calibration-file', async (req, res) => {
    try {
        const calibrationService = new CalibrationService();
        const result = await calibrationService.processCalibrationFile();
        res.json({ status: 'success', result });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process calibration file' });
    }
});
