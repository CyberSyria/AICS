"""Test fixtures — isolated SQLite DB per session."""

from __future__ import annotations

import os

# Must set before importing app
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///./test_samp.db"
os.environ["SECRET_KEY"] = "test-secret-key-at-least-32-characters!!"
os.environ["COOKIE_SECURE"] = "false"
os.environ["RATE_LIMIT_LOGIN"] = "1000/minute"
os.environ["PASSWORD_MIN_LENGTH"] = "4"
os.environ["PASSWORD_REQUIRE_COMPLEXITY"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, engine, get_db
from app.core.security import hash_password
from app.main import app
from app.models.identity import Role, User, UserPreferences
from app.seed import seed_all

TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        seed_all(db)
        # seed_all already creates admin/1234 — add analyst & viewer for RBAC tests
        analyst_role = db.query(Role).filter(Role.code == "analyst").first()
        viewer_role = db.query(Role).filter(Role.code == "viewer").first()
        for username, name, role in [
            ("analyst", "Analyst User", analyst_role),
            ("viewer", "Viewer User", viewer_role),
        ]:
            if db.query(User).filter(User.username == username).first():
                continue
            u = User(
                username=username,
                email=None,
                full_name=name,
                password_hash=hash_password("TestPassword1!"),
                role_id=role.id,
                is_active=True,
            )
            db.add(u)
            db.flush()
            db.add(UserPreferences(user_id=u.id))
        db.commit()
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    def _override():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def login(client: TestClient, username: str, password: str = "TestPassword1!") -> dict:
    r = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    csrf = r.json().get("csrf_token") or r.cookies.get("samp_csrf")
    return {"X-CSRF-Token": csrf}
