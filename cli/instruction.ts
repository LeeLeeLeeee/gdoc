import { isActionKeyword } from '../shared/highlightKeywords';
import { slugFromPath } from '../shared/schema';
import { parseMeta } from './parseMeta';
import { runEngine } from './llm';
import { getDocHtml, editDoc, consumeHighlights, type EditResult } from './edit';
import type { UploadPorts } from './upload';

export interface HighlightRecord {
  id: string;
  exact: string;
  note: string | null;
  keywords: string[];
}

/** Convert action-tagged (편집/삭제) highlights into instruction lines + the ids consumed. */
export function highlightsToInstructions(highlights: HighlightRecord[]): { lines: string[]; usedIds: string[] } {
  const lines: string[] = [];
  const usedIds: string[] = [];
  for (const h of highlights) {
    const action = h.keywords.find((k) => isActionKeyword(k));
    if (!action) continue;
    const verb = action === '삭제' ? '이 부분을 삭제하라' : '이 부분을 다시 쓰거나 고쳐라';
    const note = h.note ? ` (메모: ${h.note})` : '';
    lines.push(`- [${action}] «${h.exact}» — ${verb}${note}`);
    usedIds.push(h.id);
  }
  return { lines, usedIds };
}

/** Build the LLM prompt: rules + instructions + the full document. */
export function buildInstructionPrompt(html: string, instructions: string[]): string {
  return [
    '너는 HTML 기술 문서를 편집하는 도구다. 아래 지시에 따라 문서를 수정하라.',
    '규칙:',
    '- 전체 HTML 문서 하나만 출력한다. 설명·주석·코드펜스 없이 HTML만 출력한다.',
    '- <script id="gdoc-meta"> 메타 블록과 문서 구조·테마(스타일/스크립트)는 보존한다.',
    '- 지시와 무관한 부분은 그대로 둔다.',
    '',
    '지시:',
    ...instructions,
    '',
    '문서:',
    html,
  ].join('\n');
}

/** Pull a complete HTML document out of an LLM response (tolerate code fences/prose). */
export function extractHtml(output: string): string | null {
  if (!output) return null;
  let s = output.trim();
  const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const lower = s.toLowerCase();
  let start = lower.indexOf('<!doctype');
  if (start === -1) start = lower.indexOf('<html');
  const end = lower.lastIndexOf('</html>');
  if (start === -1 || end === -1 || end < start) return null;
  return s.slice(start, end + '</html>'.length);
}

export type Runner = (prompt: string) => Promise<string | null>;

/** Default runner: use the requested local engine, or try codex then claude. */
export function defaultRunner(engine?: 'codex' | 'claude'): Runner {
  const T = 300_000; // document edits emit a full HTML doc — the 120s default is too short
  return async (prompt) => {
    if (engine) return runEngine(engine, prompt, T);
    return (await runEngine('codex', prompt, T)) ?? (await runEngine('claude', prompt, T));
  };
}

export interface InstructionOptions {
  instruction?: string;
  fromHighlights?: boolean;
  dryRun?: boolean;
  ifMatch?: string;
  confirm?: boolean;
}

export type InstructionResult =
  | { status: 'preview'; newHtml: string; usedIds: string[] }
  | { status: EditResult['status']; id: string; usedIds: string[] };

/**
 * LLM-driven edit. Gathers instructions (free-form and/or from action highlights),
 * sends the doc to a local engine, validates the returned HTML, and applies it as a
 * TARGETED edit (does not wipe all highlights — only the used action ones are consumed).
 */
export async function runInstructionEdit(
  ref: string,
  opts: InstructionOptions,
  ports: UploadPorts,
  runner: Runner,
): Promise<InstructionResult> {
  const { html, row } = await getDocHtml(ref, ports);

  const instructions: string[] = [];
  let usedIds: string[] = [];
  if (opts.fromHighlights) {
    const highlights = (await ports.db.listHighlights?.(row.id)) ?? [];
    const conv = highlightsToInstructions(highlights);
    if (conv.lines.length === 0) throw new Error('이 문서에 편집/삭제 태그가 달린 하이라이트가 없습니다.');
    instructions.push(...conv.lines);
    usedIds = conv.usedIds;
  }
  if (opts.instruction) instructions.push(`- ${opts.instruction}`);
  if (instructions.length === 0) throw new Error('지시가 비어 있습니다: --instruction 또는 --from-highlights 가 필요합니다.');

  const out = await runner(buildInstructionPrompt(html, instructions));
  if (!out) throw new Error('LLM 실행 실패 — codex/claude 가 설치·로그인돼 있는지 확인하세요.');

  const newHtml = extractHtml(out);
  if (!newHtml) throw new Error('LLM 출력에서 완결된 HTML 문서를 찾지 못했습니다.');

  const parsed = parseMeta(newHtml);
  if (parsed.status === 'skip') throw new Error(`편집 결과 HTML이 유효하지 않습니다(${parsed.reason}). 적용하지 않습니다.`);
  if (slugFromPath(parsed.meta.path ?? '') !== row.id) {
    throw new Error('편집 결과가 문서 식별자(path)를 바꾸려 합니다. 적용하지 않습니다.');
  }

  if (opts.dryRun) return { status: 'preview', newHtml, usedIds };

  const edit = await editDoc(ref, newHtml, ports, {
    ifMatch: opts.ifMatch,
    confirm: opts.confirm,
    skipHighlightCleanup: true, // targeted: keep non-used highlights, consume only used ones
  });
  if (usedIds.length) await consumeHighlights(row.id, usedIds, ports);
  return { status: edit.status, id: edit.id, usedIds };
}
