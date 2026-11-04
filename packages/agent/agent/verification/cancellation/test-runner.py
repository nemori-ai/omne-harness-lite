"""Check the evidence classifier without starting TLC."""

import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("cancellation_runner", ROOT / "run-models.py")
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class EvidenceJudgment(unittest.TestCase):
    def test_positive_requires_completed_search(self):
        completed = "Model checking completed. No error has been found."
        self.assertTrue(RUNNER.judge("valid-mixed", 0, completed))
        self.assertFalse(RUNNER.judge("valid-mixed", 0, ""))
        self.assertFalse(RUNNER.judge("valid-mixed", 12, completed))

    def test_safety_requires_named_invariant_and_trace(self):
        violation = "Invariant NoDispatchAfterConfirmation is violated."
        trace = violation + "\nThe behavior up to this point is:"
        self.assertTrue(RUNNER.judge("bad-model-fence", 12, trace))
        self.assertFalse(RUNNER.judge("bad-model-fence", 12, violation))
        self.assertFalse(RUNNER.judge("bad-interrupt", 12, trace))
        self.assertFalse(RUNNER.judge("bad-model-fence", 75, trace))

    def test_temporal_requires_tlc_counterexample(self):
        violation = "Temporal properties were violated."
        trace = violation + "\nThe following behavior constitutes a counter-example:"
        self.assertTrue(RUNNER.judge("bad-finish", 13, trace))
        self.assertFalse(RUNNER.judge("bad-finish", 13, violation))
        self.assertFalse(RUNNER.judge("bad-finish", 1, trace))
        self.assertFalse(RUNNER.judge("bad-finish", 13, trace, timed_out=True))

    def test_every_configuration_has_an_expectation(self):
        self.assertEqual(set(RUNNER.CASES), {path.stem for path in ROOT.glob("*.cfg")})

    def test_temporal_config_rejects_wrong_or_multiple_properties(self):
        RUNNER.validate_config("bad-finish", "PROPERTY EventualTermination\n")
        for config in ["PROPERTY EventualReception\n",
                       "PROPERTY EventualTermination\nPROPERTY EventualReception\n",
                       "PROPERTIES EventualTermination EventualReception\n", ""]:
            with self.subTest(config=config), self.assertRaises(ValueError):
                RUNNER.validate_config("bad-finish", config)

    def test_temporal_counterexample_has_one_possible_property(self):
        for case, (kind, name) in RUNNER.CASES.items():
            if kind != "temporal":
                continue
            with self.subTest(case=case):
                config = (ROOT / f"{case}.cfg").read_text(encoding="utf-8")
                self.assertEqual(config.count("PROPERTY "), 1)
                self.assertIn(f"PROPERTY {name}\n", config)
                self.assertNotIn("PROPERTIES", config)


if __name__ == "__main__":
    unittest.main()
