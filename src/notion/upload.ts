import type {
  AppendBlockChildrenParameters,
  AppendBlockChildrenResponse,
} from '@notionhq/client/build/src/api-endpoints';
import type {Block} from './blocks';

type AppendFn = (
  args: Pick<AppendBlockChildrenParameters, 'block_id' | 'children' | 'after'>,
) => Promise<AppendBlockChildrenResponse>;

export interface BlockChildrenAppendClient {
  blocks: {
    children: {
      append: AppendFn;
    };
  };
}

export interface AppendBlocksDeepOptions {
  after?: AppendBlockChildrenParameters['after'];
  batchSize?: number;
  onAppend?: (event: {
    parentId: string;
    depth: number;
    inputCount: number;
    result: AppendBlockChildrenResponse;
  }) => void | Promise<void>;
}

export interface AppendBlocksDeepResult {
  topLevelBlocks: AppendBlockChildrenResponse['results'];
  appendedBlocks: AppendBlockChildrenResponse['results'];
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
    after: options.after,
    batchSize,
    depth: 0,
    onAppend: options.onAppend,
  });
}

async function appendBlocksDeepInternal(
  client: BlockChildrenAppendClient,
  parentId: string,
  blocks: Block[],
  context: Required<Pick<AppendBlocksDeepOptions, 'batchSize'>> & {
    after?: AppendBlockChildrenParameters['after'];
    depth: number;
    onAppend?: AppendBlocksDeepOptions['onAppend'];
  },
): Promise<AppendBlocksDeepResult> {
  if (!blocks.length) {
    return {
      topLevelBlocks: [],
      appendedBlocks: [],
      requestCount: 0,
    };
  }

  const topLevelBlocks: AppendBlockChildrenResponse['results'] = [];
  const appendedBlocks: AppendBlockChildrenResponse['results'] = [];
  let requestCount = 0;
  let after = context.after;

  for (const batch of chunkBlocks(blocks, context.batchSize)) {
    const response = await client.blocks.children.append({
      block_id: parentId,
      children: batch.map(stripDeferredChildren),
      after,
    });

    requestCount += 1;
    topLevelBlocks.push(...response.results);
    appendedBlocks.push(...response.results);

    await context.onAppend?.({
      parentId,
      depth: context.depth,
      inputCount: batch.length,
      result: response,
    });

    const created = response.results;
    const lastCreated = created.at(-1);
    after = lastCreated?.id;

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
          onAppend: context.onAppend,
        },
      );

      requestCount += childResult.requestCount;
      appendedBlocks.push(...childResult.appendedBlocks);
    }
  }

  return {
    topLevelBlocks,
    appendedBlocks,
    requestCount,
  };
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

function chunkBlocks(blocks: Block[], batchSize: number): Block[][] {
  const chunks: Block[][] = [];

  for (let index = 0; index < blocks.length; index += batchSize) {
    chunks.push(blocks.slice(index, index + batchSize));
  }

  return chunks;
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
