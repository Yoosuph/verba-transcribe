import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.session_manager import session_manager
from app.models.transcription import (
    CaseInformation,
    HearingParties,
    UpdateCaseInfoRequest,
    FinalTranscriptData,
    TranscriptSegment
)

client = TestClient(app)

def test_judicial_case_info_and_report_flow():
    # 1. Create a new session with Jigawa Sharia Court of Appeal default
    res = client.post("/api/sessions")
    assert res.status_code == 200
    session_data = res.json()
    session_id = session_data["id"]
    assert "case_info" in session_data
    assert session_data["case_info"]["case_number"] == "JGS/SCA/DTS/CV/018/2026"
    assert "Sharia Court of Appeal" in session_data["case_info"]["court"]

    # 2. Update case information for Jigawa division
    update_req = {
        "case": {
            "case_number": "JGS/SCA/HDJ/CV/045/2026",
            "court": "Sharia Court of Appeal of Jigawa State",
            "division": "Hadejia Judicial Division",
            "judge": "Hon. Kadi Sani Salihu (Hon. Grand Kadi)",
            "coram": [
                "Hon. Kadi Abubakar M. Gumel (Hon. Kadi)",
                "Hon. Kadi Usman Birnin Kudu (Hon. Kadi)"
            ],
            "hearing_date": "22 September 2026",
            "hearing_type": "Civil Appeal (Inheritance / Mirath)",
            "hearing_no": "1",
            "duration": "00:45:00"
        },
        "parties": {
            "claimant": "Alhaji Bello Ringim (Mai Daukaka Kara)",
            "counsel_claimant": "Barrister I. K. Dutse",
            "defendant": "Hajiya Maryam Hadejia (Wanda Ake Daukaka Kara)",
            "counsel_defendant": "Ustaz A. U. Gumel",
            "witnesses": ["Mallam Ibrahim (Shaida na 1)"]
        }
    }
    res_update = client.put(f"/api/sessions/{session_id}/case-info", json=update_req)
    assert res_update.status_code == 200
    updated = res_update.json()
    assert updated["case_info"]["case_number"] == "JGS/SCA/HDJ/CV/045/2026"
    assert "Alhaji Bello Ringim" in updated["parties"]["claimant"]

    # 3. Simulate recorded proceedings transcript segments
    final_data = FinalTranscriptData(
        language="en-NG",
        segments=[
            TranscriptSegment(
                id="seg_1",
                speaker="Hon. Grand Kadi",
                start=0.0,
                end=8.5,
                text="The appellant is hereby granted twenty-one days to file and serve their brief of argument.",
                language="en-NG"
            ),
            TranscriptSegment(
                id="seg_2",
                speaker="Ustaz A. U. Gumel",
                start=9.0,
                end=15.0,
                text="Most obliged, Your Lordship. The respondent will reply within fourteen days under the Sharia Court Rules.",
                language="en-NG"
            ),
            TranscriptSegment(
                id="seg_3",
                speaker="Hon. Grand Kadi",
                start=15.5,
                end=22.0,
                text="The appeal stands adjourned to 12 October 2026 for continuation of hearing.",
                language="en-NG"
            )
        ]
    )
    session_manager.set_final_transcript(session_id, final_data)

    # 4. Generate judicial hearing report
    res_report = client.post(f"/api/sessions/{session_id}/report")
    assert res_report.status_code == 200
    report = res_report.json()
    assert report["case"]["case_number"] == "JGS/SCA/HDJ/CV/045/2026"
    assert "Alhaji Bello Ringim" in report["parties"]["claimant"]
    assert "summary" in report
    assert "orders" in report
    assert len(report["orders"]) > 0
    assert "next_hearing" in report
    assert report["bismillah_header"] is not None

    # 5. Export report as DOCX
    res_docx = client.get(f"/api/sessions/{session_id}/export/docx")
    assert res_docx.status_code == 200
    assert res_docx.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert len(res_docx.content) > 1000

    # 6. Export report via generic export endpoint
    res_exp = client.get(f"/api/sessions/{session_id}/export?format=docx")
    assert res_exp.status_code == 200
    assert res_exp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
