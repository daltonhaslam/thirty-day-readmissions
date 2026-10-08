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


class StaleExtractTest(unittest.TestCase):
    def test_reextract_removes_files_from_previous_archive(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d, "out")
            for name, members in (("a.zip", {"old.txt": "1", "keep.txt": "1"}), ("b.zip", {"keep.txt": "2"})):
                z = Path(d, name)
                with zipfile.ZipFile(z, "w") as zf:
                    for m, body in members.items():
                        zf.writestr(m, body)
                fetch.safe_unzip(z, out)
            self.assertFalse(Path(out, "old.txt").exists())
            self.assertEqual(Path(out, "keep.txt").read_text(), "2")


class DownloadVerifyTest(unittest.TestCase):
    def _src(self, d, body, digest):
        remote = Path(d, "remote.txt")
        remote.write_bytes(body)
        return {"name": "t", "file": "t.txt", "url": remote.as_uri(), "sha256": digest, "unzip": False}

    def test_bad_download_is_not_left_in_place(self):
        with tempfile.TemporaryDirectory() as d:
            src = self._src(d, b"tampered", hashlib.sha256(b"original").hexdigest())
            with self.assertRaises(fetch.ChecksumError):
                fetch.fetch_source(src, raw_dir=Path(d, "raw"))
            self.assertFalse(Path(d, "raw", "t", "t.txt").exists())

    def test_existing_file_with_wrong_hash_is_refetched(self):
        with tempfile.TemporaryDirectory() as d:
            src = self._src(d, b"good", hashlib.sha256(b"good").hexdigest())
            dest = Path(d, "raw", "t", "t.txt")
            dest.parent.mkdir(parents=True)
            dest.write_bytes(b"stale")
            fetch.fetch_source(src, raw_dir=Path(d, "raw"))
            self.assertEqual(dest.read_bytes(), b"good")


class EncodingLintTest(unittest.TestCase):
    def test_text_io_always_names_an_encoding(self):
        import re
        root = Path(fetch.__file__).resolve().parent
        offenders = []
        for py in [root / "fetch.py", root / "build_data.py", *sorted((root / "hrrp").glob("*.py"))]:
            for i, line in enumerate(py.read_text(encoding="utf-8").splitlines(), 1):
                text_io = re.search(r"\.(read_text|write_text)\(|\bopen\(", line)
                binary = '"rb"' in line or '"wb"' in line
                if text_io and not binary and "encoding" not in line:
                    offenders.append(f"{py.name}:{i}: {line.strip()}")
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
