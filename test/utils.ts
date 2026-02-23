import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TMP_DIR = "./tmp";

await mkdir(TMP_DIR, { recursive: true });

export async function createTmpFile(
  filename: string,
  content: string,
): Promise<string> {
  const filePath = join(TMP_DIR, filename);

  await writeFile(filePath, content);

  return filePath;
}

export function deleteFile(filePath: string) {
  return rm(filePath, { force: true });
}

export function createTextLines(length = 1_000) {
  const lines = Array.from({ length }, (_, i) => `line-${i}`);
  return lines.join("\n");
}
