import { ACCEPTED_PROTOCOL_VERSIONS } from '@omne-harness-lite/governance-center-entry'
// 公开提供者入口与公共词汇拥有者分别消费。
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
    expect(ACCEPTED_PROTOCOL_VERSIONS).toEqual(['2'])
  })
})
