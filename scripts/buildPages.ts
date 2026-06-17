import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "dist-pages");
const staticFiles = ["index.html", "styles.css", "script.js", "supabase-config.js"];

async function main(): Promise<void> {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  for (const file of staticFiles) {
    await fs.copyFile(path.join(rootDir, file), path.join(outputDir, file));
  }

  console.log("Exported GitHub Pages site with Supabase client config");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
