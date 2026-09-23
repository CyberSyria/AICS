# Report templates

Templates are ordered lists of **sections** managed in the UI (`/reports/templates`).

## Built-in section types

Cover, Executive Summary, Scope, Methodology, Assets, Tools Used, Assessment Timeline, Findings Summary, Severity Distribution, Detailed Findings, Recommendations, Retest Results, Conclusion, Appendix, Custom Markdown (supports `{{project.name}}`, `{{stats.critical_count}}`, …).

## Generation options

- Language: English, Arabic, or bilingual
- Filter findings by severity/status/asset/phase
- Include/exclude evidence; redaction toggle; classification label
- Branding from design tokens + org logo/footer

## Export

- PDF (primary) via WeasyPrint HTML/CSS with RTL/Arabic shaping
- HTML and Markdown always
- Findings CSV/JSON when requested

Drafts are editable; finalized reports are immutable (version, generator, timestamp, SHA-256). Generation is audited.
