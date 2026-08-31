import * as notion from '../src/notion';
import {appendBlocksDeep} from '../src/notion/upload';
import type {
  AppendBlockChildrenParameters,
  AppendBlockChildrenResponse,
} from '@notionhq/client/build/src/api-endpoints';
import {describe, expect, it} from 'vitest';

describe('appendBlocksDeep', () => {
  it('should append deeply nested list items across multiple requests', async () => {
    const appended: Array<{
      block_id: string;
      children: notion.Block[];
      position?: AppendBlockChildrenParameters['position'];
    }> = [];
    let counter = 0;

    const client = {
      blocks: {
        children: {
          append: async ({
            block_id,
            children,
            position,
          }: {
            block_id: string;
            children: notion.Block[];
            position?: AppendBlockChildrenParameters['position'];
          }): Promise<AppendBlockChildrenResponse> => {
            appended.push({block_id, children, position});

            return {
              object: 'list',
              type: 'block',
              next_cursor: null,
              has_more: false,
              results: children.map(child => ({
                object: 'block',
                id: `block-${++counter}`,
                type: child.type ?? 'paragraph',
                has_children: false,
              })),
              block: {},
            } as AppendBlockChildrenResponse;
          },
        },
      },
    };

    const blocks = [
      notion.bulletedListItem([notion.richText('Level 1')], [
        notion.bulletedListItem([notion.richText('Level 2')], [
          notion.bulletedListItem([notion.richText('Level 3')], [
            notion.bulletedListItem([notion.richText('Level 4')]),
          ]),
        ]),
      ]),
    ];

    const result = await appendBlocksDeep(client, 'parent-page', blocks);

    expect(result.requestCount).toBe(4);
    expect(result.topLevelBlocks.map(block => block.id)).toStrictEqual([
      'block-1',
    ]);
    expect(result.blockMappings.map(mapping => mapping.path)).toStrictEqual([
      [0],
      [0, 0],
      [0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(appended.map(call => call.block_id)).toStrictEqual([
      'parent-page',
      'block-1',
      'block-2',
      'block-3',
    ]);

    appended.forEach(call => {
      call.children.forEach(child => {
        const data =
          child.type && typeof child.type === 'string'
            ? (child as Record<string, unknown>)[child.type]
            : undefined;
        if (data && typeof data === 'object' && 'children' in data) {
          expect(data.children).toBeUndefined();
        }
      });
    });
  });

  it('should chunk sibling appends to Notion maximum batch size', async () => {
    const appended: Array<{
      block_id: string;
      children: notion.Block[];
      position?: AppendBlockChildrenParameters['position'];
    }> = [];
    let counter = 0;

    const client = {
      blocks: {
        children: {
          append: async ({
            block_id,
            children,
            position,
          }: {
            block_id: string;
            children: notion.Block[];
            position?: AppendBlockChildrenParameters['position'];
          }): Promise<AppendBlockChildrenResponse> => {
            appended.push({block_id, children, position});

            return {
              object: 'list',
              type: 'block',
              next_cursor: null,
              has_more: false,
              results: children.map(child => ({
                object: 'block',
                id: `block-${++counter}`,
                type: child.type ?? 'paragraph',
                has_children: false,
              })),
              block: {},
            } as AppendBlockChildrenResponse;
          },
        },
      },
    };

    const blocks = Array.from({length: 101}, (_, index) =>
      notion.bulletedListItem([notion.richText(`Item ${index + 1}`)]),
    );

    await appendBlocksDeep(client, 'parent-page', blocks);

    expect(appended).toHaveLength(2);
    expect(appended[0]?.children).toHaveLength(100);
    expect(appended[1]?.children).toHaveLength(1);
    expect(appended[1]?.position).toStrictEqual({
      type: 'after_block',
      after_block: {id: 'block-100'},
    });
  });

  it('should preserve an explicit starting position and expose response paths', async () => {
    const positions: Array<AppendBlockChildrenParameters['position']> = [];
    const client = {
      blocks: {
        children: {
          append: async ({
            children,
            position,
          }: {
            children: notion.Block[];
            position?: AppendBlockChildrenParameters['position'];
          }): Promise<AppendBlockChildrenResponse> => {
            positions.push(position);
            return {
              object: 'list',
              type: 'block',
              next_cursor: null,
              has_more: false,
              results: children.map((child, index) => ({
                object: 'block',
                id: `created-${index}`,
                type: child.type ?? 'paragraph',
                has_children: false,
              })),
              block: {},
            } as AppendBlockChildrenResponse;
          },
        },
      },
    };

    const result = await appendBlocksDeep(
      client,
      'parent-page',
      [notion.paragraph([notion.richText('First')])],
      {position: {type: 'start'}},
    );

    expect(positions).toStrictEqual([{type: 'start'}]);
    expect(result.blockMappings).toHaveLength(1);
    expect(result.blockMappings[0]?.path).toStrictEqual([0]);
  });

  it('should keep the legacy after option compatible with position', async () => {
    let receivedPosition: AppendBlockChildrenParameters['position'];
    const client = {
      blocks: {
        children: {
          append: async ({children, position}: any) => {
            receivedPosition = position;
            return {
              object: 'list',
              type: 'block',
              next_cursor: null,
              has_more: false,
              results: children.map((child: notion.Block) => ({
                object: 'block',
                id: 'created-1',
                type: child.type ?? 'paragraph',
                has_children: false,
              })),
              block: {},
            } as AppendBlockChildrenResponse;
          },
        },
      },
    };

    await appendBlocksDeep(
      client,
      'parent-page',
      [notion.paragraph([notion.richText('First')])],
      {after: 'existing-block'},
    );

    expect(receivedPosition).toStrictEqual({
      type: 'after_block',
      after_block: {id: 'existing-block'},
    });
  });

  it('should fail when a created parent id is missing for deferred children', async () => {
    const client = {
      blocks: {
        children: {
          append: async (): Promise<AppendBlockChildrenResponse> =>
            ({
              object: 'list',
              type: 'block',
              next_cursor: null,
              has_more: false,
              results: [
                {
                  object: 'block',
                  type: 'bulleted_list_item',
                  has_children: false,
                },
              ],
              block: {},
            }) as AppendBlockChildrenResponse,
        },
      },
    };

    const blocks = [
      notion.bulletedListItem([notion.richText('Parent')], [
        notion.bulletedListItem([notion.richText('Child')]),
      ]),
    ];

    await expect(
      appendBlocksDeep(client, 'parent-page', blocks),
    ).rejects.toThrow('missing id');
  });

  it('should fail before reporting an append when response indexes do not match the input batch', async () => {
    let appendEventCount = 0;
    const client = {
      blocks: {
        children: {
          append: async (): Promise<AppendBlockChildrenResponse> =>
            ({
              object: 'list',
              type: 'block',
              next_cursor: null,
              has_more: false,
              results: [
                {
                  object: 'block',
                  id: 'block-1',
                  type: 'bulleted_list_item',
                  has_children: false,
                },
              ],
              block: {},
            }) as AppendBlockChildrenResponse,
        },
      },
    };

    const blocks = [
      notion.bulletedListItem([notion.richText('First')]),
      notion.bulletedListItem([notion.richText('Second')]),
    ];

    await expect(
      appendBlocksDeep(client, 'parent-page', blocks, {
        onAppend: () => {
          appendEventCount += 1;
        },
      }),
    ).rejects.toThrow('expected 2 blocks, received 1');
    expect(appendEventCount).toBe(0);
  });
});
