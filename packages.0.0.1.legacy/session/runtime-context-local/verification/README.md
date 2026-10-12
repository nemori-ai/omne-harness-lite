# Runtime Context provider verification

The models check persistent prefix/projection alignment, concrete read progress and watch guards, original unknown journal receipts, and dependency retention through close. They use bounded state spaces and explicit storage/fairness assumptions. They do not prove this implementation correct.

Run `tlc -workers 1 -config verification/models/ProjectionRecovery.cfg verification/models/ProjectionRecovery.tla` from this member. ContextLifetime.cfg and JournalReceipt.cfg select the other safety checks. The PR3 task runner derives one-guard negative controls and conditional progress configurations. Projection progress uses MaxEvents=2, safety uses 3. The accepted core Observation model remains in core/runtime-context/verification/models.

CaptureRead assumes one Storage.read snapshot (storage protocol P-6). SQL writes are atomic model actions. Unknown SQL content recognition, operation-level applied, tenant checks and actual storage/Cordis behavior require real tests. The implementation delivery owns those tests and run records. Raw output stays with delivery evidence, not in this source directory.
