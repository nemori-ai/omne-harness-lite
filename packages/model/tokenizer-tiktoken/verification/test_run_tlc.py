"""Reject false successes at the model-checker output boundary."""
import unittest
import tempfile
from pathlib import Path
from run_tlc import read_manifest, verdict


class VerdictTests(unittest.TestCase):
    def test_empty_manifest_is_not_success(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory).resolve()
            (source / "expect.txt").write_text("\n")
            with self.assertRaisesRegex(ValueError, "at least one configuration"):
                read_manifest(source)

    def test_positive_requires_success_and_completion(self):
        complete = "Model checking completed. No error has been found."
        self.assertTrue(verdict(0, complete, "pass"))
        self.assertFalse(verdict(124, complete, "pass"))
        self.assertFalse(verdict(0, "Starting model checking", "pass"))

    def test_negative_requires_named_invariant_and_violation_exit(self):
        violation = "Error: Invariant PhysicalCapacity is violated.\n"
        self.assertTrue(verdict(12, violation, "PhysicalCapacity"))
        self.assertFalse(verdict(12, violation, "NoLateSuccess"))
        self.assertFalse(verdict(150, violation, "PhysicalCapacity"))
        self.assertFalse(verdict(12, "Parse error", "PhysicalCapacity"))
        self.assertFalse(verdict(0, violation, "PhysicalCapacity"))


if __name__ == "__main__":
    unittest.main()
