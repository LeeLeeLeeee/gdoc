import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBED_DIM = 384;

const worker = fileURLToPath(new URL('./embed-worker.mjs', import.meta.url));

/** Embed texts to unit vectors via the Node worker (bun can't load the onnx backend). */
export function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const cp = execFile('node', [worker], { maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`embed worker failed: ${err.message}\n${String(stderr).slice(0, 800)}`));
      try {
        resolve(JSON.parse(stdout).vectors as number[][]);
      } catch (e) {
        reject(new Error(`embed worker produced no JSON: ${(e as Error).message}`));
      }
    });
    cp.stdin?.end(JSON.stringify({ model: EMBED_MODEL, texts }));
  });
}
