"""Campaign creation/retrieval and validation tests."""

from __future__ import annotations

import hashlib

SAMPLE_TEXT = "20% off cold coffee on Saturday and Sunday, 4 PM to 8 PM."


def _create_typed(client, text: str = SAMPLE_TEXT, **extra):
    payload = {"text": text, **extra}
    return client.post("/api/campaigns", json=payload)


def test_create_typed_campaign(client):
    response = _create_typed(client)
    assert response.status_code == 201
    body = response.json()

    assert body["status"] == "extracted"  # mock extraction runs on create
    assert body["input_type"] == "typed"
    assert body["transcript"]["raw"] == SAMPLE_TEXT
    assert body["transcript"]["normalized"] == SAMPLE_TEXT
    assert body["transcript"]["provider"] == "typed"
    assert body["transcript"]["is_mock"] is False

    expected_hash = "sha256:" + hashlib.sha256(SAMPLE_TEXT.encode()).hexdigest()
    assert body["transcript"]["hash"] == expected_hash

    # Extracted draft facts are schema-validated; creative assets stay empty.
    assert body["facts"]["offer"]["discount_percent"] == 20
    assert body["factsheet"]["status"] == "draft"
    assert body["factsheet"]["version"] == 1
    assert body["assets"] == []
    assert body["verification"] == []

    event_types = [e["event_type"] for e in body["audit_events"]]
    assert "campaign.created" in event_types
    assert "transcript.captured" in event_types
    assert "facts.extracted" in event_types


def test_get_campaign_by_id(client):
    created = _create_typed(client, "Flat 100 rupees off on school bags.").json()
    response = client.get(f"/api/campaigns/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]
    assert response.json()["transcript"]["raw"] == "Flat 100 rupees off on school bags."


def test_list_campaigns(client):
    first = _create_typed(client, "Offer one").json()
    second = _create_typed(client, "Offer two").json()
    response = client.get("/api/campaigns")
    assert response.status_code == 200
    ids = [c["id"] for c in response.json()]
    assert first["id"] in ids and second["id"] in ids


def test_default_shop_is_created_once(client):
    first = _create_typed(client, "Offer one").json()
    second = _create_typed(client, "Offer two").json()
    assert first["shop_id"] == second["shop_id"]


def test_create_with_explicit_unknown_shop_fails(client):
    response = client.post(
        "/api/campaigns", json={"text": "Offer", "shop_id": 999999}
    )
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["details"]["shop_id"] == 999999


def test_empty_request_is_rejected(client):
    response = client.post("/api/campaigns", json={})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_whitespace_only_text_is_rejected(client):
    response = client.post("/api/campaigns", json={"text": "   \n  "})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_invalid_base64_audio_is_rejected(client):
    response = client.post(
        "/api/campaigns", json={"audio_b64": "not-valid-base64!!"}
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "invalid_audio"


def test_missing_campaign_returns_not_found(client):
    response = client.get("/api/campaigns/424242")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["details"]["campaign_id"] == 424242


def test_invalid_campaign_id_type_is_rejected(client):
    response = client.get("/api/campaigns/not-a-number")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
