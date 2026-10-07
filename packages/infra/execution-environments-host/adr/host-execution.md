# Host execution mechanism

Status: adopted mechanism for the Linux host provider. The public interfaces and [SPEC](../SPEC.md) own its behavior.

## Process ownership

The provider uses a systemd user scope for each original command or persistent terminal. The gate enters that scope before it reports ready. The parent sends GO only after original permission is confirmed. KillMode covers the whole control group. A PID alone does not authorize recovery.

The durable adapter stores the original boot, unit, creator identity, and resource key before native preparation. The gate records entry in the user runtime directory. Creator death alone cannot exclude a late original launcher. An absent unit requires original entry evidence or a changed boot before recovery confirms stop.

Official node-pty 1.1.0 supplies the PTY mechanism. One-off targets use a trusted Node spawn launcher with inherited PTY descriptors. This preserves literal argv and executable lookup without a shell intermediary or a second user pipe backend. Optional stdin is an owned byte file with EOF. The target close receipt and inactive original scope establish completion; the launcher exit alone does not.

Persistent terminals use one real Bash process in the PTY. GNU env restores the literal TERM value before it execs Bash. This preserves an explicitly empty value that node-pty would replace with xterm. A quiet controller sources each owned script and emits a private receipt for that leg. User stdout and stderr remain merged. The narrow parser handles only the current receipt, not general ANSI. Actual shell state persists. Waiting for Bash jobs, checking residual scope processes, and observing the receipt boundary are necessary for leg completion. The next leg also requires the durable completion and original call stop receipts. The terminal belongs to the adopted environment, not to its creator call.

## Filesystem publication

The provider serializes its file mutations. This simple queue avoids internal competing publication without a lock service. It does not exclude external processes. Versions identify observed metadata, not filesystem compare-and-swap.

A batch records its original manifest before stage creation. It prepares every target before publication. It records each publication separately. Interrupted publication remains unknown and retains its manifest. Recognition reads targets and original receipts. It does not replay or roll back targets.

Cleanup requires the original stage device, inode, and birth time. Matching bytes alone cannot establish cleanup ownership. Physical stop, temporary cleanup, and confirmed business publication remain separate obligations.

## Reconsideration signals

Reconsider this mechanism when a workload requires separate stdout/stderr, live input or resize, when PTY transport faults exceed its bounded exit-drain assumptions, when a supported platform lacks systemd user scopes, a manager change invalidates entry or stop evidence, or the workload needs stronger external filesystem isolation. Reconsider the single mutation queue only when measured contention warrants another mechanism that preserves the same ownership and failure commitments. A sandbox provider must implement the same public facilities with its own isolation boundary.

## Stage disposal assurance

POSIX unlink operates on a path. It does not compare a requested inode identity atomically. The provider checks the original stage identity and preserves every replacement it observes. Cleanup requires no external rebinding of that stage entry or its resolving parent paths between the final check and unlink. This premise includes accidental external changes. Reserved stage names do not provide OS isolation.

A rename into a quarantine path would add movement and crash-recovery obligations. It would still leave a final pathname race under the same UID. This provider does not add that mechanism or claim atomic identity deletion. Target recognition remains read-only. Target publication retains its separately stated external check window.
