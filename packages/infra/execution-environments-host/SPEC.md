# Environment provider retirement

The registry retains each original provider until its retire operation reports drained.
A pending report does not confirm that the provider stopped. A failed registry close preserves the original retirement obligation for explicit retry.

The managedEnvironmentRegistry binding registers safe work before setup and retains its original close control in the row port.
It uses startRetainedAssemblyWork from assembly-lifecycle. A failed or pending original close keeps the managed row pending.
The ordinary lifetime cannot close preceding dependencies until the same registry close succeeds.
The assembly owner can obtain the retained control from closeControl for that row and explicitly retry it.
Service withdrawal does not transfer that responsibility or create a replacement registry.

The standalone registry keeps its direct close result. Its caller must retain the original instance and dependencies after failure.
The adapter does not authorize recovery or determine physical quiescence. Those decisions remain with the actual environment provider.
