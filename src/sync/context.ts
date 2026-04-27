import type {SyncDiagnostic, SyncOptions, SourceRange} from './types';

interface MaybePositionedNode {
  position?: {
    start?: {line?: number; column?: number};
    end?: {line?: number; column?: number};
  };
}

export interface HeadingScope {
  level: number;
  segment: string;
}

export interface ResolvedSyncOptions {
  strictImageUrls: boolean;
  enableEmojiCallouts: boolean;
  includeSourceRange: boolean;
  keyStrategy: 'semantic' | 'semantic-with-position';
  textAnchorLength: number;
  slugify: (text: string) => string;
  normalizeText: (text: string) => string;
  explicitAnchorPattern?: RegExp;
  extractExplicitAnchor?: SyncOptions['extractExplicitAnchor'];
}

export interface SequenceContext {
  parentKey?: string;
  parentScopeKey: string;
  pathPrefix: number[];
  headingStack: HeadingScope[];
  diagnostics: SyncDiagnostic[];
  options: ResolvedSyncOptions;
}

export function defaultNormalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function defaultSlugify(text: string): string {
  return defaultNormalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function resolveSyncOptions(options: SyncOptions = {}): ResolvedSyncOptions {
  return {
    strictImageUrls: options.strictImageUrls ?? true,
    enableEmojiCallouts: options.enableEmojiCallouts ?? false,
    includeSourceRange: options.includeSourceRange ?? true,
    keyStrategy: options.keyStrategy ?? 'semantic-with-position',
    textAnchorLength: options.textAnchorLength ?? 48,
    slugify: options.slugify ?? defaultSlugify,
    normalizeText: options.normalizeText ?? defaultNormalizeText,
    explicitAnchorPattern: options.explicitAnchorPattern,
    extractExplicitAnchor: options.extractExplicitAnchor,
  };
}

export function createRootContext(options?: SyncOptions): SequenceContext {
  return {
    parentScopeKey: 'root',
    pathPrefix: [],
    headingStack: [],
    diagnostics: [],
    options: resolveSyncOptions(options),
  };
}

export function createChildContext(
  parent: SequenceContext,
  parentNode: {syncKey: string; path: number[]; identity: {semanticKey: string}},
): SequenceContext {
  return {
    parentKey: parentNode.syncKey,
    parentScopeKey: parentNode.identity.semanticKey,
    pathPrefix: parentNode.path,
    headingStack: [],
    diagnostics: parent.diagnostics,
    options: parent.options,
  };
}

export function nextSiblingDisambiguator(
  base: string,
  siblingCounters: Map<string, number>,
): string {
  const seen = siblingCounters.get(base) ?? 0;
  siblingCounters.set(base, seen + 1);
  if (seen === 0) {
    return base;
  }

  return `${base}~${seen + 1}`;
}

export function updateHeadingStack(
  stack: HeadingScope[],
  level: number,
  segment: string,
): HeadingScope[] {
  return [...stack.filter(item => item.level < level), {level, segment}];
}

export function buildScopedPath(...segments: Array<string | undefined>): string {
  return segments.filter(Boolean).join('/');
}

export function nodeSourceRange(
  node?: MaybePositionedNode,
): SourceRange | undefined {
  const start = node?.position?.start;
  const end = node?.position?.end;
  if (!start && !end) {
    return undefined;
  }

  return {
    startLine: start?.line,
    startColumn: start?.column,
    endLine: end?.line,
    endColumn: end?.column,
  };
}

export function rangeFromNodes(
  nodes: MaybePositionedNode[],
): SourceRange | undefined {
  const first = nodes.find(node => node?.position?.start);
  const last = [...nodes].reverse().find(node => node?.position?.end);
  if (!first && !last) {
    return undefined;
  }

  return {
    startLine: first?.position?.start?.line,
    startColumn: first?.position?.start?.column,
    endLine: last?.position?.end?.line,
    endColumn: last?.position?.end?.column,
  };
}
