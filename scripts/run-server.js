import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withSherpaEnv } from "./native-env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const watch = process.argv.includes("--watch");
const env = withSherpaEnv(process.env, projectRoot);

const args = watch ? ["--watch", "server.js"] : ["server.js"];
const child = spawn(process.execPath, args, {
  cwd: projectRoot,
  env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
