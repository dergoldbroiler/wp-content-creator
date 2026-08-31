import "dotenv/config";

export type AppConfig = {
	mcpUrl: string;
	wpUser: string;
	wpAppPassword: string;
	litellmBaseUrl: string;
	litellmApiKey: string;
	litellmModel: string;
	maxToolRounds: number;
};

export function loadConfig(): AppConfig {
	const maxToolRoundsRaw = process.env.MAX_TOOL_ROUNDS?.trim();
	const maxToolRounds = maxToolRoundsRaw ? Number(maxToolRoundsRaw) : 10;
	if (!Number.isInteger(maxToolRounds) || maxToolRounds < 1) {
		throw new Error("MAX_TOOL_ROUNDS muss eine ganze Zahl >= 1 sein.");
	}

	return {
		mcpUrl: optional(
			"MCP_URL",
			"https://demos.dergoldbroiler.de/wp-json/mcp/mcp-adapter-default-server",
		),
		wpUser: required("WP_USER"),
		wpAppPassword: required("WP_APP_PASSWORD"),
		litellmBaseUrl: optional("LITELLM_BASE_URL", "http://localhost:4000/v1"),
		litellmApiKey: optional("LITELLM_API_KEY", "sk-local"),
		litellmModel: required("LITELLM_MODEL"),
		maxToolRounds,
	};
}

function required(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Umgebungsvariable ${name} fehlt. Siehe .env.example.`);
	}
	return value;
}

function optional(name: string, fallback: string): string {
	const value = process.env[name]?.trim();
	return value || fallback;
}
