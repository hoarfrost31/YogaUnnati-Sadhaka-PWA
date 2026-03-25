const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "www");
const entriesToCopy = [
  "index.html",
  "progress.html",
  "milestones.html",
  "community.html",
  "premium.html",
  "profile.html",
  "member.html",
  "auth.html",
  "manifest.webmanifest",
  "sw.js",
  "css",
  "js",
  "images",
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of entriesToCopy) {
  fs.cpSync(path.join(rootDir, entry), path.join(outDir, entry), { recursive: true });
}

console.log("Prepared web assets in ./www");
