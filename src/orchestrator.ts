import type {
	ChatCompletion,
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { AppConfig } from "./config.js";
import { chatWithTools, createLlm } from "./llm.js";
import { WordPressMcpClient, type McpToolDef } from "./mcp.js";

const SYSTEM_PROMPT = `Du bist ein Assistent mit Zugriff auf WordPress über MCP-Tools.
Nutze die verfügbaren Tools, wenn sie helfen, die Nutzerfrage zu beantworten.
Antworte auf Deutsch, wenn der Nutzer auf Deutsch fragt.`;

export async function runAgent(config: AppConfig, prompt: string): Promise<string> {
	const mcp = new WordPressMcpClient(config);
	const llm = createLlm(config);

	try {
		process.stderr.write("Verbinde mit WordPress-MCP-Server…\n");
		await mcp.connect();

		process.stderr.write("Lade MCP-Tools…\n");
		const mcpTools = await mcp.listTools();
		process.stderr.write(
			`Gefunden: ${mcpTools.length} Tool(s): ${mcpTools.map((tool) => tool.name).join(", ")}\n`,
		);

		const { openaiTools, toMcpName } = mapTools(mcpTools);
		const messages: ChatCompletionMessageParam[] = [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: prompt },
		];

		for (let round = 1; round <= config.maxToolRounds; round += 1) {
			process.stderr.write(`LLM-Runde ${round}/${config.maxToolRounds}…\n`);
			let completion: ChatCompletion;
			try {
				completion = await chatWithTools(llm, config.litellmModel, messages, openaiTools);
			} catch (error) {
				const cause = error instanceof Error ? error.message : String(error);
				throw new Error(
					`LiteLLM unter ${config.litellmBaseUrl} (Modell ${config.litellmModel}) nicht erreichbar: ${cause}`,
				);
			}
			const choice = completion.choices[0];
			if (!choice) {
				throw new Error("LiteLLM hat keine Choice zurückgegeben.");
			}

			const message = choice.message;
			messages.push({
				role: "assistant",
				content: message.content,
				tool_calls: message.tool_calls,
			});

			const toolCalls = message.tool_calls ?? [];
			if (toolCalls.length === 0) {
				if (choice.finish_reason === "length") {
					throw new Error("Antwort wurde abgeschnitten (finish_reason=length).");
				}
				const text = message.content?.trim();
				if (!text) {
					throw new Error("Modell hat weder Text noch Tool-Calls geliefert.");
				}
				return text;
			}

			for (const call of toolCalls) {
				if (call.type !== "function") {
					continue;
				}

				const mcpName = toMcpName(call.function.name);
				let args: Record<string, unknown> = {};
				try {
					args = call.function.arguments
						? (JSON.parse(call.function.arguments) as Record<string, unknown>)
						: {};
				} catch {
					args = {};
				}

				process.stderr.write(`Tool-Call: ${mcpName} ${truncate(JSON.stringify(args), 200)}\n`);
				const result = await mcp.callTool(mcpName, args);
				process.stderr.write(`Tool-Ergebnis: ${truncate(result, 300)}\n`);

				messages.push({
					role: "tool",
					tool_call_id: call.id,
					content: result,
				});
			}
		}

		throw new Error(`Abbruch: MAX_TOOL_ROUNDS (${config.maxToolRounds}) erreicht.`);
	} finally {
		await mcp.close();
	}
}

function mapTools(tools: McpToolDef[]): {
	openaiTools: ChatCompletionTool[];
	toMcpName: (openaiName: string) => string;
} {
	const openaiToMcp = new Map<string, string>();
	const used = new Set<string>();

	const openaiTools: ChatCompletionTool[] = tools.map((tool) => {
		let openaiName = tool.name.replaceAll("/", "__");
		if (used.has(openaiName)) {
			let suffix = 2;
			while (used.has(`${openaiName}_${suffix}`)) {
				suffix += 1;
			}
			openaiName = `${openaiName}_${suffix}`;
		}
		used.add(openaiName);
		openaiToMcp.set(openaiName, tool.name);

		return {
			type: "function",
			function: {
				name: openaiName,
				description: tool.description,
				parameters: tool.inputSchema,
			},
		};
	});

	return {
		openaiTools,
		toMcpName: (openaiName: string) =>
			openaiToMcp.get(openaiName) ?? openaiName.replaceAll("__", "/"),
	};
}

function truncate(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max)}…`;
}
