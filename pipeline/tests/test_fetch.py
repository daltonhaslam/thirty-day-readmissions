import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path

import fetch


class VerifySha256Test(unittest.TestCase):
    def test_returns_true_when_digest_matches(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "f.txt")
            p.write_bytes(b"hello")
            self.assertTrue(fetch.verify_sha256(p, hashlib.sha256(b"hello").hexdigest()))

    def test_raises_on_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "f.txt")
            p.write_bytes(b"hello")
            with self.assertRaises(fetch.ChecksumError):
                fetch.verify_sha256(p, "0" * 64)


class SafeUnzipTest(unittest.TestCase):
    def test_extracts_normal_members(self):
        with tempfile.TemporaryDirectory() as d:
            z = Path(d, "a.zip")
            with zipfile.ZipFile(z, "w") as zf:
                zf.writestr("inner/data.txt", "x")
            out = Path(d, "out")
            fetch.safe_unzip(z, out)
            self.assertEqual(Path(out, "inner/data.txt").read_text(), "x")

    def test_rejects_member_escaping_target(self):
        with tempfile.TemporaryDirectory() as d:
            z = Path(d, "a.zip")
            with zipfile.ZipFile(z, "w") as zf:
                zf.writestr("../evil.txt", "x")
            with self.assertRaises(fetch.UnsafeArchiveError):
                fetch.safe_unzip(z, Path(d, "out"))
            self.assertFalse(Path(d, "evil.txt").exists())


if __name__ == "__main__":
    unittest.main()
