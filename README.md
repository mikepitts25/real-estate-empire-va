# VA Home Loan Real Estate Empire

A self-paced, 12-module training program that teaches veterans, service members, and eligible
surviving spouses how to use the VA home loan benefit to build a rental property portfolio with
little to no money down.

The program is a static website built from Markdown. It deploys to GitHub Pages automatically
on every push to `main`.

> **Educational material only.** This is not financial, legal, or tax advice, and it is not
> affiliated with or endorsed by the U.S. Department of Veterans Affairs. Loan limits, funding
> fee percentages, residual income tables, and underwriting rules change — every figure is
> illustrative and must be confirmed with the VA and a VA-approved lender.
> Official information: <https://www.va.gov/housing-assistance/home-loans/>

## The curriculum

| # | Module | Covers |
| --- | --- | --- |
| 1 | The Benefit You Earned | The guaranty, zero down, no PMI, 1–4 units, funding fee, COE |
| 2 | Entitlement Math | Basic vs. bonus entitlement, second-tier use, restoration paths |
| 3 | Getting Loan-Ready | Credit, DTI, residual income, reserves, choosing a lender |
| 4 | The House Hack Blueprint | Formats, the two economic states of a house hack, buy box |
| 5 | Finding the Deal | Markets, agents, sourcing, rent rolls, MPRs |
| 6 | Underwriting the Numbers | NOI, cap rate, DSCR, break-even, stress tests |
| 7 | Offer to Close | Seller concessions, non-allowables, VA appraisal, Tidewater |
| 8 | Occupancy & Compliance | The occupancy certification, exceptions, and the legal line |
| 9 | Operating the Property | Screening, leases, systems, forcing appreciation, EEM/renovation loans |
| 10 | Restore & Repeat | Converting to a rental, entitlement paths, IRRRL, cash-out |
| 11 | Financing the Rest | Conventional, DSCR, portfolio, commercial, partnerships |
| 12 | 36-Month Campaign Plan | Milestones, metrics, risk pre-decisions |

Plus: five interactive calculators, printable worksheets, a glossary, and a resources page that
tells you where to verify every number for yourself.

## Calculators

All run client-side; nothing is transmitted anywhere.

- **VA funding fee** — by loan type, use, down payment, and exemption status
- **Second-tier entitlement** — available entitlement and zero-down capacity while keeping a property
- **DTI and residual income** — VA-style qualification check
- **House hack analyzer** — PITI, effective housing cost while occupying, cash flow after you move out
- **Portfolio projection** — doors, cash flow, and equity over a chosen horizon

## Local development

No dependencies to install — the builder uses only the Node standard library.

```bash
npm run build     # build the site into dist/
npm run serve     # build and serve at http://localhost:8080
npm test          # run the builder and content checks
```

Requires Node 18+.

## How it is built

```
content/*.md     course content, one file per page, with YAML-ish frontmatter
assets/          styles.css, app.js (progress tracking + calculators), favicon
build.js         zero-dependency Markdown renderer and static site generator
test/            assertions for the renderer, the build output, and links
dist/            generated output (git-ignored)
```

Frontmatter keys: `title`, `navTitle`, `section`, `order`, `module`, `duration`,
`description`, and `nav: false` to keep a page out of the module sequence.

The Markdown subset supports headings, lists, tables, blockquotes, code fences, links,
raw HTML blocks, task lists (which become progress-tracked checkboxes), and callouts:

```
:::warning Title goes here
Body text.
:::
```

Callout types: `warning`, `tip`, `money`, `mission`.

## Deployment

`.github/workflows/pages.yml` runs the tests, builds the site, and publishes `dist/` to
GitHub Pages on every push to `main`. In repository **Settings → Pages**, set
**Source** to **GitHub Actions**.

`.github/workflows/ci.yml` runs the tests on pull requests and non-`main` branches.

## Contributing

Corrections matter here more than in most repositories — outdated figures could cost a
veteran money. If you spot an error, open an issue or a pull request, and please cite the
primary source (va.gov, the VA Lenders Handbook M26-7, or FHFA).

## License

MIT for the code. Content is provided for educational use.
