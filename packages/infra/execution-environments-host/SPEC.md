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

## Placement and lease adoption

The registry admits one trusted placement source per owner. Its caller fiber owns the contribution. Withdrawal immediately rejects new reads and new effects. The source disposer waits for callbacks already admitted to that exact contribution; replacement does not adopt those callbacks.

An acquisition owns its input data and original resource callbacks before the first authority wait. Discovery uses a snapshot of the registered providers, or only the original owner named by an explicit reference. The strategy receives the complete matching set from that snapshot. Candidate selection checks binding ownership and all requested facilities before consulting the source strategy. It must not choose by provider registration order. Duplicate references from one provider reject its discovery result. Withdrawal during selection rejects acquisition of that original entry. A replacement with the same name cannot inherit the pending selection.

Provider success is provisional. Before delivery, the registry checks current access, the original source, and the selected description. Failure releases that exact lease; it does not acquire another instance. Each new command or file operation checks current authority for the original adopted instance. Existing process observation and stop controls remain with the original provider after access withdrawal.

The built-in host currently advertises no command or file facility. Protocol fixtures do not establish an OS backend, sandbox isolation, or physical resource recovery.
