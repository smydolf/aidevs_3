import express from 'express';
import { OpenAIService } from '../Shared/OpenAIService';
import systemPromptDefinition from "./context/systemPrompt";
import type { ChatCompletionMessageParam } from 'ai/prompts';
import type OpenAI from 'openai';

const app = express();
const port = 3000;
app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/fool-robots requests`));


interface ResponseType {
    msgID: string,
    text: string
}


app.post('/api/se01e02/fool-robots', async (req, res) => {

    console.log('Received request');
    console.log('Initializing verification');
    const openaiService = new OpenAIService()


    const response = await fetch('https://xyz.ag3nts.org/verify ', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "text": "READY",
            "msgID": 0
        })
    });

    const jsonResponse = await response.json() as ResponseType;
    console.log('Verification response:', jsonResponse);

    const systemPrompt: ChatCompletionMessageParam = await systemPromptDefinition();

    const userPrompt: ChatCompletionMessageParam = {
        role: "user",
        content: `${jsonResponse.text}`
    };

    const aiResponse = await openaiService.completion([systemPrompt, userPrompt], 'gpt-4o', false, false) as OpenAI.Chat.Completions.ChatCompletion;

    const result = aiResponse.choices[0].message.content;
    console.log('AI response:', result);


    const authResponse = await fetch('https://xyz.ag3nts.org/verify ', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "text": result,
            "msgID": jsonResponse.msgID
        })
    });

    console.log('Auth response:', await authResponse.text());
});


