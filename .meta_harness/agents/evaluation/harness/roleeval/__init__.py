"""Runner core for the standing role evaluations.

One flow is one role doing one kind of work. A flow's cases and graders live in
``agents/evaluation/suites/<flow>/``; what a run produces goes to a flow directory
outside the tracked tree, in the shape the report builder of the ``claude-api``
skill reads: ``<variant>/results.jsonl``, ``<variant>/errors.jsonl`` and
``<variant>/traces/<case>_rep<k>.json``.
"""
