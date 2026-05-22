import type { ChildProcess } from "node:child_process";
import process from "node:process";

import { z } from "zod";

type IPCSender = ChildProcess | NodeJS.Process;

/**
 * Describes who a message came from.
 * - `type: "parentMessage"` — from this process's parent.
 * - `type: "childMessage"`  — from one of our children; `childName` is set.
 */
export interface MessageSource {
  type: "parentMessage" | "childMessage";
  childName?: string;
}

/** Async handler invoked when a peer sends us a request. Returns the reply. */
export type MessageHandler = (
  source: MessageSource,
  message: string,
) => Promise<string>;

interface PendingRequest {
  resolve: (response: string) => void;
  reject: (err: Error) => void;
}

const RequestMessageSchema = z.object({
  __messenger: z.literal("request"),
  id: z.string(),
  message: z.string(),
});

const ResponseMessageSchema = z.object({
  __messenger: z.literal("response"),
  id: z.string(),
  response: z.string(),
});

const WireMessageSchema = z.discriminatedUnion("__messenger", [
  RequestMessageSchema,
  ResponseMessageSchema,
]);

type RequestMessage = z.infer<typeof RequestMessageSchema>;
type ResponseMessage = z.infer<typeof ResponseMessageSchema>;

/**
 * Correlates outgoing IPC messages with incoming responses, and dispatches
 * incoming requests to a user-supplied `MessageHandler`.
 *
 * Wire format (validated via zod):
 * - request:  `{ __messenger: "request",  id, message }`
 * - response: `{ __messenger: "response", id, response }`
 *
 * Constructor auto-subscribes to `process` so messages from our parent are
 * handled automatically when we're forked. For children we spawn, call
 * `attachChild(name, child)` once per child — Node has no aggregate
 * "any-child-sent-something" event on the parent side.
 */
export class Messenger {
  private nextId = 0;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly handler: MessageHandler;

  constructor(handler: MessageHandler) {
    this.handler = handler;
    if (process.send) {
      process.on("message", (msg) =>
        this.handleIncoming(msg, process, { type: "parentMessage" }),
      );
    }
  }

  /** Route messages from `child` (identified by `name`) through this Messenger. */
  attachChild(name: string, child: ChildProcess): void {
    child.on("message", (msg) =>
      this.handleIncoming(msg, child, { type: "childMessage", childName: name }),
    );
  }

  /**
   * Send `message` to `proc` and resolve with the peer's response.
   * Rejects if `proc` has no usable IPC channel.
   */
  async sendMessage(proc: IPCSender, message: string): Promise<string> {
    const id = `msg-${++this.nextId}`;
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const request: RequestMessage = { __messenger: "request", id, message };
      const sent = proc.send?.(request);
      if (sent === false || sent === undefined) {
        this.pending.delete(id);
        reject(new Error("Messenger: target has no IPC channel."));
      }
    });
  }

  private async handleIncoming(
    msg: unknown,
    peer: IPCSender,
    source: MessageSource,
  ): Promise<void> {
    const parsed = WireMessageSchema.safeParse(msg);
    if (!parsed.success) return;

    if (parsed.data.__messenger === "response") {
      const pending = this.pending.get(parsed.data.id);
      if (!pending) return;
      this.pending.delete(parsed.data.id);
      pending.resolve(parsed.data.response);
      return;
    }

    const response = await this.handler(source, parsed.data.message);
    const reply: ResponseMessage = {
      __messenger: "response",
      id: parsed.data.id,
      response,
    };
    peer.send?.(reply);
  }
}
