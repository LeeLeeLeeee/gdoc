#!/usr/bin/env bun
// gdoc upload [dir]  — publish generated HTML to Supabase
// gdoc analyze       — build the knowledge graph (private/graph/graph.json)
// Run with bun (auto-loads .env): `bun run cli/index.ts upload docs`
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSupabasePorts } from './supabase';
import { uploadDoc } from './upload';
import { analyze } from './analyze';

async function runUpload(dir: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them in .env).');
    process.exit(1);
  }
  const ports = createSupabasePorts(url, key, process.env.OWNER_UID);

  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.html'));
  } catch {
    console.error(`Cannot read directory: ${dir}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`No .html files in ${dir}`);
    process.exit(1);
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  for (const file of files) {
    const html = await readFile(join(dir, file), 'utf8');
    try {
      const out = await uploadDoc(html, ports);
      if (out.status === 'ok') {
        uploaded++;
        console.log(`✓ ${file} → ${out.id} (${out.bucket})`);
      } else {
        skipped++;
        console.warn(`- ${file} skipped: ${out.reason}`);
      }
    } catch (err) {
      failed++;
      console.error(`✗ ${file}: ${(err as Error).message}`);
    }
  }
  console.log(`\nuploaded=${uploaded} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'analyze') {
    await analyze();
    return;
  }
  // `gdoc upload <dir>` or legacy `gdoc <dir>`
  const dir = cmd === 'upload' ? process.argv[3] ?? 'docs' : cmd ?? 'docs';
  await runUpload(dir);
}

main();
