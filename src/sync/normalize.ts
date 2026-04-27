import type * as notion from '../notion';

export function buildTextAnchor(
  text: string | undefined,
  normalizeText: (text: string) => string,
  slugify: (text: string) => string,
  maxLength: number,
): string {
  const normalized = normalizeText(text ?? '');
  if (!normalized) {
    return 'empty';
  }

  const clipped = normalized.slice(0, maxLength);
  const slug = slugify(clipped);
  return slug || 'empty';
}

export function normalizeAssetRef(
  ref: string | undefined,
  normalizeText: (text: string) => string,
  slugify: (text: string) => string,
): string {
  const normalized = normalizeText(ref ?? '');
  if (!normalized) {
    return 'asset';
  }

  return slugify(normalized) || 'asset';
}

export function plainTextFromRichText(text: notion.RichText[]): string {
  return text
    .map(item => {
      if (item.type === 'text') {
        return item.text.content;
      }
      if (item.type === 'equation') {
        return item.equation.expression;
      }
      return '';
    })
    .join('');
}
