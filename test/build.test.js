/* Minimal assertion suite for the site builder. Run: npm test */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { renderMarkdown, parseFrontmatter, slugify, inline, build } = require('../build.js');

const NUL = String.fromCharCode(0);
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

/* ---- markdown renderer ---- */

test('frontmatter parses keys and strips the block', () => {
  const { meta, body } = parseFrontmatter('---\ntitle: Hi\norder: 3\n---\n\n# Body\n');
  assert.strictEqual(meta.title, 'Hi');
  assert.strictEqual(meta.order, '3');
  assert.ok(body.startsWith('# Body'));
});

test('headings get slug ids and feed the TOC', () => {
  const { html, headings } = renderMarkdown('## Entitlement Math\n');
  assert.ok(html.includes('<h2 id="entitlement-math">'));
  assert.strictEqual(headings.length, 1);
});

test('inline formatting handles bold, code, and links', () => {
  const html = inline('**bold** and `code` and [VA](https://va.gov)');
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<code>code</code>'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});

test('inline escapes HTML in text', () => {
  assert.ok(inline('a < b & c').includes('&lt;'));
});

test('code fences are not treated as markdown', () => {
  const { html } = renderMarkdown('```\n**not bold**\n```\n');
  assert.ok(html.includes('**not bold**'));
  assert.ok(!html.includes('<strong>'));
});

test('tables render with headers and rows', () => {
  const { html } = renderMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  assert.ok(html.includes('<th>A</th>'));
  assert.ok(html.includes('<td>2</td>'));
});

test('callouts render with type and title', () => {
  const { html } = renderMarkdown(':::warning Careful\nBody text.\n:::\n');
  assert.ok(html.includes('callout--warning'));
  assert.ok(html.includes('Careful'));
  assert.ok(html.includes('Body text.'));
});

test('task lists become tracked checkboxes', () => {
  const { html } = renderMarkdown('- [ ] Do the thing\n- [ ] Do the other thing\n');
  assert.strictEqual((html.match(/type="checkbox"/g) || []).length, 2);
  assert.ok(html.includes('data-track="chk-0"'));
});

test('raw HTML blocks pass through untouched', () => {
  const { html } = renderMarkdown('<div class="calc" data-calc="x"><h3>Hi</h3></div>\n');
  assert.ok(html.includes('data-calc="x"'));
  assert.ok(!html.includes('&lt;div'));
});

test('slugify strips punctuation', () => {
  assert.strictEqual(slugify('Offer, Contract & Closing!'), 'offer-contract-closing');
});

/* ---- full build ---- */

const pages = build();
const dist = path.join(__dirname, '..', 'dist');
const files = fs.readdirSync(dist);

test('every content file produces a page', () => {
  pages.forEach((p) => assert.ok(files.includes(p.url), `missing ${p.url}`));
});

test('assets and .nojekyll are emitted', () => {
  assert.ok(fs.existsSync(path.join(dist, 'assets', 'styles.css')));
  assert.ok(fs.existsSync(path.join(dist, 'assets', 'app.js')));
  assert.ok(fs.existsSync(path.join(dist, '.nojekyll')));
});

test('all twelve modules are present and ordered', () => {
  const modules = pages.filter((p) => p.meta.module);
  assert.strictEqual(modules.length, 12);
  modules.forEach((p, idx) => assert.strictEqual(Number(p.meta.module), idx + 1));
});

test('no unrendered markdown or control characters leak into output', () => {
  files.filter((f) => f.endsWith('.html')).forEach((f) => {
    const html = fs.readFileSync(path.join(dist, f), 'utf8');
    assert.ok(!html.includes(NUL), `${f} contains a NUL byte`);
    assert.ok(!/^:::/m.test(html), `${f} has an unrendered callout fence`);
    assert.ok(!/^\| /m.test(html), `${f} has an unrendered table row`);
  });
});

test('internal links resolve to real files', () => {
  const missing = [];
  files.filter((f) => f.endsWith('.html')).forEach((f) => {
    const html = fs.readFileSync(path.join(dist, f), 'utf8');
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    hrefs
      .filter((h) => !/^(https?:|#|mailto:)/.test(h))
      .forEach((h) => {
        const target = path.join(dist, h.replace(/^\.\.\//, '').split('#')[0]);
        if (!fs.existsSync(target)) missing.push(`${f} -> ${h}`);
      });
  });
  assert.strictEqual(missing.length, 0, `broken links: ${missing.join(', ')}`);
});

test('every calculator in the markup has a handler in app.js', () => {
  const app = fs.readFileSync(path.join(dist, 'assets', 'app.js'), 'utf8');
  const used = new Set();
  files.filter((f) => f.endsWith('.html')).forEach((f) => {
    const html = fs.readFileSync(path.join(dist, f), 'utf8');
    [...html.matchAll(/data-calc="([^"]+)"/g)].forEach((m) => used.add(m[1]));
  });
  assert.ok(used.size >= 5, `expected at least 5 calculators, found ${used.size}`);
  used.forEach((name) => {
    assert.ok(app.includes(`data-calc="${name}"`), `no handler for calculator "${name}"`);
  });
});

test('the compliance module states the occupancy rule', () => {
  const html = fs.readFileSync(path.join(dist, 'module-08-occupancy-compliance.html'), 'utf8');
  assert.ok(/occupancy fraud/i.test(html));
  assert.ok(/primary residence/i.test(html));
});

test('every page carries the educational-use disclaimer', () => {
  files.filter((f) => f.endsWith('.html')).forEach((f) => {
    const html = fs.readFileSync(path.join(dist, f), 'utf8');
    assert.ok(/not financial, legal, or tax advice/.test(html), `${f} is missing the disclaimer`);
  });
});

console.log(`\n${passed} assertions passed`);
