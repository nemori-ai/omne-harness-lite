# @omne-harness/skill-host-local

[中文](README_ZH.md)

The local Skill host. It gives `createDirectorySource`, a `SkillPackageSource` that reads Skill packages from local directories as they are now.

## Responsibility and status

This member owns one source of Skill package bytes: the directory source. It reads the current contents of a directory and keeps no index and no cache. It answers each file system refusal with one failure of the closed source failure set of `@omne-harness/skill-contract`. It does not parse packages, decide access, or compare bytes with a snapshot. `@omne-harness/skill` does that work.

Status: the behavior is a candidate. It does not have technical acceptance. The source passes the contract suite `skillPackageSourceConformance()` on real temporary directories (PS7 is not applicable). The Cordis plugin part of this member is not in this version.

## Usage

Make a source and give it a directory locator:

```ts
import { createDirectorySource } from '@omne-harness/skill-host-local'

const source = createDirectorySource()
const locator = { kind: 'directory', root: '/path/to/review' } as const
const snapshot = await source.snapshot(locator)
if ('ok' in snapshot)
  for (const entry of snapshot.ok.entries) {
    const bytes = await source.open(locator, snapshot.ok.digest, entry.path)
  }
```

The example [examples/inspect-directory.ts](examples/inspect-directory.ts) takes a snapshot of [examples/sample-skill/](examples/sample-skill/), reads the two control files, and gives them to `parseSkillPackage`. A test can give its own file system seam: `createDirectorySource({ fs })`. The member has no Cordis entry and needs Node.js 24 or later.

## Behavior

The source reads the file system only through the four reads of `DirectoryFs`. It classifies a refusal by the `code` field of the error, not by the message text. A code that the table does not list gives `unavailable`. An error without a string `code` is not a file system answer: `snapshot` or `open` rejects with that error.

| Situation                                                                                                                                | `snapshot`          | `open`              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------- |
| A `content-store` locator                                                                                                                | `package-not-found` | `package-not-found` |
| The root is absent or is not a directory (`ENOENT`, `ENOTDIR`)                                                                           | `package-not-found` | `package-not-found` |
| The root resolves to the file system root `/`, or to a path that is not UTF-8                                                            | `package-not-found` | `package-not-found` |
| The root cannot be read (`EACCES`, `EIO`, other codes)                                                                                   | `unavailable`       | `unavailable`       |
| An entry is a device, a pipe or a socket                                                                                                 | `entry-unreadable`  | —                   |
| A name in a listing, or the resolved path of an entry, is not strict UTF-8                                                               | `entry-unreadable`  | —                   |
| A file name gives no legal package path, or the seam lists one name twice                                                                | `entry-unreadable`  | —                   |
| A link dangles: its target is missing and the link is still there                                                                        | `entry-unreadable`  | —                   |
| A link forms a cycle (`ELOOP`), or points to the root or to a directory above it in the package                                          | `entry-unreadable`  | —                   |
| An entry cannot be resolved, or the kind of what it resolves to cannot be read (`ELOOP`, `ENOTDIR`, `EACCES`, `EPERM`, `EIO`)            | `entry-unreadable`  | —                   |
| A directory cannot be listed or a file cannot be opened (`EACCES`, `EPERM`, `EIO`, `ENXIO`)                                              | `entry-unreadable`  | —                   |
| Another writer replaced a file by a link after the source checked it (`ELOOP` when the source opens it)                                  | `entry-unreadable`  | —                   |
| The source opens a file and finds an object that is not a regular file and not a directory                                               | `entry-unreadable`  | —                   |
| The walk visits more than 65536 names                                                                                                    | `entry-unreadable`  | —                   |
| An entry, a link, or what it resolves to vanished after the listing (`ENOENT`)                                                           | `unavailable`       | —                   |
| The source opens a file and finds a directory, because the tree changed during the walk                                                  | `unavailable`       | —                   |
| An entry resolves outside the resolved root                                                                                              | `outside-package`   | —                   |
| The path is absent or is below a file (`ENOENT`, `ENOTDIR`), is a directory, or resolves to a path that is not UTF-8                     | —                   | `entry-not-found`   |
| The path resolves outside the resolved root                                                                                              | —                   | `outside-package`   |
| The file cannot be opened (`EACCES`, `EPERM`, `EIO`, `ELOOP`, other codes), or it is a pipe or another object that is not a regular file | —                   | `unavailable`       |

More rules:

- When the root is a link, the source uses the directory that it points to as the root. The root name is the last segment of that directory.
- Names are bytes on the file system. The source decodes each name and each resolved path as strict UTF-8. A byte order mark at the start of a name stays in the name.
- Every entry takes the same steps, whatever kind the listing reports. The source resolves the entry and checks that the result is inside the root. Then it reads the kind of the result and walks or reads it.
- A path is inside the root when it equals the root or when its segments start with the segments of the root. The source compares whole segments, not string prefixes.
- The source opens a file without following a final link and without waiting for a writer. When another writer replaces a file by a link after the check, the source refuses the file.
- One walk visits at most 65536 names. The count includes every name of every listing, also when links reach one directory many times. Links without a cycle can multiply the visits: two links per level to the next level give 2^n visits at depth n. The source sets no limit on the total size of the bytes, because the contract reads a whole package into memory; a file that links reach by 2^k paths is read 2^k times within the budget.
- Hidden files and the `.omne` directory are ordinary content. Directories, empty ones included, are not entries.
- The walk is depth first. Inside each directory it takes the names in UTF-16 code unit order and stops at the first failure. A listing with a name that is not UTF-8 fails before the source visits any of its names. A package with two faults always gives the same answer.
- `open` reads the bytes that are there now. It does not use the `digest` argument, because this source does not keep bytes by digest. The caller compares the bytes with the entry digest. When a file changes after the snapshot, `open` gives the new bytes.

The source does not protect a package against a writer that changes the package directory while the source reads it. One window stays open. After the check and before the open, a writer can replace a directory on a resolved path by a link. The open follows that link. Node.js cannot open a path below a directory without following the links on the way. A directory that becomes a link before the source lists it gives only names. The source checks each name against the root before it reads anything.

[SPEC.md](SPEC.md) owns the other rules of this behavior.

## Contracts

The public types in `src/` own the data shapes. The port requirements belong to the [demand ports of the Skill contract](../skill-contract/SPEC.md#ports). [SPEC.md](SPEC.md) owns the behavior of this source beyond the port, and the section [Behavior](#behavior) above owns the failure mapping. [docs/public-api.md](docs/public-api.md) indexes the public definitions. The source holds no resources between calls, so there is nothing to dispose of.

## Design

Three modules do the work. `fs.ts` gives the file system seam and its default over `node:fs/promises`. The seam only reads: it gives names and paths as bytes and reports the kind of each opened object. `walk.ts` reads the root, walks the directories, resolves every entry, makes the inside-the-root decision, counts the visits, and classifies every answer and refusal. `directory-source.ts` connects the walk to `sealSnapshot` and to the two port operations. See [docs/architecture.md](docs/architecture.md).

## Configuration and operation

The only option is `fs`, the file system seam. The default reads the real file system. The source reads only. It has no state, so a process restart does not change an answer. A snapshot is not atomic: when another writer changes the directory during the walk, the snapshot can mix old and new contents. The caller detects a later change by the entry digests. One walk visits at most 65536 names. The source does not limit the size of a file or the total size of the bytes.

## Verification

Run `pnpm run build`, `pnpm run typecheck` and `pnpm test` in this directory. The tests import the package by name, which resolves to `dist`, so build first. The tests use real temporary directories made with `mkdtemp`. The permission tests use an injected seam, because a root process cannot provoke `EACCES` with `chmod`. See [tests/README.md](tests/README.md) and the verification section of [SPEC.md](SPEC.md).

## Maintenance

When the port requirements of `@omne-harness/skill-contract` change, run the conformance suite again and update SPEC.md and the Behavior section. When a failure mapping changes, update the Behavior section in both README files, the permission tests, and the group design [../docs/architecture.md](../docs/architecture.md). The consumer is `@omne-harness/skill`, through the `SkillPackageSource` port.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, behavior, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Key business flows and data flows
├── object-model.md       Internal object model
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Cordis applicability and integration
src/                      Public definitions and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas (none in this member)
verification/             models/ and proofs/ (none in this member)
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources (none in this member)
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. The independent acceptance owners maintain `acceptance/`.
