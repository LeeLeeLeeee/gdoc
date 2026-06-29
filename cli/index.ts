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
import { DOC_TYPES, type GdocMeta } from '../shared/schema';
import type { Bucket } from './ports';
import { moveFilePath, renameFilePath, renameFolderDocs, updateRemoteDoc } from './manage';
import { editDoc, getDocHtml, revertDoc } from './edit';
import type { GdocMetaPatch } from '../shared/metaPatch';

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
  const ports = createPortsFromEnv();

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

  const ctx: UploadCtx = {
    byId,
    byHash,
    autoPath,
    folders,
    assignPath: dryRun ? undefined : assignPath,
    dryRun,
  };

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

function createPortsFromEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('문제: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.');
    console.error('원인: .env가 비었거나 로드되지 않음.');
    console.error('해결: .env에 값을 채우고 `bun run gdoc doctor`로 점검하세요.');
    process.exit(1);
  }
  return createSupabasePorts(url, key, process.env.OWNER_UID);
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} 값이 필요합니다.`);
  return value;
}

function positionalArgs(args: string[], valueFlags: string[] = []): string[] {
  const valueFlagSet = new Set(valueFlags);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      if (valueFlagSet.has(arg)) i++;
      continue;
    }
    out.push(arg);
  }
  return out;
}

function parseMetaPatch(args: string[]): GdocMetaPatch {
  const patch: GdocMetaPatch = {};
  const title = valueAfter(args, '--title');
  const category = valueAfter(args, '--category');
  const type = valueAfter(args, '--type');
  const visibility = valueAfter(args, '--visibility');
  const tags = valueAfter(args, '--tags');
  if (title !== undefined) patch.title = title;
  if (category !== undefined) patch.category = category;
  if (type !== undefined) {
    if (!(DOC_TYPES as readonly string[]).includes(type)) {
      throw new Error(`--type 값은 ${DOC_TYPES.join(', ')} 중 하나여야 합니다.`);
    }
    patch.type = type as GdocMeta['type'];
  }
  if (visibility !== undefined) {
    if (visibility !== 'public' && visibility !== 'private') {
      throw new Error('--visibility 값은 public 또는 private이어야 합니다.');
    }
    patch.visibility = visibility as Bucket;
  }
  if (tags !== undefined) patch.tags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  return patch;
}

async function runMove(args: string[]) {
  const dryRun = args.includes('--dry-run');
  const [ref, newPath] = positionalArgs(args);
  if (!ref || !newPath) throw new Error('사용법: gdoc mv <문서 id|path> <새 path> [--dry-run]');
  const out = await updateRemoteDoc(ref, { path: newPath }, createPortsFromEnv(), dryRun);
  console.log(`${dryRun ? '[dry-run] ' : ''}${out.plan.oldPath} → ${out.plan.newPath}`);
}

async function runRename(args: string[]) {
  const dryRun = args.includes('--dry-run');
  const [ref, newName] = positionalArgs(args);
  if (!ref || !newName) throw new Error('사용법: gdoc rename <문서 id|path> <새 파일명> [--dry-run]');
  const ports = createPortsFromEnv();
  const row = await ports.db.getByIdOrPath(ref);
  if (!row) throw new Error(`document not found: ${ref}`);
  const out = await updateRemoteDoc(ref, { path: renameFilePath(row.path, newName) }, ports, dryRun);
  console.log(`${dryRun ? '[dry-run] ' : ''}${out.plan.oldPath} → ${out.plan.newPath}`);
}

async function runMeta(args: string[]) {
  const dryRun = args.includes('--dry-run');
  const patch = parseMetaPatch(args);
  const [ref] = positionalArgs(args, ['--title', '--category', '--type', '--visibility', '--tags']);
  if (!ref) throw new Error('사용법: gdoc meta <문서 id|path> [--title 값] [--tags a,b] [--category 값] [--type 값] [--visibility public|private] [--dry-run]');
  if (Object.keys(patch).length === 0) throw new Error('변경할 meta 플래그가 없습니다.');
  const out = await updateRemoteDoc(ref, patch, createPortsFromEnv(), dryRun);
  console.log(`${dryRun ? '[dry-run] ' : ''}${out.plan.oldPath} → ${out.plan.newPath}`);
}

async function runFolder(args: string[]) {
  const dryRun = args.includes('--dry-run');
  const [subcommand, first, second] = positionalArgs(args);
  const ports = createPortsFromEnv();
  if (subcommand === 'mkdir') {
    if (!first) throw new Error('사용법: gdoc folder mkdir <folder-path> [--dry-run]');
    if (dryRun) {
      console.log(`[dry-run] folder create: ${first}`);
      return;
    }
    if (!ports.db.createFolder) throw new Error('folder create is not supported by this DB port');
    await ports.db.createFolder(first, process.env.OWNER_UID);
    console.log(`folder created: ${first}`);
    return;
  }
  if (subcommand === 'rename') {
    if (!first || !second) throw new Error('사용법: gdoc folder rename <folder-path> <새 이름> [--dry-run]');
    const out = await renameFolderDocs(first, second, ports, dryRun);
    console.log(`${dryRun ? '[dry-run] ' : ''}${out.oldPath} → ${out.newPath} (${out.updates.length} docs)`);
    return;
  }
  if (subcommand === 'rmdir') {
    if (!first) throw new Error('사용법: gdoc folder rmdir <folder-path> [--dry-run]');
    if (dryRun) {
      console.log(`[dry-run] folder delete: ${first}`);
      return;
    }
    if (!ports.db.deleteFolder) throw new Error('folder delete is not supported by this DB port');
    await ports.db.deleteFolder(first);
    console.log(`folder deleted: ${first}`);
    return;
  }
  throw new Error('사용법: gdoc folder <mkdir|rename|rmdir> ...');
}

async function runGet(args: string[]) {
  const [ref] = positionalArgs(args);
  if (!ref) throw new Error('사용법: gdoc get <문서 id|path>');
  const { html } = await getDocHtml(ref, createPortsFromEnv());
  process.stdout.write(html);
}

async function runEdit(args: string[]) {
  const dryRun = args.includes('--dry-run');
  const confirm = args.includes('--confirm');
  const file = valueAfter(args, '--file');
  const ifMatch = valueAfter(args, '--if-match');
  const [ref] = positionalArgs(args, ['--file', '--if-match']);
  if (!ref || !file) throw new Error('사용법: gdoc edit <문서 id|path> --file <경로> [--if-match <hash>] [--confirm] [--dry-run]');
  const html = await readFile(file, 'utf8');
  const out = await editDoc(ref, html, createPortsFromEnv(), { dryRun, ifMatch, confirm });
  const mark = dryRun ? '·' : out.status === 'unchanged' ? '-' : '✓';
  console.log(`${dryRun ? '[dry-run] ' : ''}${mark} ${out.id} (${out.status})`);
}

async function runRevert(args: string[]) {
  const dryRun = args.includes('--dry-run');
  const [ref] = positionalArgs(args);
  if (!ref) throw new Error('사용법: gdoc revert <문서 id|path> [--dry-run]');
  const out = await revertDoc(ref, createPortsFromEnv(), { dryRun });
  const mark = dryRun ? '·' : '✓';
  console.log(`${dryRun ? '[dry-run] ' : ''}${mark} ${out.id} (reverted → ${out.status})`);
}

async function runFileMove(args: string[]) {
  const dryRun = args.includes('--dry-run');
  const [ref, targetFolder] = positionalArgs(args);
  if (!ref || !targetFolder) throw new Error('사용법: gdoc move-file <문서 id|path> <대상 folder-path> [--dry-run]');
  const ports = createPortsFromEnv();
  const row = await ports.db.getByIdOrPath(ref);
  if (!row) throw new Error(`document not found: ${ref}`);
  const out = await updateRemoteDoc(ref, { path: moveFilePath(row.path, targetFolder) }, ports, dryRun);
  console.log(`${dryRun ? '[dry-run] ' : ''}${out.plan.oldPath} → ${out.plan.newPath}`);
}

const USAGE = `gdoc — 개인 HTML 문서 관리 CLI

사용법:
  gdoc upload <파일|폴더> [--auto-path] [--dry-run]   HTML을 Supabase에 발행
  gdoc get <문서 id|path>                              현재 문서 HTML을 stdout으로 출력
  gdoc edit <문서 id|path> --file <경로> [flags]       문서 본문을 새 HTML로 교체
  gdoc revert <문서 id|path> [--dry-run]               직전 편집 본문으로 되돌리기
  gdoc mv <문서 id|path> <새 path> [--dry-run]         문서 path 이동
  gdoc move-file <문서 id|path> <폴더> [--dry-run]     문서를 폴더로 이동
  gdoc rename <문서 id|path> <새 파일명> [--dry-run]   문서 이름 변경
  gdoc meta <문서 id|path> [meta flags] [--dry-run]    title/tags/category/type/visibility 수정
  gdoc folder mkdir <path> [--dry-run]                 빈 폴더 생성
  gdoc folder rename <path> <새 이름> [--dry-run]      폴더와 하위 문서 이동
  gdoc folder rmdir <path> [--dry-run]                 빈 폴더 삭제
  gdoc analyze [--rebuild]                            지식 그래프 + 검색 인덱스 생성
  gdoc doctor                                         환경 설정 점검
  gdoc help                                           이 도움말

플래그:
  --auto-path   path 없는 문서를 codex/claude로 자동 배치
  --dry-run     실제 쓰기 없이 미리보기(new/updated/unchanged/duplicate)
  --file        (edit) 교체할 새 HTML 파일 경로
  --if-match    (edit) 기반 content_hash. 원격이 바뀌었으면 거부(낙관적 동시성)
  --confirm     (edit) 위험 전환(문서 이동·공개범위 변경) 적용 승인
  --title       (meta) 제목
  --tags        (meta) 쉼표 구분 태그
  --category    (meta) 카테고리
  --type        (meta) 문서 타입
  --visibility  (meta) public 또는 private
  --rebuild     (analyze) 검색 인덱스 전체 재생성`;

const ALLOWED_FLAGS: Record<string, string[]> = {
  upload: ['--auto-path', '--dry-run'],
  get: [],
  edit: ['--file', '--if-match', '--confirm', '--dry-run'],
  revert: ['--dry-run'],
  mv: ['--dry-run'],
  'move-file': ['--dry-run'],
  rename: ['--dry-run'],
  meta: ['--title', '--tags', '--category', '--type', '--visibility', '--dry-run'],
  folder: ['--dry-run'],
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
    args[0] === 'analyze' ||
    args[0] === 'doctor' ||
    args[0] === 'upload' ||
    args[0] === 'get' ||
    args[0] === 'edit' ||
    args[0] === 'revert' ||
    args[0] === 'mv' ||
    args[0] === 'move-file' ||
    args[0] === 'rename' ||
    args[0] === 'meta' ||
    args[0] === 'folder'
      ? args[0]
      : 'upload';
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
  if (command === 'mv') {
    await runMove(args.slice(1));
    return;
  }
  if (command === 'get') {
    await runGet(args.slice(1));
    return;
  }
  if (command === 'edit') {
    await runEdit(args.slice(1));
    return;
  }
  if (command === 'revert') {
    await runRevert(args.slice(1));
    return;
  }
  if (command === 'move-file') {
    await runFileMove(args.slice(1));
    return;
  }
  if (command === 'rename') {
    await runRename(args.slice(1));
    return;
  }
  if (command === 'meta') {
    await runMeta(args.slice(1));
    return;
  }
  if (command === 'folder') {
    await runFolder(args.slice(1));
    return;
  }
  const positional = args.filter((a) => !a.startsWith('--'));
  const target = positional[0] === 'upload' ? positional[1] ?? 'docs' : positional[0] ?? 'docs';
  await runUpload(target, args.includes('--auto-path'), args.includes('--dry-run'));
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
