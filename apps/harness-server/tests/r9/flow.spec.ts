// @module-tag slow
// 慢：起真实的 `dist/bin.js serve` 进程两次（同一状态根）、真实的 SQLite 存储，并为每条命令起一个 `omne` 进程。先运行 `pnpm run build`
// （本成员与 `apps/cli`）。
// R9 贯通的进程级一层：发行树以 `serve` 真实模式启动，CLI 依次注册、登录、建会话、发输入，另一租户被拒且不披露
// 存在，重启后账号与登录仍在，输出里没有登录证明、凭据与游标密钥。判断都在 `flow.ts` 的检查里，`run-r9.sh` 跑同一份。
import { describe, expect, it } from 'vitest'
import { failed, runR9Flow } from './flow.ts'

describe('R9 release tree as real processes', () => {
  it('serve accepts on the real rows, a login reaches a session, another tenant is denied, a restart keeps the login, no secret is printed', async () => {
    const record = await runR9Flow()
    // Guards against a flow that stopped early or never ran a part of the story.
    expect(record.runs).toHaveLength(2)
    expect(record.steps.length).toBe(13)
    expect(new Set(record.checks.map(entry => entry.item))).toEqual(new Set([1, 2, 3, 4, 5]))
    expect(
      failed(record.checks).map(
        entry => `[item ${String(entry.item)}] ${entry.name}: ${entry.detail}`,
      ),
    ).toEqual([])
  })
})
