import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const LOG_FILE = "event_log.txt";
const MAX_BYTES = 512 * 1024; // 512 KB

/**
 * A simple logger that actors use to log events to a file in their
 * actor-directory. It is inspectable in the inspector UI.
 * 
 * Meant to be a human-readable log of what the actor is up to.
 */
export class Logger {
  private static instance: Logger | null = null;

  private readonly logPath: string;
  // Serialise all writes: each logEvent chains onto this promise.
  private queue: Promise<void> = Promise.resolve();

  private constructor(elfDir: string) {
    this.logPath = path.join(elfDir, LOG_FILE);
  }

  static init(elfDir: string): void {
    Logger.instance = new Logger(elfDir);
  }

  static get(): Logger {
    if (!Logger.instance) throw new Error("Logger not initialised — call Logger.init first");
    return Logger.instance;
  }

  /** Append a timestamped event line. Fire-and-forget; errors are swallowed. */
  static logEvent(message: string): void {
    Logger.instance?.logEventInstance(message);
  }

  private logEventInstance(message: string): void {
    this.queue = this.queue.then(() => this.write(message)).catch(() => {});
  }

  private async write(message: string): Promise<void> {
    const line = `${new Date().toISOString()}  ${message}\n`;
    await appendFile(this.logPath, line);
    await this.trimIfNeeded();
  }

  /**
   * To make sure the file doesn't grow indefinitely, we split it in half 
   * whenever it exceeds MAX_BYTES. This is a simple heuristic that should keep
   * the most recent logs while discarding the oldest ones, without needing to
   * have multiple rotating log files.
   */
  private async trimIfNeeded(): Promise<void> {
    const s = await stat(this.logPath).catch(() => null);
    if (!s || s.size <= MAX_BYTES) return;

    const content = await readFile(this.logPath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const kept = lines.slice(Math.floor(lines.length / 2));
    await writeFile(this.logPath, kept.join("\n") + "\n");
  }
}
