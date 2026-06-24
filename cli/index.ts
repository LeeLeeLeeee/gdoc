#!/usr/bin/env bun
// gdoc upload <file|dir> [--auto-path]  — publish generated HTML to Supabase
// gdoc analyze                          — build the knowledge graph + search index
// gdoc doctor                           — preflight the setup (env, DB, buckets, node)
// Run with bun (auto-loads .env): `bun run cli/index.ts upload docs --auto-path`
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createSupabasePorts } from './supabase';
import { uploadDoc, type UploadCtx } from './upload';
import { analyze } from './analyze';
import { doctor } from './doctor';
import { runEngine } from './llm';
import type { GdocMeta } from '../shared/schema';

/** Ask a local engine to slot a doc into the existing folder tree. null if unavailable. */
async function assignPath(meta: GdocMeta, folders: string[]): Promise<string | null> {
  const prompt = [
    'Assign the best folder PATH (slash-delimited) for this document so it fits the existing tree.',
    'Prefer an existing folder; otherwise propose a concise new one. The LAST segment is a short slug naming THIS document.',
    'Answer with ONLY the path on a single line — no quotes, no prose, no code fences.',
    `DOC: ${JSON.stringify({ title: meta.title, tags: meta.tags, category: meta.category, type: meta.type })}`,
    `EXISTING FOLDERS: ${JSON.stringify(folders)}`,
  ].join('\n');
  for (const engine of ['codex', 'claude'] as const) {
    const out = await runEngine(engine, prompt);
    if (!out) continue;
    const line = out.split('\n').map((s) => s.trim()).filter(Boolean).pop();
    const cleaned = line?.replace(/^["'`]+|["'`]+$/g, '').trim();
    if (cleaned && /^[\p{L}\p{N}][\p{L}\p{N}\-/ ]*$/u.test(cleaned)) return cleaned;
  }
  return null;
}

async function listHtml(target: string): Promise<string[]> {
  const st = await stat(target);
  if (st.isFile()) return target.toLowerCase().endsWith('.html') ? [target] : [];
  return (await readdir(target)).filter((f) => f.toLowerCase().endsWith('.html')).map((f) => join(target, f));
}

async function runUpload(target: string, autoPath: boolean) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them in .env).');
    process.exit(1);
  }
  const ports = createSupabasePorts(url, key, process.env.OWNER_UID);

  let files: string[];
  try {
    files = await listHtml(target);
  } catch {
    console.error(`Cannot read: ${target}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`No .html files at: ${target}`);
    process.exit(1);
  }

  // snapshot existing docs → maps + folder taxonomy
  const existing = await ports.db.listExisting();
  const byId = new Map(existing.map((d) => [d.id, d.contentHash]));
  const byHash = new Map<string, string>();
  for (const d of existing) if (d.contentHash) byHash.set(d.contentHash, d.id);
  const folders = [...new Set(existing.map((d) => d.path.split('/').slice(0, -1).join('/')).filter(Boolean))];

  const ctx: UploadCtx = { byId, byHash, autoPath, folders, assignPath };

  const tally: Record<string, number> = { new: 0, updated: 0, unchanged: 0, duplicate: 0, skipped: 0, failed: 0 };
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    try {
      const out = await uploadDoc(html, ports, ctx);
      if (out.status === 'skip') {
        tally.skipped++;
        console.warn(`- ${file} skipped: ${out.reason}`);
      } else {
        tally[out.status]++;
        const mark = out.status === 'new' || out.status === 'updated' ? '✓' : '-';
        console.log(`${mark} ${file} → ${out.id} (${out.status})`);
      }
    } catch (err) {
      tally.failed++;
      console.error(`✗ ${file}: ${(err as Error).message}`);
    }
  }

  console.log(
    `\nnew=${tally.new} updated=${tally.updated} unchanged=${tally.unchanged} duplicate=${tally.duplicate} skipped=${tally.skipped} failed=${tally.failed}`,
  );
  if (tally.failed > 0) process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'analyze') {
    await analyze();
    return;
  }
  if (args[0] === 'doctor') {
    await doctor();
    return;
  }
  const autoPath = args.includes('--auto-path');
  const positional = args.filter((a) => !a.startsWith('--'));
  const target = positional[0] === 'upload' ? positional[1] ?? 'docs' : positional[0] ?? 'docs';
  await runUpload(target, autoPath);
}

main();
