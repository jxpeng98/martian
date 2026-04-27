import {createHash} from 'crypto';
import {nextSiblingDisambiguator} from './context';
import type {
  NodeIdentity,
  SourceRange,
  SyncAnchorContext,
  SyncNodeStability,
  SyncNodeType,
} from './types';

interface BuildNodeIdentityInput {
  siblingCounters: Map<string, number>;
  semanticBase: string;
  nodeType: SyncNodeType;
  stability: SyncNodeStability;
  plainText?: string;
  originalRef?: string;
  source?: SourceRange;
  path: number[];
  keyStrategy: 'semantic' | 'semantic-with-position';
  explicitAnchorPattern?: RegExp;
  extractExplicitAnchor?: (ctx: SyncAnchorContext) => string | undefined;
  slugify: (text: string) => string;
}

export function buildNodeIdentity(
  input: BuildNodeIdentityInput,
): {syncKey: string; identity: NodeIdentity} {
  const explicitKey = extractExplicitAnchor(input);
  const explicitBase = explicitKey
    ? `${input.semanticBase}/explicit/${input.slugify(explicitKey) || explicitKey}`
    : undefined;
  const semanticKey = nextSiblingDisambiguator(
    explicitBase ?? input.semanticBase,
    input.siblingCounters,
  );
  const fallbackKey = buildFallbackKey(semanticKey, input.source, input.path);
  const syncKey =
    input.keyStrategy === 'semantic-with-position' &&
    input.stability === 'opaque' &&
    !explicitKey
      ? fallbackKey
      : semanticKey;

  return {
    syncKey,
    identity: {
      explicitKey,
      semanticKey,
      fallbackKey,
      plainText: input.plainText,
    },
  };
}

export function hashContent(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function finalizeSubtreeHash(
  contentHash: string,
  childSubtreeHashes: string[],
): string {
  return hashContent({
    contentHash,
    childSubtreeHashes,
  });
}

function extractExplicitAnchor(input: BuildNodeIdentityInput): string | undefined {
  const context: SyncAnchorContext = {
    nodeType: input.nodeType,
    plainText: input.plainText,
    originalRef: input.originalRef,
    source: input.source,
    path: input.path,
    semanticBase: input.semanticBase,
  };

  const custom = input.extractExplicitAnchor?.(context);
  if (custom) {
    return custom;
  }

  if (input.explicitAnchorPattern && input.plainText) {
    const match = input.plainText.match(input.explicitAnchorPattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  const obsidianMatch = input.plainText?.match(/\^([A-Za-z0-9-]+)\s*$/);
  return obsidianMatch?.[1];
}

function buildFallbackKey(
  semanticKey: string,
  source: SourceRange | undefined,
  path: number[],
): string {
  if (source?.startLine !== undefined || source?.startColumn !== undefined) {
    const line = source.startLine ?? 0;
    const column = source.startColumn ?? 0;
    return `${semanticKey}@L${line}C${column}`;
  }

  return `${semanticKey}@${path.join('.') || 0}`;
}
