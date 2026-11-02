# Windows command execution

The internal entry is `createWindowsHostCommands` in `src/windows-execution/index.ts`. It returns the same command manager shape as `createHostCommands`. It accepts that manager's input without the Linux prerequisite probe and callback. Provider integration remains outside this module.

The module requires 64-bit Windows and the installed .NET Framework 4 compiler. It compiles the bundled C# source with `%SystemRoot%/Microsoft.NET/Framework64/v4.0.30319/csc.exe`. It installs no SDK or native package. Compiled binaries are cached under the system temporary directory, in `omne-windows-execution/<source SHA-256>/bridge.exe`. Temporary compiler inputs are removed after compilation. A missing compiler or failed compilation returns `unavailable` before a resource is planned.

Each command has a separate native bridge and a randomly named Job Object. The bridge starts detached from Node's child-process lifetime. A controller exit therefore leaves the original Job available for recovery. The bridge holds OS resources. The TypeScript manager owns ledger calls and output accounting.

The manager records a resource plan before native allocation. The bridge creates the requested process suspended, assigns it to the Job and reports readiness. The manager sends `GO` only after a confirmed ledger permit. User processes cannot use Job breakaway. The executable, arguments, explicit environment and input travel through private pipes. They do not appear on the bridge command line. The private control frame has a 2 MiB limit. Larger requests return `capacity` before allocation.

Output bytes come directly from Windows pipe reads. The shared command buffer supplies offsets, discard counts and the single-reader rule. The configured chunk and buffer limits apply. A natural root-process exit also stops any remaining Job members. A successful outcome requires the original process exit code, zero active Job members and both output readers to reach EOF. A lost observation produces `effectUnknown`.

Forced stop calls `TerminateJobObject`. Confirmation requires zero active processes in the original Job and a signaled original process handle. A ledger recording failure keeps the resource in `unconfirmed()` even when native stop was confirmed. Windows has no general graceful termination operation for these non-console commands. A graceful request returns `unconfirmed` and retains responsibility.

`stopWindowsResource(resource, boundMs)` reopens the original named Job. It does not start the command again. It confirms zero active members before notifying the orphaned bridge to release its handles. A missing name returns `unconfirmed`. The caller must preserve that uncertainty if the confirmation is lost before durable recording.

Persistent `TerminalFacility` and command `outputMode: 'terminal'` are not implemented by this module. Terminal requests return `unsupported`. ConPTY can provide raw console bytes, but a completed PowerShell Runspace invocation does not close its output writers. A script can create an in-process thread that writes to `CONOUT$` after the invocation reaches `Completed`. Job process accounting cannot distinguish that thread from the persistent shell. Completion needs an independently enforced writer boundary and an output drain acknowledgement. The provider must not advertise terminal support until both are implemented and verified.

The [Windows tests](../tests/windows-execution/) run real executables and Jobs. They cover permit denial, raw output, buffer bounds, separate Jobs, ledger failure, missing executables and recovery after controller exit. These tests do not establish provider assembly, tenant authorization or persistent terminal behavior.
