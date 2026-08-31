import OpenAI from "openai";
import type {
	ChatCompletion,
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { AppConfig } from "./config.js";

export type { ChatCompletionMessageParam, ChatCompletionTool };

export function createLlm(config: AppConfig): OpenAI {
	return new OpenAI({
		baseURL: config.litellmBaseUrl,
		apiKey: config.litellmApiKey,
	});
}

export async function chatWithTools(
	llm: OpenAI,
	model: string,
	messages: ChatCompletionMessageParam[],
	tools: ChatCompletionTool[],
): Promise<ChatCompletion> {
	return llm.chat.completions.create({
		model,
		messages,
		tools: tools.length > 0 ? tools : undefined,
		tool_choice: tools.length > 0 ? "auto" : undefined,
	});
}
