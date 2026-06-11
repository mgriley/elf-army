/**
 * Manages the lifecycle of a goblin child process for testing.
 *
 * Spawns a fresh goblin with a temp root dir, pipes stdin/stdout so the test
 * tools can send messages and read responses, and exposes a clean
 * waitForAfter-based protocol so callers can collect output turn-by-turn.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(HERE);
const MAIN_SCRIPT = path.join(REPO_ROOT, "src", "main.ts");

/** API keys forwarded to the spawned goblin's config.json. */
export interface GoblinApiConfig {
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

export class GoblinRunner extends EventEmitter {
  private child: ChildProcess | null = null;
  private collected = "";
  private _rootDir = "";

  constructor(private readonly apiConfig: GoblinApiConfig) {
    super();
  }

  get rootDir(): string {
    return this._rootDir;
  }

  get isRunning(): boolean {
    return this.child !== null;
  }

  /**
   * Spawn a goblin into a fresh temp directory and wait until the CLI prompt
   * appears, which means the process is up and ready for messages.
   */
  async start(): Promise<void> {
    if (this.child) throw new Error("Goblin is already running");

    const testDir = await mkdtemp(path.join(tmpdir(), "goblin-test-"));
    this._rootDir = path.join(testDir, "goblin-root");

    await writeFile(
      path.join(testDir, "config.json"),
      JSON.stringify({ rootDir: this._rootDir, ...this.apiConfig }, null, 2),
    );

    this.child = spawn("node", ["--import", "tsx", MAIN_SCRIPT], {
      cwd: testDir,
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env },
    });

    this.child.stdout!.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      this.collected += text;
      process.stdout.write(text);
      this.emit("data");
    });

    this.child.on("exit", (code) => {
      this.child = null;
      this.emit("exit", code);
    });

    await this.waitForAfter(0, "> ");
  }

  /**
   * Send a message to the goblin's stdin CLI and collect all stdout output
   * until the next prompt character appears. Returns the raw output block,
   * which includes any logging and the agent's final reply text.
   */
  async sendMessage(message: string): Promise<string> {
    if (!this.child) throw new Error("Goblin is not running — call start() first");
    const startPos = this.collected.length;
    this.child.stdin!.write(message + "\n");
    await this.waitForAfter(startPos, "> ");
    return this.collected.slice(startPos);
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    this.child.kill();
    await new Promise<void>((resolve) => {
      this.child!.once("exit", () => resolve());
    });
    this.child = null;
  }

  /**
   * Resolves once `token` appears anywhere in collected stdout after `pos`.
   * Safe to call while data is still arriving.
   */
  private waitForAfter(pos: number, token: string): Promise<void> {
    return new Promise((resolve) => {
      const check = () => this.collected.slice(pos).includes(token);
      if (check()) {
        resolve();
        return;
      }
      const onData = () => {
        if (check()) {
          this.removeListener("data", onData);
          resolve();
        }
      };
      this.on("data", onData);
    });
  }
}
