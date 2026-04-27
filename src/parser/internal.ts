import * as md from '../markdown';
import * as notion from '../notion';
import {LIMITS} from '../notion';
import {parseInline} from './shared';
import {buildSyncDocument} from '../sync/build';
import {syncDocumentToBlocks} from '../sync/render';
import type {SyncOptions} from '../sync/types';

/** Options common to all methods. */
export interface CommonOptions {
  /**
   * Define how to behave when an item exceeds the Notion's request limits.
   * @see https://developers.notion.com/reference/request-limits#limits-for-property-values
   */
  notionLimits?: {
    /**
     * Whether the excess items or characters should be automatically truncated where possible.
     * If set to `false`, the resulting item will not be compliant with Notion's limits.
     * Please note that text will be truncated only if the parser is not able to resolve
     * the issue in any other way.
     */
    truncate?: boolean;
    /** The callback for when an item exceeds Notion's limits. */
    onError?: (err: Error) => void;
  };
}

export interface BlocksOptions extends CommonOptions {
  /** Whether to render invalid images as text */
  strictImageUrls?: boolean;
  enableEmojiCallouts?: boolean;
}

export interface RichTextOptions extends CommonOptions {
  /**
   * How to behave when a non-inline element is detected:
   * - `ignore` (default): skip to the next element
   * - `throw`: throw an error
   */
  nonInline?: 'ignore' | 'throw';
}

export function parseBlocks(
  root: md.Root,
  options?: BlocksOptions,
): notion.Block[] {
  const syncOptions: SyncOptions = {
    strictImageUrls: options?.strictImageUrls,
    enableEmojiCallouts: options?.enableEmojiCallouts,
  };
  const doc = buildSyncDocument(root, syncOptions);
  return syncDocumentToBlocks(doc, {
    strictImageUrls: options?.strictImageUrls,
    notionLimits: options?.notionLimits,
  });
}

export function parseRichText(
  root: md.Root,
  options?: RichTextOptions,
): notion.RichText[] {
  const richTexts: notion.RichText[] = [];

  root.children.forEach(child => {
    if (child.type === 'paragraph')
      child.children.forEach(child => richTexts.push(...parseInline(child)));
    else if (options?.nonInline === 'throw')
      throw new Error(`Unsupported markdown element: ${JSON.stringify(child)}`);
  });

  const truncate = !!(options?.notionLimits?.truncate ?? true),
    limitCallback = options?.notionLimits?.onError ?? (() => {});

  if (richTexts.length > LIMITS.RICH_TEXT_ARRAYS)
    limitCallback(
      new Error(
        `Resulting richTexts array exceeds Notion limit (${LIMITS.RICH_TEXT_ARRAYS})`,
      ),
    );

  return (
    truncate ? richTexts.slice(0, LIMITS.RICH_TEXT_ARRAYS) : richTexts
  ).map(rt => {
    if (rt.type !== 'text') return rt;

    if (rt.text.content.length > LIMITS.RICH_TEXT.TEXT_CONTENT) {
      limitCallback(
        new Error(
          `Resulting text content exceeds Notion limit (${LIMITS.RICH_TEXT.TEXT_CONTENT})`,
        ),
      );
      if (truncate)
        rt.text.content =
          rt.text.content.slice(0, LIMITS.RICH_TEXT.TEXT_CONTENT - 3) + '...';
    }

    if (
      rt.text.link?.url &&
      rt.text.link.url.length > LIMITS.RICH_TEXT.LINK_URL
    )
      limitCallback(
        new Error(
          `Resulting text URL exceeds Notion limit (${LIMITS.RICH_TEXT.LINK_URL})`,
        ),
      );

    return rt;
  });
}
