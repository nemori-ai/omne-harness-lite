# pqw-adapter

[中文](README_ZH.md)

This member adapts the closeout readings to omne. It calls the two scripts of pqw `slice-closeout` with the omne members, thresholds and test tiers. It also gives the risk level that the changed paths set. This member is not published.

## Commands

Run the commands from the repository root. `<base>` is the base commit. When the base is not an ancestor of HEAD, each command uses the merge base of the two. This is the same rule that pqw uses. The changed files are all changes from the merge base to the working tree, including uncommitted and untracked files.

```sh
pnpm run closeout:metrics -- --base <base> [--scope <path>...] [--full] [--out <dir>] [--workers N]
pnpm run closeout:mutation -- --base <base> [--scope <path>...] [--files <path>...] [--plan-only] [--max-lines N] [--out <dir>]
pnpm run risk -- --base <base>
```

- `closeout:metrics` groups the changed files by member. It builds the changed members that have a `test` script, together with their dependencies. It runs vitest coverage (lcov) in each member directory, then calls pqw `metrics.mjs` once for each member. The changed files that belong to no member get one more call, which measures complexity without coverage. By default it runs the fast tier only. `--full` runs the fast and the slow tier, and pqw merges the two lcov files. Cyclomatic complexity and CRAP use the same pair of lines from `metrics.thresholds` in `repo-toolchain.config.json`. The assertion pattern comes from `loop.sensors.assertions.assertionPattern`. The command prints a summary of 12 lines or fewer, followed by the JSON path of each member.
- `closeout:mutation` mutates the changed lines only (it gives pqw `--unit-max-lines 0`). It does not extend the range to the whole function that contains a changed line. Differential mutation answers one question: do the tests guard this change? The unchanged lines of the function test the code from before the change, and that belongs to the repository health readings. The command first calls `mutation.mjs --plan-only` for each changed member and prints the range. If the total range is more than `--max-lines` (default 600 lines), the command refuses to run and exits 2. Without `--plan-only`, it builds the dependencies of each member and calls `mutation.mjs --project` once for each member. The members with the largest range start first and get more Stryker processes (`--workers`), in proportion to their range lines. The total number of processes that run at the same time is not more than the number of CPUs. When a member stops, the next member gets its processes immediately. Mutation runs the fast tier only, with [`resources/vitest-fast.config.mts`](resources/vitest-fast.config.mts). This configuration sets the time limit of each test to 60 seconds. During mutation the machine load is high, and a test that is near the default limit of 5 seconds can time out. Then the result changes with the load. Survivors do not change the exit code. An invalid measurement gives exit 1.
- `risk` gives the lowest risk level that the changed paths set, and prints the path rules that match. [quality.md](../../docs/engineering/quality.md#按风险选择接受实现的看法) owns the definition of the levels. The toolchain paths come from `gate/toolchain-paths.txt` on `origin/github-gate` (or the local `github-gate` if the remote branch is absent). Git matches them as pathspecs. If the command cannot read this list, it prints the level, marks it as incomplete, and exits 1.

By default the output goes to `omne-closeout/<commit>[-dirty]/` in the system temporary directory, outside the working tree. `--out` sets a different directory.

## Exit codes

| Code | Meaning                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------- |
| 0    | Normal                                                                                            |
| 1    | Build failed, a reading failed, a mutation measurement is invalid, or a risk rule was not checked |
| 2    | Usage error, or the mutation range is above the limit                                             |

## Out of scope

This member does not calculate cyclomatic complexity or CRAP. It does not pair functions with the base, parse TypeScript or write a Stryker configuration. pqw owns these. Member budgets, duplicate code, dependency direction and cycles belong to repo-toolchain and `pnpm run lint:deps`.
