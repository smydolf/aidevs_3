import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { CreateEmbeddingResponse } from "openai/resources/embeddings.mjs";

export class OpenAIService {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI();
    }

    async transcribe(file: Buffer, name: string, type: string): Promise<string> {
        const transcription = await this.openai.audio.transcriptions.create({
            file: new File([file], name, { type: type }),
            model: "whisper-1"
        });
        return transcription.text;
    }
    async completion(
        messages: ChatCompletionMessageParam[],
        model: string = "gpt-4.1-mini",
        stream: boolean = false,
        jsonMode: boolean = false,
        temperature: number = 0.5,
        maxTokens: number = 1024
    ): Promise<OpenAI.Chat.Completions.ChatCompletion | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
        try {
            const chatCompletion = await this.openai.chat.completions.create({
                messages,
                model: model,
                stream,
                response_format: jsonMode ? { type: "json_object" } : { type: "text" },
                temperature: temperature,
                max_tokens: maxTokens
            });

            if (stream) {
                return chatCompletion as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
            } else {
                return chatCompletion as OpenAI.Chat.Completions.ChatCompletion;
            }
        } catch (error) {
            console.error("Error in OpenAI completion:", error);
            throw error;
        }
    }

    async createEmbedding(text: string): Promise<number[]> {
        try {
            const response: CreateEmbeddingResponse = await this.openai.embeddings.create({
                model: "text-embedding-3-large",
                input: text,
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error("Error creating embedding:", error);
            throw error;
        }
    }
}


