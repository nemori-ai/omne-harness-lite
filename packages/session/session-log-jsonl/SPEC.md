# JSONL Session Log provider behavior

Adoption: PR3 implementation authorized on 2026-10-06. This page carries the existing physical-owner, configuration and diagnostic commitments through the package-template migration. Public append, fence, tail, dedupe and lossless-value semantics remain owned by core/session-log. This migration does not accept a product story or redefine that protocol.

JL-1 The standalone owner persists one batch per JSONL line and validates recovered prefixes before using their state. An invalid or unconfirmed prefix does not become an empty log. Recovery retains the existing process-exit and legacy-exit rules. The owner does not interpret domain payloads.

JL-2 The Cordis Config contains only an absolute directory and optional positive-integer queue/resident limits. Live process-ownership and diagnostic inputs belong to the trusted factory. They do not become serialized configuration or business service methods. Root functions do not import Cordis.

JL-3 The provider publishes the core SessionLogService ABC. Its owning effect closes the same physical owner. Service withdrawal stops new work on old references. Close waits for admitted file work before lock transfer. A failed close must not establish resource release; a resolved Cordis disposal alone does not prove physical close succeeded. Applications that need a physical close gate retain the standalone owner and use its close outcome.

JL-4 A diagnostic sink failure cannot replace a business result or prevent physical cleanup. Diagnostics contain bounded operation data, not payload content, process credentials or raw file paths.

JL-5 In a recovered resident log, a read after the current tail selects no history rows. A nonempty suffix uses the ordered batch range to locate its first row and reads only selected batches. Cold validation, eviction/reopening, output size and read-by-key costs are separate obligations; this provider does not promise constant cost for those operations.

Verification belongs to member tests. The delivery retains actual file-IO, Cordis, cutpoint and cost outputs. A template marker establishes structural adoption only.
