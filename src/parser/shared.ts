import * as md from '../markdown';
import * as notion from '../notion';
import {isSupportedCodeLang} from '../notion';

export function ensureLength(text: string, copy?: object) {
  const chunks = text.match(/[^]{1,2000}/g) || [];
  return chunks.flatMap((item: string) => notion.richText(item, copy));
}

export function ensureCodeBlockLanguage(lang?: string) {
  if (lang) {
    lang = lang.toLowerCase();
    return isSupportedCodeLang(lang) ? lang : notion.parseCodeLanguage(lang);
  }

  return undefined;
}

export function parseInline(
  element: md.PhrasingContent,
  options?: notion.RichTextOptions,
): notion.RichText[] {
  const copy = {
    annotations: {
      ...(options?.annotations ?? {}),
    },
    url: options?.url,
  };

  switch (element.type) {
    case 'text':
      return ensureLength(element.value, copy);

    case 'delete':
      copy.annotations.strikethrough = true;
      return element.children.flatMap(child => parseInline(child, copy));

    case 'emphasis':
      copy.annotations.italic = true;
      return element.children.flatMap(child => parseInline(child, copy));

    case 'strong':
      copy.annotations.bold = true;
      return element.children.flatMap(child => parseInline(child, copy));

    case 'link':
      copy.url = element.url;
      return element.children.flatMap(child => parseInline(child, copy));

    case 'inlineCode':
      copy.annotations.code = true;
      return [notion.richText(element.value, copy)];

    case 'inlineMath':
      return [notion.richText(element.value, {...copy, type: 'equation'})];

    default:
      return [];
  }
}
