import process from "node:process";

import { Goblin, type GoblinConfig } from "./goblin.js";

const goblin = new Goblin();

if (process.send) {
  // We were forked by a parent goblin — wait for its startup message.
  const { config, goblinDir, purpose } = await new Promise<{
    config: GoblinConfig;
    goblinDir: string;
    purpose?: string;
  }>((resolve) => {
    process.once("message", (msg) =>
      resolve(msg as { config: GoblinConfig; goblinDir: string; purpose?: string }),
    );
  });
  await goblin.run(config, goblinDir, purpose);
} else {
  console.log(`Awakening the army...`);
  await goblin.runRootGoblin();
}
