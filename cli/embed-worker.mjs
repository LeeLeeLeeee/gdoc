// Node worker: reads {model, texts:[...]} on stdin, writes {vectors:[[...]]} on stdout.
// Transformers.js needs the Node onnxruntime backend, which bun can't resolve — so the
// bun CLI spawns this under Node (same isolation pattern as the codex/claude calls).
import { pipeline, env } from '@huggingface/transformers';

// keep stdout pure for the JSON result; send any library logging to stderr
console.log = (...a) => console.error(...a);
env.allowLocalModels = false;

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}

const { model, texts } = JSON.parse(await readStdin());
const pipe = await pipeline('feature-extraction', model);
const vectors = [];
for (const t of texts) {
  const out = await pipe(t && t.trim() ? t : ' ', { pooling: 'mean', normalize: true });
  vectors.push(Array.from(out.data));
}
process.stdout.write(JSON.stringify({ vectors }));
