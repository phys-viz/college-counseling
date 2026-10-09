# Admissions Atlas project instructions

## Improve the parser with every school import

The user has explicitly requested that adding school data through the assistant also improves the parser over time. Treat this as part of each future school import, without asking for this preference again.

- Inspect the original documents across the available years and identify changes in layouts, labels, tables, form fields, and file formats. Compare extraction with source pages before saving records.
- When a newly encountered pattern can be recognized reliably, implement a reusable parsing rule in the shared importer. Prefer incremental improvements and focused refactoring over replacing the entire parser for each school.
- Use `lib/discover-sources.ts` for archive-link discovery and `lib/extract-pdf.ts` for the browser's PDF normalization. An improvement confined to an offline ingestion script does not automatically improve the website importer.
- Use a scoped adapter when a format requires separate handling. Scope exceptional behavior by documented source structure and, where necessary, institution and report version. Keep extraction rules separate from manually reviewed values for a particular report.
- Carry reusable discoveries from offline adapters into the shared importer when its runtime can support them reliably. Explicitly document remaining gaps, such as scanned PDFs, spreadsheets, image-only factor marks, or contradictory publisher figures. Do not imply that a corrected database record proves automatic extraction supports that layout.
- For each substantive parser change, add a regression fixture or check showing the source pattern and independently verified expected results. Cover the ambiguity that caused the failure, not just the new implementation. Preserve source URLs, hashes, and physical page evidence where available.
- Run the affected checks and representative existing-school extraction checks. A new-school improvement must preserve established Cornell, USC, Clemson, and W&L behavior where supported.
- Publish changes that affect the hosted importer through the existing Sites workflow, preserving the current shared audience. Report which improvements now benefit the website importer and which remain source-adapter or manual-review work.

## Data integrity

- Verify C1 applicants, admitted, and enrolled against the original source, including all reported gender/status groups. A subgroup is never an overall total. Avoid double counting overall and component rows.
- Distinguish explicit totals from breakdown columns, current-year answers from prior-year reference columns, and answer values from years or score bounds printed in questions.
- Treat missing, zero, ambiguous, and contradictory responses separately. Preserve source inconsistencies with notes; do not invent answers to make tables reconcile.
- Preserve original Section C text and per-metric evidence. Recalculate rates from validated counts with `lib/validate-import.ts`.
- Preserve existing counselor records and reviewed corrections unless the user's request includes correcting or replacing them. Parser updates do not automatically authorize overwriting saved reports.

## Existing coverage and known limitations

The shared parser already handles multiple gender labels, reported unknown-sex counts, several residency table layouts, HTML base URLs, accessible archive-link labels, typographic hyphens, CDS-prefixed section labels, and score-range annotations. Regression checks are under `scripts/check-*.mjs`.

The Clemson/W&L archive scripts include additional offline geometry handling and manually reviewed overrides. Clemson 2021 uses a spreadsheet adapter; Clemson 2025 uses local OCR and visual review. These are useful evidence for future improvements but are not browser-importer capabilities. Keep this distinction accurate in documentation and user-facing explanations.
