import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from compile_agents import deliver
from projection import compile_sources
from cursor_probe import main as probe

SOURCE = Path(__file__).parents[2] / "agents"


@pytest.fixture
def source(tmp_path):
    return Path(shutil.copytree(SOURCE, tmp_path / "source"))


def test_cursor_never_requires_pair_configs_or_renderer(source, tmp_path):
    for name in ("codex.toml", "claude.yaml"):
        for file in (source / "roles").glob(f"*/{name}"):
            file.unlink()
    artifacts = compile_sources(source, tmp_path / "absent.py", ("cursor",))
    assert all(path.parts[0] == ".cursor" for path in artifacts)
    role = artifacts[Path(".cursor/agents/developer.md")].content.decode()
    assert "model: claude-opus-5-5-high" in role
    assert "你的实施边界" in role
    assert b'"skills": "./skills"' in artifacts[Path(".cursor/.cursor-plugin/plugin.json")].content
    with pytest.raises(FileNotFoundError):
        compile_sources(source, hosts=("codex",))


@pytest.mark.parametrize("extra", ["effort: xhigh", "permissionMode: default", "tools: Read", "model: inherit", "readonly: yes-please"])
def test_native_config_rejects_cross_host_unknown_and_duplicate_fields(source, extra):
    config = source / "roles/developer/cursor.yaml"
    config.write_text(config.read_text() + extra + "\n")
    with pytest.raises(ValueError):
        compile_sources(source, hosts=("cursor",))


@pytest.mark.parametrize("field,value", [("model", "not-a-listed-model"), ("readonly", "false"),
    ("is_background", 0), ("description", ""), ("name", "other-role")])
def test_invalid_native_values_fail_without_silent_coercion(source, field, value):
    path = source / "roles/developer/cursor.yaml"
    config = yaml.safe_load(path.read_text())
    config[field] = value
    path.write_text(yaml.safe_dump(config))
    with pytest.raises(ValueError):
        compile_sources(source, hosts=("cursor",))


def test_missing_cursor_config_fails(source):
    (source / "roles/developer/cursor.yaml").unlink()
    with pytest.raises(FileNotFoundError):
        compile_sources(source, hosts=("cursor",))


def test_unsupported_cursor_strategy_fails_before_delivery(source):
    path = source / "skills/harness-design-handbook/adapters/cursor/strategy.yaml"
    path.write_text("version: 1\nhost: cursor\nskill: harness-design-handbook\nmode: unsupported\nreason: missing native capability\n")
    with pytest.raises(ValueError, match="missing native capability"):
        compile_sources(source, hosts=("cursor",))


def test_clean_clone_initialization_has_no_personal_or_session_start_dependency(tmp_path):
    project = tmp_path / "clean clone"
    shutil.copytree(SOURCE, project / ".meta_harness/agents")
    shutil.copytree(Path(__file__).parents[1] / "src", project / ".meta_harness/tooling/src")
    assert not (project / ".cursor").exists()
    command = [sys.executable, str(project / ".meta_harness/tooling/src/initialize_agents.py"),
               "--project-root", str(project), "--host", "cursor"]
    for extra in ([], ["--check"]):
        result = subprocess.run(command + extra, cwd=tmp_path, capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr
    assert (project / ".cursor").is_symlink()
    hooks = json.loads((project / ".cursor/hooks.json").read_text())
    assert set(hooks["hooks"]) == {"stop", "subagentStop"}
    shutil.rmtree(project / ".meta_harness/agents")
    moved = tmp_path / "moved project"
    project.rename(moved)
    assert (moved / ".cursor/skills/harness-design-handbook/SKILL.md").is_file()
    assert (moved / ".cursor/runtime/cursor-hook.mjs").is_file()


@pytest.fixture
def installed(source, tmp_path):
    stage = tmp_path / "stage"
    deliver(compile_sources(source, hosts=("cursor",)), stage)
    package = tmp_path / "external installed plugin"
    shutil.move(stage / ".cursor", package)
    shutil.rmtree(source)
    workspace = tmp_path / "separate worktree"
    workspace.mkdir()
    subprocess.run(["git", "init", "-q", str(workspace)], check=True)
    tool = workspace / "tools/ts-checks"
    (tool / "src/loop").mkdir(parents=True)
    (tool / "package.json").write_text('{"type":"module"}')
    (tool / "node_modules/typescript").mkdir(parents=True)
    (tool / "node_modules/typescript/package.json").write_text("{}")
    (tool / "src/loop/stop-hook.ts").write_text("import {readFileSync,writeFileSync} from 'node:fs';"
        "writeFileSync('receipt.json',JSON.stringify({cwd:process.cwd(),payload:JSON.parse(readFileSync(0,'utf8'))}));"
        "process.stdout.write(JSON.stringify({decision:'block',reason:'new measured facts'}));")
    return package, workspace


def invoke(installed, changes=None, event="stop", text=None):
    package, workspace = installed
    payload = {"workspace_roots": [str(workspace)], "status": "completed", "loop_count": 0,
               "subagent_type": "developer", **(changes or {})}
    result = subprocess.run(["node", str(package / "runtime/cursor-hook.mjs"), "loop-stop-facts", event],
                            input=json.dumps(payload) if text is None else text,
                            cwd=package, capture_output=True, text=True)
    assert result.returncode == 0
    return json.loads(result.stdout), result.stderr


def test_relocated_plugin_measures_target_and_normalizes_payload(installed):
    output, stderr = invoke(installed)
    assert output == {"followup_message": "new measured facts"} and stderr == ""
    receipt = json.loads((installed[1] / "receipt.json").read_text())
    assert receipt["cwd"] == receipt["payload"]["cwd"] == str(installed[1])
    assert receipt["payload"]["stop_hook_active"] is False
    assert receipt["payload"]["hook_event_name"] == "Stop"
    assert invoke(installed, event="subagentStop")[0] == output
    assert json.loads((installed[1] / "receipt.json").read_text())["payload"]["hook_event_name"] == "SubagentStop"


@pytest.mark.parametrize("changes,event", [({"loop_count": 1}, "stop"), ({"stop_hook_active": True}, "stop"),
    ({"status": "aborted"}, "stop"), ({"status": "error"}, "stop"),
    ({"subagent_type": "qa"}, "subagentStop"), ({"subagent_type": None}, "subagentStop"),
    ({"loop_count": None}, "stop"), ({"loop_count": -1}, "stop")])
def test_nonmatching_recursive_incomplete_events_never_measure(installed, changes, event):
    assert invoke(installed, changes, event)[0] == {}
    assert not (installed[1] / "receipt.json").exists()


def test_ambiguous_roots_fail_without_selecting_first(installed, tmp_path):
    other = tmp_path / "other"
    other.mkdir()
    roots = [str(installed[1]), str(other)]
    output, stderr = invoke(installed, {"workspace_roots": roots})
    assert output == {} and "one target" in stderr
    assert not (installed[1] / "receipt.json").exists()
    assert invoke(installed, {"workspace_roots": roots, "cwd": str(installed[1])})[0].get("followup_message")


@pytest.mark.parametrize("script,code", [
    ("process.stdout.write('not JSON')", "adapter-failed"),
    ("process.stderr.write('failure')", "measurement-stderr"),
    ("throw new Error('failure')", "measurement-failed"),
    ("process.stdout.write(JSON.stringify({systemMessage:'warning'}))", "measurement-warning"),
    ("process.stdout.write('{}')", "invalid-measurement-output"),
    ("setInterval(()=>{}, 1000)", "measurement-failed"),
])
def test_measurement_faults_are_observable_without_followup(installed, script, code):
    package, workspace = installed
    path = package / "runtime/loop-stop-facts.json"
    config = json.loads(path.read_text())
    config["timeout"] = 1
    path.write_text(json.dumps(config))
    (workspace / "tools/ts-checks/src/loop/stop-hook.ts").write_text(script)
    output, stderr = invoke(installed)
    assert output == {} and code in stderr


def test_missing_tooling_and_invalid_input_are_diagnostic(installed):
    (installed[1] / "tools/ts-checks/node_modules/typescript/package.json").unlink()
    assert "lack compatible" in invoke(installed)[1]
    assert invoke(installed, text="invalid")[0] == {}
    assert "adapter-failed" in invoke(installed, text="invalid")[1]


def test_native_project_command_resolves_from_subdirectory_after_move(installed):
    package, workspace = installed
    shutil.copytree(package, workspace / ".cursor")
    child = workspace / "..cache"
    child.mkdir()
    config = json.loads((workspace / ".cursor/hooks.json").read_text())
    command = config["hooks"]["stop"][0]["command"]
    assert "CURSOR_PLUGIN_ROOT" not in command
    env = {**os.environ, "CURSOR_PLUGIN_ROOT": str(package / "unrelated inherited root")}
    result = subprocess.run(["sh", "-c", command], cwd=child, env=env, text=True, capture_output=True,
                            input=json.dumps({"workspace_roots": [str(workspace)], "cwd": str(child),
                                              "status": "completed", "loop_count": 0}))
    assert json.loads(result.stdout) == {"followup_message": "new measured facts"}, result.stderr
    assert json.loads((workspace / "receipt.json").read_text())["cwd"] == str(workspace)
    assert invoke(installed, {"workspace_roots": None, "cwd": str(child)})[0] == {}
    result = subprocess.run(["node", str(package / "runtime/cursor-hook.mjs"), "loop-stop-facts", "stop"],
                            input=json.dumps({"cwd": str(child), "status": "completed", "loop_count": 0}),
                            text=True, capture_output=True)
    assert json.loads(result.stdout).get("followup_message"), result.stderr
    assert json.loads((workspace / "receipt.json").read_text())["payload"]["cwd"] == str(workspace)


def test_native_plugin_command_uses_host_substitution_despite_inherited_root(installed):
    package, workspace = installed
    assert not (workspace / ".cursor").exists()
    manifest = json.loads((package / ".cursor-plugin/plugin.json").read_text())
    assert manifest["hooks"] == "./plugin-hooks.json"
    config = json.loads((package / manifest["hooks"]).read_text())
    command = config["hooks"]["stop"][0]["command"]
    assert "${CURSOR_PLUGIN_ROOT}" in command and "CURSOR_PLUGIN_ROOT:-" not in command
    expanded = command.replace("${CURSOR_PLUGIN_ROOT}", str(package))
    result = subprocess.run(["sh", "-c", expanded], cwd=workspace,
                            env={**os.environ, "CURSOR_PLUGIN_ROOT": str(package / "unrelated inherited root")},
                            text=True, capture_output=True,
                            input=json.dumps({"workspace_roots": [str(workspace)],
                                              "status": "completed", "loop_count": 0}))
    assert result.returncode == 0 and result.stderr == ""
    assert json.loads(result.stdout) == {"followup_message": "new measured facts"}
    assert json.loads((workspace / "receipt.json").read_text())["payload"]["cwd"] == str(workspace)


def test_git_common_fallback_runs_main_tool_but_measures_target(installed, tmp_path):
    package, main = installed
    for args in (["add", "tools/ts-checks/src", "tools/ts-checks/package.json"],
                 ["-c", "user.name=fixture", "-c", "user.email=fixture@invalid", "commit", "-qm", "tool"]):
        subprocess.run(["git", *args], cwd=main, check=True)
    worktree = tmp_path / "fresh target"
    subprocess.run(["git", "worktree", "add", "-qb", "fixture", str(worktree)], cwd=main, check=True)
    output, stderr = invoke((package, worktree))
    assert output == {"followup_message": "new measured facts"}, stderr
    receipt = json.loads((worktree / "receipt.json").read_text())
    assert receipt["cwd"] == receipt["payload"]["cwd"] == str(worktree)
    assert not (main / "receipt.json").exists()


def test_probe_driver_records_fixture_receipts_and_isolates_loop_home(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    prompt = tmp_path / "prompt.txt"
    prompt.write_text("Invoke the named role once.")
    agent = tmp_path / "fixture-agent"
    agent.write_text(f"#!{sys.executable}\n" + '''import json, os, pathlib, subprocess, sys
if "--version" in sys.argv:
    print("fixture-host")
    raise SystemExit(0)
plugin = pathlib.Path(sys.argv[sys.argv.index("--plugin-dir") + 1])
assert "--mode" not in sys.argv
output = pathlib.Path(os.environ["OMNE_CURSOR_PROBE_OUTPUT"])
assert os.environ["OMNE_METRICS_HOME"] == str(output / "loop")
for event, payload in [("subagentStart", {"subagent_type":"developer", "subagent_model":"fixture-model"}),
                       ("subagentStop", {"status":"completed", "subagent_type":"developer"}),
                       ("stop", {"status":"completed", "loop_count":0})]:
    subprocess.run(["node", str(plugin / "receipt.mjs"), event], input=json.dumps(payload), text=True,
                   check=True, capture_output=True, env={**os.environ, "CURSOR_PLUGIN_ROOT":str(plugin)})
print(json.dumps({"type":"result", "subtype":"success"}))
''')
    agent.chmod(0o755)
    output = tmp_path / "evidence"
    arguments = ["--workspace", str(workspace), "--output", str(output), "--agent", str(agent),
                 "--model", "fixture-model", "--prompt-file", str(prompt), "--timeout", "10"]
    assert probe([*arguments, "--run"]) == 0
    result = json.loads((output / "result.json").read_text())
    assert result["native_receipts"] == 3
    assert result["subagent_start"][0]["subagent_model"] == "fixture-model"
    assert result["stop"][-1]["status"] == "completed"
    assert (output / "host-version.txt").read_text() == "fixture-host\n"
    assert json.loads((output / "stdout.jsonl").read_text())["subtype"] == "success"
    with pytest.raises(SystemExit):
        probe(arguments)


def test_probe_rejects_duplicate_project_and_plugin_registration(tmp_path):
    (tmp_path / ".cursor/agents").mkdir(parents=True)
    with pytest.raises(SystemExit):
        probe(["--workspace", str(tmp_path), "--output", str(tmp_path / "output"), "--model", "m",
               "--prompt-file", str(tmp_path / "unused"), "--timeout", "1", "--plugin-root", str(tmp_path)])
    assert not (tmp_path / "output").exists()
