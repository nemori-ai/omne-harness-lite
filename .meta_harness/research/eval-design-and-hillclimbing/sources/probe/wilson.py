"""本专题自算的区间与噪声地板；输入取自博客示例，算式不出自任何来源。

用法：python3 wilson.py
"""
from __future__ import annotations

from math import sqrt


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return round(100 * (c - h), 1), round(100 * (c + h), 1)


ROWS = [
    ("held-out 最终配置 38/42", 38, 42),
    ("held-out 原始配置 33/42", 33, 42),
    ("train 基线 67/90", 67, 90),
    ("train Opus 5.5 low 79/90", 79, 90),
    ("train Sonnet 5 low 80/90", 80, 90),
    ("train Sonnet 5 + 改写提示词 89/90", 89, 90),
    ("按工单计 n=14：13/14", 13, 14),
    ("按工单计 n=14：11/14", 11, 14),
]

for label, k, n in ROWS:
    print(f"{label}: {100 * k / n:.2f}%  Wilson95={wilson(k, n)}")

for n, r in [(14, 3), (30, 3), (25, 2), (50, 2), (100, 2)]:
    print(f"n={n} R={r}: 1/sqrt(n*R) = ±{100 / sqrt(n * r):.1f} 点")

p1, p2, n = 38 / 42, 33 / 42, 42
se = sqrt(p1 * (1 - p1) / n + p2 * (1 - p2) / n)
print(f"held-out 差值 {100 * (p1 - p2):.1f} 点，非配对独立近似 95% 半宽 ±{196 * se:.1f} 点")
