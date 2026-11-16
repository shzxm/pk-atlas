import datetime
import os
import sqlite3

source = os.environ.get("PK_DB", "/var/lib/pk-atlas/pk.sqlite3")
directory = "/var/backups/pk-atlas-db"
os.makedirs(directory, mode=0o700, exist_ok=True)
os.chmod(directory, 0o700)
today = datetime.date.today()
target = os.path.join(directory, f"pk-{today.isoformat()}.sqlite3")
temporary = target + ".tmp"
with sqlite3.connect(source) as db, sqlite3.connect(temporary) as copy:
    db.backup(copy)
os.chmod(temporary, 0o600)
os.replace(temporary, target)
for name in os.listdir(directory):
    if name.startswith("pk-") and name.endswith(".sqlite3"):
        try:
            day = datetime.date.fromisoformat(name[3:-8])
        except ValueError:
            continue
        if (today - day).days > 30:
            os.unlink(os.path.join(directory, name))
