import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from git_environment import repository_env

env = repository_env(os.environ)
env.pop("OMNE_SUBJECT_ROOT", None)
env.pop("OMNE_RUNNER_ROOT", None)
for key in set(os.environ) - env.keys():
    del os.environ[key]

# pytest-xdist 的工作进程数，只在 `-n auto` 时由这里给（`pnpm run test:python` 带的就是它）。
# 次序：OMNE_PYTEST_WORKERS 明给的数（0 即不分进程，与单进程相同）；`pnpm run check` 交下来的预算
# OMNE_WORKER_BUDGET 的四分之一，与成员测试每个成员的份额相同（test-runs.config.json 的 workerDivisor），
# 因为 python 步与重步骤同时跑，不能两边都吃满；都没有时取逻辑核的一半：用例多半起 git 或 node 子进程，
# 24 核上实测 12 个与 24 个一样快。
WORKERS_ENV = "OMNE_PYTEST_WORKERS"
BUDGET_ENV = "OMNE_WORKER_BUDGET"
BUDGET_DIVISOR = 4
MINIMUM = 2


def _count(name: str, value: str, low: int) -> int:
    if not (value.isascii() and value.isdigit()) or int(value) < low:
        raise ValueError(f"环境变量 {name} 须为不小于 {low} 的整数，现在是 {value!r}")
    return int(value)


def workers(environ: dict[str, str], cores: int) -> int:
    given = environ.get(WORKERS_ENV, "")
    if given:
        return _count(WORKERS_ENV, given, 0)
    budget = environ.get(BUDGET_ENV, "")
    if budget:
        return max(MINIMUM, math.ceil(_count(BUDGET_ENV, budget, 1) / BUDGET_DIVISOR))
    return max(MINIMUM, cores // 2)


def pytest_xdist_auto_num_workers(config) -> int:
    return workers(dict(os.environ), os.cpu_count() or 1)
