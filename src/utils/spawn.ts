import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ResolvedScript {
  script: string;
  execArgv: string[];
}

/** Resolve a script path and the right execArgv for the current runtime (tsx vs compiled js). */
export function resolveScript(importMetaUrl: string, relScript: string): ResolvedScript {
  const here = fileURLToPath(importMetaUrl);
  const ext = path.extname(here);
  return {
    script: path.join(path.dirname(here), `${relScript}${ext}`),
    execArgv: ext === ".ts" ? ["--import", "tsx"] : [],
  };
}

/**
 * Fork a Node.js script as a subprocess. Pass `import.meta.url` from the
 * calling module so the script path can be resolved relative to it.
 * Handles dev (tsx) and prod (compiled js) automatically.
 */
export function spawnScript(
  importMetaUrl: string,
  relScript: string,
  scriptArgs: string[] = [],
): ChildProcess {
  const { script, execArgv } = resolveScript(importMetaUrl, relScript);
  return fork(script, scriptArgs, {
    execArgv,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
}
