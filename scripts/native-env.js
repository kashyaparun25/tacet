import path from "node:path";

export function withSherpaEnv(env, projectRoot) {
  const platform = process.platform;
  const arch = process.arch;

  let envKey = null;
  let pkg = null;

  if (platform === "darwin") {
    envKey = "DYLD_LIBRARY_PATH";
    pkg = arch === "arm64" ? "sherpa-onnx-darwin-arm64" : "sherpa-onnx-darwin-x64";
  } else if (platform === "linux") {
    envKey = "LD_LIBRARY_PATH";
    pkg = arch === "arm64" ? "sherpa-onnx-linux-arm64" : "sherpa-onnx-linux-x64";
  } else if (platform === "win32") {
    envKey = "PATH";
    pkg = "sherpa-onnx-win-x64";
  }

  if (!envKey || !pkg) {
    return env;
  }

  const libPath = path.join(projectRoot, "node_modules", pkg);
  const existing = env[envKey] || "";
  const separator = platform === "win32" ? ";" : ":";
  const merged = existing ? `${libPath}${separator}${existing}` : libPath;

  return { ...env, [envKey]: merged };
}
