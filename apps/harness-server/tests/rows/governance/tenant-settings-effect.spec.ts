// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// 写了真的生效（#1265 C3）：登录的人经 `tenantSettings` 把 Shell 的调用权限挑成「拒绝」之后，下一次 Shell 调用不启动，
// 结局是被权限拒绝；「清除」之后，再下一次 Shell 调用照常启动。两次之间不重启服务。工具调用准入怎样读权限归 Tool
// 与权限的现有实现，本文件只看结局随租户层的配值变。
import { expect, it } from 'vitest'
import { loginAccess } from '../../model/public-stream-support.ts'
import { onReleaseTree } from '../../support/release-tree.ts'
import { SHELL, faceOf, shellRound, shellScript } from '../../governance/tenant-settings-support.ts'

it('a deny pick of the tenant layer stops the next Shell call at its start, and a clear lets the call after it start', async () => {
  const exit = await onReleaseTree({ script: shellScript }, async tree => {
    const face = faceOf(tree)
    // The first session registers the tenant domain; its call may meet a governance runtime that
    // is not open yet. It is not part of the claim.
    await shellRound(tree, 'warmup')
    const baseline = await shellRound(tree, 'baseline')
    expect(baseline.started).toBe(true)

    const { principal, tenant } = await loginAccess(tree)
    const item = { principal, tenant, asset: SHELL, item: 'invoke' }
    const read = await face.describe(item)
    if (read.kind !== 'described') throw new Error(JSON.stringify(read))
    const denied = await face.set({
      ...item,
      operation: 'deny-shell',
      expectedRevision: read.item.revision,
      value: { kind: 'permission', pick: 'deny' },
    })
    expect(denied).toMatchObject({ kind: 'written' })
    if (denied.kind !== 'written') throw new Error(JSON.stringify(denied))

    const stopped = await shellRound(tree, 'stopped')
    expect(stopped).toMatchObject({
      started: false,
      result: 'The tool call was denied and did not run.',
      calls: [],
    })

    const cleared = await face.clear({
      ...item,
      operation: 'clear-shell',
      expectedRevision: denied.revision,
    })
    expect(cleared).toEqual({ kind: 'written', revision: String(Number(denied.revision) + 1) })

    const resumed = await shellRound(tree, 'resumed')
    expect(resumed.started).toBe(true)
  })
  expect(exit).toBe(0)
})
