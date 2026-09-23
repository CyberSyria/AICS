"""Auth, RBAC, finding IDs, evidence upload tests."""

from __future__ import annotations

import io

from tests.conftest import login


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_login_success(client):
    r = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "1234"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "admin"
    assert "admin.all" in body["permissions"] or len(body["permissions"]) > 0
    assert "samp_session" in r.cookies


def test_login_wrong_password(client):
    r = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "WrongPassword1!"},
    )
    assert r.status_code == 401
    assert r.json()["code"] == "invalid_credentials"
    assert "request_id" in r.json()


def test_me_requires_auth(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_rbac_viewer_cannot_create_project(client):
    headers = login(client, "viewer")
    r = client.post(
        "/api/v1/projects",
        json={"name": "Should Fail"},
        headers=headers,
    )
    assert r.status_code == 403


def test_admin_can_create_project_and_finding_ids(client, db):
    headers = login(client, "admin", "1234")

    wfs = client.get("/api/v1/workflows", headers=headers)
    assert wfs.status_code == 200
    workflows = wfs.json()
    items = workflows if isinstance(workflows, list) else workflows.get("items", [])
    assert len(items) > 0
    wf_id = items[0]["id"]

    pr = client.post(
        "/api/v1/projects",
        json={"name": "Test Project", "workflow_id": wf_id, "status": "active"},
        headers=headers,
    )
    assert pr.status_code == 201, pr.text
    project = pr.json()
    assert project["name"] == "Test Project"
    assert len(project["phases"]) > 0

    f1 = client.post(
        "/api/v1/findings",
        json={"title": "XSS", "project_id": project["id"]},
        headers=headers,
    )
    assert f1.status_code == 201, f1.text
    f2 = client.post(
        "/api/v1/findings",
        json={"title": "SQLi", "project_id": project["id"]},
        headers=headers,
    )
    assert f2.status_code == 201, f2.text
    assert f1.json()["public_id"] == "SEC-0001"
    assert f2.json()["public_id"] == "SEC-0002"


def test_idor_analyst_cannot_access_unassigned(client):
    admin_h = login(client, "admin", "1234")
    wfs = client.get("/api/v1/workflows", headers=admin_h).json()
    items = wfs if isinstance(wfs, list) else wfs.get("items", [])
    pr = client.post(
        "/api/v1/projects",
        json={"name": "Private", "workflow_id": items[0]["id"], "status": "active"},
        headers=admin_h,
    )
    assert pr.status_code == 201
    project_id = pr.json()["id"]

    analyst_h = login(client, "analyst")
    r = client.get(f"/api/v1/projects/{project_id}", headers=analyst_h)
    assert r.status_code in (403, 404)


def test_evidence_rejects_exe(client):
    headers = login(client, "admin", "1234")
    wfs = client.get("/api/v1/workflows", headers=headers).json()
    items = wfs if isinstance(wfs, list) else wfs.get("items", [])
    pr = client.post(
        "/api/v1/projects",
        json={"name": "Evid Proj", "workflow_id": items[0]["id"], "status": "active"},
        headers=headers,
    )
    project_id = pr.json()["id"]
    files = {"file": ("malware.exe", io.BytesIO(b"MZ fake"), "application/octet-stream")}
    data = {"project_id": str(project_id)}
    r = client.post("/api/v1/evidence", data=data, files=files, headers=headers)
    assert r.status_code in (400, 415, 422)


def test_csrf_required_on_mutating(client):
    login(client, "admin", "1234")
    # Session cookie present but no CSRF header
    r = client.post("/api/v1/auth/logout")
    assert r.status_code in (401, 403)
