import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBoundaries } from '../../tools/check-boundaries.mjs';
import { checkText } from '../../tools/check-text.mjs';
import { firstLoadBytes, FIRST_LOAD_BUDGET } from '../../tools/check-size.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EM = '\u2014';
const EN = '\u2013';

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'atlas-check-'));
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), text);
  }
  return root;
}

test('the real repo passes every check', async () => {
  assert.deepEqual(await checkBoundaries(repo), []);
  assert.deepEqual(await checkText(repo), []);
  assert.ok((await firstLoadBytes(repo)).total < FIRST_LOAD_BUDGET);
});

test('boundaries: forbidden imports and banned words are caught', async () => {
  const root = await fixture({
    'src/sim/bad.js': "import { x } from '../ui/app.js';\nexport const roll = Math.random();\nconst when = Date.now();\n",
    'src/sim/sneaky.js': "export * from '../ai/index.js';\n",
    'src/core/dom.js': 'export const w = document.title;\n',
    'src/ai/peek.js': "import { a } from '../sim/state.js';\n",
    'src/render/pkg.js': "import three from 'three';\n",
    'src/ui/dice.js': "import { random } from '../core/rng.js';\n",
    'src/sim/ok.js': "// Math.random is mentioned only in a comment\nimport { hex } from '../core/hex.js';\nimport { a } from '../battles/index.js';\n",
    'src/save/zlib.js': "import { gzipSync } from 'node:zlib';\n",
    'src/weird/x.js': 'export {};\n',
  });
  try {
    const problems = (await checkBoundaries(root)).join('\n');
    assert.match(problems, /src\/sim\/bad\.js:1 .*may not import src\/ui\/app\.js/);
    assert.match(problems, /src\/sim\/bad\.js:2 .*Math\.random/);
    assert.match(problems, /src\/sim\/bad\.js:3 .*Date/);
    assert.match(problems, /sneaky\.js.*src\/ai\/index\.js/);
    assert.match(problems, /core\/dom\.js.*document/);
    assert.match(problems, /ai\/peek\.js.*src\/sim\/state\.js/);
    assert.match(problems, /render\/pkg\.js.*no runtime dependencies/);
    assert.match(problems, /ui\/dice\.js.*src\/core\/rng\.js/);
    assert.match(problems, /save\/zlib\.js.*node:zlib/, 'static node import refused');
    assert.match(problems, /weird\/x\.js.*not in a known layer/);
    assert.doesNotMatch(problems, /ok\.js/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('text: dashes anywhere and American spelling in player text are caught', async () => {
  const root = await fixture({
    'README.md': `Atlas ${EM} a game\n`,
    'src/sim/a.js': `// range 1${EN}5\n`,
    'rules/base-ancient/text/en-GB.json': JSON.stringify({ unit: { name: 'Armored legion', hint: 'Pick a color' } }),
    'css/base.css': 'a { color: red; text-align: center; }\n',
    'index.html': '<style>.x{color:red}</style><p class="center">Choose your favorite</p>',
    'docs/ok.md': 'Plain text, (with brackets).\n',
  });
  try {
    const problems = (await checkText(root)).join('\n');
    assert.match(problems, /README\.md:1 {2}em dash/);
    assert.match(problems, /src\/sim\/a\.js:1 {2}en dash/);
    assert.match(problems, /en-GB\.json.*"Armored".*armoured/);
    assert.match(problems, /en-GB\.json.*"color".*colour/);
    assert.match(problems, /index\.html.*"favorite"/);
    assert.doesNotMatch(problems, /base\.css/);
    assert.doesNotMatch(problems, /index\.html.*"(color|center)"/);
    assert.doesNotMatch(problems, /ok\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
