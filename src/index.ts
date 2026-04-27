import {unified} from 'unified';
import markdown from 'remark-parse';
import type * as notion from './notion';
import {
  BlocksOptions,
  parseBlocks,
  parseRichText,
  RichTextOptions,
} from './parser/internal';
import type * as md from './markdown';
import gfm from 'remark-gfm';
import remarkMath from 'remark-math';
import {
  buildSyncDocument,
  syncDocumentToBlocks as renderSyncDocumentToBlocks,
  type SyncDocument,
  type SyncOptions,
  type SyncRenderOptions,
} from './sync';

/**
 * Parses Markdown content into Notion Blocks.
 *
 * @param body Any Markdown or GFM content
 * @param options Any additional option
 */
export function markdownToBlocks(
  body: string,

  options?: BlocksOptions,
): notion.Block[] {
  const root = unified().use(markdown).use(gfm).use(remarkMath).parse(body);
  return parseBlocks(root as unknown as md.Root, options);
}

/**
 * Parses inline Markdown content into Notion RichText objects.
 * Only supports plain text, italics, bold, strikethrough, inline code, and hyperlinks.
 *
 * @param text any inline Markdown or GFM content
 * @param options Any additional option
 */
export function markdownToRichText(
  text: string,
  options?: RichTextOptions,
): notion.RichText[] {
  const root = unified().use(markdown).use(gfm).parse(text);
  return parseRichText(root as unknown as md.Root, options);
}

export function markdownToSyncDocument(
  body: string,
  options?: SyncOptions,
): SyncDocument {
  const root = unified().use(markdown).use(gfm).use(remarkMath).parse(body);
  return buildSyncDocument(root as unknown as md.Root, options);
}

export function syncDocumentToBlocks(
  doc: SyncDocument,
  options?: SyncRenderOptions,
): notion.Block[] {
  return renderSyncDocumentToBlocks(doc, options);
}

export interface BlocksWithSyncOptions extends BlocksOptions {
  sync?: SyncOptions;
  assetMap?: SyncRenderOptions['assetMap'];
}

export function markdownToBlocksWithSync(
  body: string,
  options?: BlocksWithSyncOptions,
): {blocks: notion.Block[]; sync: SyncDocument} {
  const sync = markdownToSyncDocument(body, {
    ...options?.sync,
    strictImageUrls:
      options?.sync?.strictImageUrls ?? options?.strictImageUrls,
    enableEmojiCallouts:
      options?.sync?.enableEmojiCallouts ?? options?.enableEmojiCallouts,
  });

  return {
    blocks: renderSyncDocumentToBlocks(sync, {
      assetMap: options?.assetMap,
      strictImageUrls: options?.strictImageUrls,
      notionLimits: options?.notionLimits,
    }),
    sync,
  };
}

export {LIMITS} from './notion';

export {paragraph} from './notion';
export type {SyncDocument, SyncOptions, SyncRenderOptions} from './sync';
