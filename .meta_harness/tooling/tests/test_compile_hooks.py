"""Host hook files are projected from `hooks/hooks.yaml`, deterministically and only when declared."""
import json
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
