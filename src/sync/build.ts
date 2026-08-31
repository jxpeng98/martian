import * as md from '../markdown/index.js';
import * as notion from '../notion/index.js';
import {
  ensureCodeBlockLanguage,
  ensureLength,
  parseInline,
} from '../parser/shared.js';
import {
  buildScopedPath,
  createChildContext,
  createRootContext,
  defaultNormalizeText,
  defaultSlugify,
  nodeSourceRange,
  rangeFromNodes,
  updateHeadingStack,
  type HeadingScope,
  type SequenceContext,
} from './context.js';
import {buildNodeIdentity, finalizeSubtreeHash, hashContent} from './identity.js';
import {
  buildTextAnchor,
  normalizeAssetRef,
  plainTextFromRichText,
} from './normalize.js';
import {basename, extension, pathnameFromRef} from './path.js';
import type {
  RenderBlockSpec,
  SyncDocument,
  SyncDiagnostic,
  SyncNode,
  SyncAssetKind,
  SyncNodeStability,
  SyncNodeType,
  SyncOptions,
  SourceRange,
} from './types.js';

interface NodeDraft {
  nodeType: SyncNodeType;
  stability: SyncNodeStability;
  semanticBase: string;
  render: RenderBlockSpec;
  plainText?: string;
  originalRef?: string;
  source?: SourceRange;
}

interface FlowBuilder {
  nodes: SyncNode[];
  headingStack: HeadingScope[];
  scopePrefix: string;
  appendFlowNode(node: md.FlowContent): void;
  appendDraft(
    draft: NodeDraft,
    buildChildren?: (builder: FlowBuilder, parentNode: SyncNode) => void,
    nextHeadingStack?: HeadingScope[],
  ): SyncNode;
}

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

const FILE_TYPES = [
  '.csv',
  '.doc',
  '.docx',
  '.epub',
  '.gz',
  '.key',
  '.md',
  '.mp3',
  '.mp4',
  '.numbers',
  '.pages',
  '.ppt',
  '.pptx',
  '.rtf',
  '.tar',
  '.txt',
  '.wav',
  '.xls',
  '.xlsx',
  '.zip',
];

export function buildSyncDocument(
  root: md.Root,
  options?: SyncOptions,
): SyncDocument {
  const context = createRootContext(options);
  const builder = createFlowBuilder(context);
  root.children.forEach(child => builder.appendFlowNode(child));

  return {
    version: 1,
    root: builder.nodes,
    flat: flattenSyncNodes(builder.nodes),
    diagnostics: context.diagnostics,
  };
}

function createFlowBuilder(context: SequenceContext): FlowBuilder {
  const nodes: SyncNode[] = [];
  const siblingCounters = new Map<string, number>();
  let headingStack = [...context.headingStack];

  const appendDraft = (
    draft: NodeDraft,
    buildChildren?: (builder: FlowBuilder, parentNode: SyncNode) => void,
    nextHeadingStack?: HeadingScope[],
  ): SyncNode => {
    const path = [...context.pathPrefix, nodes.length];
    const source = context.options.includeSourceRange ? draft.source : undefined;
    const {syncKey, identity} = buildNodeIdentity({
      siblingCounters,
      semanticBase: draft.semanticBase,
      nodeType: draft.nodeType,
      stability: draft.stability,
      plainText: draft.plainText,
      originalRef: draft.originalRef,
      source,
      path,
      keyStrategy: context.options.keyStrategy,
      explicitAnchorPattern: context.options.explicitAnchorPattern,
      extractExplicitAnchor: context.options.extractExplicitAnchor,
      slugify: context.options.slugify,
    });

    const contentHash = hashContent({
      nodeType: draft.nodeType,
      render: draft.render,
      plainText: draft.plainText,
      originalRef: draft.originalRef,
    });

    const node: SyncNode = {
      syncKey,
      nodeType: draft.nodeType,
      stability: draft.stability,
      contentHash,
      subtreeHash: contentHash,
      parentKey: context.parentKey,
      order: path[path.length - 1] ?? 0,
      path,
      source,
      identity,
      render: draft.render,
      children: [],
    };

    if (buildChildren) {
      const childBuilder = createFlowBuilder(createChildContext(context, node));
      buildChildren(childBuilder, node);
      node.children = childBuilder.nodes;
      node.subtreeHash = finalizeSubtreeHash(
        contentHash,
        node.children.map(child => child.subtreeHash),
      );
    }

    nodes.push(node);

    if (nextHeadingStack) {
      headingStack = nextHeadingStack;
    }

    return node;
  };

  return {
    nodes,
    get headingStack() {
      return headingStack;
    },
    get scopePrefix() {
      return currentScopePrefix(context, headingStack);
    },
    appendDraft,
    appendFlowNode(node: md.FlowContent) {
      buildFlowNode(node, context, this);
    },
  };
}

function buildFlowNode(
  node: md.FlowContent,
  context: SequenceContext,
  builder: FlowBuilder,
) {
  switch (node.type) {
    case 'heading':
      buildHeadingNode(node, context, builder);
      return;

    case 'paragraph':
      buildParagraphNodes(node, context, builder);
      return;

    case 'code':
      buildCodeNode(node, context, builder);
      return;

    case 'blockquote':
      buildBlockquoteNode(node, context, builder);
      return;

    case 'list':
      buildListNodes(node, context, builder);
      return;

    case 'table':
      buildTableNode(node, context, builder);
      return;

    case 'math':
      buildMathNode(node, context, builder);
      return;

    case 'thematicBreak':
      buildDividerNode(node, context, builder);
      return;

    case 'image':
      buildImageDraft(node, context, builder);
      return;

    default:
      pushDiagnostic(context.diagnostics, {
        code: 'unsupported-flow-node',
        level: 'warning',
        message: `Unsupported markdown element: ${node.type}`,
        nodeType: node.type,
        source: nodeSourceRange(node),
      });
  }
}

function buildHeadingNode(
  element: md.Heading,
  context: SequenceContext,
  builder: FlowBuilder,
) {
  const richText = element.children.flatMap(child => parseInline(child));
  const plainText = plainTextFromRichText(richText);
  const slug =
    context.options.slugify(
      context.options.normalizeText(plainText || `heading-${element.depth}`),
    ) || `heading-${element.depth}`;
  const headingType =
    element.depth === 1 ? 'heading_1' : element.depth === 2 ? 'heading_2' : 'heading_3';
  const nextHeadingStack = updateHeadingStack(
    builder.headingStack,
    element.depth,
    `heading/${element.depth}/${slug}`,
  );

  builder.appendDraft(
    {
      nodeType: 'heading',
      stability: 'stable',
      semanticBase: buildScopedPath(
        context.parentScopeKey,
        ...nextHeadingStack.map(item => item.segment),
      ),
      render: {
        type: headingType,
        richText,
      },
      plainText,
      source: nodeSourceRange(element),
    },
    undefined,
    nextHeadingStack,
  );
}

function buildParagraphNodes(
  element: md.Paragraph,
  context: SequenceContext,
  builder: FlowBuilder,
) {
  const tocDraft = maybeBuildTableOfContentsDraft(element, context, builder.headingStack);
  if (tocDraft) {
    builder.appendDraft(tocDraft);
    return;
  }

  const segments = segmentParagraph(element);
  segments.forEach(segment => {
    if (segment.type === 'paragraph') {
      const richText = segment.children.flatMap(child => parseInline(child));
      if (richText.length === 0) {
        pushDiagnostic(context.diagnostics, {
          code: 'empty-paragraph-segment',
          level: 'info',
          message: 'Skipped an empty paragraph segment after inline normalization.',
          nodeType: 'paragraph',
          source: rangeFromNodes(segment.children),
        });
        return;
      }

      const plainText = plainTextFromRichText(richText);
      const anchor = buildTextAnchor(
        plainText,
        context.options.normalizeText,
        context.options.slugify,
        context.options.textAnchorLength,
      );

      builder.appendDraft({
        nodeType: 'paragraph',
        stability: 'stable',
        semanticBase: buildScopedPath(
          currentScopePrefix(context, builder.headingStack),
          `paragraph/${anchor}`,
        ),
        render: {
          type: 'paragraph',
          richText,
        },
        plainText,
        source: rangeFromNodes(segment.children) ?? nodeSourceRange(element),
      });
      return;
    }

    buildImageDraft(
      segment.image,
      context,
      builder,
      currentScopePrefix(context, builder.headingStack),
    );
  });
}

function buildCodeNode(
  element: md.Code,
  context: SequenceContext,
  builder: FlowBuilder,
) {
  const text = ensureLength(element.value);
  const plainText = element.value;
  const anchor = buildTextAnchor(
    plainText,
    context.options.normalizeText,
    context.options.slugify,
    context.options.textAnchorLength,
  );

  builder.appendDraft({
    nodeType: 'code',
    stability: 'opaque',
    semanticBase: buildScopedPath(
      currentScopePrefix(context, builder.headingStack),
      `code/${anchor}`,
    ),
    render: {
      type: 'code',
      richText: text,
      language: ensureCodeBlockLanguage(element.lang) ?? 'plain text',
    },
    plainText,
    source: nodeSourceRange(element),
  });
}

function buildBlockquoteNode(
  element: md.Blockquote,
  context: SequenceContext,
  builder: FlowBuilder,
) {
  const firstChild = element.children[0];
  const firstTextNode =
    firstChild?.type === 'paragraph'
      ? (firstChild as md.Paragraph).children[0]
      : undefined;

  if (firstTextNode?.type === 'text') {
    const firstParagraph = firstChild as md.Paragraph;
    const gfmAlert = buildGfmCalloutDraft(
      element,
      firstParagraph,
      firstTextNode,
      context,
      builder,
    );
    if (gfmAlert) {
      return;
    }

    const obsidianCallout = buildObsidianCalloutDraft(
      element,
      firstParagraph,
      firstTextNode,
      context,
      builder,
    );
    if (obsidianCallout) {
      return;
    }

    if (context.options.enableEmojiCallouts) {
      const emojiCallout = buildEmojiCalloutDraft(
        element,
        firstParagraph,
        firstTextNode,
        context,
        builder,
      );
      if (emojiCallout) {
        return;
      }
    }
  }

  const plainText = blockquotePlainText(element);
  const anchor = buildTextAnchor(
    plainText || 'quote',
    context.options.normalizeText,
    context.options.slugify,
    context.options.textAnchorLength,
  );

  builder.appendDraft(
    {
      nodeType: 'quote',
      stability: 'stable',
      semanticBase: buildScopedPath(
        currentScopePrefix(context, builder.headingStack),
        `quote/${anchor}`,
      ),
      render: {
        type: 'quote',
        richText: [],
      },
      plainText,
      source: nodeSourceRange(element),
    },
    childBuilder => {
      element.children.forEach(child => childBuilder.appendFlowNode(child));
    },
  );
}

function buildListNodes(
  element: md.List,
  context: SequenceContext,
  builder: FlowBuilder,
) {
  element.children.forEach((item, index) => {
    const firstChild = item.children[0];
    const paragraph = firstChild?.type === 'paragraph' ? firstChild : undefined;
    const richText = paragraph
      ? paragraph.children.flatMap(child => parseInline(child))
      : [];
    const plainText = plainTextFromRichText(richText);
    const anchor = buildTextAnchor(
      plainText || `${index + 1}`,
      context.options.normalizeText,
      context.options.slugify,
      context.options.textAnchorLength,
    );
    const render =
      element.start !== null && element.start !== undefined
        ? ({type: 'numbered_list_item', richText} as const)
        : item.checked !== null && item.checked !== undefined
          ? ({type: 'to_do', checked: item.checked, richText} as const)
          : ({type: 'bulleted_list_item', richText} as const);
    const restChildren = paragraph ? item.children.slice(1) : item.children.slice();

    if (
      paragraph &&
      paragraph.children.some(
        child => child.type === 'image' || child.type === 'break',
      )
    ) {
      pushDiagnostic(context.diagnostics, {
        code: 'list-item-inline-segmentation',
        level: 'warning',
        message:
          'Inline images and hard breaks inside the first list paragraph are not split into dedicated sync nodes yet.',
        nodeType: 'listitem',
        source: nodeSourceRange(paragraph),
      });
    }

    builder.appendDraft(
      {
        nodeType: 'list_item',
        stability: 'stable',
        semanticBase: buildScopedPath(
          currentScopePrefix(context, builder.headingStack),
          `list-item/${anchor}`,
        ),
        render,
        plainText,
        source: nodeSourceRange(item),
      },
      childBuilder => {
        restChildren.forEach(child => childBuilder.appendFlowNode(child));
      },
    );
  });
}

function buildTableNode(
  element: md.Table,
  context: SequenceContext,
  builder: FlowBuilder,
) {
  const rows = element.children.map(row => notion.tableRow(row.children.map(cell => parseTableCell(cell))));
  const tableWidth = element.children.length ? element.children[0].children.length : 0;
  const plainText = rows
    .flatMap(row =>
      row.table_row.cells.map(cell => plainTextFromRichText(cell)),
    )
    .join(' | ');
  const anchor = buildTextAnchor(
    plainText || 'table',
    context.options.normalizeText,
    context.options.slugify,
    context.options.textAnchorLength,
  );

  builder.appendDraft({
    nodeType: 'table',
    stability: 'opaque',
    semanticBase: buildScopedPath(
      currentScopePrefix(context, builder.headingStack),
      `table/${anchor}`,
    ),
    render: {
      type: 'table',
      rows,
      tableWidth,
    },
    plainText,
    source: nodeSourceRange(element),
  });
}

function buildMathNode(
  element: md.Math,
  context: SequenceContext,
  builder: FlowBuilder,
) {
  const anchor = buildTextAnchor(
    element.value,
    context.options.normalizeText,
    context.options.slugify,
    context.options.textAnchorLength,
  );

  builder.appendDraft({
    nodeType: 'equation',
    stability: 'opaque',
    semanticBase: buildScopedPath(
      currentScopePrefix(context, builder.headingStack),
      `equation/${anchor}`,
    ),
    render: {
      type: 'equation',
      expression: element.value.split('\n').join('\n'),
    },
    plainText: element.value,
    source: nodeSourceRange(element),
  });
}

function buildDividerNode(
  element: md.ThematicBreak,
  context: SequenceContext,
  builder: FlowBuilder,
) {
  builder.appendDraft({
    nodeType: 'divider',
    stability: 'stable',
    semanticBase: buildScopedPath(
      currentScopePrefix(context, builder.headingStack),
      'divider',
    ),
    render: {
      type: 'divider',
    },
    source: nodeSourceRange(element),
  });
}

function buildImageDraft(
  image: md.Image,
  context: SequenceContext,
  builder: FlowBuilder,
  scopePrefix = currentScopePrefix(context, builder.headingStack),
) {
  const imageDraft = createImageDraft(image, context, scopePrefix);
  builder.appendDraft(imageDraft);
}

function createImageDraft(
  image: md.Image,
  context: SequenceContext,
  scopePrefix: string,
): NodeDraft {
  const assetKind = detectAssetKind(image.url);
  return {
    nodeType: assetKind,
    stability: 'stable',
    semanticBase: buildScopedPath(
      scopePrefix,
      `asset/${normalizeAssetRef(
        image.url,
        context.options.normalizeText,
        context.options.slugify,
      )}`,
    ),
    render: {
      type: 'asset',
      assetKind,
      url: image.url,
      originalRef: image.url,
      name: assetKind === 'file' ? assetDisplayName(image.url) : undefined,
    },
    plainText: image.url,
    originalRef: image.url,
    source: nodeSourceRange(image),
  };
}

function maybeBuildTableOfContentsDraft(
  element: md.Paragraph,
  context: SequenceContext,
  headingStack: HeadingScope[],
): NodeDraft | null {
  const mightBeToc =
    element.children.length > 2 &&
    element.children[0].type === 'text' &&
    element.children[0].value === '[[' &&
    element.children[1].type === 'emphasis';

  if (!mightBeToc) {
    return null;
  }

  const emphasisItem = element.children[1] as md.Emphasis;
  const emphasisTextItem = emphasisItem.children[0] as md.Text;
  if (emphasisTextItem.value !== 'TOC') {
    return null;
  }

  return {
    nodeType: 'table_of_contents',
    stability: 'opaque',
    semanticBase: buildScopedPath(
      currentScopePrefix(context, headingStack),
      'table-of-contents',
    ),
    render: {
      type: 'table_of_contents',
    },
    plainText: 'TOC',
    source: nodeSourceRange(element),
  };
}

function buildGfmCalloutDraft(
  element: md.Blockquote,
  paragraph: md.Paragraph,
  firstTextNode: md.Text,
  context: SequenceContext,
  builder: FlowBuilder,
): boolean {
  const firstLine = firstTextNode.value.split('\n')[0];
  const gfmMatch = firstLine.match(
    /^(?:\\\[|\[)!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/,
  );

  if (!gfmMatch) {
    return false;
  }

  const alertType = gfmMatch[1].toUpperCase();
  if (!notion.isGfmAlertType(alertType)) {
    return false;
  }

  const config = notion.GFM_ALERT_MAP[alertType];
  const firstParagraphRichText = parseParagraphAfterTextPrefix(
    paragraph,
    firstTextNode,
    firstLine.length,
    true,
  );
  const anchor = buildTextAnchor(
    config.title,
    context.options.normalizeText,
    context.options.slugify,
    context.options.textAnchorLength,
  );

  builder.appendDraft(
    {
      nodeType: 'callout',
      stability: 'stable',
      semanticBase: buildScopedPath(
        currentScopePrefix(context, builder.headingStack),
        `callout/${anchor}`,
      ),
      render: {
        type: 'callout',
        richText: [notion.richText(config.title)],
        emoji: config.emoji,
        color: config.color,
      },
      plainText: config.title,
      source: nodeSourceRange(element),
    },
    childBuilder => {
      if (firstParagraphRichText.length > 0) {
        appendSyntheticParagraphNode(
          childBuilder,
          paragraph.position ? nodeSourceRange(paragraph) : undefined,
          firstParagraphRichText,
        );
      }

      element.children.slice(1).forEach(child => childBuilder.appendFlowNode(child));
    },
  );

  return true;
}

function buildObsidianCalloutDraft(
  element: md.Blockquote,
  paragraph: md.Paragraph,
  firstTextNode: md.Text,
  context: SequenceContext,
  builder: FlowBuilder,
): boolean {
  const obsidianMatch = firstTextNode.value.match(/^\[!([a-z]+)\](?:[+-])?\s*/i);
  if (!obsidianMatch) {
    return false;
  }

  const calloutType = obsidianMatch[1].toUpperCase();
  if (!notion.isGfmAlertType(calloutType)) {
    return false;
  }

  const config = notion.GFM_ALERT_MAP[calloutType];
  const richText = parseParagraphAfterTextPrefix(
    paragraph,
    firstTextNode,
    obsidianMatch[0].length,
    false,
  );
  const titleText = plainTextFromRichText(richText) || config.title;
  const anchor = buildTextAnchor(
    titleText,
    context.options.normalizeText,
    context.options.slugify,
    context.options.textAnchorLength,
  );

  builder.appendDraft(
    {
      nodeType: 'callout',
      stability: 'stable',
      semanticBase: buildScopedPath(
        currentScopePrefix(context, builder.headingStack),
        `callout/${anchor}`,
      ),
      render: {
        type: 'callout',
        richText: richText.length ? richText : [notion.richText(config.title)],
        emoji: config.emoji,
        color: config.color,
      },
      plainText: titleText,
      source: nodeSourceRange(element),
    },
    childBuilder => {
      element.children.slice(1).forEach(child => childBuilder.appendFlowNode(child));
    },
  );

  return true;
}

function buildEmojiCalloutDraft(
  element: md.Blockquote,
  paragraph: md.Paragraph,
  firstTextNode: md.Text,
  context: SequenceContext,
  builder: FlowBuilder,
): boolean {
  const emojiData = notion.parseCalloutEmoji(firstTextNode.value);
  if (!emojiData) {
    return false;
  }

  const richText = paragraph.children.flatMap(child =>
    child === firstTextNode
      ? parseInline({
          type: 'text',
          value: firstTextNode.value.slice(emojiData.emoji.length).trimStart(),
        })
      : parseInline(child),
  );
  const plainText = plainTextFromRichText(richText);
  const anchor = buildTextAnchor(
    plainText || emojiData.emoji,
    context.options.normalizeText,
    context.options.slugify,
    context.options.textAnchorLength,
  );

  builder.appendDraft(
    {
      nodeType: 'callout',
      stability: 'stable',
      semanticBase: buildScopedPath(
        currentScopePrefix(context, builder.headingStack),
        `callout/${anchor}`,
      ),
      render: {
        type: 'callout',
        richText,
        emoji: emojiData.emoji,
        color: emojiData.color,
      },
      plainText,
      source: nodeSourceRange(element),
    },
    childBuilder => {
      element.children.slice(1).forEach(child => childBuilder.appendFlowNode(child));
    },
  );

  return true;
}

function appendSyntheticParagraphNode(
  builder: FlowBuilder,
  source: SourceRange | undefined,
  richText: notion.RichText[],
) {
  const plainText = plainTextFromRichText(richText);
  const anchor = buildTextAnchor(
    plainText,
    defaultNormalizeText,
    defaultSlugify,
    48,
  );

  builder.appendDraft({
    nodeType: 'paragraph',
    stability: 'stable',
    semanticBase: buildScopedPath(builder.scopePrefix, `paragraph/${anchor}`),
    render: {
      type: 'paragraph',
      richText,
    },
    plainText,
    source,
  });
}

function parseTableCell(node: md.TableCell): notion.RichText[] {
  return node.children.flatMap(child => parseInline(child));
}

function currentScopePrefix(
  context: SequenceContext,
  headingStack: HeadingScope[],
): string {
  return buildScopedPath(
    context.parentScopeKey,
    ...headingStack.map(item => item.segment),
  );
}

function parseParagraphAfterTextPrefix(
  paragraph: md.Paragraph,
  firstTextNode: md.Text,
  offset: number,
  stripLeadingNewline: boolean,
): notion.RichText[] {
  return paragraph.children.flatMap(child => {
    if (child !== firstTextNode) {
      return parseInline(child);
    }

    let text = firstTextNode.value.slice(offset);
    if (stripLeadingNewline) {
      text = text.replace(/^\n+/, '');
    }

    return text ? parseInline({type: 'text', value: text}) : [];
  });
}

function blockquotePlainText(element: md.Blockquote): string {
  return element.children
    .flatMap(child => {
      if (child.type === 'paragraph') {
        return child.children.flatMap(inline => parseInline(inline));
      }

      return [];
    })
    .map(item => {
      if (item.type === 'text') {
        return item.text.content;
      }
      if (item.type === 'equation') {
        return item.equation.expression;
      }

      return '';
    })
    .join(' ');
}

function flattenSyncNodes(nodes: SyncNode[]): SyncDocument['flat'] {
  const flat: SyncDocument['flat'] = [];

  const visit = (node: SyncNode) => {
    const {children, ...rest} = node;
    flat.push({
      ...rest,
      childKeys: children.map(child => child.syncKey),
    });
    children.forEach(visit);
  };

  nodes.forEach(visit);
  return flat;
}

function segmentParagraph(
  element: md.Paragraph,
): Array<
  {type: 'paragraph'; children: md.PhrasingContent[]} | {type: 'image'; image: md.Image}
> {
  const segments: Array<
    {type: 'paragraph'; children: md.PhrasingContent[]} | {type: 'image'; image: md.Image}
  > = [];
  let currentChildren: md.PhrasingContent[] = [];

  const pushParagraph = () => {
    if (currentChildren.length > 0) {
      segments.push({
        type: 'paragraph',
        children: currentChildren,
      });
      currentChildren = [];
    }
  };

  element.children.forEach(child => {
    if (child.type === 'image') {
      pushParagraph();
      segments.push({
        type: 'image',
        image: child,
      });
      return;
    }

    if (child.type === 'break') {
      pushParagraph();
      return;
    }

    currentChildren.push(child);
  });

  pushParagraph();
  return segments;
}

function pushDiagnostic(
  diagnostics: SyncDiagnostic[],
  diagnostic: SyncDiagnostic,
) {
  diagnostics.push(diagnostic);
}

function detectAssetKind(ref: string): SyncAssetKind {
  const extension = assetExtension(ref);
  if (extension === '.pdf') {
    return 'pdf';
  }

  if (ALLOWED_IMAGE_TYPES.includes(extension)) {
    return 'image';
  }

  if (FILE_TYPES.includes(extension)) {
    return 'file';
  }

  return 'image';
}

function assetDisplayName(ref: string): string | undefined {
  const base = basename(pathnameFromRef(ref));
  return base && base !== '.' ? decodeURIComponent(base) : undefined;
}

function assetExtension(ref: string): string {
  return extension(pathnameFromRef(ref));
}
