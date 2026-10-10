// Copies the web app into www/ for the Capacitor Android build.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "www");
const files = ["index.html", "styles.css", "app.js", "config.js",
  "manifest.webmanifest", "sw.js"];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "icons"), { recursive: true });
for (const f of files) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const f of fs.readdirSync(path.join(root, "icons")))
  fs.copyFileSync(path.join(root, "icons", f), path.join(out, "icons", f));
console.log("www/ ready");
