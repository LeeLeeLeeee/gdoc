export const ACTION_KEYWORDS = ['편집', '삭제'] as const;
export const INFO_KEYWORDS = ['궁금', '중요', '확인'] as const;
export const HIGHLIGHT_KEYWORDS = [...ACTION_KEYWORDS, ...INFO_KEYWORDS] as const;

export type HighlightKeyword = (typeof HIGHLIGHT_KEYWORDS)[number];

export function isActionKeyword(k: string): boolean {
  return (ACTION_KEYWORDS as readonly string[]).includes(k);
}
