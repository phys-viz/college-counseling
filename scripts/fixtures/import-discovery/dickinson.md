# Dickinson discovery regression

Source: https://www.dickinson.edu/info/20084/institutional_research/3487/statistics

Retrieved October 24, 2026. Original response bytes are retained in `dickinson.html`.
SHA-256: `ca389871eca136cd84c43c514fb3a8480c8f9e52f5cec6d0c41469db12335f0e`.

Independently checked against the page's Common Data Set list: ten report links, fall years 2016 through 2025. The footer's Non-Discrimination Policy is a separate, unrelated PDF. Before the fix discovery returned eleven files because regex word boundaries did not recognize `cds_` or `cds2016` filenames, leaving its explicit-CDS filter inactive.

`check-dickinson-discovery.mjs` checks this original page plus synthetic filename boundary ambiguities. `check-dickinson-browser.mjs --collect` downloads the original reports into ignored local cache with URL/hash metadata and verifies each through the same PDF.js extractor as the website. It does not save reports or claim all extracted metrics are independently verified.
