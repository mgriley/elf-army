/**
 * An {@link AbstractPeer} over a Node IPC channel — a forked child process, or
 * `process` itself for talking to our parent. This is the only transport for
 * V1, since the goblin hierarchy is a process tree wired together by `fork()`.
 *
 * Request/response correlation for this single edge is delegated to an
 * {@link AsyncRequestTracker}: each outgoing call gets a unique id, the matching
 * reply resolves its promise, and inbound calls are dispatched to
 * `managerHandle.invokeFunction` with the result shipped back. (This supersedes
 * the old standalone `messenger.ts`, which multiplexed every peer through one
 * handler; here each edge is its own self-contained `IpcPeer`.)
 *
 * Wire shapes, discriminated by `__peer` and validated on receipt:
 *   request:  { __peer: "request",  id, funcName, inData }
 *   response: { __peer: "response", id, result }
 */

import type { ChildProcess } from "node:child_process";

import { AsyncRequestTracker } from "../utils/async-request-tracker.js";
import { Schema } from "../utils/schema.js";
import {
  schemaLiteral,
  schemaNum,
  schemaObj,
  schemaResult,
  schemaStr,
} from "../utils/schema_utils.js";
import { AbstractPeer, type CallResult, type PeerManagerHandle } from "../peers/peer.js";

/** Either end of a Node IPC channel exposes this slice of the API. */
export type IpcChannel = Pick<ChildProcess, "send" | "on" | "off">;

/** What we hand the tracker per outgoing call; it stamps on the correlation id. */
interface RequestPayload {
  funcName: string;
  inData: string;
}

interface RequestMessage {
  __peer: "request";
  id: number;
  funcName: string;
  inData: string;
}

interface ResponseMessage {
  __peer: "response";
  id: number;
  result: CallResult;
}

// Messages arrive from another process, so validate them before use. The
// `result` arm is a `CallResult` (Result<string>), built via schemaResult.
const requestSchema = new Schema<RequestMessage>(
  schemaObj({
    __peer: schemaLiteral("request"),
    id: schemaNum(),
    funcName: schemaStr(),
    inData: schemaStr(),
  }),
);

const responseSchema = new Schema<ResponseMessage>(
  schemaObj({
    __peer: schemaLiteral("response"),
    id: schemaNum(),
    result: schemaResult(schemaStr()),
  }),
);

export class IpcPeer extends AbstractPeer {
  private closed = false;
  private readonly listener: (msg: unknown) => void;
  // Correlates each outgoing call to the peer's reply by id; see AsyncRequestTracker.
  private readonly tracker = new AsyncRequestTracker<RequestPayload, CallResult>(
    (id, payload) => {
      const request: RequestMessage = { __peer: "request", id, ...payload };
      // `send` returns false (or is absent) when there is no live IPC channel —
      // e.g. the peer process already exited. Degrade to an error result.
      const sent = this.channel.send?.(request);
      if (sent === false || sent === undefined) {
        this.tracker.resolve(id, { ok: false, error: "peer has no IPC channel" });
      }
    },
    { label: "peer call" },
  );

  constructor(
    private readonly channel: IpcChannel,
    managerHandle: PeerManagerHandle,
  ) {
    super(managerHandle);
    this.listener = (msg) => void this.handleIncoming(msg);
    this.channel.on("message", this.listener);
  }

  async sendRpc(funcName: string, inData: string): Promise<CallResult> {
    if (this.closed) return { ok: false, error: "peer connection is closed" };
    try {
      return await this.tracker.request({ funcName, inData });
    } catch (err) {
      // The tracker rejects only when the transport dies (see close()); surface
      // it as a value to keep the "never throws" contract.
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.channel.off("message", this.listener);
    this.tracker.rejectAll(new Error("peer connection closed before reply"));
  }

  private async handleIncoming(msg: unknown): Promise<void> {
    const kind =
      typeof msg === "object" && msg !== null
        ? (msg as Record<string, unknown>).__peer
        : undefined;

    if (kind === "response") {
      // resolve is a no-op for unknown/duplicate ids, so no extra guard needed.
      const parsed = responseSchema.safeParse(msg);
      // TODO - should potentially notifythe PeerManager of malformed messages, but for now just ignore them.
      if (parsed.ok) this.tracker.resolve(parsed.value.id, parsed.value.result);
      return;
    }

    if (kind !== "request") return;
    const parsed = requestSchema.safeParse(msg);
      // TODO - should potentially notifythe PeerManager of malformed messages, but for now just ignore them.
    if (!parsed.ok) return;
    const { id, funcName, inData } = parsed.value;

    const result = await this.managerHandle.invokeFunction(funcName, inData);
    const reply: ResponseMessage = { __peer: "response", id, result };
    this.channel.send?.(reply);
  }
}
