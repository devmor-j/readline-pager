import { randomUUID } from "node:crypto";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TMP_DIR = "./tmp";

export interface CreateTmpFileOptions {
  filename?: string;
  append?: boolean;
  encoding?: BufferEncoding;
}

await mkdir(TMP_DIR, { recursive: true });

// TODO: make filename optional and turn to object arg
export async function createTmpFile(
  content: string,
  {
    filename = randomUUID(),
    append = false,
    encoding = "utf8",
  }: CreateTmpFileOptions,
): Promise<string> {
  const filepath = join(TMP_DIR, filename);

  if (append) {
    await appendFile(filepath, content, encoding);
  } else {
    await writeFile(filepath, content, encoding);
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
