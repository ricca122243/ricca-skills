// Builds the standalone website from the same index.html that is published as a claude.ai artifact.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from "node:fs";
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/call", { recursive: true });
const page = readFileSync("index.html", "utf8");
const head = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#FFFFFF"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>`;
writeFileSync("dist/index.html", head + page + "</body></html>");
cpSync("voice", "dist/voice", { recursive: true });
cpSync("call/elevenlabs-client-1.36.0.js", "dist/call/elevenlabs-client-1.36.0.js");
if (existsSync("voice-samples")) cpSync("voice-samples", "dist/voice-samples", { recursive: true });
console.log("built dist/");
