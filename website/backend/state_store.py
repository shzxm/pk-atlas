"""Section-level state storage while retaining the legacy snapshot API."""
import json
import time

SECTIONS = ("records", "courses", "intakes", "plans", "settings")
DEFAULTS = {"records": [], "courses": [], "intakes": [], "plans": {}, "settings": {}}


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def initialize(con):
    con.execute("CREATE TABLE IF NOT EXISTS state_sections (user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, body TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,name))")
    for row in con.execute("SELECT user_id,body FROM user_state").fetchall():
        state = json.loads(row["body"])
        existing = {entry["name"]: entry["body"] for entry in
                    con.execute("SELECT name,body FROM state_sections WHERE user_id=?",
                                (row["user_id"],)).fetchall()}
        # The production API previously wrote user_state without mirroring
        # sections. Repair only divergent mirrors; user_state is authoritative.
        mismatched = [name for name in SECTIONS if
                      existing.get(name) != compact(state.get(name, DEFAULTS[name]))]
        if mismatched:
            mirror(con, row["user_id"], state, mismatched)


def mirror(con, user_id, state, names, only_missing=False):
    now = int(time.time())
    for name in names:
        if name not in SECTIONS:
            raise ValueError("Unknown state section")
        value = state.get(name, DEFAULTS[name])
        if only_missing:
            con.execute("INSERT OR IGNORE INTO state_sections(user_id,name,body,updated_at) VALUES(?,?,?,?)",
                        (user_id, name, compact(value), now))
        else:
            con.execute("INSERT INTO state_sections(user_id,name,body,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",
                        (user_id, name, compact(value), now))


def load_sections(con, user_id):
    rows = con.execute("SELECT name,body FROM state_sections WHERE user_id=?", (user_id,)).fetchall()
    values = {row["name"]: json.loads(row["body"]) for row in rows}
    return {name: values.get(name, DEFAULTS[name]) for name in SECTIONS}
