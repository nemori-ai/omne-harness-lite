# Application member checker evidence

This record covers the package-checker distinction between reusable/distributable
members and a private application used only as a build/test workspace carrier. It
does not establish that `local-harness` is executable or that its product behavior
is complete.

## Inputs and environment

- Source parent: `b4d232df3edbc77aa110853aefbc4e0291f73701` on
  `fix/dsh-p1-app-checker`; the checker, tests, and this record are delivered in the
  same subsequent commit.
- Rules consumed: [workspace ownership](../../../../docs/maintenance/workspace.md),
  [verification scope](../../../../docs/maintenance/verification.md),
  [application boundary](../../../../apps/AGENTS.md), and the
  [package-checker contract](../../README.md).
- Node `v24.18.0`; pnpm `10.28.1`; TypeScript is the locked workspace dependency.
- Native fixture compiler: GCC/G++ `10.5.0` from
  `/data/qiwei/repos/omne-harness-lite/.worktrees/dsh-core-adoption/tmp/p0-lock-probe/gcc10-root`.
  `CC` and `CXX` selected its `usr/bin/gcc-10` and `usr/bin/g++-10`;
  `GCC_EXEC_PREFIX` selected its `usr/lib/gcc/`.
- Dependency preparation was `pnpm install --offline --frozen-lockfile
  --ignore-scripts`. No lockfile, dependency declaration, product source, external
  service, or model was changed or invoked.

## Acceptance mapping

| Acceptance observation | Executable evidence |
|---|---|
| A private app containing only `package.json` and `tests/` can depend on a real public product-package fixture without invented source, exports, provenance, or distribution | `checks a private test-only application carrier without requiring library artifacts` runs the complete repository checker, observes both members, and observes only the product package in isolated artifact consumption |
| Existing app source/test and dependency boundaries remain enforced | Injected `src` and `tests` sibling-source penetration cases are rejected; an undeclared public test import is rejected |
| Reusable packages cannot point back to apps; unsupported binaries do not silently pass | The package-to-app closure case is rejected and an app `bin` declaration reports `unsupported application bin` |
| Distributable members retain provenance, exports, pack, strict declaration, runtime, and native isolation checks | The pre-existing public-app tarball fixture passes; the complete suite passes 21 tests with zero skips, including the no-op native rebuild rejection and shared-addon/transitive-consumer fixture |
| The real inventory reaches the carrier classification | The real checker reports the carrier and five declared product dependencies before a separate admission-package distribution failure described below |

## RED

The first new end-to-end fixture was run before checker implementation:

```text
$ node --test --test-name-pattern='checks a private test-only application carrier' tools/package-checks/tests/boundaries.test.mjs
✖ checks a private test-only application carrier without requiring library artifacts
ℹ tests 1
ℹ pass 0
ℹ fail 1
Error: ENOENT: no such file or directory, open '.../apps/local-harness/provenance.json'
exit 1
```

After adding all assigned negative measurements, the pre-implementation run reported
six failures: the five application cases were intercepted by the same provenance
ENOENT, while the reusable-package-to-application closure reported `Missing expected
exception`.

```text
ℹ tests 6
ℹ pass 0
ℹ fail 6
ℹ skipped 0
exit 1
```

## GREEN

The focused post-implementation command was:

```text
$ node --test --test-name-pattern='private test-only application carrier|application (src|tests) imports|undeclared application test|application binaries|reusable package dependencies' tools/package-checks/tests/boundaries.test.mjs
ℹ tests 6
ℹ pass 6
ℹ fail 0
ℹ skipped 0
exit 0
```

The complete package-checker suite used the explicit native compiler environment:

```text
$ COMPILER_ROOT=.../gcc10-root; CC="$COMPILER_ROOT/usr/bin/gcc-10" CXX="$COMPILER_ROOT/usr/bin/g++-10" GCC_EXEC_PREFIX="$COMPILER_ROOT/usr/lib/gcc/" pnpm --filter @omne-harness-lite/package-checks test
✔ checks project-owned packages and apps through independent tarball consumers with sanitized Node resolution
✔ rejects a no-op native rebuild that exits zero without producing a loadable fs-ext addon
✔ loads one shared addon for multiple direct native owners and a transitive consumer
ℹ tests 21
ℹ pass 21
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 65300.052823
exit 0
```

The workspace build ran after the frozen, offline install:

```text
$ pnpm run build
Scope: 19 of 21 workspace projects
apps/local-harness build$ tsc -p tsconfig.json
exit 0
```

The real repository checker reached and passed the application-carrier phase:

```text
$ COMPILER_ROOT=.../gcc10-root; CC="$COMPILER_ROOT/usr/bin/gcc-10" CXX="$COMPILER_ROOT/usr/bin/g++-10" GCC_EXEC_PREFIX="$COMPILER_ROOT/usr/lib/gcc/" pnpm --filter @omne-harness-lite/package-checks check
PASS: checked private application carrier local-harness, 5 declared product dependency(s)
PASS: 19 product members, dependency boundaries, 94 upstream source records
Failed artifact evidence retained: /tmp/omne-package-artifacts-TY4qTP
AssertionError: artifact contains non-distribution file: evidence/provider/artifact.txt
exit 1
```

Read-only inspection identified the later failure as
`@omne-harness-lite/admission`: its manifest includes `evidence` in `files`, and its
tarball contains `package/evidence/provider/artifact.txt`. That product-package
distribution choice is outside this task's write scope. The real run therefore proves
that `local-harness` is discovered and checked under the carrier rules, but it is not
a successful whole-repository artifact run.

Formatting and diff hygiene:

```text
$ pnpm format:check -- tools/package-checks/src/boundaries.mjs tools/package-checks/src/check.mjs tools/package-checks/tests/boundaries.test.mjs
All matched files use Prettier code style!
exit 0

$ git diff --check
exit 0
```

These are implementation tests and real local artifact checks. No finite model or
machine proof was run, and no result here is an unconditional proof of application or
package correctness.
