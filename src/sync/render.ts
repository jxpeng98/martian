import * as notion from '../notion/index.js';
import {LIMITS} from '../notion/index.js';
import {extension} from './path.js';
import type {
  ResolvedAsset,
  SyncAssetKind,
  SyncDocument,
  SyncNode,
  SyncRenderOptions,
} from './types.js';

const ALLOWED_IMAGE_TYPES = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.tif',
  '.tiff',
  '.bmp',
  '.svg',
  '.heic',
  '.webp',
];

export function syncDocumentToBlocks(
  doc: SyncDocument,
  options: SyncRenderOptions = {},
): notion.Block[] {
  const rendered = doc.root.flatMap(node => renderNode(node, options));
  const truncate = !!(options.notionLimits?.truncate ?? true);
  const limitCallback = options.notionLimits?.onError ?? (() => {});

  if (rendered.length > LIMITS.PAYLOAD_BLOCKS) {
    limitCallback(
      new Error(
        `Resulting blocks array exceeds Notion limit (${LIMITS.PAYLOAD_BLOCKS})`,
      ),
    );
  }

  return truncate ? rendered.slice(0, LIMITS.PAYLOAD_BLOCKS) : rendered;
}

function renderNode(
  node: SyncNode,
  options: SyncRenderOptions,
): notion.Block[] {
  const children = node.children.flatMap(child => renderNode(child, options));

  switch (node.render.type) {
    case 'paragraph':
      return [notion.paragraph(node.render.richText)];

    case 'heading_1':
      return [notion.headingOne(node.render.richText)];

    case 'heading_2':
      return [notion.headingTwo(node.render.richText)];

    case 'heading_3':
      return [notion.headingThree(node.render.richText)];

    case 'bulleted_list_item':
      return [
        notion.bulletedListItem(node.render.richText, children),
      ];

    case 'numbered_list_item':
      return [
        notion.numberedListItem(node.render.richText, children),
      ];

    case 'to_do':
      return [
        notion.toDo(node.render.checked, node.render.richText, children),
      ];

    case 'quote':
      return [notion.blockquote(node.render.richText, children)];

    case 'callout':
      return [
        notion.callout(
          node.render.richText,
          node.render.emoji,
          node.render.color,
          children,
        ),
      ];

    case 'divider':
      return [notion.divider()];

    case 'asset':
      return renderAssetNode(node.render, options);

    case 'table':
      return [notion.table(node.render.rows, node.render.tableWidth)];

    case 'code':
      return [notion.code(node.render.richText, node.render.language)];

    case 'equation':
      return [notion.equation(node.render.expression)];

    case 'table_of_contents':
      return [notion.table_of_contents()];

    default:
      return [];
  }
}

function renderAssetNode(
  asset: Extract<SyncNode['render'], {type: 'asset'}>,
  options: SyncRenderOptions,
): notion.Block[] {
  const resolved = resolveAsset(asset, options.assetMap);
  const strict = options.strictImageUrls ?? true;

  if (resolved.kind === 'image') {
    if (strict && !isValidExternalImageUrl(resolved.url)) {
      return [notion.paragraph([notion.richText(asset.originalRef)])];
    }

    return [notion.image(resolved.url)];
  }

  if (strict && !isValidExternalUrl(resolved.url)) {
    return [notion.paragraph([notion.richText(asset.originalRef)])];
  }

  if (resolved.kind === 'pdf') {
    return [notion.pdf(resolved.url)];
  }

  return [notion.file(resolved.url, resolved.name)];
}

function resolveAsset(
  asset: Extract<SyncNode['render'], {type: 'asset'}>,
  assetMap: Record<string, ResolvedAsset> | undefined,
): {url: string; kind: SyncAssetKind; name?: string} {
  const resolved = assetMap?.[asset.originalRef];
  if (!resolved) {
    return {
      url: asset.url,
      kind: asset.assetKind,
      name: asset.name,
    };
  }

  if (typeof resolved === 'string') {
    return {
      url: resolved,
      kind: asset.assetKind,
      name: asset.name,
    };
  }

  return {
    url: resolved.url,
    kind: resolved.kind ?? asset.assetKind,
    name: resolved.name ?? asset.name,
  };
}

function isValidExternalImageUrl(url: string): boolean {
  const parsed = safeUrl(url);
  if (!parsed) {
    return false;
  }

  return ALLOWED_IMAGE_TYPES.includes(extension(parsed.pathname));
}

function isValidExternalUrl(url: string): boolean {
  return safeUrl(url) !== undefined;
}

function safeUrl(url: string): URL | undefined {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}
