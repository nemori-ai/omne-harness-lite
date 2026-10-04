// 公开入口（装配 apps/tenancy-host 消费的名字；任务简报「导出名不改」）。
import { describe, expect, it } from 'vitest'
import * as entry from '../src/index.ts'
import * as bindings from '../src/cordis.ts'

describe('公开入口', () => {
  it('装配消费的名字都在：两个插件、两份 config Schema、迁移片段、迁移前核对、四个通知名', () => {
    expect(bindings.governanceCenterEntryPlugin.name).toBe('governance-center-entry-node')
    expect(bindings.governanceCenterOpsPlugin.name).toBe('governance-center-entry-node-ops')
    expect(entry.GovernanceCenterEntryConfigSchema).toBeDefined()
    expect(entry.GovernanceCenterOpsConfigSchema).toBeDefined()
    expect(entry.governanceCenterMigrations).toHaveLength(1)
    expect(typeof entry.governanceCenterPreflight).toBe('function')
    expect([
      entry.SERVING_EVENT,
      entry.STOPPED_EVENT,
      entry.DEFECT_EVENT,
      entry.LISTENING_EVENT,
    ]).toEqual([
      'governance-center-entry/serving',
      'governance-center-entry/stopped',
      'governance-center-entry/defect',
      'governance-center-ops/listening',
    ])
    expect(entry.OPS_SOCKET_NAME).toBe('governance-center-ops.sock')
    expect(entry.ACCEPTED_PROTOCOL_VERSIONS).toEqual(['2'])
  })
})
