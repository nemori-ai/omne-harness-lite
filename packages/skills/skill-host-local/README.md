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

| Situation                                                                                                            | `snapshot`          | `open`              |
| -------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------- |
| A `content-store` locator                                                                                            | `package-not-found` | `package-not-found` |
| The root is absent or is not a directory (`ENOENT`, `ENOTDIR`)                                                       | `package-not-found` | `package-not-found` |
| The root resolves to the file system root `/`                                                                        | `package-not-found` | `package-not-found` |
| The root cannot be read (`EACCES`, `EIO`, other codes)                                                               | `unavailable`       | `unavailable`       |
| An entry is a device, a pipe or a socket                                                                             | `entry-unreadable`  | —                   |
| A link dangles or forms a cycle (`ENOENT`, `ELOOP`), or points to the root or to a directory above it in the package | `entry-unreadable`  | —                   |
| A link or the object it resolves to cannot be read (`EACCES`, `EPERM`, `EIO`, `ENOTDIR`)                             | `entry-unreadable`  | —                   |
| A file or a directory inside the package cannot be read (`EACCES`, `EPERM`, `EIO`)                                   | `entry-unreadable`  | —                   |
| A file name gives no legal package path, or the seam lists one name twice                                            | `entry-unreadable`  | —                   |
| A listed file vanished before the source read it (`ENOENT`)                                                          | `unavailable`       | —                   |
| A link resolves outside the resolved root                                                                            | `outside-package`   | —                   |
| The path is absent, is below a file, or is a directory (`ENOENT`, `ENOTDIR`, `EISDIR`)                               | —                   | `entry-not-found`   |
| The path resolves outside the resolved root                                                                          | —                   | `outside-package`   |
| The file cannot be read (`EACCES`, `EPERM`, `EIO`, a pipe)                                                           | —                   | `unavailable`       |

More rules:

- When the root is a link, the source uses the directory that it points to as the root. The root name is the last segment of that directory.
- A path is inside the root when it equals the root or when its segments start with the segments of the root. The source compares whole segments, not string prefixes.
- Hidden files and the `.omne` directory are ordinary content. Directories, empty ones included, are not entries.
- The source walks each directory in UTF-16 code unit order of the names and stops at the first failure. A package with two faults always gives the same answer.
- `open` reads the bytes that are there now. It does not use the `digest` argument, because this source does not keep bytes by digest. The caller compares the bytes with the entry digest. When a file changes after the snapshot, `open` gives the new bytes.

[SPEC.md](SPEC.md) owns the other rules of this behavior.

## Contracts

The public types in `src/` own the data shapes. The port requirements belong to the [demand ports of the Skill contract](../skill-contract/SPEC.md#ports). [SPEC.md](SPEC.md) owns the behavior of this source beyond the port, and the section [Behavior](#behavior) above owns the failure mapping. [docs/public-api.md](docs/public-api.md) indexes the public definitions. The source holds no resources between calls, so there is nothing to dispose of.

## Design

Three modules do the work. `fs.ts` gives the file system seam and its default over `node:fs/promises`. `walk.ts` reads the root, walks the directories, resolves links, makes the inside-the-root decision, and classifies every refusal. `directory-source.ts` connects the walk to `sealSnapshot` and to the two port operations. See [docs/architecture.md](docs/architecture.md).

## Configuration and operation

The only option is `fs`, the file system seam. The default reads the real file system. The source reads only. It has no state, so a process restart does not change an answer. A snapshot is not atomic: when another writer changes the directory during the walk, the snapshot can mix old and new contents. The caller detects a later change by the entry digests. The source does not limit file size, entry count, or the size of a directory link expansion.

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
