import {nextSiblingDisambiguator} from './context.js';
import type {
  NodeIdentity,
  SourceRange,
  SyncAnchorContext,
  SyncNodeStability,
  SyncNodeType,
} from './types.js';

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
  const input = JSON.stringify(value);
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;

  return [h1, h2, h3, h4]
    .map(hash => (hash >>> 0).toString(16).padStart(8, '0'))
    .join('');
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
