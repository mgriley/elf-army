/**
 * Tool definitions for the tester agent.
 *
 * Covers the four axes from TestingStrategy.md:
 *   - Starting/stopping the goblin process
 *   - Sending messages to the goblin agent
 *   - Inspecting goblin files on disk (via the inspector /tree API or direct fs reads)
 *   - Making HTTP requests to test the apps the goblin builds
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Tool } from "../src/agent/llm.js";
import { GoblinRunner } from "./goblin_runner.js";

const INSPECTOR_URL = "http://localhost:7777";

export function createTestTools(runner: GoblinRunner): Tool[] {
  return [
    {
      name: "start_goblin",
      description:
        "Start the goblin process. Must be called before any other goblin tools. " +
        "Returns confirmation once the goblin is ready to receive messages.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        await runner.start();
        return `Goblin started. Root dir: ${runner.rootDir}`;
      },
    },

    {
      name: "send_to_goblin",
      description:
        "Send a message to the goblin agent via its CLI and return all output " +
        "produced during that turn (logs, tool calls, and the agent's final reply). " +
        "The output may be verbose — the agent's reply is the last paragraph before " +
        "the trailing '> ' prompt.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message to send to the goblin agent.",
          },
        },
      },
      handler: async (args) => {
        const output = await runner.sendMessage(args.message as string);
        return output.trim() || "(no output)";
      },
    },

    {
      name: "list_goblin_files",
      description:
        "Fetch the full file tree of the goblin root directory from the inspector, " +
        "including the contents of every file. Use this to understand what code the " +
        "goblin has written, what functions exist, and how the app is structured.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        try {
          const res = await fetch(`${INSPECTOR_URL}/tree`);
          if (!res.ok) return `Inspector /tree failed: HTTP ${res.status}`;
          const text = await res.text();
          // Cap the response to avoid overwhelming the agent context.
          if (text.length > 20000) {
            return text.slice(0, 20000) + "\n... (truncated)";
          }
          return text;
        } catch (err) {
          return `Inspector unavailable: ${(err as Error).message}`;
        }
      },
    },

    {
      name: "read_goblin_file",
      description:
        "Read the contents of a specific file from the goblin root directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path relative to the goblin root dir (e.g. 'functions/sendMessage.mjs').",
          },
        },
      },
      handler: async (args) => {
        const fullPath = path.join(runner.rootDir, args.path as string);
        try {
          return await readFile(fullPath, "utf8");
        } catch (err) {
          return `Error reading file: ${(err as Error).message}`;
        }
      },
    },

    {
      name: "http_request",
      description:
        "Make an HTTP request to a URL. Use this to test the HTTP endpoints the " +
        "goblin creates. Discover the port from the goblin's output or by reading " +
        "the ports config file in the goblin root.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Full URL to request (e.g. 'http://localhost:3000/messages').",
          },
          method: {
            type: "string",
            description: "HTTP method: GET, POST, PUT, DELETE. Defaults to GET.",
          },
          body: {
            type: "string",
            description: "Request body as a string (optional).",
          },
          content_type: {
            type: "string",
            description: "Content-Type header. Defaults to application/json when body is set.",
          },
        },
      },
      handler: async (args) => {
        const method = (args.method as string | undefined) ?? "GET";
        const headers: Record<string, string> = {};
        if (args.body) {
          headers["content-type"] =
            (args.content_type as string | undefined) ?? "application/json";
        }
        try {
          const res = await fetch(args.url as string, {
            method,
            headers,
            ...(args.body ? { body: args.body as string } : {}),
          });
          const text = await res.text();
          return `HTTP ${res.status} ${res.statusText}\n${text}`;
        } catch (err) {
          return `Request failed: ${(err as Error).message}`;
        }
      },
    },

    {
      name: "fetch_inspector_page",
      description:
        "Fetch a page from the goblin inspector web UI at http://localhost:7777. " +
        "Use path '/' for the main HTML page or '/tree' for the raw file-tree JSON.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "URL path to fetch, e.g. '/' or '/tree'.",
          },
        },
      },
      handler: async (args) => {
        const urlPath = (args.path as string | undefined) ?? "/";
        try {
          const res = await fetch(`${INSPECTOR_URL}${urlPath}`);
          const text = await res.text();
          const preview = text.length > 4000 ? text.slice(0, 4000) + "\n... (truncated)" : text;
          return `HTTP ${res.status}\n${preview}`;
        } catch (err) {
          return `Inspector unavailable: ${(err as Error).message}`;
        }
      },
    },

    {
      name: "stop_goblin",
      description: "Stop the goblin process and clean up.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        await runner.stop();
        return "Goblin stopped.";
      },
    },
  ];
}
