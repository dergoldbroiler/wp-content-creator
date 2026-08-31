import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AppConfig } from "./config.js";

export type McpToolDef = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
};

export class WordPressMcpClient {
	private client: Client | null = null;

	constructor(private readonly config: AppConfig) {}

	async connect(): Promise<void> {
		const auth = Buffer.from(
			`${this.config.wpUser}:${this.config.wpAppPassword}`,
		).toString("base64");

		const transport = new StreamableHTTPClientTransport(new URL(this.config.mcpUrl), {
			requestInit: {
				headers: {
					Authorization: `Basic ${auth}`,
				},
			},
		});

		const client = new Client({
			name: "wp-content-creator",
			version: "0.1.0",
		});

		await client.connect(transport);
		this.client = client;
	}

	async listTools(): Promise<McpToolDef[]> {
		const { tools } = await this.requireClient().listTools();
		return tools.map((tool) => ({
			name: tool.name,
			description: tool.description ?? "",
			inputSchema: (tool.inputSchema ?? {
				type: "object",
				properties: {},
			}) as Record<string, unknown>,
		}));
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<string> {
		const result = await this.requireClient().callTool({
			name,
			arguments: args,
		});

		const text = stringifyContent(result.content);
		if (result.isError) {
			return `Tool-Fehler: ${text}`;
		}
		return text;
	}

	async close(): Promise<void> {
		if (!this.client) {
			return;
		}
		await this.client.close();
		this.client = null;
	}

	private requireClient(): Client {
		if (!this.client) {
			throw new Error("MCP-Client ist nicht verbunden.");
		}
		return this.client;
	}
}

function stringifyContent(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return JSON.stringify(content);
	}

	const parts = content.map((part) => {
		if (
			part &&
			typeof part === "object" &&
			"type" in part &&
			part.type === "text" &&
			"text" in part
		) {
			return String(part.text);
		}
		return JSON.stringify(part);
	});

	return parts.join("\n") || JSON.stringify(content);
}
