/**
 * Test runner entry point.
 *
 * Usage:
 *   node --import tsx tests/run.ts <test_name>
 *
 * Example:
 *   node --import tsx tests/run.ts chat_app
 *   node --import tsx tests/run.ts notes_app
 *
 * Reads API keys from config.json in the repo root (same file the goblin uses).
 * Spawns a fresh goblin into a temp directory for each run so tests never
 * interfere with each other or with the real goblin-root.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Agent } from "../src/agent/agent.js";
import { AnthropicLLM } from "../src/agent/anthropic-llm.js";
import { OpenAILLM } from "../src/agent/openai-llm.js";
import { GoblinRunner } from "./goblin_runner.js";
import { createTestTools } from "./tools.js";
import { chatAppTest } from "./definitions/chat_app.js";
import { notesAppTest } from "./definitions/notes_app.js";

const TESTS: Record<string, { name: string; description: string }> = {
  chat_app: chatAppTest,
  notes_app: notesAppTest,
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(HERE);

async function main(): Promise<void> {
  const testName = process.argv[2];

  if (!testName) {
    console.error("Usage: node --import tsx tests/run.ts <test_name>");
    console.error(`Available tests: ${Object.keys(TESTS).join(", ")}`);
    process.exit(1);
  }

  const testDef = TESTS[testName];
  if (!testDef) {
    console.error(`Unknown test "${testName}". Available: ${Object.keys(TESTS).join(", ")}`);
    process.exit(1);
  }

  const configRaw = await readFile(path.join(REPO_ROOT, "config.json"), "utf8");
  const config = JSON.parse(configRaw) as {
    anthropicApiKey?: string;
    openaiApiKey?: string;
  };

  const runner = new GoblinRunner({
    anthropicApiKey: config.anthropicApiKey,
    openaiApiKey: config.openaiApiKey,
  });

  let llm;
  if (config.anthropicApiKey) {
    llm = new AnthropicLLM({ apiKey: config.anthropicApiKey });
  } else if (config.openaiApiKey) {
    llm = new OpenAILLM({ apiKey: config.openaiApiKey });
  } else {
    throw new Error("config.json must include anthropicApiKey or openaiApiKey");
  }

  const systemPrompt =
    "You are an automated tester for the Goblin system — an AI-powered runtime " +
    "that builds and runs applications on demand. Your job is to rigorously test " +
    "goblin's ability to build a specific application by driving it with instructions, " +
    "then verifying the resulting app actually works via HTTP requests and file inspection. " +
    "Be methodical: build incrementally, test each step before moving on, and conclude " +
    "with a clear PASS or FAIL verdict backed by specific evidence.";

  const tools = createTestTools(runner);
  const agent = new Agent(llm, tools, systemPrompt);

  // Run the agent loop in the background; drive it with a single ask().
  void agent.runAgentLoop();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Running test: ${testDef.name}`);
  console.log("=".repeat(60) + "\n");

  let result: string;
  try {
    result = await agent.ask(testDef.description);
  } finally {
    // Always clean up the goblin process even if the agent throws.
    await runner.stop().catch(() => {});
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Test result:");
  console.log("=".repeat(60));
  console.log(result);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
