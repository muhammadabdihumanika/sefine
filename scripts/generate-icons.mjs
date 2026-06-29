// Generates PWA PNG icons from the SVG sources (run: npm run icons).
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const iconsDir = join(root, "public", "icons");

const icon = readFileSync(join(iconsDir, "icon.svg"));
const maskable = readFileSync(join(iconsDir, "maskable.svg"));

const outputs = [
  [icon, 192, "icon-192.png"],
  [icon, 512, "icon-512.png"],
  [icon, 180, "apple-touch-icon-180.png"],
  [icon, 32, "favicon-32.png"],
  [maskable, 192, "icon-maskable-192.png"],
  [maskable, 512, "icon-maskable-512.png"],
];

for (const [src, size, name] of outputs) {
  await sharp(src).resize(size, size).png().toFile(join(iconsDir, name));
  console.log("✓", name, `${size}x${size}`);
}
console.log("Done.");
