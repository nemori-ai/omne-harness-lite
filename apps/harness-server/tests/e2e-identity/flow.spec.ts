// @module-tag slow
// 慢：起真实的 `dist/bin.js serve` 进程两次（同一状态根）、真实的 SQLite 存储，为每条命令起一个 `omne` 进程，
// 并为空闲期限真实等待约半分钟。先运行 `pnpm run build`（本成员与 `apps/cli`）。
// 租户身份端到端（K10，身份规格 AC-9 的步骤 1 至 13）：判断都在 `flow.ts`，`drive.ts` 跑同一份并写证据文件。
import { describe, expect, it } from 'vitest'
import { failedChecks, failedSteps, runIdentityFlow } from './flow.ts'

describe('identity end to end over real processes', () => {
  it('every step answers the expected outcome and exit code, and every check holds', async () => {
    const record = await runIdentityFlow()
    expect(record.aborted).toBeUndefined()
    // Guards against a flow that stopped early: all thirteen steps and both processes ran.
    expect(new Set(record.steps.map(entry => entry.step))).toEqual(
      new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]),
    )
    expect(record.runs).toHaveLength(2)
    expect(
      failedSteps(record).map(
        entry =>
          `[step ${String(entry.step)}] ${entry.label}: ${String(entry.outcome)}/${String(entry.exitCode)}`,
      ),
    ).toEqual([])
    expect(failedChecks(record).map(entry => `${entry.name}: ${entry.actual}`)).toEqual([])
  }, 300_000)
})
