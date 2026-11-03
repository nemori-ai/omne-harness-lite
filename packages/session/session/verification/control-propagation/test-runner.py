"""Check the evidence classifier without starting TLC."""

import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("control_propagation_runner", ROOT / "run-models.py")
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class EvidenceJudgment(unittest.TestCase):
    def test_positive_requires_completed_search(self):
        completed = "Model checking completed. No error has been found."
        self.assertTrue(RUNNER.judge("valid-cancel-run", 0, completed))
        self.assertFalse(RUNNER.judge("valid-cancel-run", 0, ""))
        self.assertFalse(RUNNER.judge("valid-cancel-run", 12, completed))

    def test_safety_requires_named_invariant_and_trace(self):
        violation = "Invariant TargetSafe is violated."
        trace = violation + "\nThe behavior up to this point is:"
        self.assertTrue(RUNNER.judge("bad-association", 12, trace))
        self.assertFalse(RUNNER.judge("bad-association", 12, violation))
        self.assertFalse(RUNNER.judge("bad-skip-query", 12, trace))
        self.assertFalse(RUNNER.judge("bad-association", 75, trace))

    def test_temporal_requires_tlc_counterexample(self):
        violation = "Temporal properties were violated."
        trace = violation + "\nThe following behavior constitutes a counter-example:"
        self.assertTrue(RUNNER.judge("bad-serial-outbound", 13, trace))
        self.assertFalse(RUNNER.judge("bad-serial-outbound", 13, violation))
        self.assertFalse(RUNNER.judge("bad-serial-outbound", 1, trace))
        self.assertFalse(RUNNER.judge("bad-serial-outbound", 13, trace, timed_out=True))

    def test_every_configuration_has_an_expectation(self):
        self.assertEqual(set(RUNNER.CASES), {path.stem for path in ROOT.glob("*.cfg")})

    def test_temporal_config_rejects_wrong_or_multiple_properties(self):
        RUNNER.validate_config("bad-serial-outbound", "PROPERTY SuccessorProgress\n")
        for config in ["PROPERTY CloseProgress\n",
                       "PROPERTY SuccessorProgress\nPROPERTY CloseProgress\n",
                       "PROPERTIES SuccessorProgress CloseProgress\n", ""]:
            with self.subTest(config=config), self.assertRaises(ValueError):
                RUNNER.validate_config("bad-serial-outbound", config)

    def test_temporal_counterexample_has_one_possible_property(self):
        for case, (kind, name) in RUNNER.CASES.items():
            if kind != "temporal":
                continue
            with self.subTest(case=case):
                config = (ROOT / f"{case}.cfg").read_text(encoding="utf-8")
                self.assertEqual(config.count("PROPERTY "), 1)
                self.assertIn(f"PROPERTY {name}\n", config)
                self.assertNotIn("PROPERTIES", config)

    def test_bug_switches_match_the_module(self):
        module = (ROOT / "ControlPropagation.tla").read_text(encoding="utf-8")
        for case, (kind, _) in RUNNER.CASES.items():
            if kind == "positive":
                continue
            config = (ROOT / f"{case}.cfg").read_text(encoding="utf-8")
            bug = config.split('Bugs = {"', 1)[1].split('"', 1)[0]
            with self.subTest(case=case, bug=bug):
                self.assertIn(f'"{bug}"', module)


if __name__ == "__main__":
    unittest.main()
