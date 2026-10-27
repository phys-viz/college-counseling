# School data coverage

Reviewed October 10, 2026. This expansion adds 378 reports for 22 schools. Years identify fall cohorts. The reproducible seed contains 526 reports; previously saved counselor reports remain preserved separately in the shared database.

| School | Fall years | Reports | Source formats |
|---|---|---:|---|
| Bentley University | 2021–2025 | 5 | PDF |
| Boston University | 2008–2025 | 18 | PDF |
| Duquesne University | 2018–2025 | 8 | PDF |
| Elon University | 2000–2025 | 26 | PDF, XLSX |
| Fordham University | 2011–2022 | 12 | PDF |
| George Washington University | 2018–2025 | 8 | PDF |
| Indiana University Bloomington | 2000–2025 | 26 | HTML |
| James Madison University | 1999, 2018–2025 | 9 | DOCX, PDF |
| Lehigh University | 2001–2006, 2008–2025 | 24 | HTML, PDF |
| The Ohio State University (Columbus) | 2014–2025 | 12 | PDF |
| Rutgers University–New Brunswick | 2012–2023 | 12 | PDF |
| University of Alabama | 2007–2025 | 19 | PDF |
| University of Delaware | 1997–2024 | 28 | PDF |
| University of Florida | 1997–2025 | 29 | PDF |
| University of Georgia | 2003–2025 | 23 | PDF |
| University of Illinois Urbana-Champaign | 2017–2025 | 9 | XLSX |
| University of Maryland, College Park | 2007–2025 | 19 | XLSX |
| University of Massachusetts Amherst | 1999–2025 | 27 | PDF |
| University of Massachusetts Boston | 2011–2023 | 13 | PDF, XLSX |
| University of North Carolina at Charlotte | 2004–2025 | 22 | PDF, XLSX |
| University of Notre Dame | 2007–2025 | 19 | PDF |
| University of Scranton | 2006–2009, 2020–2025 | 10 | PDF |

Campus scope includes Rutgers–New Brunswick, Indiana Bloomington, Illinois Urbana-Champaign, UMass Boston, and Maryland College Park. The Rutgers desk card reports admitted-student scores and is not substituted for enrolled-student CDS figures.

The additional schools distinguish UMass Amherst from UMass Boston and Ohio State Columbus from its regional campuses. Fordham's 2023 Word and 2024 workbook links require access that was unavailable; usable institution-authored archived originals cover 2020–2022. Published older JMU and George Washington originals that could not be recovered are listed as unavailable in their source manifests. Georgia's official PDFs were accessible even though its index refused automated access.

Missing years remain absent. Scranton's 2010 file is an unfilled template; 2011–2019 usable originals were not recovered. Lehigh's archived 2007 Section C link is unavailable; its 2001, 2003 and 2006 enrollment responses are incomplete. Illinois 2016 redirects to a webpage rather than its original XLS. Notre Dame's public official folder starts in 2007. UMass Boston's nominal 2013 PDF contains 2014 data, so the genuine 2013 workbook is used instead.

Conflicting answers stay unfilled with source notes, including Bentley 2023 applicants; Elon 2020 enrollment; Scranton 2009, 2020 and 2022 enrollment; and some gender/status/residency details. Separately verified same-cohort Section B totals support Elon 2002, 2003 and 2019 enrollment. UF 1997 C1 and B1 disagree; its explicit C1 headline is preserved with a note. Consult individual records before relying on a disputed figure.

Delaware reports change campus scope across years. Some older enrollment populations are ambiguous; 2015–2020 applicants cover a different population from admitted students, so admission rates remain missing. Later institution-wide totals include Associate in Arts students and are kept separate from Newark-only gender figures. JMU 1999 class-rank counts and band labels are not imported as cumulative percentages. JMU 2022 and Georgia 2023 enrollment conflicts retain verified headline totals with disputed breakdowns omitted.

Manifests, hashes and independent reviews are in data/batch-*-sources.json and data/batch-*-source-review.json. Records retain raw Section C text, form answers and per-metric evidence. Institution-authored archived originals are labeled in source notes. Additional source-extracted metrics have not all been manually audited.

The shared PDF importer now handles compact gender-column tables, CDS-prefixed section labels, historical wrapped labels, independently reconciled merged overall cells, residency totals, spaced numeric commas, footnote marks, paired SAT/ACT distributions, and separately labeled submission counts. It chooses answer pages over revision lists and rejects rank-band annotations and blank-answer sum instructions. Discovery keeps years and campuses separate, follows bounded archive links, suppresses redundant section PDFs when a full report exists, recognizes labeled download links, and explains workbook/Word/viewer limitations.

Historical HTML, Excel 97–2003 (.xls) and Word remain offline adapters; the browser now extracts .xlsx CDS workbooks but does not add OCR, .xls, Word or HTML extraction. Seeded .xlsx records keep their offline-adapter extraction and reviewed overrides. Ohio State 2024–2025 and Delaware 1997/2024 require offline OCR and visual review because the PDF text is absent or corrupt. Word records retain original file hashes, extracted XML hashes and source table/row indexes; those indexes are not physical PDF pages. Reviewed omissions prevent later source enrichment from refilling disputed values. Separate section files retain their own raw-page URL/hash and metric evidence. Lossless compressed seed payloads are decoded only for missing record IDs and do not replace saved counselor records.
