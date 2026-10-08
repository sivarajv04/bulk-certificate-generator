"""CSV/Excel import and preview tests."""
import io

from openpyxl import Workbook

API = "/api/v1/certificate-jobs/import-preview"


def _xlsx_bytes(rows):
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_csv_preview_detects_name_and_email_columns(client):
    data = b"Student Name,Email,Department\nAsha Rao,asha@example.com,CSE\nRavi Kumar,,ECE\n,missing@example.com,CSE\n"
    response = client.post(API, files={"file": ("students.csv", data, "text/csv")})

    assert response.status_code == 200
    body = response.json()
    assert body["name_column"] == 0
    assert body["email_column"] == 1
    assert body["valid_count"] == 2
    assert body["invalid_count"] == 1
    assert body["recipients"] == [
        {"name": "Asha Rao", "email": "asha@example.com"},
        {"name": "Ravi Kumar"},
    ]


def test_excel_preview_supports_explicit_column_mapping(client):
    data = _xlsx_bytes([
        ["Roll No", "Full Name", "Contact"],
        ["22CS01", "Asha Rao", "asha@example.com"],
        ["22CS02", "Ravi Kumar", "ravi@example.com"],
    ])
    response = client.post(
        API,
        files={"file": ("students.xlsx", data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"name_column": "1", "email_column": "2"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name_column"] == 1
    assert body["email_column"] == 2
    assert body["valid_count"] == 2
    assert [r["name"] for r in body["recipients"]] == ["Asha Rao", "Ravi Kumar"]


def test_import_preview_does_not_create_a_job(client):
    data = b"name\nAsha Rao\nRavi Kumar\n"
    response = client.post(API, files={"file": ("students.csv", data, "text/csv")})
    assert response.status_code == 200

    jobs = client.get("/api/v1/certificate-jobs/not-created")
    assert jobs.status_code == 404
