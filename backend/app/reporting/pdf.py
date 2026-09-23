"""
Report HTML generation with RTL/Arabic CSS, and PDF export.

PDF engine: WeasyPrint when available (needs Pango/GTK on Windows).
Fallback: return HTML only and document system deps — callers can still export HTML/Markdown.
"""

from __future__ import annotations

import base64
import hashlib
import logging
from pathlib import Path
from typing import Any

from jinja2 import Template

logger = logging.getLogger(__name__)

ASSETS_DIR = Path(__file__).resolve().parent / "assets"

WEASYPRINT_AVAILABLE = False
try:
    from weasyprint import HTML as WeasyHTML  # noqa: N811

    WEASYPRINT_AVAILABLE = True
except Exception as exc:  # pragma: no cover - platform dependent
    WeasyHTML = None  # type: ignore
    logger.warning(
        "WeasyPrint unavailable (%s). PDF export falls back to HTML. "
        "On Windows install GTK3 runtime; on Debian: apt install libpango-1.0-0 "
        "libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev shared-mime-info",
        exc,
    )


def _data_uri(path: Path, mime: str) -> str:
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _letterhead_assets() -> dict[str, str]:
    """Load logo + Qomra fonts for the official report letterhead."""
    logo = ASSETS_DIR / "image2.png"
    regular = ASSETS_DIR / "Qomra-Regular.otf"
    bold = ASSETS_DIR / "Qomra-Bold.otf"
    out: dict[str, str] = {"logo_uri": "", "font_regular_uri": "", "font_bold_uri": ""}
    if logo.is_file():
        out["logo_uri"] = _data_uri(logo, "image/png")
    if regular.is_file():
        out["font_regular_uri"] = _data_uri(regular, "font/otf")
    if bold.is_file():
        out["font_bold_uri"] = _data_uri(bold, "font/otf")
    return out


# Design tokens from prompt (report branding)
CSS = """
{% if font_regular_uri %}
@font-face {
  font-family: "Qomra";
  src: url("{{ font_regular_uri }}") format("opentype");
  font-weight: 400;
  font-style: normal;
}
{% endif %}
{% if font_bold_uri %}
@font-face {
  font-family: "Qomra";
  src: url("{{ font_bold_uri }}") format("opentype");
  font-weight: 700;
  font-style: normal;
}
{% endif %}
:root {
  --gold: #C1A576;
  --ink: #062E28;
  --void: #010C0A;
  --panel: #041C18;
  --card: #071F1B;
  --text: #F0E6D2;
  --muted: #8A9A8C;
  --error: #FF6B6B;
  --success: #7CFF6B;
  --warning: #E6C27A;
}
@page { size: A4; margin: 18mm 16mm; }
body {
  font-family: "Segoe UI", "Noto Naskh Arabic", "Cairo", "Tahoma", sans-serif;
  color: #1a1a1a;
  background: #fff;
  font-size: 11pt;
  line-height: 1.55;
}
body.rtl { direction: rtl; text-align: right; }
body.ltr { direction: ltr; text-align: left; }
h1, h2, h3 { color: var(--ink); border-bottom: 1px solid var(--gold); padding-bottom: 0.25em; }
.letterhead {
  text-align: center;
  margin: 0 0 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid var(--gold);
  font-family: "Qomra", "itf Qomra Arabic", "Segoe UI", "Noto Naskh Arabic", Tahoma, sans-serif;
}
.letterhead .logo {
  display: block;
  margin: 0 auto 0.75rem;
  width: 88px;
  height: auto;
}
.letterhead .org-line {
  margin: 0.15rem 0;
  color: #1a1a1a;
  font-size: 12pt;
  font-weight: 400;
  line-height: 1.45;
}
.letterhead .org-line.primary {
  font-weight: 700;
  font-size: 13pt;
}
.cover {
  page-break-after: always;
  text-align: center;
  padding-top: 8%;
}
.cover .title {
  font-family: "Qomra", "itf Qomra Arabic", "Segoe UI", "Noto Naskh Arabic", Tahoma, sans-serif;
  font-size: 1.65rem;
  margin: 1.25rem 0 0.75rem;
  color: var(--ink);
  font-weight: 700;
}
.meta { color: #555; font-size: 0.95rem; }
.classification {
  display: inline-block;
  border: 2px solid var(--error);
  color: var(--error);
  padding: 0.2rem 0.8rem;
  font-weight: 700;
  margin-top: 1.5rem;
}
table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
th, td { border: 1px solid #ccc; padding: 6px 8px; }
th { background: #f3efe6; color: var(--ink); }
.sev-critical { color: var(--error); font-weight: 700; }
.sev-high { color: #d97757; font-weight: 700; }
.sev-medium { color: var(--warning); }
.sev-low { color: var(--gold); }
.sev-informational { color: var(--muted); }
.section { page-break-inside: avoid; margin-bottom: 1.5rem; }
.finding { border: 1px solid #ddd; padding: 0.8rem; margin-bottom: 1rem; }
.finding .id { color: var(--gold); font-weight: 700; }
footer { font-size: 0.8rem; color: #777; }
"""

REPORT_TEMPLATE = Template(
    """
<!DOCTYPE html>
<html lang="{{ lang }}" dir="{{ dir }}">
<head>
  <meta charset="utf-8"/>
  <title>{{ title }}</title>
  <style>{{ css }}</style>
</head>
<body class="{{ dir }}">
  <section class="cover">
    <header class="letterhead">
      {% if logo_uri %}
      <img class="logo" src="{{ logo_uri }}" alt=""/>
      {% endif %}
      {% for line in letterhead_lines %}
      <div class="org-line{% if loop.first %} primary{% endif %}">{{ line }}</div>
      {% endfor %}
    </header>
    <div class="title">{{ title }}</div>
    <div class="meta">{{ project_name }}</div>
    <div class="meta">{{ generated_at }}</div>
    {% if classification %}
    <div class="classification">{{ classification }}</div>
    {% endif %}
  </section>

  {% for section in sections %}
  <section class="section">
    <h2>{{ section.title }}</h2>
    {{ section.body | safe }}
  </section>
  {% endfor %}

  {% if findings %}
  <section class="section">
    <h2>{{ findings_heading }}</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th><th>{{ col_title }}</th><th>{{ col_severity }}</th><th>{{ col_status }}</th>
        </tr>
      </thead>
      <tbody>
      {% for f in findings %}
        <tr>
          <td class="id">{{ f.public_id }}</td>
          <td>{{ f.title }}</td>
          <td class="sev-{{ f.severity_code }}">{{ f.severity_name }}</td>
          <td>{{ f.status_name }}</td>
        </tr>
      {% endfor %}
      </tbody>
    </table>

    {% for f in findings %}
    <div class="finding">
      <div><span class="id">{{ f.public_id }}</span> — {{ f.title }}</div>
      <p><strong>{{ col_severity }}:</strong> {{ f.severity_name }} |
         <strong>{{ col_status }}:</strong> {{ f.status_name }}</p>
      {% if f.description %}<p>{{ f.description }}</p>{% endif %}
      {% if f.impact %}<p><strong>{{ col_impact }}:</strong> {{ f.impact }}</p>{% endif %}
      {% if f.recommendation %}<p><strong>{{ col_recommendation }}:</strong> {{ f.recommendation }}</p>{% endif %}
    </div>
    {% endfor %}
  </section>
  {% endif %}
</body>
</html>
"""
)

# Official letterhead from report.docx (itf Qomra Arabic)
LETTERHEAD_LINES_AR = (
    "الجمهورية العربية السورية",
    "وزارة الدفاع",
    "إدارة المعلوماتية",
    "فرع الذكاء الصنعي",
    "قسم أمن الذكاء الصنعي",
)

LETTERHEAD_LINES_EN = (
    "Syrian Arab Republic",
    "Ministry of Defense",
    "Information Directorate",
    "Artificial Intelligence Branch",
    "AI Security Department",
)


def _i18n(language: str) -> dict[str, str]:
    if language == "ar":
        return {
            "lang": "ar",
            "dir": "rtl",
            "findings_heading": "النتائج الأمنية التفصيلية",
            "col_title": "العنوان",
            "col_severity": "الخطورة",
            "col_status": "الحالة",
            "col_impact": "التأثير",
            "col_recommendation": "التوصية",
        }
    return {
        "lang": "en" if language != "ar" else "ar",
        "dir": "rtl" if language == "ar" else "ltr",
        "findings_heading": "Detailed Findings",
        "col_title": "Title",
        "col_severity": "Severity",
        "col_status": "Status",
        "col_impact": "Impact",
        "col_recommendation": "Recommendation",
    }


def build_report_html(
    *,
    title: str,
    project_name: str,
    language: str,
    classification: str,
    generated_at: str,
    sections: list[dict[str, str]],
    findings: list[dict[str, Any]],
) -> str:
    labels = _i18n(language)
    if language == "bilingual":
        labels["lang"] = "en"
        labels["dir"] = "ltr"
        labels["findings_heading"] = "Detailed Findings / النتائج الأمنية التفصيلية"

    assets = _letterhead_assets()
    css = Template(CSS).render(
        font_regular_uri=assets["font_regular_uri"],
        font_bold_uri=assets["font_bold_uri"],
    )
    letterhead_lines = LETTERHEAD_LINES_AR if language == "ar" else LETTERHEAD_LINES_EN
    # Official Word letterhead is Arabic — keep AR hierarchy for bilingual too
    if language == "bilingual":
        letterhead_lines = LETTERHEAD_LINES_AR

    return REPORT_TEMPLATE.render(
        css=css,
        title=title,
        project_name=project_name,
        classification=classification,
        generated_at=generated_at,
        sections=sections,
        findings=findings,
        logo_uri=assets["logo_uri"],
        letterhead_lines=letterhead_lines,
        **labels,
    )


def html_to_pdf(html: str) -> tuple[bytes | None, str]:
    """
    Returns (pdf_bytes, format).
    format is 'pdf' if WeasyPrint worked, else 'html' with pdf_bytes=None.
    """
    if not WEASYPRINT_AVAILABLE or WeasyHTML is None:
        return None, "html"
    try:
        pdf = WeasyHTML(string=html).write_pdf()
        return pdf, "pdf"
    except Exception as exc:  # pragma: no cover
        logger.exception("WeasyPrint PDF failed: %s", exc)
        return None, "html"


def content_sha256(data: bytes | str) -> str:
    raw = data.encode("utf-8") if isinstance(data, str) else data
    return hashlib.sha256(raw).hexdigest()
