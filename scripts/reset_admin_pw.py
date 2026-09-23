"""Reset local admin password for smoke testing."""
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.identity import User

db = SessionLocal()
try:
    for email, password in [
        ("admin@example.com", "ChangeMe!12345"),
        ("admin@samp.local", "ChangeMe!12345"),
    ]:
        u = db.query(User).filter(User.email == email).first()
        if u:
            u.password_hash = hash_password(password)
            print(f"updated {email} id={u.id}")
        else:
            print(f"missing {email}")
    db.commit()
finally:
    db.close()
