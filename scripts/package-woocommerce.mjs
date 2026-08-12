import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ZipArchive } from "archiver";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(root, "dist");
const outputPath = resolve(outputDirectory, "starfiniti-loyalty.zip");
await mkdir(outputDirectory, { recursive: true });

await new Promise((resolveArchive, rejectArchive) => {
  const output = createWriteStream(outputPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on("close", resolveArchive);
  output.on("error", rejectArchive);
  archive.on("error", rejectArchive);
  archive.pipe(output);
  archive.glob(
    "**/*",
    {
      cwd: resolve(root, "plugins/woocommerce"),
      ignore: ["tests/**"],
    },
    { prefix: "starfiniti-loyalty" },
  );
  void archive.finalize();
});

console.log(`Packaged ${outputPath}`);
