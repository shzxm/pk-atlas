"""Last-successful-upload snapshot policy helpers."""
import re
import time

POLICY = "last-upload-wins-v1"
MAX_BACKUPS = 20
MAX_RECEIPTS = 250
_OPERATION = re.compile(r"^[A-Za-z0-9_-]{16,90}$")


def valid_operation_id(value):
    return isinstance(value, str) and _OPERATION.fullmatch(value) is not None


def initialize(con):
    con.execute("""CREATE TABLE IF NOT EXISTS state_upload_receipts (
        user_id INTEGER NOT NULL, operation_id TEXT NOT NULL,
        accepted_version INTEGER NOT NULL,
        PRIMARY KEY (user_id, operation_id))""")
    con.execute("""CREATE TABLE IF NOT EXISTS state_revision_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL, previous_version INTEGER NOT NULL,
        previous_body TEXT NOT NULL, saved_at INTEGER NOT NULL)""")
    con.execute("""CREATE INDEX IF NOT EXISTS idx_state_revision_user
        ON state_revision_backups(user_id, id DESC)""")


def lookup(con, user_id, operation_id):
    row = con.execute(
        "SELECT accepted_version FROM state_upload_receipts "
        "WHERE user_id=? AND operation_id=?", (user_id, operation_id)
    ).fetchone()
    return row["accepted_version"] if row is not None else None


def backup(con, user_id, version, body):
    con.execute(
        "INSERT INTO state_revision_backups "
        "(user_id, previous_version, previous_body, saved_at) VALUES(?,?,?,?)",
        (user_id, version, body, int(time.time()))
    )
    con.execute("""DELETE FROM state_revision_backups
        WHERE user_id=? AND id NOT IN (
            SELECT id FROM state_revision_backups
            WHERE user_id=? ORDER BY id DESC LIMIT ?)""",
        (user_id, user_id, MAX_BACKUPS)
    )


def remember(con, user_id, operation_id, accepted_version):
    con.execute(
        "INSERT INTO state_upload_receipts "
        "(user_id, operation_id, accepted_version) VALUES(?,?,?)",
        (user_id, operation_id, accepted_version)
    )
    con.execute("""DELETE FROM state_upload_receipts
        WHERE user_id=? AND operation_id NOT IN (
            SELECT operation_id FROM state_upload_receipts
            WHERE user_id=? ORDER BY accepted_version DESC LIMIT ?)""",
        (user_id, user_id, MAX_RECEIPTS)
    )
