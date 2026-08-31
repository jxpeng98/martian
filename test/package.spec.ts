import {execFileSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';

describe('package entry', () => {
  it('loads as native ESM', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        'import {markdownToBlocks} from "./build/src/index.js"; console.log(markdownToBlocks("- item").length)',
      ],
      {cwd: process.cwd(), encoding: 'utf8'},
    );

    expect(output.trim()).toBe('1');
  });
});
