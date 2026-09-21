import io
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from app.models.transcription import JudicialHearingReport

# Formal judicial color palette
COLOR_NAVY = RGBColor(10, 37, 64)       # Deep Navy
COLOR_GREEN = RGBColor(0, 135, 81)     # Nigerian Green
COLOR_DARK = RGBColor(33, 37, 41)       # Charcoal Body Text
COLOR_MUTED = RGBColor(100, 116, 139)   # Slate Gray
COLOR_BORDER = "CCCCCC"

def set_cell_background(cell, fill_hex: str):
    """Sets background fill color of a table cell."""
    tcPr = cell._element.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Sets cell padding in twips (1/20 pt)."""
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for margin, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{margin}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def generate_judicial_docx(report: JudicialHearingReport) -> io.BytesIO:
    """
    Generates an authoritative, beautifully styled Judicial Hearing Report .docx document.
    """
    doc = Document()

    # Configure standard 1-inch margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)
        section.page_width = Inches(8.27)   # Standard A4 width
        section.page_height = Inches(11.69) # Standard A4 height

    # Configure Header & Footer
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)
        section.page_width = Inches(8.27)   # Standard A4 width
        section.page_height = Inches(11.69) # Standard A4 height

        # Configure Header & Footer
        header = section.header
        header_p = header.paragraphs[0]
        header_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        h_run = header_p.add_run(f"SHARIA COURT OF APPEAL, JIGAWA STATE  •  APPEAL/SUIT NO: {report.case.case_number}")
        h_run.font.size = Pt(8.5)
        h_run.font.color.rgb = COLOR_MUTED

        footer = section.footer
        footer_p = footer.paragraphs[0]
        footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        f_run = footer_p.add_run("Official Judicial Hearing Record — Sharia Court of Appeal, Jigawa State of Nigeria (Dutse Division)")
        f_run.font.italic = True
        f_run.font.size = Pt(8)
        f_run.font.color.rgb = COLOR_MUTED

    # Bismillah & Invocation
    p_bis = doc.add_paragraph()
    p_bis.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_bis.paragraph_format.space_after = Pt(2)
    r_bis_ar = p_bis.add_run("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\n")
    r_bis_ar.font.size = Pt(13)
    r_bis_ar.font.bold = True
    r_bis_ar.font.color.rgb = COLOR_GREEN
    r_bis_en = p_bis.add_run("IN THE NAME OF ALLAH, THE MOST BENEFICENT, THE MOST MERCIFUL")
    r_bis_en.font.size = Pt(8.5)
    r_bis_en.font.bold = True
    r_bis_en.font.color.rgb = COLOR_MUTED

    # Court Hierarchy Header
    p_crest = doc.add_paragraph()
    p_crest.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_crest.paragraph_format.space_before = Pt(4)
    p_crest.paragraph_format.space_after = Pt(2)
    r_crest = p_crest.add_run("IN THE SHARIA COURT OF APPEAL OF JIGAWA STATE OF NIGERIA")
    r_crest.font.size = Pt(11)
    r_crest.font.bold = True
    r_crest.font.color.rgb = COLOR_NAVY

    p_court = doc.add_paragraph()
    p_court.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_court.paragraph_format.space_after = Pt(3)
    r_court = p_court.add_run(f"HOLDEN AT DUTSE ({getattr(report.case, 'division', 'DUTSE JUDICIAL DIVISION').upper()})")
    r_court.font.size = Pt(12)
    r_court.font.bold = True
    r_court.font.color.rgb = COLOR_GREEN

    p_suit = doc.add_paragraph()
    p_suit.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_suit.paragraph_format.space_after = Pt(10)
    r_suit = p_suit.add_run(f"APPEAL / SUIT NO: {report.case.case_number}")
    r_suit.font.size = Pt(11)
    r_suit.font.bold = True
    r_suit.font.color.rgb = COLOR_DARK

    # Coram Box (Before Their Lordships)
    p_coram_hdr = doc.add_paragraph()
    p_coram_hdr.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_coram_hdr.paragraph_format.space_after = Pt(2)
    r_coram_hdr = p_coram_hdr.add_run("BEFORE THEIR LORDSHIPS:")
    r_coram_hdr.font.bold = True
    r_coram_hdr.font.size = Pt(9)
    r_coram_hdr.font.color.rgb = COLOR_NAVY

    coram_list = getattr(report.case, 'coram', [
        "HON. KADI SANI SALIHU — HON. GRAND KADI (PRESIDING)",
        "HON. KADI ABUBAKAR M. GUMEL — HON. KADI",
        "HON. KADI USMAN BIRNIN KUDU — HON. KADI"
    ])
    for c_member in coram_list:
        p_c = doc.add_paragraph()
        p_c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_c.paragraph_format.space_after = Pt(1)
        r_c = p_c.add_run(c_member)
        r_c.font.size = Pt(8.5)
        r_c.font.bold = True
        r_c.font.color.rgb = COLOR_DARK

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # Parties Box: BETWEEN / AND
    table_parties = doc.add_table(rows=3, cols=2)
    table_parties.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_parties.autofit = False

    # Row 1: Claimant / Appellant
    cell_c1 = table_parties.rows[0].cells[0]
    cell_c2 = table_parties.rows[0].cells[1]
    cell_c1.width = Inches(4.5)
    cell_c2.width = Inches(2.0)
    p_c1 = cell_c1.paragraphs[0]
    r_c1 = p_c1.add_run(f"{report.parties.claimant}\n")
    r_c1.bold = True
    r_c1.font.size = Pt(10)
    r_c1_counsel = p_c1.add_run(f"Counsel/Wakil: {report.parties.counsel_claimant}")
    r_c1_counsel.font.size = Pt(9)
    r_c1_counsel.font.color.rgb = COLOR_MUTED
    p_c2 = cell_c2.paragraphs[0]
    p_c2.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_c2 = p_c2.add_run("APPELLANT / MAI DAUKAKA KARA")
    r_c2.font.bold = True
    r_c2.font.size = Pt(8.5)

    # Row 2: AND
    cell_and = table_parties.rows[1].cells[0]
    p_and = cell_and.paragraphs[0]
    r_and = p_and.add_run("AND")
    r_and.font.bold = True
    r_and.font.size = Pt(9)

    # Row 3: Defendant / Respondent
    cell_d1 = table_parties.rows[2].cells[0]
    cell_d2 = table_parties.rows[2].cells[1]
    cell_d1.width = Inches(4.5)
    cell_d2.width = Inches(2.0)
    p_d1 = cell_d1.paragraphs[0]
    r_d1 = p_d1.add_run(f"{report.parties.defendant}\n")
    r_d1.bold = True
    r_d1.font.size = Pt(10)
    r_d1_counsel = p_d1.add_run(f"Counsel/Wakil: {report.parties.counsel_defendant}")
    r_d1_counsel.font.size = Pt(9)
    r_d1_counsel.font.color.rgb = COLOR_MUTED
    p_d2 = cell_d2.paragraphs[0]
    p_d2.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_d2 = p_d2.add_run("RESPONDENT / WANDA AKE DAUKAKA KARA")
    r_d2.font.bold = True
    r_d2.font.size = Pt(8.5)

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # Title Bar
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(8)
    p_title.paragraph_format.space_after = Pt(12)
    r_t = p_title.add_run("OFFICIAL RECORD OF PROCEEDINGS & JUDICIAL HEARING REPORT")
    r_t.font.bold = True
    r_t.font.size = Pt(11)
    r_t.font.color.rgb = COLOR_NAVY

    # 1. Hearing Information Meta Table
    meta_table = doc.add_table(rows=3, cols=4)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        [("Presiding Coram", report.case.judge), ("Hearing Date", report.case.hearing_date)],
        [("Nature of Cause", report.case.hearing_type), ("Sitting Division", getattr(report.case, 'division', 'Dutse Division'))],
        [("Hearing Session", f"Session #{report.case.hearing_no}"), ("Witnesses Present", ", ".join(report.parties.witnesses) or "None called")]
    ]
    for r_idx, row_items in enumerate(meta_data):
        for c_idx, (label, val) in enumerate(row_items):
            c_label = meta_table.rows[r_idx].cells[c_idx * 2]
            c_val = meta_table.rows[r_idx].cells[c_idx * 2 + 1]
            set_cell_background(c_label, "F0F4F2")
            set_cell_margins(c_label, top=60, bottom=60, left=100, right=100)
            set_cell_margins(c_val, top=60, bottom=60, left=100, right=100)

            p_l = c_label.paragraphs[0]
            r_l = p_l.add_run(label)
            r_l.font.bold = True
            r_l.font.size = Pt(8.5)
            r_l.font.color.rgb = COLOR_NAVY

            p_v = c_val.paragraphs[0]
            r_v = p_v.add_run(str(val))
            r_v.font.size = Pt(8.5)

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # 2. Executive Summary
    h2 = doc.add_heading(level=2)
    h2.paragraph_format.space_before = Pt(12)
    h2.paragraph_format.space_after = Pt(4)
    r_h2 = h2.add_run("1. Executive Summary of Proceedings")
    r_h2.font.bold = True
    r_h2.font.color.rgb = COLOR_NAVY

    # Badge notice
    p_badge = doc.add_paragraph()
    p_badge.paragraph_format.space_after = Pt(6)
    r_badge = p_badge.add_run("[AI-GENERATED DRAFT — PRODUCED FROM AUDIO RECORDING AND VERBATIM SPEECH ANALYSIS]")
    r_badge.font.bold = True
    r_badge.font.size = Pt(8)
    r_badge.font.color.rgb = COLOR_GREEN

    # Summary paragraphs
    for para_text in report.summary.split("\n\n"):
        if para_text.strip():
            p_s = doc.add_paragraph(para_text.strip())
            p_s.paragraph_format.line_spacing = 1.15
            p_s.paragraph_format.space_after = Pt(6)
            for r in p_s.runs:
                r.font.size = Pt(9.5)

    # 3. Proceedings Narrative (Explanation of Proceedings without timestamps)
    h3 = doc.add_heading(level=2)
    h3.paragraph_format.space_before = Pt(12)
    h3.paragraph_format.space_after = Pt(6)
    r_h3 = h3.add_run("2. Chronological Proceedings Narrative & Explanation")
    r_h3.font.bold = True
    r_h3.font.color.rgb = COLOR_NAVY

    if report.proceedings:
        proc_table = doc.add_table(rows=1, cols=2)
        proc_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        hdr_cells = proc_table.rows[0].cells
        hdr_cells[0].width = Inches(2.2)
        hdr_cells[1].width = Inches(4.5)
        for idx, title in enumerate(["Procedural Stage & Participant", "Substantive Explanation of Proceedings"]):
            set_cell_background(hdr_cells[idx], "0A2540")
            p = hdr_cells[idx].paragraphs[0]
            r = p.add_run(title)
            r.font.bold = True
            r.font.size = Pt(8.5)
            r.font.color.rgb = RGBColor(255, 255, 255)

        for item in report.proceedings:
            row_cells = proc_table.add_row().cells
            row_cells[0].width = Inches(2.2)
            row_cells[1].width = Inches(4.5)

            p_spk = row_cells[0].paragraphs[0]
            r_spk = p_spk.add_run(f"{item.stage}\n")
            r_spk.font.bold = True
            r_spk.font.size = Pt(8.5)
            r_spk.font.color.rgb = COLOR_NAVY
            r_sub = p_spk.add_run(item.speaker)
            r_sub.font.size = Pt(8)
            r_sub.font.color.rgb = COLOR_MUTED

            p_txt = row_cells[1].paragraphs[0]
            r_txt = p_txt.add_run(item.text)
            r_txt.font.size = Pt(8.5)
            r_txt.font.color.rgb = COLOR_DARK

    # 4. Key Issues Considered & Sharia Inquiries
    h4 = doc.add_heading(level=2)
    h4.paragraph_format.space_before = Pt(12)
    h4.paragraph_format.space_after = Pt(4)
    r_h4 = h4.add_run("3. Issues for Determination & Sharia Inquiry")
    r_h4.font.bold = True
    r_h4.font.color.rgb = COLOR_NAVY

    if report.issues:
        for idx, issue_item in enumerate(report.issues, 1):
            p_issue = doc.add_paragraph()
            p_issue.paragraph_format.space_after = Pt(4)
            r_num = p_issue.add_run(f"3.{idx}  ")
            r_num.font.bold = True
            r_num.font.size = Pt(9.5)
            r_num.font.color.rgb = COLOR_GREEN
            r_body = p_issue.add_run(issue_item.issue)
            r_body.font.size = Pt(9.5)

    # 5. Party Submissions (Wakilai)
    h5 = doc.add_heading(level=2)
    h5.paragraph_format.space_before = Pt(12)
    h5.paragraph_format.space_after = Pt(4)
    r_h5 = h5.add_run("4. Submissions of the Parties / Counsel (Wakilai)")
    r_h5.font.bold = True
    r_h5.font.color.rgb = COLOR_NAVY

    p_c_hdr = doc.add_paragraph()
    r_c_hdr = p_c_hdr.add_run(f"4.1 Appellant / Claimant Submissions ({report.parties.counsel_claimant})")
    r_c_hdr.font.bold = True
    r_c_hdr.font.size = Pt(9.5)
    r_c_hdr.font.color.rgb = COLOR_NAVY
    for sub in report.submissions.claimant:
        p_sub = doc.add_paragraph(style='List Bullet')
        p_sub.paragraph_format.space_after = Pt(3)
        r = p_sub.add_run(sub)
        r.font.size = Pt(9)

    p_d_hdr = doc.add_paragraph()
    p_d_hdr.paragraph_format.space_before = Pt(6)
    r_d_hdr = p_d_hdr.add_run(f"4.2 Respondent / Defendant Submissions ({report.parties.counsel_defendant})")
    r_d_hdr.font.bold = True
    r_d_hdr.font.size = Pt(9.5)
    r_d_hdr.font.color.rgb = COLOR_NAVY
    for sub in report.submissions.defendant:
        p_sub = doc.add_paragraph(style='List Bullet')
        p_sub.paragraph_format.space_after = Pt(3)
        r = p_sub.add_run(sub)
        r.font.size = Pt(9)

    # 6. Islamic Jurisprudence & Statutory Authorities
    if getattr(report, 'islamic_authorities', None):
        h_islamic = doc.add_heading(level=2)
        h_islamic.paragraph_format.space_before = Pt(12)
        h_islamic.paragraph_format.space_after = Pt(4)
        r_isl = h_islamic.add_run("5. Applicable Islamic Jurisprudence (Fiqh) & Statutory Provisions")
        r_isl.font.bold = True
        r_isl.font.color.rgb = COLOR_NAVY

        for auth in report.islamic_authorities:
            p_auth = doc.add_paragraph(style='List Bullet')
            p_auth.paragraph_format.space_after = Pt(3)
            r_a = p_auth.add_run(auth)
            r_a.font.size = Pt(9)
            r_a.font.italic = True

    # 7. Court Observations
    if report.court_observations:
        h_obs = doc.add_heading(level=2)
        h_obs.paragraph_format.space_before = Pt(12)
        h_obs.paragraph_format.space_after = Pt(4)
        r_obs = h_obs.add_run("6. Judicial Observations of the Bench")
        r_obs.font.bold = True
        r_obs.font.color.rgb = COLOR_NAVY

        for obs in report.court_observations:
            p_o = doc.add_paragraph(style='List Bullet')
            p_o.paragraph_format.space_after = Pt(3)
            r = p_o.add_run(obs)
            r.font.size = Pt(9)

    # 8. Court Orders & Directions (Hukunci)
    h6 = doc.add_heading(level=2)
    h6.paragraph_format.space_before = Pt(12)
    h6.paragraph_format.space_after = Pt(4)
    r_h6 = h6.add_run("7. Enforceable Court Orders & Rulings (Hukunci)")
    r_h6.font.bold = True
    r_h6.font.color.rgb = COLOR_NAVY

    if report.orders:
        for idx, order_item in enumerate(report.orders, 1):
            p_order = doc.add_paragraph()
            p_order.paragraph_format.space_after = Pt(5)
            r_num = p_order.add_run(f"ORDER {idx}:  ")
            r_num.font.bold = True
            r_num.font.size = Pt(9.5)
            r_num.font.color.rgb = COLOR_GREEN

            r_ord = p_order.add_run(order_item.order)
            r_ord.font.size = Pt(9.5)
            r_ord.font.bold = True

    # 9. Compliance & Action Deadlines
    if report.action_items:
        h7 = doc.add_heading(level=2)
        h7.paragraph_format.space_before = Pt(12)
        h7.paragraph_format.space_after = Pt(4)
        r_h7 = h7.add_run("8. Compliance & Administrative Deadlines")
        r_h7.font.bold = True
        r_h7.font.color.rgb = COLOR_NAVY

        act_table = doc.add_table(rows=1, cols=3)
        act_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        hdr = act_table.rows[0].cells
        hdr[0].width = Inches(3.5)
        hdr[1].width = Inches(1.8)
        hdr[2].width = Inches(1.4)
        for idx, h_text in enumerate(["Directive / Action Task", "Responsible Party / Registry", "Compliance Window"]):
            set_cell_background(hdr[idx], "0A2540")
            p = hdr[idx].paragraphs[0]
            r = p.add_run(h_text)
            r.font.bold = True
            r.font.size = Pt(8.5)
            r.font.color.rgb = RGBColor(255, 255, 255)

        for act in report.action_items:
            cells = act_table.add_row().cells
            cells[0].width = Inches(3.5)
            cells[1].width = Inches(1.8)
            cells[2].width = Inches(1.4)

            p0 = cells[0].paragraphs[0]
            r0 = p0.add_run(act.task)
            r0.font.size = Pt(8.5)

            p1 = cells[1].paragraphs[0]
            r1 = p1.add_run(act.assignee or "Counsel")
            r1.font.size = Pt(8.5)

            p2 = cells[2].paragraphs[0]
            r2 = p2.add_run(act.deadline or "Before Next Hearing")
            r2.font.bold = True
            r2.font.size = Pt(8.5)
            r2.font.color.rgb = COLOR_GREEN

    # 10. Next Hearing & Adjournment (Ta'jil)
    h8 = doc.add_heading(level=2)
    h8.paragraph_format.space_before = Pt(12)
    h8.paragraph_format.space_after = Pt(4)
    r_h8 = h8.add_run("9. Adjournment & Next Hearing (Ta'jil)")
    r_h8.font.bold = True
    r_h8.font.color.rgb = COLOR_NAVY

    p_adj = doc.add_paragraph()
    p_adj.paragraph_format.space_after = Pt(14)
    r_adj = p_adj.add_run(
        f"The matter is adjourned to {report.next_hearing.date} at {report.next_hearing.time} "
        f"for {report.next_hearing.purpose}"
    )
    r_adj.font.size = Pt(9.5)
    r_adj.font.bold = True

    # 11. Judicial Attestation & Registry Seal Block
    doc.add_paragraph().paragraph_format.space_after = Pt(8)
    p_sign_hdr = doc.add_paragraph()
    p_sign_hdr.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_sh = p_sign_hdr.add_run("ATTESTATION & REGISTRY CERTIFICATION")
    r_sh.font.bold = True
    r_sh.font.size = Pt(9.5)
    r_sh.font.color.rgb = COLOR_NAVY

    sign_table = doc.add_table(rows=2, cols=2)
    sign_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    sign_table.autofit = False

    c_g = sign_table.rows[0].cells[0]
    c_k1 = sign_table.rows[0].cells[1]
    c_k2 = sign_table.rows[1].cells[0]
    c_cr = sign_table.rows[1].cells[1]

    for cell in [c_g, c_k1, c_k2, c_cr]:
        cell.width = Inches(3.2)
        set_cell_margins(cell, top=140, bottom=140, left=100, right=100)

    p_g = c_g.paragraphs[0]
    p_g.add_run("_____________________________________\nHON. KADI SANI SALIHU\n").bold = True
    r_sub_g = p_g.add_run("The Honourable Grand Kadi, Jigawa State\nPresiding Coram")
    r_sub_g.font.size = Pt(8)
    r_sub_g.font.color.rgb = COLOR_MUTED

    p_k1 = c_k1.paragraphs[0]
    p_k1.add_run("_____________________________________\nHON. KADI ABUBAKAR M. GUMEL\n").bold = True
    r_sub_k1 = p_k1.add_run("Honourable Kadi\nMember of the Bench")
    r_sub_k1.font.size = Pt(8)
    r_sub_k1.font.color.rgb = COLOR_MUTED

    p_k2 = c_k2.paragraphs[0]
    p_k2.add_run("_____________________________________\nHON. KADI USMAN BIRNIN KUDU\n").bold = True
    r_sub_k2 = p_k2.add_run("Honourable Kadi\nMember of the Bench")
    r_sub_k2.font.size = Pt(8)
    r_sub_k2.font.color.rgb = COLOR_MUTED

    p_cr = c_cr.paragraphs[0]
    p_cr.add_run("_____________________________________\nCHIEF REGISTRAR / COURT SCRIBE\n").bold = True
    r_sub_cr = p_cr.add_run("Sharia Court of Appeal, Dutse\nOfficial Judicial Seal & Date")
    r_sub_cr.font.size = Pt(8)
    r_sub_cr.font.color.rgb = COLOR_MUTED

    # 12. Appendix: Verbatim Transcript (if present)
    if report.appendix_transcript and report.appendix_transcript.segments:
        doc.add_page_break()
        h_app = doc.add_heading(level=1)
        h_app.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r_app = h_app.add_run("APPENDIX A: VERBATIM PROCEEDINGS TRANSCRIPT")
        r_app.font.bold = True
        r_app.font.size = Pt(12)
        r_app.font.color.rgb = COLOR_NAVY

        p_app_sub = doc.add_paragraph()
        p_app_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_app_sub.paragraph_format.space_after = Pt(12)
        r_sub = p_app_sub.add_run(f"Official Verbatim Record • Appeal/Suit No: {report.case.case_number}")
        r_sub.font.size = Pt(8.5)
        r_sub.font.color.rgb = COLOR_MUTED

        for seg in report.appendix_transcript.segments:
            p_seg = doc.add_paragraph()
            p_seg.paragraph_format.space_after = Pt(3)
            p_seg.paragraph_format.line_spacing = 1.1

            r_spk = p_seg.add_run(f"{seg.speaker}: ")
            r_spk.font.bold = True
            r_spk.font.size = Pt(8.5)
            r_spk.font.color.rgb = COLOR_NAVY

            r_t = p_seg.add_run(seg.text)
            r_t.font.size = Pt(8.5)

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer
