import os
import subprocess
import sys


def test_documentation_git_checks_use_explicit_root(tmp_path):
    target, foreign = tmp_path / "target", tmp_path / "foreign"
    for root in (target, foreign):
        root.mkdir()
        subprocess.run(["git", "init", "-q", str(root)], check=True)
    record = target / ".meta_harness/design/record/forbidden.md"
    record.parent.mkdir(parents=True)
    record.write_text("# Process record\n")
    subprocess.run(["git", "-C", str(target), "add", "."], check=True)
    (foreign / "marker").write_text("foreign")
    subprocess.run(["git", "-C", str(foreign), "add", "."], check=True)
    index = (foreign / ".git/index").read_bytes()
    result = subprocess.run([sys.executable, "-m", "omne_harness_lite_spec_tools.check_docs", "--root", str(target)],
                            env={**os.environ, "GIT_DIR": str(foreign / ".git"), "GIT_WORK_TREE": str(foreign),
                                 "GIT_INDEX_FILE": str(foreign / ".git/index")}, capture_output=True, text=True)
    assert result.returncode == 1
    assert "process record files must not be tracked in Git" in result.stdout
    assert (foreign / ".git/index").read_bytes() == index
