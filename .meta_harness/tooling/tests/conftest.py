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
# 次序：OMNE_PYTEST_WORKERS 明给的数（0 即不分进程，与单进程相同）；令牌池交下来的 OMNE_WORKER_BUDGET，
# 拿到几个令牌就起几个进程（python 步要多少令牌由 tools/test-runner 的步骤表定）；都没有时取逻辑核的一半：
# 用例多半起 git 或 node 子进程，24 核上实测 12 个与 24 个一样快。
# 本文件没被加载时（只跑别的测试根，或别的检出借用 test:python），由 test:python 设的
# PYTEST_XDIST_AUTO_NUM_WORKERS=0 让 xdist 退回单进程，不按核数起一堆进程去跑几条用例。
WORKERS_ENV = "OMNE_PYTEST_WORKERS"
BUDGET_ENV = "OMNE_WORKER_BUDGET"
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
        return _count(BUDGET_ENV, budget, 1)
    return max(MINIMUM, cores // 2)


def pytest_xdist_auto_num_workers(config) -> int:
    return workers(dict(os.environ), os.cpu_count() or 1)
