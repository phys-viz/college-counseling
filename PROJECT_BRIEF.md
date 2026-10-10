# Admissions Atlas — brief for a new Codex conversation

## Purpose and users

We are building a scalable, searchable college-counseling research library for a professional college counselor and her husband. It normalizes institutional Common Data Set (CDS) reports across schools and reporting years, initially focusing on Section C (first-year admissions), with additional academic, cost, aid, outcome, and transfer metrics. Every figure should be traceable to its original report and supporting page. This is historical research, not a prediction of an individual student's admission chances.

Live app: https://college-counseling-atlas.andonee.chatgpt.site

The Site is shared with the owner and his wife using a custom audience. Preserve that audience. Both can browse, compare, plot, export, and save reviewed imports to the same persistent database. They do not need ChatGPT to extract supported PDFs inside the app. Never change sharing or email anyone without a new instruction.

## Product

- Searchable school profiles and yearly reports, school/year filters, source-linked details, comparison of up to four reports, CSV and full JSON exports.
- Trends for one or two schools across a chosen year range; missing years remain gaps. Line charts offer automatic, zero-based, or custom Y-axis ranges with reset and bounds validation; year fields remain the horizontal range controls. Metric-specific hover/focus details show relevant supporting counts. Trend counts describe selected years and available source reports rather than the whole library. School-specific annotations name missing years and values outside custom Y-axis limits, and copied/downloaded figures retain these annotations. Archive links follow the selected schools, using saved latest-report metadata even when the chosen years have no records. Copy graph writes a PNG of the current chart with its axis and label settings, title, legend and source attribution; PNG/SVG/CSV downloads remain available. SAT/ACT middle-50% ranges show reported percentiles; medians appear only when supplied.
- Searchable metric picker with colored categories and alphabetical metric names. Legends use bundled official school marks and documented school colors.
- “Add school data” accepts a school's CDS archive page or a direct PDF URL. It discovers reports, extracts PDF text/form fields in the browser, presents drafts for review, recalculates rates, and saves to the shared database. Existing school/year records require explicit replacement. JSON is still the interchange/backup format.

## Architecture and important files

Workspace: `C:\Vibe Coding\College Counseling\counselor-database`.

React/TypeScript app using Vinext/Vite, Tailwind/Radix and Recharts, published through the Sites plugin to a Cloudflare Workers runtime. Cloudflare D1 SQLite is the hosted database; local development has separate local D1 state. FTS5 search is maintained by database triggers. The downloadable SQLite snapshot is not the production database.

- `AGENTS.md`: mandatory standing project instructions; read first.
- `README.md`: setup, source adapters, tests and known limitations.
- `app/atlas.tsx`, components: library/import/trend UI.
- `app/api/reports/route.ts`: paginated summaries, full records, validated imports.
- `app/api/trends/route.ts`: numeric trend records and derived comparisons.
- `lib/discover-sources.ts`, `lib/public-source.ts`: bounded public-source discovery/fetching.
- `lib/extract-pdf.ts`, `lib/extract-additional.ts`: shared browser PDF normalization.
- `lib/metric-definitions.ts`, `lib/metric-groups.ts`, `lib/trend-types.ts`: labels, categories, chart metrics and definitions.
- `lib/extract-gender.ts`: reusable C1 gender parsing; `lib/saved-gender.ts` and `data/gender-source-backfill.json`: additive enrichment of existing records, keyed by institution/year and exact source hash. Existing gender corrections are preserved. Profiles, trends and exports include the enrichment without overwriting stored core fields.
- `lib/validate-import.ts`: schema/count validation and calculated rates.
- `lib/database.ts`: database access and idempotent seed inserts; never overwrite counselor edits through seeding.
- `data/reports.json`: reproducible seed; production also contains counselor-imported schools.
- `data/*sources*.json`, source review files, `scripts/fixtures/`: provenance and independent regression expectations.
- `.openai/hosting.json`: Sites project `appgprj_6ac6a051d748819193e9ef93cb68ca12`, logical D1 binding `DB`. No secrets belong in this brief or the repository.

## Standing requirements from the user

Every school added through Codex must also improve the shared parser when a reliable reusable pattern is found. Inspect layout changes across years; add independently checked fixtures; keep exceptional/offline adapters separate. A manually corrected record does not prove the website parser supports its layout.

Accuracy has priority: an earlier W&L import mistakenly treated male applicants as total applicants. Reconcile all reported gender/status groups, avoid adding overall and component rows twice, and distinguish blank, zero, unknown, contradictory and unreported values. Preserve publisher inconsistencies with source notes. Never add SAT reading/math percentiles to invent a composite. Policy, aid, cost and outcome reporting periods can differ from the admissions fall year.

Preserve raw Section C text, form fields, SHA-256, original URL and per-metric page/method evidence. Keep reviewed counselor corrections unless a correction/replacement was requested. Additive enrichment should preserve existing core values and source evidence.

## Coverage and current work

Seed coverage: 526 reports. The expansion adds 378 reports for 22 schools; see SCHOOL_DATA_COVERAGE.md for exact years and exclusions. Prior coverage: 148 reports across Cornell 1999–2025, South Carolina (Columbia) 2000–2025, Clemson 2008–2025, Washington and Lee 2005–2025, NYU 2018–2025, Villanova 2023–2025, Michigan Ann Arbor 1998–2025, TCNJ 2014–2025, and Virginia Tech 2019 / 2022–2025. The shared library also contains four counselor-imported reports for Boston College, Harvard and Penn State (University Park); consult the live database for exact coverage.

Gender admissions retains 20 source metrics: applicants, admitted, enrolled, admission rate and yield for male, female, another gender and unknown gender/sex. The trend picker displays only the ten male/female metrics, as requested; underlying source data and profiles retain all reported categories. Counts and rates retain source evidence; unfilled categories stay gaps. Rate denominators use the selected group, not overall applicants. TCNJ 2023 has contradictory breakdowns and preserves its printed overall totals with notes. Michigan 2018 has a stale Fall 2017 C1 label; the reviewed cohort index is 2018. Clemson 2016 appears to misassign gender/status enrollment answers; those gender enrollment/yield values remain unfilled. Clemson 2025's scanned C1 has one-student inconsistencies between its gender, status and overall counts; visually reviewed unknown-sex counts and notes are recorded separately in `data/gender-source-review.json`. Some older formats still lack reliable normalized fields.

Existing counselor-imported Harvard 2025 and Penn State 2025 have saved headline counts that disagree with their source gender totals. The enrichment flags this in source notes; it does not silently replace the counselor's saved totals. These need explicit review before relying on their overall rates.

NYU's server blocked direct downloads: eight NYU-authored archived files were used with exact archived URLs/hashes and explicit notes. NYU 2021/2025 are XLSX sources processed through an offline worksheet adapter. Cornell 2022 uses its companion Section C spreadsheet. Clemson 2021 needs a spreadsheet adapter and Clemson 2025 needs OCR/visual review. Virginia Tech has five source-verified reports (2019 and 2022–2025), using exact archived VT-authored originals; other inspected year-labeled files contain only definitions/change logs and are excluded. VT 2023 has 47,208 applicants across gender rows versus a printed overall/residency total of 47,207; the seed preserves the explicit overall total with notes, while automatic PDF imports flag it for review. VT 2024 is a question/answer XLSX dictionary with inconsistent residency and unknown-gender answers, retained in raw worksheet evidence and notes. VT 2022/2024/2025 remain offline worksheet adapters. Shared PDF improvements repair a narrowly recognized malformed font encoding and wrapped residency/score labels; source fixtures and actual PDF.js checks are in scripts/check-vt-import.mjs and scripts/check-vt-browser.mjs. Browser imports support selectable-text PDFs and filled PDF forms, not OCR, XLSX or historical HTML-only reports. Never silently fill missing years from adjacent reports.

## Development, verification and publication

Use existing dependencies and local migrations; do not recreate the app or production database. Typical commands: `npm run dev`, `npm run build`, `node scripts/check-c1-counts.mjs`, `node scripts/check-additional-metrics.mjs`, `node scripts/check-gender-metrics.mjs`, `node scripts/check-new-archives.mjs`, and the affected school/browser tests under `scripts/check-*.mjs`. Read the README for local D1 setup and source collection. Playwright is installed under ignored `.sites-runtime/browser`; Chrome is at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Do not depend on ignored caches without documenting a reproducible collection step. Source fixtures make the main extraction regressions independent of live university sites.

Database initialization must use request-local D1 operations, never a module-level in-flight promise: an interrupted Worker request can leave later visitors waiting indefinitely. Only missing seed IDs are inserted, with conflict protection. Library and trend reads have a 15-second timeout and show a retry state. Run `node scripts/check-library-loading.mjs` for cancellation, recovery and preservation checks.

For hosted changes, read the installed Sites building/hosting skills. Open the existing Site and use the bundled `site-workflow.mjs`, native source credentials passed only through hidden stdin, then native save/deploy calls. Preserve project identity, shared audience and database contents. Never print tokens or commit them. In this Windows environment, build with literal Node/npm CLI arguments and Git on PATH; `TAR_OPTIONS=--force-local` handles drive-letter archive paths. Save/deploy only the exact verified workflow commit/archive.

Suggested next-conversation opening: “Read AGENTS.md and PROJECT_BRIEF.md in the existing counselor-database workspace. Continue updating Admissions Atlas; preserve its shared library, source evidence and existing Sites identity.”
