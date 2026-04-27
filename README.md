# Martian: Markdown to Notion Parser

Convert Markdown and GitHub Flavoured Markdown to Notion API Blocks, RichText, and sync metadata.

[![Node.js CI](https://github.com/tryfabric/martian/actions/workflows/ci.yml/badge.svg)](https://github.com/tryfabric/martian/actions/workflows/ci.yml)
[![Code Style: Google](https://img.shields.io/badge/code%20style-google-blueviolet.svg)](https://github.com/google/gts)

Martian is a Markdown parser to convert any Markdown content to Notion API block or RichText objects. It
uses [unified](https://github.com/unifiedjs/unified) to create a Markdown AST, then converts the AST into Notion
objects.

Designed to make using the Notion SDK and API easier. Notion API version 1.0.

### Supported Markdown Elements

- All inline elements (italics, bold, strikethrough, inline code, hyperlinks, equations)
- Lists (ordered, unordered, checkboxes) - to any level of depth
  - Notion blocks support deeper nesting, but the `append block children` API only allows up to two levels of nesting per request payload
- All headers (header levels >= 3 are treated as header level 3)
- Code blocks, with language highlighting support
- Block quotes
  - Supports GFM alerts (e.g. [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION])
  - Supports Notion callouts when blockquote starts with an emoji (optional, enabled with `enableEmojiCallouts`)
  - Automatically maps common emojis and alert types to appropriate background colors
  - Preserves formatting and nested blocks within callouts
- Tables
- Equations
- Images
  - Inline images are split into paragraph segments and asset blocks in their original order
  - Image URLs are validated when rendering Notion image blocks; invalid external image URLs are inserted as text for you to fix manually
- Files and PDFs in the sync pipeline
  - Asset nodes can be preserved in the sync tree and later resolved through an `assetMap`
  - PDFs render to Notion `pdf` blocks; known non-image attachments render to Notion `file` blocks

## Usage

### Basic usage:

The package exports block/rich-text helpers plus sync-aware APIs, which you can import like this:

```ts
// JS
const {
  markdownToBlocks,
  markdownToRichText,
  markdownToSyncDocument,
  syncDocumentToBlocks,
  markdownToBlocksWithSync,
} = require('@tryfabric/martian');
// TS
import {
  markdownToBlocks,
  markdownToRichText,
  markdownToSyncDocument,
  syncDocumentToBlocks,
  markdownToBlocksWithSync,
} from '@tryfabric/martian';
```

Here are couple of examples with both of them:

```ts
markdownToRichText(`**Hello _world_**`);
```

<details>
<summary>Result</summary>
<pre>
[
  {
    "type": "text",
    "annotations": {
      "bold": true,
      "strikethrough": false,
      "underline": false,
      "italic": false,
      "code": false,
      "color": "default"
    },
    "text": {
      "content": "Hello "
    }
  },
  {
    "type": "text",
    "annotations": {
      "bold": true,
      "strikethrough": false,
      "underline": false,
      "italic": true,
      "code": false,
      "color": "default"
    },
    "text": {
      "content": "world"
    }
  }
]
</pre>
</details>

```ts
markdownToBlocks(`
hello _world_ 
*** 
## heading2
* [x] todo

> 📘 **Note:** Important _information_

> Some other blockquote
`);
```

<details>
<summary>Result</summary>
<pre>
[
  {
    "object": "block",
    "type": "paragraph",
    "paragraph": {
      "rich_text": [
        {
          "type": "text",
          "annotations": {
            "bold": false,
            "strikethrough": false,
            "underline": false,
            "italic": false,
            "code": false,
            "color": "default"
          },
          "text": {
            "content": "hello "
          }
        },
        {
          "type": "text",
          "annotations": {
            "bold": false,
            "strikethrough": false,
            "underline": false,
            "italic": true,
            "code": false,
            "color": "default"
          },
          "text": {
            "content": "world"
          }
        }
      ]
    }
  },
  {
    "object": "block",
    "type": "divider",
    "divider": {}
  },
  {
    "object": "block",
    "type": "heading_2",
    "heading_2": {
      "rich_text": [
        {
          "type": "text",
          "annotations": {
            "bold": false,
            "strikethrough": false,
            "underline": false,
            "italic": false,
            "code": false,
            "color": "default"
          },
          "text": {
            "content": "heading2"
          }
        }
      ]
    }
  },
  {
    "object": "block",
    "type": "to_do",
    "to_do": {
      "rich_text": [
        {
          "type": "text",
          "annotations": {
            "bold": false,
            "strikethrough": false,
            "underline": false,
            "italic": false,
            "code": false,
            "color": "default"
          },
          "text": {
            "content": "todo"
          }
        }
      ],
      "checked": true
    }
  },
  {
    "type": "callout",
    "callout": {
      "rich_text": [
        {
          "type": "text",
          "text": {
            "content": "Note:"
          },
          "annotations": {
            "bold": true,
            "strikethrough": false,
            "underline": false,
            "italic": false,
            "code": false,
            "color": "default"
          }
        },
        {
          "type": "text",
          "text": {
            "content": " Important "
          }
        },
        {
          "type": "text",
          "text": {
            "content": "information"
          },
          "annotations": {
            "bold": false,
            "strikethrough": false,
            "underline": false,
            "italic": true,
            "code": false,
            "color": "default"
          }
        }
      ],
      "icon": {
        "type": "emoji",
        "emoji": "📘"
      },
      "color": "blue_background"
    }
  },
  {
    "type": "quote",
    "quote": {
      "rich_text": [
        {
          "type": "text",
          "text": {
            "content": "Some other blockquote"
          },
          "annotations": {
            "bold": false,
            "strikethrough": false,
            "underline": false,
            "italic": false,
            "code": false,
            "color": "default"
          }
        }
      ]
    }
  }
]
</pre>
</details>

### Sync-aware usage

If you need stable identities for block diffing or attachment upload workflows, use the sync APIs instead of only calling `markdownToBlocks()`.

#### `markdownToSyncDocument()`

Build a sync-aware intermediate tree with:

- `syncKey`: stable logical identity
- `contentHash`: whether the current node content changed
- `subtreeHash`: whether the current node or any descendant changed
- `source`: optional source range derived from mdast positions
- `diagnostics`: warnings about unsupported or degraded sync behavior

```ts
const sync = markdownToSyncDocument(`# Title

Paragraph

![](attachments/report.pdf)`);

console.log(sync.root[0].syncKey);
console.log(sync.flat.map(node => node.nodeType));
```

#### `markdownToBlocksWithSync()`

Parse once and get both the final blocks and the sync tree:

```ts
const {blocks, sync} = markdownToBlocksWithSync(markdown, {
  strictImageUrls: true,
  sync: {
    includeSourceRange: true,
  },
});
```

#### `syncDocumentToBlocks()`

Render a previously-built sync tree into final Notion blocks. This is useful when attachments are uploaded after parsing and you want to keep `syncKey` stable while swapping in the uploaded URLs.

```ts
const sync = markdownToSyncDocument(markdown);

const blocks = syncDocumentToBlocks(sync, {
  assetMap: {
    'attachments/report.pdf': {
      url: 'https://cdn.example.com/notion/report.pdf',
      kind: 'pdf',
    },
    'attachments/spec.docx': {
      url: 'https://cdn.example.com/notion/spec.docx',
      kind: 'file',
      name: 'spec.docx',
    },
  },
});
```

#### Stable vs opaque sync nodes

Current high-quality sync keys are generated for:

- headings
- paragraph segments
- bulleted / numbered / todo list items
- image / pdf / file assets
- quotes / callouts
- dividers

These nodes currently render correctly but are treated as opaque sync regions, so diffing should rebuild the subtree if they change:

- tables
- code blocks
- equations
- table of contents blocks

### Working with blockquotes

Martian supports three types of blockquotes:

1. Standard blockquotes:

```md
> This is a regular blockquote
> It can span multiple lines
```

2. GFM alerts (based on [GFM Alerts](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts)):

```md
> [!NOTE]
> Important information that users should know

> [!WARNING]
> Critical information that needs attention
```

3. Emoji-style callouts (optional) (based on [ReadMe's markdown callouts](https://docs.readme.com/rdmd/docs/callouts)):

```md
> 📘 **Note:** This is a callout with a blue background
> It supports all markdown formatting and can span multiple lines

> ❗ **Warning:** This is a callout with a red background
> Perfect for important warnings
```

#### GFM Alerts

GFM alerts are automatically converted to Notion callouts with appropriate icons and colors:

- NOTE (📘, blue): Useful information that users should know
- TIP (💡, green): Helpful advice for doing things better
- IMPORTANT (☝️, purple): Key information users need to know
- WARNING (⚠️, yellow): Urgent info that needs immediate attention
- CAUTION (❗, red): Advises about risks or negative outcomes
- INFO (📘, blue): General context or clarifications
- TODO (📝, gray): Tasks that need to be completed
- SUCCESS (✅, green): Highlights positive outcomes or completions
- QUESTION (❓, purple): Raises open questions or items needing clarification
- FAILURE (❌, red): Calls out broken flows or unsuccessful attempts
- DANGER (☠️, red): Signals critical problems that demand immediate action
- BUG (🐛, orange): Marks known issues or defects
- EXAMPLE (🧪, blue): Provides illustrative examples or sample usage
- QUOTE (💬, gray): Emphasizes notable quotes or references

#### Obsidian Callouts

Obsidian-style callouts (e.g. `[!info]`, `[!warning]-`, `[!bug] Custom title`) are detected automatically and rendered as Notion callouts. The marker can be lowercase or uppercase, and any text after the marker becomes the callout title/body (if you omit a title, a sensible default is inserted). The following Obsidian callout types are supported:

`info`, `todo`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `bug`, `example`, `quote`

#### Emoji-style Callouts

By default, emoji-style callouts are disabled. You can enable them using the `enableEmojiCallouts` option:

```ts
const options = {
  enableEmojiCallouts: true,
};
```

When enabled, callouts are detected when a blockquote starts with an emoji. The emoji determines the callout's background color. The current supported color mappings are:

- 📘 (blue): Perfect for notes and information
- 👍 (green): Success messages and tips
- ❗ (red): Warnings and important notices
- 🚧 (yellow): Work in progress or caution notices

All other emojis will have a default background color. The supported emoji color mappings can be expanded easily if needed.

If a blockquote doesn't match either GFM alert syntax or emoji-style callout syntax (when enabled), it will be rendered as a Notion quote block.

##### Examples

Standard blockquote:

```ts
markdownToBlocks('> A regular blockquote');
```

<details>
<summary>Result</summary>
<pre>
[
  {
    "object": "block",
    "type": "quote",
    "quote": {
      "rich_text": [
        {
          "type": "text",
          "text": {
            "content": "A regular blockquote"
          }
        }
      ]
    }
  }
]
</pre>
</details>

GFM alert:

```ts
markdownToBlocks('> [!NOTE]\n> Important information');
```

<details>
<summary>Result</summary>
<pre>
[
  {
    "object": "block",
    "type": "callout",
    "callout": {
      "rich_text": [
        {
          "type": "text",
          "text": {
            "content": "Note"
          }
        }
      ],
      "icon": {
        "type": "emoji",
        "emoji": "📘"
      },
      "color": "blue_background",
      "children": [
        {
          "type": "paragraph",
          "paragraph": {
            "rich_text": [
              {
                "type": "text",
                "text": {
                  "content": "Important information"
                }
              }
            ]
          }
        }
      ]
    }
  }
]
</pre>
</details>

Emoji-style callout (with `enableEmojiCallouts: true`):

```ts
markdownToBlocks('> 📘 Note: Important information', {
  enableEmojiCallouts: true,
});
```

<details>
<summary>Result</summary>
<pre>
[
  {
    "object": "block",
    "type": "callout",
    "callout": {
      "rich_text": [
        {
          "type": "text",
          "text": {
            "content": "Note: Important information"
          }
        }
      ],
      "icon": {
        "type": "emoji",
        "emoji": "📘"
      },
      "color": "blue_background"
    }
  }
]
</pre>
</details>

### Working with Notion's limits

Sometimes a Markdown input would result in an output that would be rejected by the Notion API: here are some options to deal with that.

#### An item exceeds the children or character limit

By default, the package will try to resolve these kind of issues by re-distributing the content to multiple blocks: when that's not possible, `martian` will truncate the output to avoid your request resulting in an error.  
If you want to disable this kind of behavior, you can use this option:

```ts
const options = {
  notionLimits: {
    truncate: false,
  },
};

markdownToBlocks('input', options);
markdownToRichText('input', options);
```

Deeply nested list blocks are still produced by the parser. If you send them to Notion through `PATCH /v1/blocks/{block_id}/children`, note that Notion's official API only accepts up to two nested levels in a single append request, so deeper trees must be appended in multiple requests.

#### Manually handling errors related to Notions's limits

You can set a callback for when one of the resulting items would exceed Notion's limits. Please note that this function will be called regardless of whether the final output will be truncated.

```ts
const options = {
  notionLimits: {
    // truncate: true, // by default
    onError: (err: Error) => {
      // Something has appened!
      console.error(err);
    },
  },
};

markdownToBlocks('input', options);
markdownToRichText('input', options);
```

### Working with images

If an image has an invalid external URL, the Notion API will reject the whole request. `martian` prevents this issue by converting unresolved image blocks into text, so that requests stay valid and you can fix the links later.

This validation happens when rendering final Notion blocks:

- `markdownToBlocks()` applies it immediately
- `syncDocumentToBlocks()` applies it when projecting a `SyncDocument`

If you want to disable this behavior, you can use this option:

```ts
const options = {
  strictImageUrls: false,
};
```

Default behavior:

```ts
markdownToBlocks('![](InvalidURL)');
```

<details>
<summary>Result</summary>
<pre>
[
  {
    "object": "block",
    "type": "paragraph",
    "paragraph": {
      "rich_text": [
        {
          "type": "text",
          "annotations": {
            "bold": false,
            "strikethrough": false,
            "underline": false,
            "italic": false,
            "code": false,
            "color": "default"
          },
          "text": {
            "content": "InvalidURL"
          }
        }
      ]
    }
  }
]
</pre>
</details>

`strictImageUrls` disabled:

```ts
markdownToBlocks('![](InvalidURL)', {
  strictImageUrls: false,
});
```

<details>
<summary>Result</summary>
<pre>
[
  {
    "object": "block",
    "type": "image",
    "image": {
      "type": "external",
      "external": {
        "url": "InvalidURL"
      }
    }
  }
]
</pre>
</details>

### Working with attachments in the sync pipeline

`markdownToSyncDocument()` preserves Markdown assets as sync nodes even when they are not yet valid Notion URLs. This is useful when another tool uploads local files first and only later knows the final Notion-compatible URL.

Known behavior:

- image extensions such as `.png`, `.jpg`, `.webp` are treated as image assets
- `.pdf` is treated as a Notion `pdf` block
- known document/media/archive extensions such as `.docx`, `.md`, `.mp4`, `.zip` are treated as Notion `file` blocks
- unresolved local assets will fall back to text when rendered without an `assetMap` in strict mode

Example:

```ts
const sync = markdownToSyncDocument('![](attachments/spec.docx)');

const blocks = syncDocumentToBlocks(sync, {
  assetMap: {
    'attachments/spec.docx': {
      url: 'https://cdn.example.com/notion/spec.docx',
      kind: 'file',
      name: 'spec.docx',
    },
  },
});
```

#### Sync options

`markdownToSyncDocument()` and `markdownToBlocksWithSync()` accept these sync-specific options:

- `includeSourceRange`: include mdast-derived source positions in each sync node
- `keyStrategy`: use `"semantic"` or `"semantic-with-position"` fallback keys
- `textAnchorLength`: control how much normalized text is used to build semantic anchors
- `slugify`: customize slug generation
- `normalizeText`: customize text normalization before semantic-key generation
- `explicitAnchorPattern`: extract explicit anchors from text with a regex
- `extractExplicitAnchor`: provide a custom explicit-anchor extractor

`syncDocumentToBlocks()` and `markdownToBlocksWithSync()` also accept:

- `assetMap`: map original asset refs to uploaded URLs and optional `kind` / `name`
- `strictImageUrls`: keep strict external image validation enabled or disabled during final block rendering

### Non-inline elements when parsing rich text

By default, if the text provided to `markdownToRichText` would result in one or more non-inline elements, the package will ignore those and only parse paragraphs.  
You can make the package throw an error when a non-inline element is detected by setting the `nonInline` option to `'throw'`.

Default behavior:

```ts
markdownToRichText('# Header\nAbc', {
  // nonInline: 'ignore', // Default
});
```

<details>
<summary>Result</summary>
<pre>
[
  {
    type: 'text',
    annotations: {
      bold: false,
      strikethrough: false,
      underline: false,
      italic: false,
      code: false,
      color: 'default'
    },
    text: { content: 'Abc', link: undefined }
  }
]
</pre>
</details>

Throw an error:

```ts
markdownToRichText('# Header\nAbc', {
  nonInline: 'throw',
});
```

<details>
<summary>Result</summary>
<pre>
Error: Unsupported markdown element: {"type":"heading","depth":1,"children":[{"type":"text","value":"Header","position":{"start":{"line":1,"column":3,
"offset":2},"end":{"line":1,"column":9,"offset":8}}}],"position":{"start":{"line":1,"column":1,"offset":0},"end":{"line":1,"column":9,"offset":8}}}  
</pre>
</details>

---

Built with 💙 by the team behind [Fabric](https://tryfabric.com).

<img src="https://static.scarf.sh/a.png?x-pxid=79ae4e0a-7e48-4965-8a83-808c009aa47a" />
