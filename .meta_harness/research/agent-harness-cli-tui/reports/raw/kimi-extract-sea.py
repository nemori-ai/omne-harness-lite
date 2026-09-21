#!/usr/bin/env python3
"""Extract the Node SEA payload (bundled JS + assets) from the kimi-code native binary.

Verified against /data/qiwei/.kimi-code/bin/kimi, version 0.31.0 (linux-x64,
BuildID 5e67bdf95c7646325b62decd0ca8d375d325ea19, 153,685,184 bytes, mtime 2026-07-30).
The SEA config is built with useSnapshot:false / useCodeCache:false, so the JS is
stored as plain text and comes out readable.

Usage: python3 kimi-extract-sea.py <binary> <outdir>
"""
import json, os, struct, sys

def main(binary: str, outdir: str) -> None:
    blob = open(binary, "rb").read()
    i = blob.find(b"NODE_SEA_BLOB\x00")
    if i < 0:
        raise SystemExit("no NODE_SEA_BLOB note found")
    namesz, descsz, ntype = struct.unpack_from("<III", blob, i - 12)
    off = i + ((namesz + 3) & ~3)                 # name padded to 4 bytes
    magic, flags = struct.unpack_from("<II", blob, off); off += 8
    assert magic == 0x143DA20, hex(magic)
    off += 1                                      # one byte between flags and code_path
    def rd(o):
        (n,) = struct.unpack_from("<Q", blob, o)
        return blob[o + 8 : o + 8 + n], o + 8 + n
    code_path, off = rd(off)
    code, off = rd(off)
    os.makedirs(outdir, exist_ok=True)
    open(os.path.join(outdir, "main.cjs"), "wb").write(code)
    manifest = {}
    if flags & 8:                                 # kIncludeAssets
        (count,) = struct.unpack_from("<Q", blob, off); off += 8
        os.makedirs(os.path.join(outdir, "assets"), exist_ok=True)
        for _ in range(count):
            k, off = rd(off)
            v, off = rd(off)
            key = k.decode()
            manifest[key] = len(v)
            open(os.path.join(outdir, "assets", key.replace("/", "__")), "wb").write(v)
    json.dump(manifest, open(os.path.join(outdir, "asset_manifest.json"), "w"), indent=1)
    print(f"magic={hex(magic)} flags={flags} descsz={descsz}")
    print(f"code_path={code_path.decode()}")
    print(f"code={len(code)} bytes; assets={len(manifest)} files, {sum(manifest.values())} bytes")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
