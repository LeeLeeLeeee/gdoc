/** Reduce a doc's HTML to plain text for embedding: drop script/style, strip tags,
 *  decode the common entities, collapse whitespace. Title/category/tags are prefixed
 *  so the topical signal survives the model's token truncation. */
export function extractText(
  html: string,
  meta: { title: string; tags: string[]; category: string },
  maxChars = 4000,
): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  const head = [meta.title, meta.category, meta.tags.join(' ')].filter(Boolean).join(' · ');
  return `${head}\n${body}`.slice(0, maxChars).trim();
}
