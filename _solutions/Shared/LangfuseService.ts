import { Langfuse, LangfuseTraceClient, LangfuseGenerationClient } from 'langfuse';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

interface ModelParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  [key: string]: any;
}

export class LangfuseService {
  private langfuse: Langfuse;

  constructor() {
    this.langfuse = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      baseUrl: process.env.LANGFUSE_HOST
    });

    this.langfuse.on("error", (error: Error) => {
      console.error("Langfuse error:", error);
    });

    if (process.env.NODE_ENV === 'development') {
      this.langfuse.debug();
    }
  }

  createTrace(options: { id: string; name: string; sessionId: string }): LangfuseTraceClient {
    return this.langfuse.trace(options);
  }

  createGeneration(
    trace: LangfuseTraceClient,
    name: string,
    messages: ChatCompletionMessageParam[],
    response: any,
    model: string = 'gpt-4',
    modelParameters?: ModelParameters,
    metadata?: Record<string, any>
  ): LangfuseGenerationClient {
    return trace.generation({
      name,
      model,
      modelParameters: modelParameters || {
        temperature: 0.7,
        maxTokens: 1000,
      },
      input: messages,
      output: response,
      metadata,
    });
  }

  async shutdownAsync(): Promise<void> {
    await this.langfuse.shutdownAsync();
  }
}