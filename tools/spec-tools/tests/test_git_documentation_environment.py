import os
import subprocess
import sys
from pathlib import Path


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


def test_link_check_skips_git_ignored_directories_but_not_their_siblings(tmp_path):
    """A leftover `.stryker-tmp-*` sandbox must not make the link check fail, at any depth."""
    from omne_harness_lite_spec_tools.check_docs import check

    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    files = {
        "README.md": "# Root\n",
        "docs/a.md": "# A\n",
        "packages/x/README.md": "# X\n",
        ".stryker-tmp-x/docs/broken.md": "[missing](absent.md)\n",
        "packages/x/.stryker-tmp-y/broken.md": "[missing](absent.md)\n",
    }
    for name, text in files.items():
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    (tmp_path / ".meta_harness").mkdir()
    (tmp_path / ".gitignore").write_text(".stryker-tmp*\n", encoding="utf-8")

    errors, count = check(tmp_path.resolve())
    assert errors == []
    assert count == 3

    # Siblings of an ignored directory, and untracked files Git does not ignore, stay in scope.
    (tmp_path / "packages/x/docs-extra.md").write_text("[missing](absent.md)\n", encoding="utf-8")
    errors, _ = check(tmp_path.resolve())
    assert [error.split(":")[0] for error in errors] == [str(Path("packages/x/docs-extra.md"))]


def test_link_check_scans_everything_without_a_git_ignore_rule(tmp_path):
    """Control: the same sandbox is scanned when Git does not ignore it, so the skip above is Git's."""
    from omne_harness_lite_spec_tools.check_docs import check

    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    (tmp_path / "README.md").write_text("# Root\n", encoding="utf-8")
    (tmp_path / ".meta_harness").mkdir()
    (tmp_path / "docs").mkdir()
    sandbox = tmp_path / "docs/.stryker-tmp-x"
    sandbox.mkdir()
    (sandbox / "broken.md").write_text("[missing](absent.md)\n", encoding="utf-8")
    errors, _ = check(tmp_path.resolve())
    assert len(errors) == 1 and "broken.md" in errors[0]
