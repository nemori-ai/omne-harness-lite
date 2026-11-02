"""Check the evidence classifier without starting TLC."""

import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("candidate_cache_runner", ROOT / "run-models.py")
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class EvidenceJudgment(unittest.TestCase):
    def test_positive_requires_completed_search(self):
        completed = "Model checking completed. No error has been found."
        self.assertTrue(RUNNER.judge("valid-cache", 0, completed))
        self.assertFalse(RUNNER.judge("valid-cache", 0, ""))
        self.assertFalse(RUNNER.judge("valid-cache", 12, completed))
        self.assertFalse(RUNNER.judge("valid-cache", 0, completed, timed_out=True))

    def test_safety_requires_named_invariant_and_trace(self):
        violation = "Invariant Equivalence is violated."
        trace = violation + "\nThe behavior up to this point is:"
        self.assertTrue(RUNNER.judge("bad-gap", 12, trace))
        self.assertFalse(RUNNER.judge("bad-gap", 12, violation))
        self.assertFalse(RUNNER.judge("bad-auth-hit", 12, trace))
        self.assertFalse(RUNNER.judge("bad-gap", 75, trace))

    def test_every_configuration_has_an_expectation(self):
        self.assertEqual(set(RUNNER.CASES), {path.stem for path in ROOT.glob("*.cfg")})

    def test_each_negative_config_names_its_invariant(self):
        for case, (kind, name) in RUNNER.CASES.items():
            with self.subTest(case=case):
                config = (ROOT / f"{case}.cfg").read_text(encoding="utf-8")
                RUNNER.validate_config(case, config)
                if kind == "invariant":
                    self.assertIn(f"INVARIANT {name}\n", config)
                    self.assertNotIn("INVARIANTS", config)
                    self.assertEqual(config.count("Bugs = {\""), 1)
                else:
                    self.assertIn("Bugs = {}\n", config)

    def test_validate_config_rejects_wrong_or_multiple_invariants(self):
        RUNNER.validate_config("bad-gap", "INVARIANT Equivalence\n")
        for config in ["INVARIANT Authorized\n", "INVARIANT Equivalence\nINVARIANT Authorized\n",
                       "INVARIANTS\n Equivalence\n", ""]:
            with self.subTest(config=config), self.assertRaises(ValueError):
                RUNNER.validate_config("bad-gap", config)


if __name__ == "__main__":
    unittest.main()
