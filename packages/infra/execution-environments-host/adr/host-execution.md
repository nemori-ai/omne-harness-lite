# Host execution mechanism

Status: adopted mechanism for the Linux host provider. The public interfaces and [SPEC](../SPEC.md) own its behavior.

## Process ownership

The provider uses a systemd user scope for each original command or persistent terminal. The gate enters that scope before it reports ready. The parent sends GO only after original permission is confirmed. KillMode covers the whole control group. A PID alone does not authorize recovery.

The durable adapter stores the original boot, unit, creator identity, and resource key before native preparation. The gate records entry in the user runtime directory. Creator death alone cannot exclude a late original launcher. An absent unit requires original entry evidence or a changed boot before recovery confirms stop.

Persistent terminals use one real Bash process and separate output sinks for each leg. A completion marker, both output EOFs, and absence of residual command processes are necessary for leg completion. The next leg also requires the durable completion and original call stop receipts. The terminal belongs to the adopted environment, not to its creator call.

## Filesystem publication

The provider serializes its file mutations. This simple queue avoids internal competing publication without a lock service. It does not exclude external processes. Versions identify observed metadata, not filesystem compare-and-swap.

A batch records its original manifest before stage creation. It prepares every target before publication. It records each publication separately. Interrupted publication remains unknown and retains its manifest. Recognition reads targets and original receipts. It does not replay or roll back targets.

Cleanup requires the original stage device, inode, and birth time. Matching bytes alone cannot establish cleanup ownership. Physical stop, temporary cleanup, and confirmed business publication remain separate obligations.

## Reconsideration signals

Reconsider this mechanism when a supported platform lacks systemd user scopes, a manager change invalidates entry or stop evidence, or the workload needs stronger external filesystem isolation. Reconsider the single mutation queue only when measured contention warrants another mechanism that preserves the same ownership and failure commitments. A sandbox provider must implement the same public facilities with its own isolation boundary.
