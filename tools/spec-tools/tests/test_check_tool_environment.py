import subprocess
import zipfile

from omne_harness_lite_spec_tools import check_tool_environment as tool
from omne_harness_lite_spec_tools.doc_support import digest


def jar(path, body):
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("META-INF/MANIFEST.MF", body)
    return path


def run(monkeypatch, capsys, tla, alloy):
    monkeypatch.setattr(tool.shutil, "which", lambda name: "java")
    monkeypatch.setattr(
        tool.subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, "", 'openjdk version "21.0.13"'),
    )
    monkeypatch.setenv("TLA2TOOLS_JAR", str(tla))
    monkeypatch.setenv("ALLOY_ANALYZER_JAR", str(alloy))
    code = tool.main()
    return code, capsys.readouterr().out


def test_tla2tools_other_than_the_pinned_release_fails(tmp_path, monkeypatch, capsys):
    code, out = run(monkeypatch, capsys, jar(tmp_path / "tla.jar", "other build"), jar(tmp_path / "alloy.jar", "a"))
    assert code == 1
    assert "MISMATCH: TLA2TOOLS_JAR must be tla2tools v1.7.4" in out
    assert tool.PINNED_JARS["TLA2TOOLS_JAR"][1] in out


def test_pinned_tla2tools_passes(tmp_path, monkeypatch, capsys):
    tla = jar(tmp_path / "tla.jar", "pinned build")
    pinned = tool.PINNED_JARS["TLA2TOOLS_JAR"]
    monkeypatch.setitem(tool.PINNED_JARS, "TLA2TOOLS_JAR", (pinned[0], digest(tla)))
    code, out = run(monkeypatch, capsys, tla, jar(tmp_path / "alloy.jar", "a"))
    assert code == 0
    assert "MISMATCH" not in out
