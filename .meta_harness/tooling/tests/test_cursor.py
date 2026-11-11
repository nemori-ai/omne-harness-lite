import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from compile_agents import deliver
from projection import compile_sources
from executable_bits import copy_tree, staged_modes

SOURCE = Path(__file__).parents[2] / "agents"


@pytest.fixture
def source(tmp_path):
    return copy_tree(SOURCE, tmp_path / "source")


def test_cursor_package_has_skills_and_hooks_but_no_agents(source):
    artifacts = compile_sources(source, hosts=("cursor",))
    assert all(path.parts[0] == ".cursor" for path in artifacts)
    assert not any(path.parts[1:2] == ("agents",) for path in artifacts)
    manifest = json.loads(artifacts[Path(".cursor/.cursor-plugin/plugin.json")].content)
    assert manifest["skills"] == "./skills" and manifest["hooks"] == "./plugin-hooks.json"
    assert "agents" not in manifest
    hooks = json.loads(artifacts[Path(".cursor/hooks.json")].content)["hooks"]
    assert set(hooks) == {"stop", "subagentStop"}


def test_unsupported_cursor_strategy_fails_before_delivery(source):
    path = source / "skills/harness-design-handbook/adapters/cursor/strategy.yaml"
    path.write_text("version: 1\nhost: cursor\nskill: harness-design-handbook\nmode: unsupported\nreason: missing native capability\n", encoding="utf-8")
    with pytest.raises(ValueError, match="missing native capability"):
        compile_sources(source, hosts=("cursor",))


@staged_modes
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
    hooks = json.loads((project / ".cursor/hooks.json").read_text(encoding="utf-8"))
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
    tool = workspace / "tools/repo-toolchain"
    (tool / "src/loop").mkdir(parents=True)
    (tool / "package.json").write_text('{"type":"module"}', encoding="utf-8")
    (tool / "node_modules/typescript").mkdir(parents=True)
    (tool / "node_modules/typescript/package.json").write_text("{}", encoding="utf-8")
    (tool / "src/loop/stop-hook.ts").write_text("import {readFileSync,writeFileSync} from 'node:fs';"
        "writeFileSync('receipt.json',JSON.stringify({cwd:process.cwd(),payload:JSON.parse(readFileSync(0,'utf8'))}));"
        "process.stdout.write(JSON.stringify({decision:'block',reason:'new measured facts'}));", encoding="utf-8")
    return package, workspace


def invoke(installed, changes=None, event="stop", text=None, env=None):
    package, workspace = installed
    payload = {"workspace_roots": [str(workspace)], "status": "completed", "loop_count": 0,
               "subagent_type": "developer", **(changes or {})}
    result = subprocess.run(["node", str(package / "runtime/cursor-hook.mjs"), "loop-stop-facts", event],
                            input=json.dumps(payload) if text is None else text,
                            cwd=package, capture_output=True, text=True, encoding="utf-8", env=env)
    assert result.returncode == 0
    return json.loads(result.stdout), result.stderr


def test_relocated_plugin_measures_target_and_normalizes_payload(installed):
    output, stderr = invoke(installed)
    assert output == {"followup_message": "new measured facts"} and stderr == ""
    receipt = json.loads((installed[1] / "receipt.json").read_text(encoding="utf-8"))
    assert receipt["cwd"] == receipt["payload"]["cwd"] == str(installed[1])
    assert receipt["payload"]["stop_hook_active"] is False
    assert receipt["payload"]["hook_event_name"] == "Stop"
    assert invoke(installed, event="subagentStop")[0] == output
    assert json.loads((installed[1] / "receipt.json").read_text(encoding="utf-8"))["payload"]["hook_event_name"] == "SubagentStop"


def test_hostile_git_cannot_redirect_adapter_project_or_canonical_commands(installed, tmp_path):
    package, workspace = installed
    foreign = tmp_path / "foreign"
    foreign.mkdir()
    subprocess.run(["git", "init", "-q", str(foreign)], check=True)
    (foreign / "marker").write_text("foreign", encoding="utf-8")
    subprocess.run(["git", "-C", str(foreign), "add", "."], check=True)
    index = (foreign / ".git/index").read_bytes()
    env = {**os.environ, "GIT_DIR": str(foreign / ".git"), "GIT_WORK_TREE": str(foreign),
           "GIT_INDEX_FILE": str(foreign / ".git/index")}
    tool = workspace / "tools/repo-toolchain/src/loop/stop-hook.ts"
    # Git prints the top level with forward slashes on Windows; resolve() compares it as a path.
    tool.write_text("import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';" + tool.read_text(encoding="utf-8") +
                   "if(resolve(execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim())!==resolve(process.cwd()))process.exit(9);", encoding="utf-8")
    assert invoke(installed, env=env) == ({"followup_message": "new measured facts"}, "")
    shutil.copytree(package, workspace / ".cursor")
    project = json.loads((workspace / ".cursor/hooks.json").read_text(encoding="utf-8"))["hooks"]["stop"][0]["command"]
    canonical = json.loads((package / "runtime/loop-stop-facts.json").read_text(encoding="utf-8"))["command"]
    for command in (project, canonical):
        result = subprocess.run(["sh", "-c", command], cwd=workspace, env=env, text=True, encoding="utf-8", capture_output=True,
                                input=json.dumps({"workspace_roots": [str(workspace)], "cwd": str(workspace),
                                                  "status": "completed", "loop_count": 0}))
        assert result.returncode == 0 and result.stderr == "", result.stderr
        assert json.loads((workspace / "receipt.json").read_text(encoding="utf-8"))["cwd"] == str(workspace)
    assert not (foreign / "receipt.json").exists()
    assert (foreign / ".git/index").read_bytes() == index


@pytest.mark.parametrize("changes,event", [({"loop_count": 1}, "stop"), ({"stop_hook_active": True}, "stop"),
    ({"status": "aborted"}, "stop"), ({"status": "error"}, "stop"),
    ({"loop_count": None}, "stop"), ({"loop_count": -1}, "stop")])
def test_nonmatching_recursive_incomplete_events_never_measure(installed, changes, event):
    assert invoke(installed, changes, event)[0] == {}
    assert not (installed[1] / "receipt.json").exists()


def test_subagent_stop_measures_every_subagent_type(installed):
    for subagent_type in ("developer", "qa", "explore", None):
        output, stderr = invoke(installed, {"subagent_type": subagent_type}, "subagentStop")
        assert output == {"followup_message": "new measured facts"} and stderr == ""


def test_ambiguous_roots_fail_without_selecting_first(installed, tmp_path):
    other = tmp_path / "other"
    other.mkdir()
    roots = [str(installed[1]), str(other)]
    output, stderr = invoke(installed, {"workspace_roots": roots})
    assert output == {} and "one target" in stderr
    assert not (installed[1] / "receipt.json").exists()
    assert invoke(installed, {"workspace_roots": roots, "cwd": str(installed[1])})[0].get("followup_message")


# Only the hang case may rely on the timeout. The others must reach their own failure code, so they run
# under the configured limit: a one-second limit would also fire on a slow process spawn under load and
# report `measurement-failed` instead of the fault under test.
HANG = "setInterval(()=>{}, 1000)"


@pytest.mark.parametrize("script,code", [
    ("process.stdout.write('not JSON')", "adapter-failed"),
    ("setTimeout(()=>process.stdout.write('not JSON'), 1500)", "adapter-failed"),
    ("process.stderr.write('failure')", "measurement-stderr"),
    ("throw new Error('failure')", "measurement-failed"),
    ("process.stdout.write(JSON.stringify({systemMessage:'warning'}))", "measurement-warning"),
    ("process.stdout.write('{}')", "invalid-measurement-output"),
    (HANG, "measurement-failed"),
])
def test_measurement_faults_are_observable_without_followup(installed, script, code):
    package, workspace = installed
    if script == HANG:
        path = package / "runtime/loop-stop-facts.json"
        config = json.loads(path.read_text(encoding="utf-8"))
        config["timeout"] = 1
        path.write_text(json.dumps(config), encoding="utf-8")
    (workspace / "tools/repo-toolchain/src/loop/stop-hook.ts").write_text(script, encoding="utf-8")
    output, stderr = invoke(installed)
    assert output == {} and code in stderr
    if script == HANG:
        assert "ETIMEDOUT" in stderr


def test_missing_dependencies_still_run_the_target_script_and_invalid_input_is_diagnostic(installed):
    # 没装依赖不由适配器判：照跑目标树自己的脚本，「量不了」由脚本自己说。
    (installed[1] / "tools/repo-toolchain/node_modules/typescript/package.json").unlink()
    assert invoke(installed) == ({"followup_message": "new measured facts"}, "")
    assert invoke(installed, text="invalid")[0] == {}
    assert "adapter-failed" in invoke(installed, text="invalid")[1]


def test_native_project_command_resolves_from_subdirectory_after_move(installed):
    package, workspace = installed
    shutil.copytree(package, workspace / ".cursor")
    child = workspace / "..cache"
    child.mkdir()
    config = json.loads((workspace / ".cursor/hooks.json").read_text(encoding="utf-8"))
    command = config["hooks"]["stop"][0]["command"]
    assert "CURSOR_PLUGIN_ROOT" not in command
    env = {**os.environ, "CURSOR_PLUGIN_ROOT": str(package / "unrelated inherited root")}
    result = subprocess.run(["sh", "-c", command], cwd=child, env=env, text=True, encoding="utf-8", capture_output=True,
                            input=json.dumps({"workspace_roots": [str(workspace)], "cwd": str(child),
                                              "status": "completed", "loop_count": 0}))
    assert json.loads(result.stdout) == {"followup_message": "new measured facts"}, result.stderr
    assert json.loads((workspace / "receipt.json").read_text(encoding="utf-8"))["cwd"] == str(workspace)
    assert invoke(installed, {"workspace_roots": None, "cwd": str(child)})[0] == {}
    result = subprocess.run(["node", str(package / "runtime/cursor-hook.mjs"), "loop-stop-facts", "stop"],
                            input=json.dumps({"cwd": str(child), "status": "completed", "loop_count": 0}),
                            text=True, encoding="utf-8", capture_output=True)
    assert json.loads(result.stdout).get("followup_message"), result.stderr
    assert json.loads((workspace / "receipt.json").read_text(encoding="utf-8"))["payload"]["cwd"] == str(workspace)


def test_native_plugin_command_uses_host_substitution_despite_inherited_root(installed):
    package, workspace = installed
    assert not (workspace / ".cursor").exists()
    manifest = json.loads((package / ".cursor-plugin/plugin.json").read_text(encoding="utf-8"))
    assert manifest["hooks"] == "./plugin-hooks.json"
    config = json.loads((package / manifest["hooks"]).read_text(encoding="utf-8"))
    command = config["hooks"]["stop"][0]["command"]
    assert "${CURSOR_PLUGIN_ROOT}" in command and "CURSOR_PLUGIN_ROOT:-" not in command
    expanded = command.replace("${CURSOR_PLUGIN_ROOT}", str(package))
    result = subprocess.run(["sh", "-c", expanded], cwd=workspace,
                            env={**os.environ, "CURSOR_PLUGIN_ROOT": str(package / "unrelated inherited root")},
                            text=True, encoding="utf-8", capture_output=True,
                            input=json.dumps({"workspace_roots": [str(workspace)],
                                              "status": "completed", "loop_count": 0}))
    assert result.returncode == 0 and result.stderr == ""
    assert json.loads(result.stdout) == {"followup_message": "new measured facts"}
    assert json.loads((workspace / "receipt.json").read_text(encoding="utf-8"))["payload"]["cwd"] == str(workspace)


def test_worktree_runs_only_its_own_tool_never_the_main_checkouts(installed, tmp_path):
    package, main = installed
    for args in (["add", "tools/repo-toolchain/src", "tools/repo-toolchain/package.json"],
                 ["-c", "user.name=fixture", "-c", "user.email=fixture@invalid", "commit", "-qm", "tool"]):
        subprocess.run(["git", *args], cwd=main, check=True)
    worktree = tmp_path / "fresh target"
    subprocess.run(["git", "worktree", "add", "-qb", "fixture", str(worktree)], cwd=main, check=True)
    # 刚建、没装依赖的工作树：跑的是它自己的脚本。
    output, stderr = invoke((package, worktree))
    assert output == {"followup_message": "new measured facts"}, stderr
    receipt = json.loads((worktree / "receipt.json").read_text(encoding="utf-8"))
    assert receipt["cwd"] == receipt["payload"]["cwd"] == str(worktree)
    assert not (main / "receipt.json").exists()
    # 没有这份脚本的工作树（停在旧提交上）：不出声，也不借主检出那份。
    (worktree / "tools/repo-toolchain/src/loop/stop-hook.ts").unlink()
    (worktree / "receipt.json").unlink()
    assert invoke((package, worktree)) == ({}, "")
    assert not (worktree / "receipt.json").exists() and not (main / "receipt.json").exists()
