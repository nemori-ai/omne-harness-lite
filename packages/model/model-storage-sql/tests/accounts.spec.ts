import { describe, expect, it } from 'vitest'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import {
  checkCommandsAccounts,
  createMemoryModelCommands,
  type CommandsAccountsReport,
  type CommandsAccountsSubject,
} from '@omne-harness/model/testing'
import {
  callId,
  coreOptions,
  instanceId,
  opId,
  proof,
  sqlCommands,
  tenantOf,
  type Principal,
} from './fixture.ts'

const A = tenantOf('a')
const OUTSIDER: Principal = Object.freeze({ subject: 'trusted-0' })

type Kind = 'memory' | 'sql'
type Alter = (commands: ModelCommands<Principal>) => ModelCommands<Principal>

function subjectOf(kind: Kind, alter: Alter = commands => commands) {
  return (): CommandsAccountsSubject<Principal> => {
    const built =
      kind === 'memory'
        ? (() => {
            const core = coreOptions([A])
            return { core, commands: createMemoryModelCommands(core.options).commands }
          })()
        : sqlCommands([A])
    const admit = built.core.admitOf(A, callId('accounts'), opId('admit'))
    return {
      commands: alter(built.commands),
      admit,
      instance: instanceId(),
      continuity: call => proof(call),
      lateSource: ({ call, dispatch }) => proof(`${call}/${dispatch}`, 'supplier'),
      completion: ({ call, result }) => proof(`${call}/${result}`, admit.consumer.owner),
      outsider: { principal: OUTSIDER, tenant: A },
    }
  }
}

function normalized(report: CommandsAccountsReport): CommandsAccountsReport {
  return {
    ok: report.ok,
    results: report.results.map(result =>
      result.status === 'pass'
        ? result
        : { ...result, detail: result.detail.replace(/"owner":"model-[a-z-]+"/g, '"owner":"*"') },
    ),
  }
}

async function reports(alterSql?: Alter) {
  const memory = await checkCommandsAccounts({ subject: subjectOf('memory') })
  const sql = await checkCommandsAccounts({ subject: subjectOf('sql', alterSql) })
  return { memory, sql }
}

describe('checkCommandsAccounts on the memory and the SQL ModelCommands', () => {
  it('gives the same result for every obligation', async () => {
    const { memory, sql } = await reports()
    console.log(`accounts report (memory): ${JSON.stringify(memory)}`)
    console.log(`accounts report (sql): ${JSON.stringify(sql)}`)
    expect(memory.ok).toBe(true)
    expect(normalized(sql)).toEqual(normalized(memory))
  })

  it('tells the two apart when the SQL commands lose the result of one method', async () => {
    const { memory, sql } = await reports(commands => ({
      ...commands,
      dispatches: async input => {
        const read = await commands.dispatches(input)
        return 'failure' in read ? read : { ok: [] }
      },
    }))
    expect(normalized(sql)).not.toEqual(normalized(memory))
    expect(sql.ok).toBe(false)
  })
})
