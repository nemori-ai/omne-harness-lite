"""Small exhaustive illustration, not a proof of real provider/tokenizer behavior."""
from itertools import product
import json

checked = 0
for actual_prefix, old_prediction_error, phi, delta, phi_error, delta_error in product(
    range(5), range(-2, 3), range(4), range(4), range(-1, 2), range(-1, 2)
):
    old_prediction = actual_prefix + old_prediction_error
    observed_input = actual_prefix  # successful calibration replaces prediction
    predicted = observed_input + phi + phi_error + delta + delta_error
    actual = actual_prefix + phi + delta
    assert predicted - actual == phi_error + delta_error
    checked += 1

allocations = [(x, 40 - x) for x in range(41)]
assert (10, 30) in allocations and (20, 20) in allocations
# Two worlds with the same observed old input cannot be admitted safely by
# a rule looking only at old usage, unless it rejects both regardless of delta.
window, observed_input, reserve = 100, 60, 10
safe = observed_input + 1 + reserve <= window
unsafe = observed_input + 41 + reserve > window
assert safe and unsafe
print(json.dumps({"finite_error_reset_cases": checked,
                  "aggregate_40_indistinguishable_nonnegative_allocations": len(allocations),
                  "same_old_input_safe_and_unsafe_new_input": [1, 41],
                  "scope": "Toy arithmetic only; no model requests; not TLA verification."}))
