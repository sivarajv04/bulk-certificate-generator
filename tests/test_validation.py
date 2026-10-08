"""Input validation: bad recipients are reported per item, never reject the request."""
import pytest

from app.services.validation import RecipientValidationError, validate_recipient

API = "/api/v1/certificate-jobs"


@pytest.mark.parametrize(
    "name, expected",
    [("Asha Rao", "Asha Rao"), ("  Asha   Rao \n", "Asha Rao"), ("José Núñez", "José Núñez")],
)
def test_valid_names_are_normalised(name, expected):
    assert validate_recipient(name, None, 100).name == expected


@pytest.mark.parametrize(
    "name, fragment",
    [
        (None, "required"),
        ("   ", "required"),
        (123, "must be text"),
        ("x" * 101, "too long"),
        ("Asha\x00Rao", "non-printable"),
        ("வணக்கம்", "cannot print"),
    ],
)
def test_invalid_names_are_rejected(name, fragment):
    with pytest.raises(RecipientValidationError, match=fragment):
        validate_recipient(name, None, 100)


@pytest.mark.parametrize("email", ["not-an-email", "a@b", "a b@c.com", 42])
def test_invalid_emails_are_rejected(email):
    with pytest.raises(RecipientValidationError):
        validate_recipient("Asha", email, 100)


def test_blank_email_is_treated_as_missing():
    assert validate_recipient("Asha", "  ", 100).email is None


def test_mixed_request_reports_each_problem(client, job_payload):
    recipients = [
        {"name": "Asha Rao", "email": "asha@example.com"},
        {"name": "", "email": "x@example.com"},
        {"name": "Ravi Kumar", "email": "bad-email"},
        {"name": "Meena"},
    ]
    job_id = client.post(API, json=job_payload(recipients)).json()["job_id"]

    status = client.get(f"{API}/{job_id}").json()
    assert status["status"] == "COMPLETED_WITH_ERRORS"
    assert (status["success_count"], status["failed_count"]) == (2, 2)

    failed = client.get(f"{API}/{job_id}/certificates", params={"status": "FAILED"}).json()
    assert failed["total"] == 2
    reasons = {i["recipient_name"]: i["error"] for i in failed["items"]}
    assert "required" in reasons[""]
    assert "valid address" in reasons["Ravi Kumar"]
    assert all(i["certificate_number"] is None and i["download_url"] is None for i in failed["items"])


def test_job_with_only_invalid_recipients_fails_immediately(client, job_payload):
    resp = client.post(API, json=job_payload([{"name": ""}, {"name": None}]))
    assert resp.status_code == 202
    assert resp.json()["status"] == "FAILED"

    status = client.get(f"{API}/{resp.json()['job_id']}").json()
    assert status["status"] == "FAILED"
    assert status["progress_percent"] == 100.0
    assert status["download_all_url"] is None
