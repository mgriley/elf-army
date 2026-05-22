import { AnthropicLLM } from "./anthropic-llm.js";
import { AsyncQueue } from "./async-queue.js";
import type { ElfConfig } from "./elf-lib.js";
import type { LLM, Message } from "./llm.js";
import { OpenAILLM } from "./openai-llm.js";

export class Agent {
  private readonly llm: LLM;
  private readonly history: Message[] = [];
  private readonly inbox = new AsyncQueue<string>();

  constructor(llm: LLM) {
    this.llm = llm;
  }

  /**
   * Build an Agent from an `ElfConfig`. Anthropic is preferred when both
   * keys are present; throws if neither is set.
   */
  static createAgent(config: ElfConfig): Agent {
    if (config.anthropicApiKey) {
      return new Agent(new AnthropicLLM({ apiKey: config.anthropicApiKey }));
    }
    if (config.openaiApiKey) {
      return new Agent(new OpenAILLM({ apiKey: config.openaiApiKey }));
    }
    throw new Error(
      "Agent.createAgent: ElfConfig must include anthropicApiKey or openaiApiKey.",
    );
  }

  /** Append a message to the inbox; runAgentLoop will pick it up. */
  async queueMessage(message: string): Promise<void> {
    this.inbox.push(message);
  }

  /** Forever: take next inbox message, send to the LLM, store the reply. */
  async runAgentLoop(): Promise<void> {
    console.log(`Running the agent loop! Waiting for messages...`);
    while (true) {
      const incoming = await this.inbox.pop();
      this.history.push({ role: "user", content: incoming });

      const response = await this.llm.complete({ messages: this.history });

      const assistantMessage: Message = {
        role: "assistant",
        content: response.text,
      };
      if (response.toolCalls?.length) {
        assistantMessage.toolCalls = response.toolCalls;
      }
      this.history.push(assistantMessage);

      console.log(`[agent] ${response.text}`);
    }
  }
}
