#!/usr/bin/env node
// Renders the card to a standalone HTML file and, when Chrome is available,
// the README screenshots. Run with `npm run preview` after `npm run build`.
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ActivityGraph } from "../dist/index.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const css = readFileSync(path.join(root, "src/styles.css"), "utf8");
const THEMES = [
  ["light", "#faf9f7"],
  ["dark", "#0f0e0d"],
];

function page(body, background, pad = "22px 0 22px") {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Activity Heatmap preview</title><style>
${css}
body{margin:0;background:${background};font:14px ui-sans-serif,system-ui,-apple-system,sans-serif;}
.activity-graph{padding:${pad};}
</style></head><body>${body}</body></html>`;
}

await mkdir(path.join(root, "examples"), { recursive: true });
await mkdir(path.join(root, "docs"), { recursive: true });

// The README shots show the card variant, since that is the assembled look.
// The component's own default is bare — see examples/playground.html.
const CARD_PROPS = { card: true };

// One page showing both themes, for eyeballing in a browser.
const combined = THEMES.map(([theme, background]) =>
  `<div style="background:${background}">${renderToStaticMarkup(
    React.createElement(ActivityGraph, { ...CARD_PROPS, theme }),
  )}</div>`,
).join("");
await writeFile(path.join(root, "examples/preview.html"), page(combined, "#ffffff"), "utf8");
console.log("wrote examples/preview.html");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
for (const [theme, background] of THEMES) {
  const html = page(
    renderToStaticMarkup(React.createElement(ActivityGraph, { ...CARD_PROPS, theme })),
    background,
  );
  const temporary = path.join(root, "docs", "_" + theme + ".html");
  await writeFile(temporary, html, "utf8");
  try {
    await execFileAsync(chrome, [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      "--window-size=1500,352",
      "--screenshot=" + path.join(root, "docs", "preview-" + theme + ".png"),
      "file://" + temporary,
    ]);
    console.log("wrote docs/preview-" + theme + ".png");
  } catch {
    console.log("skipped docs/preview-" + theme + ".png (Chrome not found)");
  }
  await rm(temporary, { force: true });
}
