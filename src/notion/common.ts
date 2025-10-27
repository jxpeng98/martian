import type {RichText, EmojiRequest, ApiColor} from './blocks';

/**
 * The limits that the Notion API uses for property values.
 * @see https://developers.notion.com/reference/request-limits#limits-for-property-values
 */
export const LIMITS = {
  PAYLOAD_BLOCKS: 1000,
  RICH_TEXT_ARRAYS: 100,
  RICH_TEXT: {
    TEXT_CONTENT: 2000,
    LINK_URL: 1000,
    EQUATION_EXPRESSION: 1000,
  },
};

export interface RichTextOptions {
  type?: 'text' | 'equation'; // 'mention' is not supported
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
  url?: string;
}

function isValidURL(url: string | undefined): boolean {
  if (!url || url === '') {
    return false;
  }

  const urlRegex = /^https?:\/\/.+/i;
  return urlRegex.test(url);
}

export function richText(
  content: string,
  options: RichTextOptions = {},
): RichText {
  const annotations: RichText['annotations'] = {
    bold: false,
    strikethrough: false,
    underline: false,
    italic: false,
    code: false,
    color: 'default' as const,
    ...((options.annotations as RichText['annotations']) || {}),
  };

  if (options.type === 'equation')
    return {
      type: 'equation',
      annotations,
      equation: {
        expression: content,
      },
    };
  else
    return {
      type: 'text',
      annotations,
      text: {
        content: content,
        link: isValidURL(options.url)
          ? {
              type: 'url',
              url: options.url,
            }
          : undefined,
      },
    } as RichText;
}

export const SUPPORTED_CODE_BLOCK_LANGUAGES = [
  'abap',
  'arduino',
  'bash',
  'basic',
  'c',
  'clojure',
  'coffeescript',
  'c++',
  'c#',
  'css',
  'dart',
  'diff',
  'docker',
  'elixir',
  'elm',
  'erlang',
  'flow',
  'fortran',
  'f#',
  'gherkin',
  'glsl',
  'go',
  'graphql',
  'groovy',
  'haskell',
  'html',
  'java',
  'javascript',
  'json',
  'julia',
  'kotlin',
  'latex',
  'less',
  'lisp',
  'livescript',
  'lua',
  'makefile',
  'markdown',
  'markup',
  'matlab',
  'mermaid',
  'nix',
  'objective-c',
  'ocaml',
  'pascal',
  'perl',
  'php',
  'plain text',
  'powershell',
  'prolog',
  'protobuf',
  'python',
  'r',
  'reason',
  'ruby',
  'rust',
  'sass',
  'scala',
  'scheme',
  'scss',
  'shell',
  'sql',
  'swift',
  'typescript',
  'vb.net',
  'verilog',
  'vhdl',
  'visual basic',
  'webassembly',
  'xml',
  'yaml',
  'java/c/c++/c#',
] as const;

export type supportedCodeLang = (typeof SUPPORTED_CODE_BLOCK_LANGUAGES)[number];

export function isSupportedCodeLang(lang: string): lang is supportedCodeLang {
  return (SUPPORTED_CODE_BLOCK_LANGUAGES as readonly string[]).includes(lang);
}

export interface TableRowBlock {
  type: 'table_row';
  table_row: {
    cells: Array<Array<RichText>>;
  };
  object?: 'block';
}

export const SUPPORTED_GFM_ALERT_TYPES = [
  'NOTE',
  'TIP',
  'IMPORTANT',
  'WARNING',
  'CAUTION',
  'INFO',
  'TODO',
  'SUCCESS',
  'QUESTION',
  'FAILURE',
  'DANGER',
  'BUG',
  'EXAMPLE',
  'QUOTE',
] as const;

export type GfmAlertType = (typeof SUPPORTED_GFM_ALERT_TYPES)[number];

export function isGfmAlertType(type: string): type is GfmAlertType {
  return (SUPPORTED_GFM_ALERT_TYPES as readonly string[]).includes(type);
}

export const GFM_ALERT_MAP: Record<
  GfmAlertType,
  {
    emoji: EmojiRequest;
    color: ApiColor;
    title: string;
  }
> = {
  NOTE: {emoji: '📘', color: 'blue_background', title: 'Note'},
  TIP: {emoji: '💡', color: 'green_background', title: 'Tip'},
  IMPORTANT: {emoji: '☝️', color: 'purple_background', title: 'Important'},
  WARNING: {emoji: '⚠️', color: 'yellow_background', title: 'Warning'},
  CAUTION: {emoji: '❗', color: 'red_background', title: 'Caution'},
  INFO: {emoji: '📘', color: 'blue_background', title: 'Info'},
  TODO: {emoji: '📝', color: 'gray_background', title: 'To-do'},
  SUCCESS: {emoji: '✅', color: 'green_background', title: 'Success'},
  QUESTION: {emoji: '❓', color: 'purple_background', title: 'Question'},
  FAILURE: {emoji: '❌', color: 'red_background', title: 'Failure'},
  DANGER: {emoji: '☠️', color: 'red_background', title: 'Danger'},
  BUG: {emoji: '🐛', color: 'orange_background', title: 'Bug'},
  EXAMPLE: {emoji: '🧪', color: 'blue_background', title: 'Example'},
  QUOTE: {emoji: '💬', color: 'gray_background', title: 'Quote'},
} as const;

export const SUPPORTED_EMOJI_COLOR_MAP: Partial<
  Record<EmojiRequest, ApiColor>
> = {
  '👍': 'green_background',
  '📘': 'blue_background',
  '🚧': 'yellow_background',
  '❗': 'red_background',
  '💡': 'green_background',
  '📝': 'gray_background',
  '✅': 'green_background',
  '❓': 'purple_background',
  '⚠️': 'yellow_background',
  '❌': 'red_background',
  '☠️': 'red_background',
  '🐛': 'orange_background',
  '🧪': 'blue_background',
  '💬': 'gray_background',
};
