import { Service, type Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AgentExecutionControlService,
  AgentExecutionRecoveryService,
  AgentInstanceProvisionService,
  agentInstancesKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import type { AgentDrivePort } from '@omne-harness/session-contract'
import { sessionAgentDriveKey } from '@omne-harness/session-cordis-contract/cordis'
import { createSessionAgentDrivePlugin } from '../src/cordis/agent-drive.ts'
import { createSessionJournalInterpretationPlugin } from '../src/cordis/journal-interpretation.ts'
import { ok } from './fixtures/common-journal.ts'
import { endWithFailure, refusedByModel } from './fixtures/finish.ts'
import { cordisScene, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const scenes: SqlScene[] = []
const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  for (const s of scenes.splice(0)) await s.close()
})

const unsupported = async () => fail({ kind: 'unsupported' as const })

async function restarted(name: string) {
  const s = await sqlScene(name)
  scenes.push(s)
  const c = await cordisScene(s)
  disposers.push(() => c.dispose())
  await endWithFailure(s, c.journal(), refusedByModel())
  const coordinator = async () => succeed(s.access.principal)
  await c.mount(createSessionJournalInterpretationPlugin<string>({ coordinator }).plugin)

  class Provision extends AgentInstanceProvisionService<string> {
    readonly acquire: AgentInstanceProvisionService<string>['acquire'] = unsupported
  }
  class Directory extends Service {
    constructor(scope: Context) {
      super(scope, agentInstancesKey)
    }
    readonly resolve = unsupported
    readonly connect = unsupported
  }
  class Recovery extends AgentExecutionRecoveryService<string> {
    readonly query: AgentExecutionRecoveryService<string>['query'] = unsupported
    readonly load: AgentExecutionRecoveryService<string>['load'] = input =>
      c.journal().load({ ...s.access, execution: input.execution })
    readonly reconcile: AgentExecutionRecoveryService<string>['reconcile'] = unsupported
    readonly detach: AgentExecutionRecoveryService<string>['detach'] = unsupported
    readonly contact: AgentExecutionRecoveryService<string>['contact'] = unsupported
  }
  class Control extends AgentExecutionControlService<string> {
    readonly control: AgentExecutionControlService<string>['control'] = unsupported
  }
  for (const service of [Provision, Directory, Recovery, Control]) await c.mount(service)
  await c.mount(createSessionAgentDrivePlugin<string>({ coordinator }))
  const drive = c.ctx.get(sessionAgentDriveKey) as AgentDrivePort | undefined
  if (drive === undefined) throw new Error('sessionAgentDrive is absent')
  const run = async () => ok(await s.port.readWork(s.sessionAccess)).run
  return { s, drive, run }
}

describe('an execution that ended before its published events were read', () => {
  it('inspect of the ended execution wakes the reader, and the Session log gets the terminal of the Run', async () => {
    const f = await restarted('ended-unread')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect((await f.run()).kind).toBe('active')

    const { tenant, session } = f.s.access
    const status = await f.drive.inspect({ tenant, session, execution: f.s.execution })
    expect(status).toHaveProperty('ok.state', 'ended')
    await vi.waitFor(async () => expect((await f.run()).kind).toBe('terminal'), { timeout: 5000 })
    const run = await f.run()
    expect(run.kind === 'terminal' ? run.terminal.outcome : null).toBe('failed')
  })
})
