import sqlite3
import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import last_upload


class LastUploadWinsTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("CREATE TABLE user_state (user_id INTEGER PRIMARY KEY, version INTEGER, body TEXT)")
        self.db.execute("INSERT INTO user_state VALUES (1,1,?)", ('{"records":[]}',))
        last_upload.initialize(self.db)

    def tearDown(self):
        self.db.close()

    def test_last_committed_snapshot_wins(self):
        for operation, payload in [
            ("app-upload-20261117-01", '{"records":[{"id":"app"}]}'),
            ("web-upload-20261117-02", '{"records":[{"id":"web"}]}')
        ]:
            with self.db:
                before = self.db.execute("SELECT version,body FROM user_state WHERE user_id=1").fetchone()
                last_upload.backup(self.db, 1, before["version"], before["body"])
                self.db.execute("UPDATE user_state SET version=version+1,body=? WHERE user_id=1", (payload,))
                last_upload.remember(self.db, 1, operation, before["version"]+1)
        result = self.db.execute("SELECT version,body FROM user_state WHERE user_id=1").fetchone()
        self.assertEqual(result["version"], 3)
        self.assertIn('"web"', result["body"])
        self.assertNotIn('"app"', result["body"])
        self.assertEqual(last_upload.lookup(self.db, 1, "app-upload-20261117-01"), 2)

    def test_upload_ids_and_bounded_history(self):
        self.assertFalse(last_upload.valid_operation_id("short"))
        self.assertTrue(last_upload.valid_operation_id("123e4567-e89b-12d3-a456-426614174000"))
        with self.db:
            for n in range(28):
                last_upload.backup(self.db, 1, n, '{"records":[]}')
        count = self.db.execute("SELECT COUNT(*) FROM state_revision_backups").fetchone()[0]
        self.assertEqual(count, 20)


if __name__ == "__main__":
    unittest.main()
