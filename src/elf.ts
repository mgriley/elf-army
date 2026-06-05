/**
 * Elf — one node in the hierarchy. It owns the set of components from
 * DesignDocs/Components.md and wires them together; everything an elf can do is
 * some composition of these managers:
 *
 *   - FunctionManager — its library of micro-functions, grouped into interfaces
 *   - PeerManager     — the edges in/out, and who may call what
 *   - SpawnManager    — forks child elves and registers them as peers
 *   - PortsManager    — opens HTTP ports, each exposed as just another peer
 *   - Database        — a private KV store for whatever data it needs
 *   - NotesManager    — a persistent scratchpad (purpose / tasks / memory)
 *   - Agent           — the LLM "brain" driving it all
 *
 * Persistence is per-manager: each mirrors its state to the elf's work dir, so
 * `run()` restores the full elf (functions, interfaces, peer bindings, ports,
 * notes) and brings child elves + ports back up where they left off.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Schema } from "./utils/schema.js";

import { Agent } from "./agent/agent.js";
import { runCli } from "./cli.js";
import { ROOT_PURPOSE } from "./root_purpose.js";
import { runBashCommandTool } from "./tools.js";
import { checkIfDirExists } from "./utils/utils.js";

import { Database } from "./database/database.js";
import { FunctionManager } from "./functions/function_manager.js";
import { NotesManager } from "./notes/notes_manager.js";
import { PeerManager } from "./peers/peer_manager.js";
import { PortsManager } from "./ports/ports_manager.js";
import { IpcPeer, type IpcChannel } from "./spawn/ipc_peer.js";
import { SpawnManager } from "./spawn/spawn_manager.js";

// Path to main.{js,ts} sitting next to this file. The extension follows our
// current runtime: `.js` when running compiled output, `.ts` under tsx.
const HERE = fileURLToPath(import.meta.url);
const ENTRY_SCRIPT = path.join(path.dirname(HERE), `main${path.extname(HERE)}`);

// The peer name an elf gives the IPC edge back to whoever forked it.
const PARENT_PEER = "parent";

export type ElfId = string;

export interface ElfConfig {
  rootDir: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
}

export const ElfConfigSchema = new Schema<ElfConfig>({
  type: "object",
  properties: {
    rootDir: { type: "string" },
    openaiApiKey: { type: "optional", inner: { type: "string" } },
    anthropicApiKey: { type: "optional", inner: { type: "string" } },
  },
});

export class Elf {
  // All set in `run()`, before the first await — the elf is unusable until then.
  private config!: ElfConfig;
  private elfDir!: string;
  private agent!: Agent;
  private functionManager!: FunctionManager;
  private peerManager!: PeerManager;
  private spawnManager!: SpawnManager;
  private portsManager!: PortsManager;
  private database!: Database;
  private notesManager!: NotesManager;

  /**
   * Entry point for the top-of-tree elf: read config, ensure the root work dir,
   * then run the elf alongside a stdin REPL that feeds the user's lines to its
   * agent.
   */
  async runRootElf() {
    console.log(`Launching root elf`);

    const config = await this.readConfigFile();
    console.log(`Loaded config...`);

    await this.createWorkDir(config.rootDir, ROOT_PURPOSE);
    await Promise.all([
      this.run(config, config.rootDir),
      // TODO - should the CLI just be a peer we register for root? Probs,
      // and calls built-in func for sending a msg to the agent.
      runCli((message) => this.agent.ask(message)),
    ]);
  }

  /**
   * Boot this elf in `elfDir`: construct and start every component, reconnect to
   * the parent (if forked), restore child elves + ports, then run the agent loop.
   */
  async run(config: ElfConfig, elfDir: string) {
    console.log(`Running an elf in ${elfDir}!`);
    process.chdir(elfDir);
    this.config = config;
    this.elfDir = elfDir;

    // Construct the agent before any await so input arriving from the CLI or a
    // peer can't race against an unset field while we're still booting. The
    // manager operations aren't exposed as agent tools yet — that comes later.
    this.agent = Agent.createAgent(config, [runBashCommandTool]);

    // Build the components. PeerManager calls into FunctionManager (its access
    // gate), and Spawn/Ports register their connections as peers, so those two
    // take the PeerManager.
    this.functionManager = new FunctionManager(elfDir);
    this.peerManager = new PeerManager(elfDir, this.functionManager);
    this.database = new Database(elfDir);
    this.notesManager = new NotesManager(elfDir);
    this.spawnManager = new SpawnManager({
      childrenDir: path.join(elfDir, "children"),
      entryScript: ENTRY_SCRIPT,
      peerManager: this.peerManager,
      initPayload: (childDir) => ({ config, elfDir: childDir }),
    });
    this.portsManager = new PortsManager(elfDir, this.peerManager, this.functionManager);

    // Restore persisted state. FunctionManager first so the interface bindings
    // PeerManager loads resolve against functions that already exist.
    await this.functionManager.start();
    await this.peerManager.start();
    await this.database.start();
    await this.notesManager.start();
    await this.portsManager.start();

    // If we were forked, the same IPC channel that delivered our init message is
    // the edge back to our parent — adopt it as a peer like any other.
    if (process.send) {
      await this.peerManager.attachPeer(
        PARENT_PEER,
        // `process` exposes send/on/off but its chainable `on` returns Process,
        // not ChildProcess, so the structural match needs an explicit cast.
        (callbacks) => new IpcPeer(process as unknown as IpcChannel, callbacks),
      );
    }

    // Bring the world back up where we left off.
    await this.spawnManager.spawnAllExisting();
    await this.portsManager.openAllExisting();

    // TODO - feed the agent a first instruction once manager ops are tools.
    await this.agent.runAgentLoop();
  }

  /**
   * Create a fresh work directory at `dirPath` containing a `purpose.md` file
   * with the given contents. If `dirPath` already exists, no-op. (Child work
   * dirs are created by SpawnManager; this is for the root elf, which has no
   * parent to spawn it.)
   */
  async createWorkDir(dirPath: string, purpose: string): Promise<void> {
    if (await checkIfDirExists(dirPath)) return;
    await mkdir(dirPath, { recursive: true });
    await writeFile(path.join(dirPath, "purpose.md"), purpose);
  }

  private async readConfigFile(): Promise<ElfConfig> {
    const configPath = path.join(process.cwd(), "config.json");
    const raw = await readFile(configPath, "utf8");
    return ElfConfigSchema.parse(JSON.parse(raw));
  }
}
