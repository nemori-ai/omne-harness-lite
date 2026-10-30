"""README 里写的 `uv run` 命令必须能在当前仓库运行（防御指导 DP-10：文档与实现对齐）。"""
import os
import re
import shlex
import subprocess
from pathlib import Path

import pytest

REPOSITORY = Path(__file__).parents[3]
README = REPOSITORY / ".meta_harness/tooling/README.md"
SCRIPT_COMMAND = re.compile(r"^uv run --locked python (\.meta_harness/tooling/src/\w+\.py)\b", re.MULTILINE)


def documented_scripts() -> list[str]:
    return sorted(set(SCRIPT_COMMAND.findall(README.read_text(encoding="utf-8"))))


def test_readme_documents_the_reconciler_and_source_checker_commands():
    # 取不到命令时下面的参数化会静默变空，先固定「至少写了这两条」。
    scripts = documented_scripts()
    assert ".meta_harness/tooling/src/domain_objects.py" in scripts
    assert ".meta_harness/tooling/src/check_sources.py" in scripts


@pytest.mark.parametrize("script", documented_scripts())
def test_documented_uv_run_command_answers_help(script):
    env = {key: value for key, value in os.environ.items() if key != "UV_DEFAULT_INDEX"}
    command = shlex.split(f"uv run --locked python {script} --help")
    result = subprocess.run(command, cwd=REPOSITORY, env=env, capture_output=True, text=True,
                            encoding="utf-8", timeout=300)
    assert result.returncode == 0, result.stderr
    assert "usage:" in result.stdout
