import * as notion from '../src/notion';
import {appendBlocksDeep} from '../src/notion/upload';
import type {AppendBlockChildrenResponse} from '@notionhq/client/build/src/api-endpoints';
import {describe, expect, it} from 'vitest';

describe('appendBlocksDeep', () => {
  it('should append deeply nested list items across multiple requests', async () => {
    const appended: Array<{
      block_id: string;
      children: notion.Block[];
      after?: string;
    }> = [];
    let counter = 0;

    const client = {
      blocks: {
        children: {
          append: async ({
            block_id,
            children,
            after,
          }: {
            block_id: string;
            children: notion.Block[];
            after?: string;
          }): Promise<AppendBlockChildrenResponse> => {
            appended.push({block_id, children, after});

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
      after?: string;
    }> = [];
    let counter = 0;

    const client = {
      blocks: {
        children: {
          append: async ({
            block_id,
            children,
            after,
          }: {
            block_id: string;
            children: notion.Block[];
            after?: string;
          }): Promise<AppendBlockChildrenResponse> => {
            appended.push({block_id, children, after});

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
    expect(appended[1]?.after).toBe('block-100');
  });
});
