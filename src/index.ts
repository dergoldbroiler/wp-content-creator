import { loadConfig } from "./config.js";
import { runAgent } from "./orchestrator.js";

async function main(): Promise<void> {
	const prompt = process.argv.slice(2).join(" ").trim();
	if (!prompt) {
		process.stderr.write('Usage: npm start -- "Dein Prompt"\n');
		process.exitCode = 1;
		return;
	}

	const config = loadConfig();
	const answer = await runAgent(config, prompt);
	process.stdout.write(`${answer}\n`);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`Fehler: ${message}\n`);
	process.exitCode = 1;
});
