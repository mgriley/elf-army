import { startInspectorServer } from "./server.js";

const rootDir = process.argv[2];
if (!rootDir) {
  console.error("inspector/main: rootDir argument required");
  process.exit(1);
}

startInspectorServer(rootDir);
