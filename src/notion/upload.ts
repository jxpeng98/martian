import type {
  AppendBlockChildrenParameters,
  AppendBlockChildrenResponse,
} from '@notionhq/client/build/src/api-endpoints';
import type {Block} from './blocks.js';

type AppendFn = (
  args: Pick<
    AppendBlockChildrenParameters,
    'block_id' | 'children' | 'position'
  >,
) => Promise<AppendBlockChildrenResponse>;

export interface BlockChildrenAppendClient {
  blocks: {
    children: {
      append: AppendFn;
    };
  };
}

export interface AppendBlocksDeepOptions {
  position?: AppendBlockChildrenParameters['position'];
  /** @deprecated Use `position: {type: 'after_block', ...}`. */
  after?: string;
  batchSize?: number;
  onAppend?: (event: {
    parentId: string;
    depth: number;
    inputCount: number;
    paths: number[][];
    result: AppendBlockChildrenResponse;
  }) => void | Promise<void>;
}

export interface AppendedBlockMapping {
  path: number[];
  block: AppendBlockChildrenResponse['results'][number];
}

export interface AppendBlocksDeepResult {
  topLevelBlocks: AppendBlockChildrenResponse['results'];
  appendedBlocks: AppendBlockChildrenResponse['results'];
  blockMappings: AppendedBlockMapping[];
  requestCount: number;
}

const MAX_APPEND_CHILDREN = 100;

const DEFERRED_CHILDREN_BLOCK_TYPES = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'quote',
  'to_do',
  'toggle',
  'template',
  'callout',
  'synced_block',
  'column',
]);

export async function appendBlocksDeep(
  client: BlockChildrenAppendClient,
  parentId: string,
  blocks: Block[],
  options: AppendBlocksDeepOptions = {},
): Promise<AppendBlocksDeepResult> {
  const batchSize = normalizeBatchSize(options.batchSize);
  return appendBlocksDeepInternal(client, parentId, blocks, {
    position:
      options.position ??
      (options.after
        ? {type: 'after_block', after_block: {id: options.after}}
        : undefined),
    batchSize,
    depth: 0,
    pathPrefix: [],
    onAppend: options.onAppend,
  });
}

async function appendBlocksDeepInternal(
  client: BlockChildrenAppendClient,
  parentId: string,
  blocks: Block[],
  context: Required<Pick<AppendBlocksDeepOptions, 'batchSize'>> & {
    position?: AppendBlockChildrenParameters['position'];
    depth: number;
    pathPrefix: number[];
    onAppend?: AppendBlocksDeepOptions['onAppend'];
  },
): Promise<AppendBlocksDeepResult> {
  if (!blocks.length) {
    return {
      topLevelBlocks: [],
      appendedBlocks: [],
      blockMappings: [],
      requestCount: 0,
    };
  }

  const topLevelBlocks: AppendBlockChildrenResponse['results'] = [];
  const appendedBlocks: AppendBlockChildrenResponse['results'] = [];
  const blockMappings: AppendedBlockMapping[] = [];
  let requestCount = 0;
  let position = context.position;

  for (
    let batchStart = 0;
    batchStart < blocks.length;
    batchStart += context.batchSize
  ) {
    const batch = blocks.slice(batchStart, batchStart + context.batchSize);
    const paths = batch.map((_, index) => [
      ...context.pathPrefix,
      batchStart + index,
    ]);
    const response = await client.blocks.children.append({
      block_id: parentId,
      children: batch.map(stripDeferredChildren),
      position,
    });

    const created = response.results;
    assertCreatedBlocks(created, batch.length, parentId, context.depth);

    requestCount += 1;
    topLevelBlocks.push(...created);
    appendedBlocks.push(...created);
    blockMappings.push(
      ...created.map((block, index) => ({
        path: paths[index],
        block,
      })),
    );

    await context.onAppend?.({
      parentId,
      depth: context.depth,
      inputCount: batch.length,
      paths,
      result: response,
    });

    const lastCreated = created.at(-1);
    position = lastCreated?.id
      ? {
          type: 'after_block',
          after_block: {id: lastCreated.id},
        }
      : undefined;

    for (const [index, originalBlock] of batch.entries()) {
      const createdBlock = created[index];
      const childBlocks = getDeferredChildren(originalBlock);

      if (!createdBlock?.id || !childBlocks.length) {
        continue;
      }

      const childResult = await appendBlocksDeepInternal(
        client,
        createdBlock.id,
        childBlocks,
        {
          batchSize: context.batchSize,
          depth: context.depth + 1,
          pathPrefix: paths[index],
          onAppend: context.onAppend,
        },
      );

      requestCount += childResult.requestCount;
      appendedBlocks.push(...childResult.appendedBlocks);
      blockMappings.push(...childResult.blockMappings);
    }
  }

  return {
    topLevelBlocks,
    appendedBlocks,
    blockMappings,
    requestCount,
  };
}

function assertCreatedBlocks(
  created: AppendBlockChildrenResponse['results'],
  expectedCount: number,
  parentId: string,
  depth: number,
): void {
  if (!Array.isArray(created) || created.length !== expectedCount) {
    const actualCount = Array.isArray(created) ? created.length : 'invalid';
    throw new Error(
      `Notion append response mismatch for parent ${parentId} at depth ${depth}: expected ${expectedCount} blocks, received ${actualCount}`,
    );
  }

  created.forEach((createdBlock, index) => {
    if (!createdBlock?.id) {
      throw new Error(
        `Notion append response missing id for parent ${parentId} at depth ${depth}, index ${index}`,
      );
    }
  });
}

function normalizeBatchSize(batchSize?: number): number {
  if (!batchSize) {
    return MAX_APPEND_CHILDREN;
  }

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('batchSize must be a positive integer');
  }

  return Math.min(batchSize, MAX_APPEND_CHILDREN);
}

function getDeferredChildren(block: Block): Block[] {
  const blockType = block.type;

  if (!blockType || !DEFERRED_CHILDREN_BLOCK_TYPES.has(blockType)) {
    return [];
  }

  const data = getTypedBlockData(block, blockType);
  const children = data?.children;

  return Array.isArray(children) ? [...(children as Block[])] : [];
}

function stripDeferredChildren(block: Block): Block {
  const blockType = block.type;

  if (!blockType || !DEFERRED_CHILDREN_BLOCK_TYPES.has(blockType)) {
    return block;
  }

  const data = getTypedBlockData(block, blockType);

  if (!data || !('children' in data)) {
    return block;
  }

  const nextData = {...data} as Record<string, unknown>;
  delete nextData.children;

  return {
    ...block,
    [blockType]: nextData,
  } as Block;
}

function getTypedBlockData(
  block: Block,
  blockType: string,
): Record<string, unknown> | undefined {
  const data = (block as Record<string, unknown>)[blockType];
  return data && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : undefined;
}
