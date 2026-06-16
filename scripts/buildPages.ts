import fs from "node:fs/promises";
import path from "node:path";
import { getAdjustedCash } from "../services/excelService.ts";

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

  const adjustedCash = await getAdjustedCash();

  await fs.writeFile(
    path.join(dataDir, "adjusted-cash.json"),
    `${JSON.stringify({ adjustedCash: Number(adjustedCash.toFixed(2)) }, null, 2)}\n`,
  );

  console.log(`Exported GitHub Pages site with adjusted cash ${adjustedCash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
