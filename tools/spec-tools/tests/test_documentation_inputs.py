import pytest

from omne_harness_lite_spec_tools.documentation_inputs import Inputs


def test_binary_input_freezes_bytes(tmp_path):
    (tmp_path / "image.png").write_bytes(b"\x89PNG\xff")
    inputs = Inputs(tmp_path)
    assert inputs.read_bytes("image.png") == b"\x89PNG\xff"
    inputs.verify()
    with pytest.raises(UnicodeDecodeError):
        inputs.read("image.png")


def test_same_bytes_retargeted_alias_fails(tmp_path):
    for name in ("a", "b"):
        (tmp_path / name).write_bytes(b"same")
    alias = tmp_path / "alias"
    alias.symlink_to(tmp_path / "a")
    inputs = Inputs(tmp_path)
    inputs.read_bytes("alias")
    alias.unlink()
    alias.symlink_to(tmp_path / "b")
    with pytest.raises(ValueError, match="actual path"):
        inputs.verify()


def test_missing_input_becoming_present_fails(tmp_path):
    inputs = Inputs(tmp_path)
    assert inputs.read_bytes("missing") is None
    (tmp_path / "missing").write_bytes(b"new")
    with pytest.raises(ValueError, match="changed"):
        inputs.verify()


def test_template_navigation_does_not_weaken_registered_path_rules(tmp_path):
    target = tmp_path / ".templates/template.md"
    target.parent.mkdir()
    target.write_text("# Template\n")
    inputs = Inputs(tmp_path)
    assert inputs.read_bytes(".templates/template.md", navigation=True)
    inputs.verify()
    with pytest.raises(ValueError, match="invalid inventory"):
        inputs.read(".templates/template.md")
