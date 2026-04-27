import type * as notion from '../notion';
import type {supportedCodeLang, TableRowBlock} from '../notion';

export type SyncNodeType =
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'pdf'
  | 'file'
  | 'list_item'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'table'
  | 'code'
  | 'equation'
  | 'table_of_contents'
  | 'unknown';

export type SyncNodeStability = 'stable' | 'opaque';

export type SyncAssetKind = 'image' | 'pdf' | 'file';

export type RenderBlockSpec =
  | {
      type: 'paragraph';
      richText: notion.RichText[];
    }
  | {
      type: 'heading_1' | 'heading_2' | 'heading_3';
      richText: notion.RichText[];
    }
  | {
      type: 'bulleted_list_item';
      richText: notion.RichText[];
    }
  | {
      type: 'numbered_list_item';
      richText: notion.RichText[];
    }
  | {
      type: 'to_do';
      checked: boolean;
      richText: notion.RichText[];
    }
  | {
      type: 'quote';
      richText: notion.RichText[];
    }
  | {
      type: 'callout';
      richText: notion.RichText[];
      emoji: notion.EmojiRequest;
      color: notion.ApiColor;
    }
  | {
      type: 'divider';
    }
  | {
      type: 'asset';
      assetKind: SyncAssetKind;
      url: string;
      originalRef: string;
      name?: string;
    }
  | {
      type: 'table';
      rows: TableRowBlock[];
      tableWidth: number;
    }
  | {
      type: 'code';
      richText: notion.RichText[];
      language: supportedCodeLang;
    }
  | {
      type: 'equation';
      expression: string;
    }
  | {
      type: 'table_of_contents';
    };

export type ResolvedAsset =
  | string
  | {
      url: string;
      kind?: SyncAssetKind;
      name?: string;
    };

export interface SourceRange {
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export interface NodeIdentity {
  explicitKey?: string;
  semanticKey: string;
  fallbackKey: string;
  plainText?: string;
}

export interface SyncDiagnostic {
  code: string;
  level: 'info' | 'warning';
  message: string;
  nodeType?: string;
  path?: number[];
  source?: SourceRange;
  syncKey?: string;
}

export interface SyncNode {
  syncKey: string;
  nodeType: SyncNodeType;
  stability: SyncNodeStability;
  contentHash: string;
  subtreeHash: string;
  parentKey?: string;
  order: number;
  path: number[];
  source?: SourceRange;
  identity: NodeIdentity;
  render: RenderBlockSpec;
  children: SyncNode[];
}

export interface SyncFlatNode extends Omit<SyncNode, 'children'> {
  childKeys: string[];
}

export interface SyncDocument {
  version: 1;
  root: SyncNode[];
  flat: SyncFlatNode[];
  diagnostics: SyncDiagnostic[];
}

export interface SyncAnchorContext {
  nodeType: SyncNodeType;
  plainText?: string;
  originalRef?: string;
  source?: SourceRange;
  path: number[];
  semanticBase: string;
}

export interface SyncOptions {
  strictImageUrls?: boolean;
  enableEmojiCallouts?: boolean;
  includeSourceRange?: boolean;
  keyStrategy?: 'semantic' | 'semantic-with-position';
  textAnchorLength?: number;
  slugify?: (text: string) => string;
  normalizeText?: (text: string) => string;
  explicitAnchorPattern?: RegExp;
  extractExplicitAnchor?: (ctx: SyncAnchorContext) => string | undefined;
}

export interface SyncRenderOptions {
  assetMap?: Record<string, ResolvedAsset>;
  strictImageUrls?: boolean;
  notionLimits?: {
    truncate?: boolean;
    onError?: (err: Error) => void;
  };
}
