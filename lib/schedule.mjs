import { mkdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LABEL = "dev.activity-graph.sync";

function xmlString(value) {
  return "<string>" + String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;") + "</string>";
}

function plistFor({ cwd, cliPath, nodePath, logDir }) {
  const uid = process.getuid?.() || "";
  const environment = [
    "<key>PATH</key>" + xmlString(process.env.PATH || "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"),
  ].join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    '<plist version="1.0">',
    "<dict>",
    "<key>Label</key>" + xmlString(LABEL),
    "<key>ProgramArguments</key>",
    "<array>" + [nodePath, cliPath, "sync", "--cwd", cwd].map(xmlString).join("") + "</array>",
    "<key>WorkingDirectory</key>" + xmlString(cwd),
    "<key>EnvironmentVariables</key><dict>" + environment + "</dict>",
    "<key>StartInterval</key><integer>86400</integer>",
    "<key>RunAtLoad</key><true/>",
    "<key>ProcessType</key>" + xmlString("Utility"),
    "<key>LowPriorityIO</key><true/>",
    "<key>StandardOutPath</key>" + xmlString(path.join(logDir, "activity-graph.log")),
    "<key>StandardErrorPath</key>" + xmlString(path.join(logDir, "activity-graph.error.log")),
    "</dict>",
    "</plist>",
  ].join("\n");
}

export async function installLaunchAgent({ cwd, cliPath, nodePath = process.execPath, homeDir = os.homedir() }) {
  if (process.platform !== "darwin") {
    throw new Error("The built-in scheduler currently supports macOS launchd only.");
  }
  const agentsDir = path.join(homeDir, "Library", "LaunchAgents");
  const logDir = path.join(homeDir, "Library", "Logs");
  const plistPath = path.join(agentsDir, LABEL + ".plist");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  await writeFile(plistPath, plistFor({ cwd, cliPath, nodePath, logDir }), "utf8");
  return { label: LABEL, plistPath };
}

export async function uninstallLaunchAgent({ homeDir = os.homedir() }) {
  const plistPath = path.join(homeDir, "Library", "LaunchAgents", LABEL + ".plist");
  try {
    await unlink(plistPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return { label: LABEL, plistPath };
}
