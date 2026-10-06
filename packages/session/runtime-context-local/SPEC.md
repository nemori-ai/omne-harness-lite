# Local context observation

The public behavior belongs to core/runtime-context/SPEC.md. This page states the local owner's additional obligations; it does not introduce another public contract or accept a product story.

The journal uses the same owned-event classification for replay and public history inspection. A record that claims to be a context event but has an invalid envelope or unsupported codec makes the context unavailable. Unrelated records do not change the context projection. Unknown append receipts retain the original event until its presence can be established. Read and write jobs retain the original journal dependency through drain.

A reader resolves persisted values against one decoded journal prefix. It validates selected registration/content facts again after source reads. In-flight watches reject participating local writes and source hints, including a registration admitted while the final authority read is pending. The Cordis assembly has one local context mutation owner for that journal; independent writers must not bypass its mutation boundary. The snapshot does not promise an atomic transaction with an external authorization store or external source.

Source qualification is removed before its read/invalidate jobs drain. Late values cannot be adopted after removal. A new same-named contribution has another generation and does not inherit the old contribution's work. Reader cursors retain only visible projections, values and generation strings in a WeakMap; the owner does not keep a strong history table or source callbacks through a cursor.

This implementation still replays the durable prefix for observation. It does not deliver the later increment's persistent current projection or O(1) requirement.
