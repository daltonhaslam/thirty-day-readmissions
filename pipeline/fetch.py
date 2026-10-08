"""Download the public source files listed in sources.json into data/raw/.

Each source is verified against a pinned SHA-256 so a rebuild uses byte-identical inputs.
Zip archives are extracted with a path-traversal guard.

Usage:  python3 -I pipeline/fetch.py [--only NAME] [--refresh-hashes]
"""
import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent
ROOT = PIPELINE.parent
RAW_DIR = ROOT / "data" / "raw"
SOURCES = PIPELINE / "sources.json"
USER_AGENT = "Mozilla/5.0 (hrrp-explorer data fetch)"


class ChecksumError(Exception):
    pass


class UnsafeArchiveError(Exception):
    pass


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_sha256(path, expected):
    actual = sha256_of(path)
    if actual != expected:
        raise ChecksumError(f"{path}: expected sha256 {expected}, got {actual}")
    return True


def safe_unzip(zip_path, target):
    target = Path(target).resolve()
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.infolist():
            dest = (target / member.filename).resolve()
            if not dest.is_relative_to(target):
                raise UnsafeArchiveError(f"{zip_path}: member {member.filename!r} escapes {target}")
        zf.extractall(target)


def download(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp, open(part, "wb") as out:
        shutil.copyfileobj(resp, out)
    part.replace(dest)


def fetch_source(src, refresh_hashes=False):
    folder = RAW_DIR / src["name"]
    dest = folder / src["file"]
    if not dest.exists():
        print(f"  downloading {src['url']}")
        download(src["url"], dest)
    if refresh_hashes:
        src["sha256"] = sha256_of(dest)
    else:
        verify_sha256(dest, src["sha256"])
    if src.get("unzip"):
        safe_unzip(dest, folder / "extracted")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--only", help="fetch a single source by name")
    ap.add_argument("--refresh-hashes", action="store_true", help="record current file hashes instead of verifying")
    args = ap.parse_args(argv)
    sources = json.loads(SOURCES.read_text())
    for src in sources:
        if args.only and src["name"] != args.only:
            continue
        print(f"[{src['name']}]")
        fetch_source(src, args.refresh_hashes)
    if args.refresh_hashes:
        SOURCES.write_text(json.dumps(sources, indent=2) + "\n")
        print("sources.json hashes refreshed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
