// Copies the web app into www/ for the Capacitor Android build.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "www");
const files = ["index.html", "styles.css", "app.js", "config.js",
  "manifest.webmanifest", "sw.js"];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "icons"), { recursive: true });
fs.mkdirSync(path.join(out, "brand"), { recursive: true });
for (const f of files) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of ["icons", "brand"])
  for (const f of fs.readdirSync(path.join(root, d)))
    fs.copyFileSync(path.join(root, d, f), path.join(out, d, f));
console.log("www/ ready");
