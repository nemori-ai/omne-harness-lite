"""Host hook files are projected from `hooks/hooks.yaml`, deterministically and only when declared."""
import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import compile_agents as compiler
from projection import compile_sources

CLAUDE = Path(".claude/settings.json")
CODEX = Path(".codex/hooks.json")
COMMAND = 'node --experimental-strip-types "$(git rev-parse --show-toplevel)/stop-hook.ts"'


def declare(source: Path, hooks) -> None:
    (source / "hooks").mkdir(exist_ok=True)
    (source / "hooks/hooks.yaml").write_text(yaml.safe_dump({"hooks": hooks}, allow_unicode=True),
                                              encoding="utf-8")


@pytest.fixture
def source(tmp_path):
    """No skills; one complete role pair so that subagent_types can name it."""
    root = tmp_path / "agents"
    (root / "skills").mkdir(parents=True)
    role = root / "roles/developer"
    role.mkdir(parents=True)
    (role / "role.md").write_text("实施。\n", encoding="utf-8")
    (role / "codex.toml").write_text('name = "developer"\ndescription = "Implement"\n', encoding="utf-8")
    (role / "claude.yaml").write_text("name: developer\ndescription: Implement\n", encoding="utf-8")
    declare(root, [{"id": "facts", "events": ["Stop", "SubagentStop"],
                    "subagent_types": ["developer"], "command": COMMAND, "timeout": 60}])
    return root


EXPECTED = {
    "hooks": {
        "Stop": [{"hooks": [{"command": COMMAND, "timeout": 60, "type": "command"}]}],
        "SubagentStop": [{"hooks": [{"command": COMMAND, "timeout": 60, "type": "command"}],
                          "matcher": "developer"}],
    }
}


def test_both_hosts_get_the_same_sorted_two_space_file(source, tmp_path):
    output = tmp_path / "out"
    assert compiler.main(["--source", str(source), "--output", str(output)]) == 0
    claude = (output / CLAUDE).read_bytes()
    assert claude == (output / CODEX).read_bytes()
    assert json.loads(claude) == EXPECTED
    assert claude == (json.dumps(EXPECTED, indent=2, sort_keys=True) + "\n").encode()
    assert compiler.main(["--source", str(source), "--output", str(output), "--check"]) == 0


def test_single_host_gets_only_its_file(source, tmp_path):
    output = tmp_path / "out"
    assert compiler.main(["--source", str(source), "--output", str(output), "--host", "claude-code"]) == 0
    assert (output / CLAUDE).is_file()
    assert not (output / ".codex").exists()


def test_without_hooks_the_output_set_is_unchanged(source):
    with_hooks = set(compile_sources(source))
    (source / "hooks/hooks.yaml").unlink()
    assert set(compile_sources(source)) == with_hooks - {CLAUDE, CODEX}
    (source / "hooks").rmdir()
    assert set(compile_sources(source)) == with_hooks - {CLAUDE, CODEX}
    declare(source, [])
    assert set(compile_sources(source)) == with_hooks - {CLAUDE, CODEX}


@pytest.mark.parametrize("change, message", [
    ({"events": ["Stop", "SessionEnd"]}, "hook events must be distinct names"),
    ({"events": []}, "hook events must be distinct names"),
    ({"command": "  "}, "hook command must be a non-empty string"),
    ({"timeout": 0}, "hook timeout must be a positive integer"),
    ({"timeout": "60"}, "hook timeout must be a positive integer"),
    ({"timeout": True}, "hook timeout must be a positive integer"),
    ({"subagent_types": ["no-such-role"]}, "subagent_types must name existing roles"),
    ({"subagent_types": ["developer.*"]}, "subagent_types must name existing roles"),
    ({"magic": 1}, "unknown hook fields ['magic']"),
])
def test_invalid_declaration_names_the_hook(source, change, message):
    entry = {"id": "bad-one", "events": ["Stop"], "command": COMMAND, "timeout": 60, **change}
    declare(source, [entry])
    with pytest.raises(ValueError, match="bad-one") as raised:
        compile_sources(source)
    assert message in str(raised.value)


def test_duplicate_id_is_rejected(source):
    entry = {"id": "twice", "events": ["Stop"], "command": COMMAND, "timeout": 60}
    declare(source, [entry, entry])
    with pytest.raises(ValueError, match="duplicate hook id: twice"):
        compile_sources(source)


def test_check_reports_missing_or_different_hook_files(source, tmp_path, capsys):
    output = tmp_path / "out"
    args = ["--source", str(source), "--output", str(output)]
    assert compiler.main(args) == 0
    (output / CODEX).unlink()
    assert compiler.main(args + ["--check"]) == 1
    assert "missing generated file: .codex/hooks.json" in capsys.readouterr().err
    assert compiler.main(args) == 0
    (output / CLAUDE).write_text('{"hooks": {}}\n')
    assert compiler.main(args + ["--check"]) == 1
    assert "output differs" in capsys.readouterr().err


# --- 入库的那条命令：真的拿 shell 跑一遍 ------------------------------------------------------------------------------

DECLARED = Path(__file__).parents[2] / "agents/hooks/hooks.yaml"
TOOL = "tools/ts-checks"
# 替身脚本：印出「跑的是哪一份、标准输入收到了什么」。
STAND_IN = "import { readFileSync } from 'node:fs'\nprocess.stdout.write(`${process.argv[1]}|${readFileSync(0, 'utf8')}`)\n"


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@invalid", *args], cwd=cwd, check=True,
                   capture_output=True)


def _install(checkout: Path) -> None:
    marker = checkout / TOOL / "node_modules/typescript/package.json"
    marker.parent.mkdir(parents=True)
    marker.write_text("{}\n", encoding="utf-8")


def _stop(cwd: Path) -> subprocess.CompletedProcess:
    (hook,) = yaml.safe_load(DECLARED.read_text(encoding="utf-8"))["hooks"]
    return subprocess.run(["sh", "-c", hook["command"]], cwd=cwd, input="{}", capture_output=True, text=True,
                          check=False)


def test_the_declared_stop_command_runs_a_copy_of_the_tool_that_has_its_dependencies(tmp_path, monkeypatch):
    """刚建的工作树没装依赖：跑主检出里的那一份；装了就跑自己的。不在仓库里：退出 0，什么都不做。"""
    main = tmp_path / "main"
    script = Path(TOOL) / "src/loop/stop-hook.ts"
    (main / script).parent.mkdir(parents=True)
    (main / script).write_text(STAND_IN, encoding="utf-8")
    (main / "apps/cli/src").mkdir(parents=True)
    (main / "apps/cli/src/keep.ts").write_text("export {}\n", encoding="utf-8")
    _git(main, "init", "-q")  # 不用 `init -b`：Git 2.28 才有
    _git(main, "add", ".")
    _git(main, "commit", "-q", "-m", "tool")
    _install(main)
    fresh = tmp_path / "fresh"
    _git(main, "worktree", "add", "-q", str(fresh), "-b", "someone/work")

    for cwd in (fresh, fresh / "apps/cli/src", main, main / "apps/cli/src"):
        ran = _stop(cwd)
        assert (ran.returncode, ran.stdout) == (0, f"{(main / script).resolve()}|{{}}"), (cwd, ran.stderr)

    _install(fresh)
    ran = _stop(fresh / "apps/cli/src")
    assert (ran.returncode, ran.stdout) == (0, f"{(fresh / script).resolve()}|{{}}"), ran.stderr

    # 一棵停在旧提交上的工作树：装了依赖，却还没有这份脚本。
    (fresh / script).unlink()
    ran = _stop(fresh)
    assert (ran.returncode, ran.stdout) == (0, f"{(main / script).resolve()}|{{}}"), ran.stderr

    outside = tmp_path / "outside"
    outside.mkdir()
    # basetemp can be inside the execution checkout; make this negative genuinely outside Git.
