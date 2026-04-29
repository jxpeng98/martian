import * as md from '../src/markdown';
import * as notion from '../src/notion';
import {buildSyncDocument} from '../src/sync/build';
import {syncDocumentToBlocks} from '../src/sync/render';
import {describe, expect, it} from 'vitest';

describe('sync document', () => {
  it('should build stable sync keys for headings and scoped paragraphs', () => {
    const ast = md.root(
      md.heading(1, md.text('Section')),
      md.paragraph(md.text('Paragraph one')),
      md.paragraph(md.text('Paragraph two')),
    );

    const first = buildSyncDocument(ast);
    const second = buildSyncDocument(ast);

    expect(first.flat.map(node => node.syncKey)).toStrictEqual(
      second.flat.map(node => node.syncKey),
    );
    expect(first.root[0]?.syncKey).toBe('root/heading/1/section');
    expect(first.root[1]?.syncKey).toBe(
      'root/heading/1/section/paragraph/paragraph-one',
    );
    expect(first.root[2]?.syncKey).toBe(
      'root/heading/1/section/paragraph/paragraph-two',
    );
  });

  it('should change subtreeHash without changing parent contentHash when a child changes', () => {
    const before = md.root(
      md.unorderedList(
        md.listItem(
          md.paragraph(md.text('Parent')),
          md.unorderedList(md.listItem(md.paragraph(md.text('Child A')))),
        ),
      ),
    );
    const after = md.root(
      md.unorderedList(
        md.listItem(
          md.paragraph(md.text('Parent')),
          md.unorderedList(md.listItem(md.paragraph(md.text('Child B')))),
        ),
      ),
    );

    const beforeDoc = buildSyncDocument(before);
    const afterDoc = buildSyncDocument(after);

    expect(beforeDoc.root[0]?.contentHash).toBe(afterDoc.root[0]?.contentHash);
    expect(beforeDoc.root[0]?.subtreeHash).not.toBe(afterDoc.root[0]?.subtreeHash);
  });

  it('should render asset blocks using the resolved asset map without changing sync identity', () => {
    const ast = md.root(md.paragraph(md.image('https://example.com/a.jpg', '', '')));
    const doc = buildSyncDocument(ast);
    const imageNode = doc.root[0];

    expect(imageNode?.nodeType).toBe('image');
    expect(imageNode?.syncKey).toBe('root/asset/httpsexamplecomajpg');

    const actual = syncDocumentToBlocks(doc, {
      assetMap: {
        'https://example.com/a.jpg': 'https://cdn.example.com/uploaded.jpg',
      },
    });

    expect(actual).toStrictEqual([
      notion.image('https://cdn.example.com/uploaded.jpg'),
    ]);
  });

  it('should render pdf assets through the asset map', () => {
    const ast = md.root(md.paragraph(md.image('notes/report.pdf', '', '')));
    const doc = buildSyncDocument(ast);

    expect(doc.root[0]?.nodeType).toBe('pdf');

    const actual = syncDocumentToBlocks(doc, {
      assetMap: {
        'notes/report.pdf': {
          url: 'https://cdn.example.com/report',
          kind: 'pdf',
        },
      },
    });

    expect(actual).toStrictEqual([notion.pdf('https://cdn.example.com/report')]);
  });

  it('should render file assets through the asset map with a name override', () => {
    const ast = md.root(md.paragraph(md.image('attachments/data.docx', '', '')));
    const doc = buildSyncDocument(ast);

    expect(doc.root[0]?.nodeType).toBe('file');

    const actual = syncDocumentToBlocks(doc, {
      assetMap: {
        'attachments/data.docx': {
          url: 'https://cdn.example.com/files/data',
          kind: 'file',
          name: 'data.docx',
        },
      },
    });

    expect(actual).toStrictEqual([
      notion.file('https://cdn.example.com/files/data', 'data.docx'),
    ]);
  });

  it('should fall back to text for unresolved local assets in strict mode', () => {
    const ast = md.root(md.paragraph(md.image('attachments/data.docx', '', '')));
    const doc = buildSyncDocument(ast);

    const actual = syncDocumentToBlocks(doc);

    expect(actual).toStrictEqual([
      notion.paragraph([notion.richText('attachments/data.docx')]),
    ]);
  });

  it('should keep source ranges when enabled', () => {
    const positionedParagraph = {
      ...md.paragraph(md.text('Hello')),
      position: {
        start: {line: 3, column: 1},
        end: {line: 3, column: 5},
      },
    };
    const ast = md.root(positionedParagraph);

    const doc = buildSyncDocument(ast);

    expect(doc.root[0]?.source).toStrictEqual({
      startLine: 3,
      startColumn: 1,
      endLine: 3,
      endColumn: 5,
    });
  });
});
