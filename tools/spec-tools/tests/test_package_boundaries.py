import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from omne_harness_lite_spec_tools.doc_support import repository_root


def test_discovery_uses_inspected_checkout(tmp_path):
    (tmp_path / "spec").mkdir()
    (tmp_path / "docs").mkdir()
    (tmp_path / "spec/catalog.json").write_text('{}')
    nested = tmp_path / "packages/member"
    nested.mkdir(parents=True)
    assert repository_root(nested) == tmp_path


def test_discovery_does_not_fall_back_to_installed_package():
    # The repository test runner places tmp_path inside the checkout.
    with TemporaryDirectory(prefix="omne-spec-discovery-") as directory:
        with pytest.raises(ValueError, match="--root"):
            repository_root(Path(directory))


def test_package_import_and_cli_help_work_outside_checkout():
    with TemporaryDirectory(prefix="omne-spec-cli-") as directory:
        for module in ("check_docs", "check_specs", "evaluate_developer_model"):
            result = subprocess.run(
                [sys.executable, "-m", f"omne_harness_lite_spec_tools.{module}", "--help"],
                cwd=directory, capture_output=True, text=True,
            )
            assert result.returncode == 0, result.stderr
            assert "--root" in result.stdout
