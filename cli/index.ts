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
import { unknownFlags } from './args';
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

async function runUpload(target: string, autoPath: boolean, dryRun = false) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('문제: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.');
    console.error('원인: .env가 비었거나 로드되지 않음.');
    console.error('해결: .env에 값을 채우고 `bun run gdoc doctor`로 점검하세요.');
    process.exit(1);
  }
  const ports = createSupabasePorts(url, key, process.env.OWNER_UID);

  let files: string[];
  try {
    files = await listHtml(target);
  } catch (e) {
    console.error(`문제: 경로를 읽을 수 없습니다 — ${target}`);
    console.error(`원인: ${(e as Error).message}`);
    console.error('해결: 경로(폴더/파일)가 존재하는지 확인하세요.');
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`문제: ${target} 에 .html 파일이 없습니다.`);
    console.error('해결: HTML이 있는 폴더나 .html 파일 경로를 지정하세요.');
    process.exit(1);
  }

  if (dryRun) console.log('DRY RUN — 실제 쓰기 없음. --auto-path의 LLM 호출도 생략(폴백 경로로 미리보기).\n');

  // snapshot existing docs → maps + folder taxonomy
  const existing = await ports.db.listExisting();
  const byId = new Map(existing.map((d) => [d.id, d.contentHash]));
  const byHash = new Map<string, string>();
  for (const d of existing) if (d.contentHash) byHash.set(d.contentHash, d.id);
  const folders = [...new Set(existing.map((d) => d.path.split('/').slice(0, -1).join('/')).filter(Boolean))];

  const ctx: UploadCtx = { byId, byHash, autoPath, folders, assignPath: dryRun ? undefined : assignPath, dryRun };

  const tally: Record<string, number> = { new: 0, updated: 0, unchanged: 0, duplicate: 0, skipped: 0, failed: 0 };
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    try {
      const out = await uploadDoc(html, ports, ctx);
      if (out.status === 'skip') {
        tally.skipped++;
        console.warn(`- ${file} skipped: ${out.reason}${out.detail ? ` (${out.detail})` : ''}`);
      } else {
        tally[out.status]++;
        const mark = dryRun ? '·' : out.status === 'new' || out.status === 'updated' ? '✓' : '-';
        console.log(`${mark} ${file} → ${out.id} (${out.status})`);
      }
    } catch (err) {
      tally.failed++;
      console.error(`✗ ${file}: ${(err as Error).message}`);
    }
  }

  console.log(
    `\n${dryRun ? '[dry-run] ' : ''}new=${tally.new} updated=${tally.updated} unchanged=${tally.unchanged} duplicate=${tally.duplicate} skipped=${tally.skipped} failed=${tally.failed}`,
  );
  if (tally.failed > 0) process.exit(1);
}

const USAGE = `gdoc — 개인 HTML 문서 관리 CLI

사용법:
  gdoc upload <파일|폴더> [--auto-path] [--dry-run]   HTML을 Supabase에 발행
  gdoc analyze [--rebuild]                            지식 그래프 + 검색 인덱스 생성
  gdoc doctor                                         환경 설정 점검
  gdoc help                                           이 도움말

플래그:
  --auto-path   path 없는 문서를 codex/claude로 자동 배치
  --dry-run     실제 쓰기 없이 미리보기(new/updated/unchanged/duplicate)
  --rebuild     (analyze) 검색 인덱스 전체 재생성`;

const ALLOWED_FLAGS: Record<string, string[]> = {
  upload: ['--auto-path', '--dry-run'],
  analyze: ['--rebuild'],
  doctor: [],
};

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const command =
    args[0] === 'analyze' || args[0] === 'doctor' || args[0] === 'upload' ? args[0] : 'upload';
  const bad = unknownFlags(args, ALLOWED_FLAGS[command]);
  if (bad.length) {
    console.error(`알 수 없는 플래그: ${bad.join(', ')}\n`);
    console.error(USAGE);
    process.exit(1);
  }
  if (command === 'analyze') {
    await analyze({ rebuild: args.includes('--rebuild') });
    return;
  }
  if (command === 'doctor') {
    await doctor();
    return;
  }
  const positional = args.filter((a) => !a.startsWith('--'));
  const target = positional[0] === 'upload' ? positional[1] ?? 'docs' : positional[0] ?? 'docs';
  await runUpload(target, args.includes('--auto-path'), args.includes('--dry-run'));
}

main();
