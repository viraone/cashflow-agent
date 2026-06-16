import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "dist-pages");
const dataDir = path.join(outputDir, "data");
const staticFiles = ["index.html", "styles.css", "script.js"];

async function main(): Promise<void> {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  for (const file of staticFiles) {
    await fs.copyFile(path.join(rootDir, file), path.join(outputDir, file));
  }

  await fs.cp(path.join(rootDir, "data"), dataDir, { recursive: true });

  console.log("Exported GitHub Pages site from data/financial-data.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
