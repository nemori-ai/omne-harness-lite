# Internal design

## Storage ownership

`al_domain` binds the database records to one tenant domain and stores the owner sequence. `al_assets` stores the latest pointer and optimistic revision. `al_versions` stores immutable body and declaration records. `al_holdings` stores the holding identity, selected version policy, lifecycle, source order, grants and revision.

Keys include the domain scope and asset or holding identity. A partial unique index prevents two held capabilities with the same category and name. Removed holdings remain addressable but leave that active index. Settings assignment tables remain owned by Settings.

The [mutation module](../src/mutations.ts) performs every state transition inside the SQL participant transaction. It increments the durable owner sequence only for a change. The [projection module](../src/projection.ts) reads those same records during guard or capture execution. There is no separate authority cache between validation and commit.

## Publication boundary

The public owner verifies the `PinnedBody` through `projectAssetSettings`. The category's `settings` function derives the declaration from that fixed body. Publication sends bounded serializable data to the Worker. Runtime category objects never become SQL command DTOs.

The Worker validates schemas, declaration semantics and the server digest before storing the version. Subsequent reads validate persisted records and their domain bindings. Publication of an existing version compares the complete immutable record, excluding its original owner sequence number.

The owner capability and raw SQL storage are trusted deployment interfaces. The Worker does not establish an independent identity grant for a caller that already holds these interfaces. Tenant-facing composition must verify Identity qualification before supplying commands or consuming projections.

## Current asset read

The snapshot handler checks the configured domain row, then reads `al_assets` by its primary key. It returns the native publication revision and current version pointer. An initialized but empty domain can report absence. It does not scan holdings or infer publication revision from the domain owner sequence. The caller must still pass the observed revision to `publish`; the original mutation rejects a stale revision.

## Recovery and failure

The SQL operation identity uses the domain and a digest of `operationId`. Mutation receipts contain the exact command binding and result. The result mapper verifies both before exposing success. Duplicate requests therefore return the original outcome even when the caller lost the first reply.

Conflict replies roll back owner changes and remain queryable through the SQL receipt protocol. Worker failures, malformed receipts and missing observations cannot produce mutation success. Read handler failures return `unavailable`.

The provider keeps a set of accepted calls. Closing stops admission and drains this set. It does not close the shared SQL provider.

## Composition

The material descriptor declares `settings.assets-projection` and `assets.current-publication`. The package supplies no write guard. A consumer reads the asset projection fact in its own combination.

The schema and fact keys come from the public `@omne-harness/settings-local` entry. The package imports no private Settings module. A capture command publishes only projection data and does not write settings or establish new rights.
