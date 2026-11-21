import { describe, expect, it } from 'vitest'
import { createDomainBinding, workspaceStorageDomain } from '@omne-harness/workspace-local'

const COMBINATION = { combinationVersion: 'v1', manifestDigest: 'digest' }

function ports(answers: (string | Error)[]) {
  const asked: unknown[] = []
  const reports: string[] = []
  let combinations = 0
  return {
    asked,
    reports,
    combinations: () => combinations,
    bind: createDomainBinding({
      storage: {
        async registerCombination(input) {
          asked.push(input)
          const answer = answers.shift() ?? 'registered'
          if (answer instanceof Error) throw answer
          return { kind: answer } as never
        },
      },
      async combination() {
        combinations++
        return COMBINATION
      },
      report: reason => void reports.push(reason),
    }),
  }
}

describe('the workspace domain is registered once', () => {
  it('in the system scope, with the persistence participant, and remembered', async () => {
    const p = ports([])
    expect(await p.bind()).toEqual(COMBINATION)
    expect(await p.bind()).toEqual(COMBINATION)
    expect(p.asked).toEqual([
      { ...workspaceStorageDomain, ...COMBINATION, participants: ['workspace.persistence'] },
    ])
    expect(workspaceStorageDomain).toEqual({
      scope: { kind: 'system' },
      transactionDomain: 'system.workspace',
    })
    expect(p.combinations()).toBe(1)
  })

  it('two callers at once share one registration', async () => {
    const p = ports([])
    expect(await Promise.all([p.bind(), p.bind()])).toEqual([COMBINATION, COMBINATION])
    expect(p.asked.length).toBe(1)
  })

  it('a refusal or a failure is no binding, is reported, and is asked again next time', async () => {
    const p = ports(['combination_mismatch', new Error('storage is down')])
    expect(await p.bind()).toBeNull()
    expect(await p.bind()).toBeNull()
    expect(p.reports).toEqual([
      'the storage answered combination_mismatch',
      'Error: storage is down',
    ])
    expect(await p.bind()).toEqual(COMBINATION)
    expect(p.asked.length).toBe(3)
  })
})
