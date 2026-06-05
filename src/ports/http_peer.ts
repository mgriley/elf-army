/**
 * An {@link AbstractPeer} over Node's built-in `http.Server` (zero deps) — the
 * edge that lets an elf act like a server.
 *
 * All inbound HTTP requests are forwarded to a single handler function (named at
 * construction time, typically `handleRequest_<portName>`). The function receives
 * the full request details and returns an HTTP response descriptor.
 *
 *   HTTP request  ->  handlerFuncName({method,path,query,headers,body})
 *                 ->  {status, contentType, body}
 *                 ->  HTTP response
 *
 * Request payload fields (all strings):
 *   method   — HTTP verb (GET, POST, …)
 *   path     — URL path, percent-decoded, no query string (e.g. "/hello")
 *   query    — raw query string, empty string if none (e.g. "x=1&y=2")
 *   headers  — request headers as a JSON-encoded object
 *   body     — request body as UTF-8 text, empty string if none
 *
 * Response payload fields:
 *   status      — HTTP status code (integer)
 *   contentType — Content-Type header value (string)
 *   body        — response body as UTF-8 text (string)
 *
 * Errors from invokeFunction (unknown function, no interface, runtime failure,
 * etc.) are mapped to HTTP status codes via {@link statusForError}.
 *
 * It is *inbound-only*: {@link sendRpc} always fails as a value — an HttpPeer
 * never initiates calls.
 */

import type { IncomingMessage, Server, ServerResponse } from "node:http";

import { AbstractPeer, type CallResult, type PeerManagerHandle } from "../peers/peer.js";

/** Cap on request body size, so a single client can't exhaust memory. */
const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

export class HttpPeer extends AbstractPeer {
  private closed = false;
  private readonly onRequest: (req: IncomingMessage, res: ServerResponse) => void;

  constructor(
    private readonly server: Server,
    managerHandle: PeerManagerHandle,
    /** Name of the function that handles all inbound requests for this port. */
    private readonly handlerFuncName: string,
  ) {
    super(managerHandle);
    this.onRequest = (req, res) => void this.handleRequest(req, res);
    this.server.on("request", this.onRequest);
  }

  /** An HttpPeer is inbound-only; it has no single client to call out to. */
  async sendRpc(): Promise<CallResult> {
    return { ok: false, error: "http peer is inbound-only; cannot initiate RPC" };
  }

  /** Stop listening and detach the handler. Idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.server.off("request", this.onRequest);
    this.server.close();
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const rawUrl = req.url ?? "/";
    const qIdx = rawUrl.indexOf("?");
    const rawPath = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
    const query: Record<string, string> = {};
    if (qIdx >= 0) {
      for (const [key, val] of new URLSearchParams(rawUrl.slice(qIdx + 1))) {
        query[key] = val;
      }
    }
    const path = decodeURIComponent(rawPath);

    // Normalize to Record<string, string>: Node returns string[] only for
    // set-cookie (duplicate values preserved as an array); join those with ", ".
    const headers: Record<string, string> = {};
    for (const [key, val] of Object.entries(req.headers)) {
      if (val === undefined) continue;
      headers[key] = Array.isArray(val) ? val.join(", ") : val;
    }

    let body: string;
    try {
      body = await readBody(req);
    } catch (err) {
      return respond(res, 413, err instanceof Error ? err.message : String(err));
    }

    const inData = JSON.stringify({ method, path, query, headers, body });
    const result = await this.managerHandle.invokeFunction(this.handlerFuncName, inData);

    if (!result.ok) {
      return respond(res, statusForError(result.error), result.error);
    }

    let response: { status: number; contentType: string; body: string };
    try {
      response = JSON.parse(result.value) as typeof response;
    } catch {
      return respond(res, 500, "handler returned non-JSON response");
    }

    respond(res, response.status, response.body, response.contentType);
  }
}

/** Read the full request body as a UTF-8 string, rejecting if it exceeds the cap. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Map a CallResult error string onto an HTTP status. The error is only a
 * human-readable string, so this matches on phrases PeerManager/FunctionManager
 * produce. Anything unrecognized is treated as a server-side failure (500).
 */
function statusForError(error: string): number {
  if (/has no interface assigned/.test(error)) return 403;
  if (/no function named|not in interface|no longer exists|no peer named/.test(error)) return 404;
  if (/not valid JSON|input validation failed/.test(error)) return 400;
  return 500;
}

function respond(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = "text/plain; charset=utf-8",
): void {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}
