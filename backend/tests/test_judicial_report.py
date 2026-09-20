import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.transcription import CaseInformation, HearingParties, UpdateCaseInfoRequest

client = TestClient(app)

def test_judicial_case_info_and_report_flow():
    # 1. Create a new session
    res = client.post("/api/sessions")
    assert res.status_code == 200
    session_data = res.json()
    session_id = session_data["id"]
    assert "case_info" in session_data
    assert session_data["case_info"]["case_number"] == "FHC/KN/CS/1042/2026"

    # 2. Update case information
    update_req = {
        "case": {
            "case_number": "FHC/ABJ/CS/550/2026",
            "court": "Federal High Court, Abuja",
            "judge": "Hon. Justice B. O. Adeleke",
            "hearing_date": "22 September 2026",
            "hearing_type": "Substantive Trial",
            "hearing_no": "2",
            "duration": "00:35:00"
        },
        "parties": {
            "claimant": "Federal Ministry of Justice",
            "counsel_claimant": "Rotimi Jacobs SAN",
            "defendant": "Alpha Oil & Gas Ltd",
            "counsel_defendant": "Wole Olanipekun SAN",
            "witnesses": ["PW1 — Audu Bako"]
        }
    }
    res_update = client.put(f"/api/sessions/{session_id}/case-info", json=update_req)
    assert res_update.status_code == 200
    updated = res_update.json()
    assert updated["case_info"]["case_number"] == "FHC/ABJ/CS/550/2026"
    assert updated["parties"]["claimant"] == "Federal Ministry of Justice"

    # 3. Generate judicial report
    res_report = client.post(f"/api/sessions/{session_id}/report")
    assert res_report.status_code == 200
    report = res_report.json()
    assert report["case"]["case_number"] == "FHC/ABJ/CS/550/2026"
    assert report["parties"]["claimant"] == "Federal Ministry of Justice"
    assert "summary" in report
    assert "orders" in report
    assert len(report["orders"]) > 0
    assert "next_hearing" in report

    # 4. Export report as DOCX
    res_docx = client.get(f"/api/sessions/{session_id}/export/docx")
    assert res_docx.status_code == 200
    assert res_docx.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert len(res_docx.content) > 1000

    # 5. Export report via generic export endpoint
    res_exp = client.get(f"/api/sessions/{session_id}/export?format=docx")
    assert res_exp.status_code == 200
    assert res_exp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
