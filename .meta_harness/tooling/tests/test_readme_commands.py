"""README 里每条 `uv run --locked python <脚本>` 命令：脚本在，`--help` 退出 0，写着的参数能被脚本照原样解析。

只解析，不执行：在脚本调用 `ArgumentParser.parse_args` 解析完 README 的参数之后立即退出 0。
参数名写错、缺必填参数、取值不在 choices 里时退出 2，用例变红。脚本收到参数之后做什么不在这里验证。
在命令后面直接加 `--help` 做不到这一点：argparse 读到 `--help` 就打印帮助并退出 0，不报前面写错的参数名。
`pnpm run`、`pytest` 等其他命令不在这里验证（防御指导 DP-10：文档与实现对齐）。
"""
import os
import re
import shlex
import subprocess
from pathlib import Path

import pytest

REPOSITORY = Path(__file__).parents[3]
README = REPOSITORY / ".meta_harness/tooling/README.md"
LAUNCHER = ["uv", "run", "--locked", "python"]
SCRIPT = re.compile(r"\.meta_harness/tooling/src/\w+\.py")
FENCE = re.compile(r"^```(?:sh|bash|shell)\n(.*?)^```", re.MULTILINE | re.DOTALL)
ASSIGNMENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*=")
PARSED = "README-ARGUMENTS-PARSED"
# Replace parse_args with one that parses as the script asks and then stops the script before it acts.
PARSE_ONLY = f"""
import argparse, os, runpy, sys
script = sys.argv[1]
real = argparse.ArgumentParser.parse_args
def parse_only(self, args=None, namespace=None):
    real(self, args, namespace)
    print({PARSED!r})
    raise SystemExit(0)
argparse.ArgumentParser.parse_args = parse_only
sys.argv = sys.argv[1:]
sys.path.insert(0, os.path.dirname(os.path.abspath(script)))
runpy.run_path(script, run_name="__main__")
"""


def documented_commands(text: str) -> list[list[str]]:
    """Each documented command that runs a tooling script with uv, as its words after the launcher."""
    commands = []
    for block in FENCE.findall(text):
        for line in block.replace("\\\n", " ").split("\n"):
            words = shlex.split(line, comments=True)
            while words and ASSIGNMENT.match(words[0]):
                words.pop(0)
            if words[:len(LAUNCHER)] == LAUNCHER and len(words) > len(LAUNCHER) and SCRIPT.fullmatch(words[4]):
                commands.append(words[len(LAUNCHER):])
    return commands


COMMANDS = documented_commands(README.read_text(encoding="utf-8"))


def run(words: list[str]) -> subprocess.CompletedProcess:
    env = {key: value for key, value in os.environ.items() if key != "UV_DEFAULT_INDEX"}
    # 帮助文字含中文；PYTHONUTF8=0 时子进程按系统代码页输出，这里按 UTF-8 读会解码失败。
    env["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run([*LAUNCHER, *words], cwd=REPOSITORY, env=env, capture_output=True, text=True,
                          encoding="utf-8", timeout=300)


def test_readme_documents_the_reconciler_and_source_checker_commands():
    # 取不到命令时下面的参数化会静默变空，先固定「至少写了这几条」。
    scripts = {words[0] for words in COMMANDS}
    assert {".meta_harness/tooling/src/domain_objects.py", ".meta_harness/tooling/src/check_sources.py",
            ".meta_harness/tooling/src/save_handback.py", ".meta_harness/tooling/src/cursor_probe.py"} <= scripts
    assert [".meta_harness/tooling/src/domain_objects.py", "--root", ".meta_harness/design", "--stale",
            "report"] in COMMANDS, "a trailing comment is not part of the command"


def test_commands_are_read_from_fences_with_continuations_and_variables():
    text = ("```sh\nX=1 uv run --locked python .meta_harness/tooling/src/a.py \\\n  --flag value   # note\n"
            "uv run --locked pytest x\n```\n\nuv run --locked python .meta_harness/tooling/src/prose.py\n")
    assert documented_commands(text) == [[".meta_harness/tooling/src/a.py", "--flag", "value"]]


@pytest.mark.parametrize("script", sorted({words[0] for words in COMMANDS}))
def test_documented_script_answers_help(script):
    result = run([script, "--help"])
    assert result.returncode == 0, result.stderr
    assert "usage:" in result.stdout


@pytest.mark.parametrize("words", COMMANDS, ids=[shlex.join(words) for words in COMMANDS])
def test_documented_arguments_parse_as_written(words):
    source = (REPOSITORY / words[0]).read_text(encoding="utf-8")
    assert ".parse_args(" in source, "only an argparse script can be parsed without running it"
    result = run(["-c", PARSE_ONLY, *words])
    assert (result.returncode, result.stdout.strip().splitlines()[-1:]) == (0, [PARSED]), result.stderr
