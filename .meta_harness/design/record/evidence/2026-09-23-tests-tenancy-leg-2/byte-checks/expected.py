"""W4-A 独立核对：自行解析 https-json 绑定的 examples.md §1～§5，与入口层包 dist 产出的字节逐字节比较。

不复用包内测试的解析器。每份：十六进制去空白 → 字节；转义文本去排版换行、把字面 \\r\\n 还原成 CR LF → 字节；
核对两种写法相同、总字节数与头部/体字节数、SHA-256 与页面所写一致；再与 produced/<名>.bin 比较。
用法：python3 expected.py <examples.md> <produced 目录>
"""
import hashlib
import re
import sys
from pathlib import Path

md = Path(sys.argv[1]).read_text(encoding="utf-8").split("\n")
produced_dir = Path(sys.argv[2])
# 页面次序里的第几份 → produced 名；§2 请求不是答复，只核自洽
names = ["1-version-mismatch", None, "2-public-health-reply", "3.1-login-state-rejected",
         "3.2-unavailable", "3.3-invalid-input", "4-route-result", "5-full-health"]
summary_re = re.compile(r"^总 (\d+) 字节 = 头部 (\d+) \+ 体 (\d+)；SHA-256 `([0-9a-f]{64})`")
items = []
i = 0
while i < len(md):
    m = summary_re.match(md[i])
    if not m:
        i += 1
        continue
    blocks = []
    j = i + 1
    while len(blocks) < 2:
        if md[j] == "```text":
            k = j + 1
            while md[k] != "```":
                k += 1
            blocks.append(md[j + 1:k])
            j = k
        j += 1
    items.append((m, blocks))
    i = j
failures = 0
print(f"items\t{len(items)}")
for index, (m, (escaped_lines, hex_lines)) in enumerate(items):
    total, head, body, sha = int(m[1]), int(m[2]), int(m[3]), m[4]
    escaped = "".join(escaped_lines).replace("\\r\\n", "\r\n").encode("utf-8")
    hexed = bytes.fromhex("".join("".join(hex_lines).split()))
    split = hexed.find(b"\r\n\r\n") + 4
    checks = {
        "escaped==hex": escaped == hexed,
        "total": len(hexed) == total,
        "head+body": split == head and len(hexed) - split == body,
        "sha256": hashlib.sha256(hexed).hexdigest() == sha,
    }
    name = names[index] if index < len(names) else None
    if name is not None:
        prod = (produced_dir / f"{name}.bin").read_bytes()
        checks["produced==example"] = prod == hexed
        prod_sha = hashlib.sha256(prod).hexdigest()
    else:
        prod_sha = "-"
    bad = [k for k, v in checks.items() if not v]
    failures += len(bad)
    print(f"{index}\t{name or '2-public-health-request'}\t{total}\t{sha}\tproduced={prod_sha}\t"
          + ("OK" if not bad else "FAIL:" + ",".join(bad)))
print(f"failures\t{failures}")
sys.exit(1 if failures or len(items) != 8 else 0)
