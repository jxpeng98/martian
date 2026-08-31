// scripts/languageMap.ts
// This script is responsible for generating src/notion/languageMap.json

import * as linguistLanguages from 'linguist-languages';
import type { Language } from 'linguist-languages';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {supportedCodeLang} from '../src/notion/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type LinguistLanguageMap = typeof linguistLanguages;

export const languages: Record<
  supportedCodeLang,
  LinguistLanguageMap[keyof LinguistLanguageMap] | undefined
> = {
  abap: linguistLanguages.ABAP,
  arduino: undefined,
  bash: linguistLanguages.Shell,
  basic: linguistLanguages.BASIC,
  c: linguistLanguages.C,
  clojure: linguistLanguages.Clojure,
  coffeescript: linguistLanguages.CoffeeScript,
  'c++': linguistLanguages['C++'],
  'c#': linguistLanguages['C#'],
  css: linguistLanguages.CSS,
  dart: linguistLanguages.Dart,
  diff: linguistLanguages.Diff,
  docker: linguistLanguages.Dockerfile,
  elixir: linguistLanguages.Elixir,
  elm: linguistLanguages.Elm,
  erlang: linguistLanguages.Erlang,
  flow: undefined,
  fortran: linguistLanguages.Fortran,
  'f#': linguistLanguages['F#'],
  gherkin: linguistLanguages.Gherkin,
  glsl: linguistLanguages.GLSL,
  go: linguistLanguages.Go,
  graphql: linguistLanguages.GraphQL,
  groovy: linguistLanguages.Groovy,
  haskell: linguistLanguages.Haskell,
  html: linguistLanguages.HTML,
  java: linguistLanguages.Java,
  javascript: linguistLanguages.JavaScript,
  json: linguistLanguages.JSON,
  julia: linguistLanguages.Julia,
  kotlin: linguistLanguages.Kotlin,
  latex: linguistLanguages.TeX,
  less: linguistLanguages.Less,
  lisp: linguistLanguages['Common Lisp'],
  livescript: linguistLanguages.LiveScript,
  lua: linguistLanguages.Lua,
  makefile: linguistLanguages.Makefile,
  markdown: linguistLanguages.Markdown,
  markup: undefined,
  matlab: linguistLanguages.MATLAB,
  mermaid: undefined,
  nix: linguistLanguages.Nix,
  'objective-c': linguistLanguages['Objective-C'],
  ocaml: linguistLanguages.OCaml,
  pascal: linguistLanguages.Pascal,
  perl: linguistLanguages.Perl,
  php: linguistLanguages.PHP,
  'plain text': undefined,
  powershell: linguistLanguages.PowerShell,
  prolog: linguistLanguages.Prolog,
  protobuf: linguistLanguages['Protocol Buffer'],
  python: linguistLanguages.Python,
  r: linguistLanguages.R,
  reason: linguistLanguages.Reason,
  ruby: linguistLanguages.Ruby,
  rust: linguistLanguages.Rust,
  sass: linguistLanguages.Sass,
  scala: linguistLanguages.Scala,
  scheme: linguistLanguages.Scheme,
  scss: linguistLanguages.SCSS,
  shell: linguistLanguages.Shell,
  sql: linguistLanguages.SQL,
  swift: linguistLanguages.Swift,
  typescript: linguistLanguages.TypeScript,
  'vb.net': linguistLanguages['Visual Basic .NET'],
  verilog: linguistLanguages.Verilog,
  vhdl: linguistLanguages.VHDL,
  'visual basic': undefined,
  webassembly: linguistLanguages.WebAssembly,
  xml: linguistLanguages.XML,
  yaml: linguistLanguages.YAML,
  'java/c/c++/c#': linguistLanguages.Java
};

const map: Record<string, string> = {};

Object.entries(languages).forEach(([notionKey, value]) => {
  (Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .forEach((lang) => {
      const l = lang as Language;
      const base = (l.aceMode ?? l.name ?? '').toLowerCase();
      if (base) map[base] = notionKey;

      l.aliases?.forEach((alias) => {
        const k = alias.toLowerCase();
        map[k] = notionKey;
      });
    });
});

const outDir = path.join(__dirname, '../src/notion');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(
  path.join(outDir, 'languageMap.json'),
  JSON.stringify(map, null, 2)
);
