"""Retrieving generated certificates."""
import io
import zipfile

from pypdf import PdfReader

API = "/api/v1/certificate-jobs"


def _make_job(client, job_payload, names):
    return client.post(API, json=job_payload([{"name": n} for n in names])).json()["job_id"]


def test_download_single_certificate(client, job_payload):
    job_id = _make_job(client, job_payload, ["Asha Rao"])
    item = client.get(f"{API}/{job_id}/certificates").json()["items"][0]

    resp = client.get(item["download_url"])
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert item["certificate_number"] in resp.headers["content-disposition"]
    text = PdfReader(io.BytesIO(resp.content)).pages[0].extract_text()
    assert "Asha Rao" in text and item["certificate_number"] in text


def test_certificate_numbers_are_unique_and_formatted(client, job_payload):
    job_id = _make_job(client, job_payload, [f"Person {c}" for c in "ABCDE"])
    numbers = [i["certificate_number"] for i in client.get(f"{API}/{job_id}/certificates").json()["items"]]

    assert len(set(numbers)) == 5
    assert all(n.startswith("CERT-") and len(n.split("-")[2]) == 6 for n in numbers)


def test_download_unknown_certificate_is_404(client):
    assert client.get("/api/v1/certificates/nope/download").status_code == 404


def test_download_failed_certificate_is_409(client, job_payload):
    job_id = client.post(API, json=job_payload([{"name": "Good"}, {"name": ""}])).json()["job_id"]
    failed = client.get(f"{API}/{job_id}/certificates", params={"status": "FAILED"}).json()["items"][0]
    assert failed["download_url"] is None


def test_zip_contains_every_successful_certificate(client, job_payload):
    job_id = _make_job(client, job_payload, ["Asha Rao", "Ravi Kumar", "Meena Iyer"])
    resp = client.get(f"{API}/{job_id}/download")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        names = zf.namelist()
        assert len(names) == 3
        assert any("Asha_Rao" in n for n in names)
        assert all(zf.read(n).startswith(b"%PDF") for n in names)


def test_zip_skips_failed_items(client, job_payload):
    job_id = client.post(API, json=job_payload([{"name": "Good One"}, {"name": ""}])).json()["job_id"]
    with zipfile.ZipFile(io.BytesIO(client.get(f"{API}/{job_id}/download").content)) as zf:
        assert len(zf.namelist()) == 1


def test_zip_with_nothing_generated_is_409(client, job_payload):
    job_id = client.post(API, json=job_payload([{"name": ""}])).json()["job_id"]
    assert client.get(f"{API}/{job_id}/download").status_code == 409


def test_listing_supports_pagination_and_filtering(client, job_payload):
    job_id = _make_job(client, job_payload, [f"Person {i}" for i in range(7)])

    page1 = client.get(f"{API}/{job_id}/certificates", params={"page": 1, "page_size": 3}).json()
    page3 = client.get(f"{API}/{job_id}/certificates", params={"page": 3, "page_size": 3}).json()
    assert page1["total"] == 7 and len(page1["items"]) == 3
    assert len(page3["items"]) == 1

    assert client.get(f"{API}/{job_id}/certificates", params={"status": "FAILED"}).json()["total"] == 0
    assert client.get(f"{API}/{job_id}/certificates", params={"page_size": 1000}).status_code == 422
    assert client.get(f"{API}/{job_id}/certificates", params={"status": "BOGUS"}).status_code == 422
