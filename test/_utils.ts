import { randomUUID } from "node:crypto";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TMP_DIR = "./tmp";

export interface CreateTmpFileOptions {
  filename?: string;
  append?: boolean;
}

await mkdir(TMP_DIR, { recursive: true });

export async function createTmpFile(
  content: string,
  { filename = randomUUID(), append = false }: CreateTmpFileOptions = {},
): Promise<string> {
  const filepath = join(TMP_DIR, filename);

  if (append) {
    await appendFile(filepath, content);
  } else {
    await writeFile(filepath, content);
  }

  return filepath;
}

export function tryDeleteFile(filepath: string) {
  return rm(filepath, { force: true }).catch(() => {});
}

export function createTextLines(count: number) {
  const lines: string[] = [];

  for (let i = 0; i < count; i++) {
    lines.push(randomUUID());
  }

  return lines.join("\n");
}
