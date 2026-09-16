#!/usr/bin/env node
/**
 * Static site builder for the VA Home Loan Real Estate Empire training program.
 *
 * Zero dependencies on purpose: GitHub Pages builds should not need a lockfile
 * or a network install. Content lives in content/*.md, output lands in dist/.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, 'content');
const ASSETS_DIR = path.join(ROOT, 'assets');
const OUT_DIR = path.join(ROOT, 'dist');

const SITE = {
  title: 'VA Home Loan Real Estate Empire',
  tagline: 'A self-paced training program for veterans building a rental portfolio with little to no money down.',
  // Overridden by the Pages workflow so canonical/OG URLs are correct.
  baseUrl: process.env.SITE_BASE_URL || '',
};

/* ------------------------------------------------------------------ *
 * Tiny markdown renderer
 * ------------------------------------------------------------------ */

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Inline formatting: code, bold, italics, links. Applied to escaped text. */
function inline(text) {
  let out = escapeHtml(text);
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `@@CODE${codes.length - 1}@@`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const external = /^https?:/.test(href);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${attrs}>${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/@@CODE(\d+)@@/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
  return out;
}

function parseFrontmatter(raw) {
  const meta = {};
  let body = raw;
  if (raw.startsWith('---\n')) {
    const end = raw.indexOf('\n---', 4);
    if (end !== -1) {
      const block = raw.slice(4, end);
      body = raw.slice(end + 4).replace(/^\n+/, '');
      for (const line of block.split('\n')) {
        const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (m) meta[m[1]] = m[2].trim();
      }
    }
  }
  return { meta, body };
}

/**
 * Render markdown to HTML. Returns { html, headings } where headings powers
 * the on-page table of contents.
 */
function renderMarkdown(src) {
  const lines = src.split('\n');
  const headings = [];
  const out = [];
  let i = 0;
  let checkboxIndex = 0;

  const isBlank = (l) => l.trim() === '';

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) { i++; continue; }

    // Fenced code
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre class="code"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // Callout: ::: type Title ... :::
    const callout = line.match(/^:::\s*(\w+)\s*(.*)$/);
    if (callout) {
      const [, type, title] = callout;
      const buf = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') buf.push(lines[i++]);
      i++;
      const inner = renderMarkdown(buf.join('\n'));
      headings.push(...inner.headings);
      out.push(
        `<aside class="callout callout--${escapeHtml(type)}">` +
          (title ? `<p class="callout__title">${inline(title)}</p>` : '') +
          inner.html +
        `</aside>`
      );
      continue;
    }

    // Raw HTML block (calculators, custom widgets)
    if (/^</.test(line)) {
      const buf = [];
      while (i < lines.length && !isBlank(lines[i])) buf.push(lines[i++]);
      out.push(buf.join('\n'));
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const id = slugify(text);
      if (level === 2 || level === 3) headings.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { out.push('<hr />'); i++; continue; }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]*\|[\s|:-]*$/.test(lines[i + 1])) {
      const splitRow = (row) =>
        row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const header = splitRow(lines[i]);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes('|') && !isBlank(lines[i])) body.push(splitRow(lines[i++]));
      out.push(
        '<div class="table-wrap"><table><thead><tr>' +
          header.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          body
            .map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
            .join('') +
          '</tbody></table></div>'
      );
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      const inner = renderMarkdown(buf.join('\n'));
      out.push(`<blockquote>${inner.html}</blockquote>`);
      continue;
    }

    // Task list -> interactive, progress-tracked checkboxes
    if (/^[-*]\s+\[[ xX]\]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+\[[ xX]\]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+\[[ xX]\]\s+/, ''));
        i++;
      }
      out.push(
        '<ul class="checklist">' +
          items
            .map((t) => {
              const id = `chk-${checkboxIndex++}`;
              return `<li><input type="checkbox" class="checklist__box" id="${id}" data-track="${id}" /><label for="${id}">${inline(t)}</label></li>`;
            })
            .join('') +
          '</ul>'
      );
      continue;
    }

    // Unordered list (supports one level of nesting via two-space indent)
    if (/^[-*]\s+/.test(line)) {
      out.push(renderList(lines, () => i, (n) => { i = n; }, false));
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      out.push(renderList(lines, () => i, (n) => { i = n; }, true));
      continue;
    }

    // Paragraph
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,4}\s|[-*]\s|\d+\.\s|>|```|:::|<)/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`);
    else i++;
  }

  return { html: out.join('\n'), headings };
}

function renderList(lines, getI, setI, ordered) {
  let i = getI();
  const marker = ordered ? /^(\s*)(\d+)\.\s+(.*)$/ : /^(\s*)[-*]\s+(.*)$/;
  const items = [];
  while (i < lines.length) {
    const m = lines[i].match(marker);
    if (!m) break;
    const indent = m[1].length;
    const text = ordered ? m[3] : m[2];
    if (indent >= 2 && items.length) items[items.length - 1].children.push(text);
    else items.push({ text, children: [] });
    i++;
  }
  setI(i);
  const tag = ordered ? 'ol' : 'ul';
  return (
    `<${tag}>` +
    items
      .map(
        (it) =>
          `<li>${inline(it.text)}` +
          (it.children.length ? `<ul>${it.children.map((c) => `<li>${inline(c)}</li>`).join('')}</ul>` : '') +
          `</li>`
      )
      .join('') +
    `</${tag}>`
  );
}

/* ------------------------------------------------------------------ *
 * Page templates
 * ------------------------------------------------------------------ */

function navHtml(pages, current) {
  const groups = [];
  for (const p of pages) {
    const section = p.meta.section || 'Program';
    let g = groups.find((x) => x.name === section);
    if (!g) groups.push((g = { name: section, items: [] }));
    g.items.push(p);
  }
  return groups
    .map(
      (g) =>
        `<div class="nav__group"><p class="nav__group-title">${escapeHtml(g.name)}</p><ul>` +
        g.items
          .map((p) => {
            const active = p.slug === current ? ' class="is-active"' : '';
            const num = p.meta.module ? `<span class="nav__num">${escapeHtml(p.meta.module)}</span>` : '';
            return `<li${active}><a href="${rel(current, p.url)}" data-track-page="${p.slug}">${num}<span>${escapeHtml(p.meta.navTitle || p.meta.title)}</span><span class="nav__check" aria-hidden="true"></span></a></li>`;
          })
          .join('') +
        '</ul></div>'
    )
    .join('');
}

/**
 * Relative link from one page to another. Every page is emitted flat at the root
 * of dist/, so a bare filename is correct from any page and keeps the site working
 * under a project subpath like /repo-name/ on GitHub Pages.
 */
function rel(fromSlug, toUrl) {
  return toUrl;
}

function layout({ page, pages, contentHtml, headings, prev, next }) {
  const current = page.slug;
  // Flat output: assets sit beside the pages, so never walk up out of the site root.
  const base = '';
  const toc = headings.filter((h) => h.level === 2);
  const canonical = SITE.baseUrl ? `${SITE.baseUrl.replace(/\/$/, '')}/${page.url === 'index.html' ? '' : page.url}` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(page.meta.title)} | ${escapeHtml(SITE.title)}</title>
<meta name="description" content="${escapeHtml(page.meta.description || SITE.tagline)}" />
${canonical ? `<link rel="canonical" href="${canonical}" />` : ''}
<meta property="og:title" content="${escapeHtml(page.meta.title)}" />
<meta property="og:description" content="${escapeHtml(page.meta.description || SITE.tagline)}" />
<meta property="og:type" content="article" />
<link rel="icon" href="${base}assets/favicon.svg" />
<link rel="stylesheet" href="${base}assets/styles.css" />
</head>
<body data-page="${escapeHtml(current)}">
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <button class="topbar__menu" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">☰</button>
  <a class="topbar__brand" href="${base}index.html">
    <span class="topbar__mark" aria-hidden="true">★</span>
    <span>VA Home Loan <strong>Real Estate Empire</strong></span>
  </a>
  <div class="topbar__right">
    <span class="topbar__progress" id="progress-label">0% complete</span>
    <button class="topbar__theme" id="theme-toggle" aria-label="Toggle dark mode">◐</button>
  </div>
</header>
<div class="shell">
  <nav class="nav" id="nav" aria-label="Program navigation">
    <div class="nav__progress"><div class="nav__progress-bar" id="progress-bar"></div></div>
    ${navHtml(pages, current)}
    <div class="nav__group">
      <p class="nav__group-title">Tools</p>
      <ul>
        <li><a href="${base}calculators.html">Calculators</a></li>
        <li><a href="${base}worksheets.html">Worksheets</a></li>
        <li><a href="${base}glossary.html">Glossary</a></li>
        <li><a href="${base}resources.html">Resources</a></li>
      </ul>
    </div>
    <button class="nav__reset" id="reset-progress" type="button">Reset progress</button>
  </nav>
  <main class="main" id="main">
    <article class="doc">
      ${page.meta.module ? `<p class="doc__eyebrow">Module ${escapeHtml(page.meta.module)}${page.meta.duration ? ` · ${escapeHtml(page.meta.duration)}` : ''}</p>` : ''}
      <h1>${escapeHtml(page.meta.title)}</h1>
      ${page.meta.description ? `<p class="doc__lede">${inline(page.meta.description)}</p>` : ''}
      ${toc.length > 2 && page.meta.toc !== 'false' ? `<details class="toc"><summary>On this page</summary><ul>${toc.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('')}</ul></details>` : ''}
      ${contentHtml}
      ${page.meta.module ? `<div class="complete"><label><input type="checkbox" id="module-complete" data-module="${escapeHtml(current)}" /> Mark Module ${escapeHtml(page.meta.module)} complete</label></div>` : ''}
    </article>
    <nav class="pager" aria-label="Pagination">
      ${prev ? `<a class="pager__link pager__link--prev" href="${rel(current, prev.url)}"><span>Previous</span><strong>${escapeHtml(prev.meta.navTitle || prev.meta.title)}</strong></a>` : '<span></span>'}
      ${next ? `<a class="pager__link pager__link--next" href="${rel(current, next.url)}"><span>Next</span><strong>${escapeHtml(next.meta.navTitle || next.meta.title)}</strong></a>` : '<span></span>'}
    </nav>
    <footer class="footer">
      <p><strong>Educational material only.</strong> This program is not financial, legal, or tax advice, and it is not affiliated with or endorsed by the U.S. Department of Veterans Affairs. Loan rules, fees, and limits change — confirm every number with the VA, a VA-approved lender, and your own advisors before you act.</p>
      <p>Official VA home loan information: <a href="https://www.va.gov/housing-assistance/home-loans/" target="_blank" rel="noopener noreferrer">va.gov/housing-assistance/home-loans</a> · VA Regional Loan Center: 1-877-827-3702</p>
    </footer>
  </main>
</div>
<script src="${base}assets/app.js"></script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function loadPages() {
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  const pages = files.map((file) => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const slug = file.replace(/\.md$/, '');
    if (!meta.title) throw new Error(`content/${file} is missing a "title" in its frontmatter`);
    if (!meta.order) throw new Error(`content/${file} is missing an "order" in its frontmatter`);
    return {
      slug,
      file,
      meta,
      body,
      order: Number(meta.order),
      url: slug === 'index' ? 'index.html' : `${slug}.html`,
    };
  });
  pages.sort((a, b) => a.order - b.order);
  return pages;
}

function build() {
  const pages = loadPages();
  rmrf(OUT_DIR);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  copyDir(ASSETS_DIR, path.join(OUT_DIR, 'assets'));
  // Tell GitHub Pages not to run Jekyll over the output.
  fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '');

  const navigable = pages.filter((p) => p.meta.nav !== 'false');

  pages.forEach((page) => {
    const idx = navigable.findIndex((p) => p.slug === page.slug);
    const prev = idx > 0 ? navigable[idx - 1] : null;
    const next = idx !== -1 && idx < navigable.length - 1 ? navigable[idx + 1] : null;
    const { html, headings } = renderMarkdown(page.body);
    const out = layout({ page, pages: navigable, contentHtml: html, headings, prev, next });
    fs.writeFileSync(path.join(OUT_DIR, page.url), out);
  });

  // Search/index data for anything that wants it later.
  fs.writeFileSync(
    path.join(OUT_DIR, 'program.json'),
    JSON.stringify(
      {
        title: SITE.title,
        tagline: SITE.tagline,
        modules: navigable.map((p) => ({
          slug: p.slug,
          url: p.url,
          title: p.meta.title,
          module: p.meta.module || null,
          section: p.meta.section || 'Program',
          duration: p.meta.duration || null,
          description: p.meta.description || '',
        })),
      },
      null,
      2
    )
  );

  const urls = navigable.map((p) => p.url);
  if (SITE.baseUrl) {
    const b = SITE.baseUrl.replace(/\/$/, '');
    fs.writeFileSync(
      path.join(OUT_DIR, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map((u) => `  <url><loc>${b}/${u === 'index.html' ? '' : u}</loc></url>`).join('\n') +
        `\n</urlset>\n`
    );
  }

  console.log(`Built ${pages.length} pages -> dist/`);
  return pages;
}

if (require.main === module) {
  try {
    build();
  } catch (err) {
    console.error(`Build failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { renderMarkdown, parseFrontmatter, slugify, inline, build, loadPages };
