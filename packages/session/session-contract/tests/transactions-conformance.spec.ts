// Self-proof of the SessionTransactionPort suite: it passes on the conforming in-memory port and
// on the same port without the second tenant (the cross-tenant case is then not applicable), and
// each case fails under a violating variant that breaks the rule of that case.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import type { SessionCommand, SessionTransactionPort } from '@omne-harness/session-contract'
import {
  adoption,
  evidence,
  memorySessionTransactionsFixture,
  ordinaryInput,
  sessionEntriesConformance,
  sessionTransactionsConformance,
  type SessionTransactionsFixture,
} from '@omne-harness/session-contract/testing'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itPassesLegal,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'

const cases = sessionTransactionsConformance<string>()

const NAMES = {
  create: 'create commits the creation and readWork returns the snapshot',
  recall: 'the same operation with the same input recalls the original receipt',
  conflict: 'the same operation with another input is a conflict',
  tenant: 'another tenant reads denied, the same as for a session that never was',
  login: 'startRun of an interactive entry needs the login-entry confirmation among the guards',
  rehand:
    'after a bounded terminal the successor Run re-hands the same input, and judgeCompletion follows',
  accept: 'accept queues an ordinary input and readInput returns it',
  start: 'startRun fixes the first input, opens the Run and keeps the inputs pending',
  runActive: 'a second startRun on an unfinished Run is run-active, and without input no-input',
  handover: 'the hand-over marks the input handed, keeps it pending, and refuses another execution',
  message:
    'the message hand-over records the assistant message, and after the terminal the next input opens another Run',
  history:
    'history pages the entries in commit order, next continues, a cursor of another session is invalid',
  pending: 'pending lists the session while inputs or a Run are open, and omits it afterwards',
  query:
    'queryOperation answers committed with the receipt, and unknown for an operation never seen',
  finish: 'finishRun with an admission rejection fails the Run and releases the first input',
  offPath: 'archive commits its scope cleanup without pretending physical release',
  oneIdentity: 'an operation identity belongs to one operation, whatever its form',
  toolUnsupported:
    'stopCall of a Tool target is unsupported before the identity and the session are read',
  answerOnly: 'an answer-only control writes no revision and replays the original answer',
  malformedControl:
    'a malformed cancelRun or stopCall is refused invalid and saves neither an answer nor an operation',
  modelSelection:
    'readModelSelection is not-ready before any selection and then returns the saved one with its original source',
} as const

type Fixture = SessionTransactionsFixture<string>
type Port = SessionTransactionPort<string>

/** A fixture whose port is the conforming port with `build(real)` laid over it. */
function variant(build: (real: Port) => Partial<Port>): () => Fixture {
  return () => {
    const base = memorySessionTransactionsFixture()
    return { ...base, port: { ...base.port, ...build(base.port) } }
  }
}

const legal: readonly LegalProvider<Fixture>[] = [
  { name: 'the conforming in-memory port', fixture: memorySessionTransactionsFixture },
  {
    name: 'the in-memory port without a second tenant',
    fixture: () => {
      const { otherAccess: _other, ...rest } = memorySessionTransactionsFixture()
      return rest
    },
    notApplicable: { [NAMES.tenant]: 'otherAccess' },
  },
]

const variants: readonly Variant<Fixture>[] = [
  {
    name: 'readWork answers the session of another tenant',
    fails: [NAMES.tenant],
    fixture: variant(real => {
      const fixture = memorySessionTransactionsFixture()
      return {
        readWork: async input => {
          const own = await real.readWork(input)
          return 'ok' in own ? own : real.readWork({ ...fixture.access, session: input.session })
        },
      }
    }),
  },
  {
    name: 'a recall is reported as a fresh commit',
    fails: [NAMES.recall],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (
          'ok' in answer &&
          typeof answer.ok === 'object' &&
          answer.ok !== null &&
          'receipt' in answer.ok
        ) {
          const receipt = (answer.ok as { receipt: { recovered: boolean } }).receipt
          return succeed({ ...answer.ok, receipt: { ...receipt, recovered: false } })
        }
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'a conflict is reported as unavailable',
    fails: [NAMES.conflict, NAMES.oneIdentity],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        return 'failure' in answer && answer.failure.kind === 'conflict'
          ? fail({ kind: 'unavailable' as const, owner: 'variant', diagnostic: 'conflict hidden' })
          : answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'queryOperation answers not-committed for an operation never seen',
    fails: [NAMES.query],
    fixture: variant(real => ({
      queryOperation: async input => {
        const answer = await real.queryOperation(input)
        return 'ok' in answer && answer.ok.kind === 'unknown'
          ? succeed({
              kind: 'not-committed' as const,
              exclusion: { owner: 'variant', record: 'x', revision: '1', digest: 'sha256:x' },
            })
          : answer
      },
    })),
  },
  {
    name: 'next ignores the session of the cursor',
    fails: [NAMES.history],
    fixture: variant(real => {
      const fixture = memorySessionTransactionsFixture()
      return {
        history: {
          ...real.history,
          next: input => real.history.next({ ...input, session: fixture.access.session }),
        },
      }
    }),
  },
  {
    name: 'pending never lists a session for its inputs',
    fails: [NAMES.pending],
    fixture: variant(real => ({
      pending: async input => {
        if (input.reason === 'inputs') return succeed({ sessions: [], next: null })
        return real.pending(input)
      },
    })),
  },
  {
    name: 'readInput answers nothing for an accepted input',
    fails: [NAMES.accept],
    fixture: variant(() => ({
      readInput: async () => fail({ kind: 'invalid' as const, field: 'input', reason: 'variant' }),
    })),
  },
  {
    name: 'startRun reports another first input',
    fails: [NAMES.start, NAMES.message],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (input.command.kind === 'startRun' && 'ok' in answer)
          return succeed({ ...(answer.ok as object), first: 'input-other' })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'a second startRun on an unfinished Run is reported as no-input',
    fails: [NAMES.runActive],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if ('failure' in answer && answer.failure.kind === 'run-active')
          return fail({ kind: 'no-input' as const })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'a hand-over of another execution is accepted',
    fails: [NAMES.handover],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (
          'failure' in answer &&
          answer.failure.kind === 'invalid' &&
          answer.failure.field === 'fact.execution'
        )
          return succeed({
            operation: input.command.input.operation,
            revision: '0',
            first: '0',
            last: '0',
            recovered: false,
            source: { owner: 'variant', record: 'x', revision: '1', digest: 'sha256:x' },
          })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'a message after the terminal is accepted',
    fails: [NAMES.message],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (
          'failure' in answer &&
          answer.failure.kind === 'terminal' &&
          input.command.kind === 'recordMessage'
        )
          return succeed({
            operation: input.command.input.operation,
            revision: '0',
            first: '0',
            last: '0',
            recovered: false,
            source: { owner: 'variant', record: 'x', revision: '1', digest: 'sha256:x' },
          })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'finishRun after the terminal is accepted again',
    fails: [NAMES.finish],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (
          'failure' in answer &&
          answer.failure.kind === 'terminal' &&
          input.command.kind === 'finishRun'
        )
          return succeed({
            receipt: {
              operation: input.command.input.operation,
              revision: '0',
              first: '0',
              last: '0',
              recovered: false,
              source: { owner: 'variant', record: 'x', revision: '1', digest: 'sha256:x' },
            },
            terminal: answer.failure.terminal,
          })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'startRun opens the Run without the login-entry confirmation',
    fails: [NAMES.login],
    fixture: variant(real => ({
      commit: (async input =>
        real.commit(
          input.command.kind === 'startRun' && input.guards.length === 0
            ? {
                ...input,
                guards: [
                  {
                    owner: 'login-entry',
                    participant: 'variant',
                    protocol: adoption('variant-material'),
                    facts: { kind: 'string', value: 'forged' },
                  },
                ],
              }
            : input,
        )) as Port['commit'],
    })),
  },
  {
    name: 'a hand-over of an input handed to an earlier Run is refused',
    fails: [NAMES.rehand],
    fixture: variant(real => {
      const handed = new Set<string>()
      return {
        commit: (async input => {
          const command = input.command as SessionCommand
          if (command.kind === 'receive' && command.input.fact.kind === 'input-handover') {
            if (handed.has(command.input.fact.input))
              return fail({
                kind: 'invalid' as const,
                field: 'fact.input',
                reason: 'variant: handed to an earlier Run',
              })
            handed.add(command.input.fact.input)
          }
          return real.commit(input)
        }) as Port['commit'],
      }
    }),
  },
  {
    name: 'archive pretends scope cleanup is already released',
    fails: [NAMES.offPath],
    fixture: variant(real => ({
      readWork: async input => {
        const result = await real.readWork(input)
        return 'ok' in result && result.ok.lifecycle === 'archived'
          ? succeed({ ...result.ok, tasks: [] })
          : result
      },
    })),
  },
  {
    name: 'split-operation-tables: a control keeps an identity table of its own',
    fails: [NAMES.oneIdentity, NAMES.answerOnly],
    fixture: variant(real => ({
      commit: (async input => {
        const command = input.command as SessionCommand
        if (command.kind !== 'cancelRun' && command.kind !== 'stopCall') return real.commit(input)
        const renamed = {
          ...command,
          input: { ...command.input, operation: `ctl:${command.input.operation}` },
        }
        return real.commit({ ...input, command: renamed } as never)
      }) as Port['commit'],
    })),
  },
  {
    name: 'tool-check-after-identity-lookup: a used identity answers conflict before unsupported',
    fails: [NAMES.toolUnsupported],
    fixture: variant(real => ({
      commit: (async input => {
        const command = input.command as SessionCommand
        if (command.kind === 'stopCall' && command.input.producer.kind === 'tool') {
          const known = await real.queryOperation({
            ...input.access,
            operation: command.input.operation,
          })
          if ('ok' in known && known.ok.kind === 'committed')
            return fail({ kind: 'conflict' as const, operation: command.input.operation })
        }
        return real.commit(input)
      }) as Port['commit'],
    })),
  },
  {
    name: 'empty-batch-receipt: an answer-only control advances the revision',
    fails: [NAMES.answerOnly],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (input.command.kind === 'cancelRun' && 'ok' in answer)
          await real.commit({
            access: input.access,
            command: {
              kind: 'accept',
              input: {
                tenant: input.command.input.tenant,
                session: input.command.input.session,
                operation: `${input.command.input.operation}/bump` as never,
                value: ordinaryInput(`bump-${input.command.input.operation}`),
              },
            },
            guards: [],
          })
        return answer
      }) as Port['commit'],
    })),
  },
  {
    name: 'format-refusal-as-answer: a malformed control is repaired and saved as a business answer',
    fails: [NAMES.malformedControl],
    fixture: variant(real => ({
      commit: (async input => {
        const command = input.command as SessionCommand
        if (command.kind === 'cancelRun') {
          const run = command.input.run === '' ? ('run_never' as never) : command.input.run
          const urgency = command.input.urgency === 'force' ? 'force' : 'graceful'
          return real.commit({
            ...input,
            command: { ...command, input: { ...command.input, run, urgency } },
          } as never)
        }
        if (command.kind === 'stopCall' && command.input.producer.kind !== 'tool') {
          const { producer } = command.input
          const fixed = {
            kind: 'model' as const,
            call: producer.call === '' ? 'm1' : producer.call,
          }
          return real.commit({
            ...input,
            command: { ...command, input: { ...command.input, producer: fixed } },
          } as never)
        }
        return real.commit(input)
      }) as Port['commit'],
    })),
  },
  {
    name: 'query-unseen-as-not-committed: a control identity reads as never seen',
    fails: [NAMES.oneIdentity],
    fixture: variant(real => ({
      queryOperation: async input => {
        const answer = await real.queryOperation(input)
        return 'failure' in answer && answer.failure.kind === 'conflict'
          ? succeed({
              kind: 'not-committed' as const,
              exclusion: { owner: 'variant', record: 'x', revision: '1', digest: 'sha256:x' },
            })
          : answer
      },
    })),
  },
  {
    name: 'default-selection: a missing selection is filled with a default name',
    fails: [NAMES.modelSelection],
    fixture: variant(real => ({
      readModelSelection: async input => {
        const answer = await real.readModelSelection(input)
        return 'failure' in answer && answer.failure.kind === 'not-ready'
          ? succeed({
              selection: { name: 'default', basis: evidence('default') },
              revision: '1' as never,
              source: evidence('read-time'),
            })
          : answer
      },
    })),
  },
  {
    name: 'selection-source-at-read-time: the source is made up when the selection is read',
    fails: [NAMES.modelSelection],
    fixture: variant(real => ({
      readModelSelection: async input => {
        const answer = await real.readModelSelection(input)
        return 'ok' in answer ? succeed({ ...answer.ok, source: evidence('read-time') }) : answer
      },
    })),
  },
  {
    name: 'create answers another session',
    fails: [NAMES.create],
    fixture: variant(real => ({
      commit: (async input => {
        const answer = await real.commit(input)
        if (input.command.kind === 'create' && 'ok' in answer) {
          const created = answer.ok as { state: { session: string } }
          return succeed({
            ...created,
            state: { ...created.state, session: `${created.state.session}-other` },
          })
        }
        return answer
      }) as Port['commit'],
    })),
  },
]

describe('the SessionTransactionPort suite', () => {
  it('is well formed: unique names and a clause for every case', () => {
    expectWellFormed(cases)
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
  })

  itPassesLegal(cases, legal)
  itFailsExactly(cases, variants)

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, variants)
  })
})

const entriesCases = sessionEntriesConformance<string>()

const ENTRIES = {
  commit: 'commitEntries commits the range and its receipt names the batch evidence of the commit',
  revision:
    'the consequence and the progress row are one new revision, and readWork reads the saved progress back',
  continue:
    'the next range continues from the start that readWork gives, and a start behind the saved progress is changed',
  recall:
    'the same operation with the same observation recalls the original receipt and writes nothing',
  conflict: 'an operation identity of another observation or of another commit form is a conflict',
  refusal:
    'a refused commitEntries leaves the revision, the log and the operation identity unchanged',
  query:
    'queryOperation answers committed for an entries operation, and queryControlOperation conflict',
  tenant: 'an observation of another tenant is denied, the same as for a session that never was',
  access: 'commitEntries asks no access check, for a commit, a recall and a refusal',
} as const

const entriesLegal: readonly LegalProvider<Fixture>[] = [
  { name: 'the conforming in-memory port', fixture: memorySessionTransactionsFixture },
  {
    name: 'the in-memory port without a second tenant',
    fixture: () => {
      const { otherAccess: _other, ...rest } = memorySessionTransactionsFixture()
      return rest
    },
    notApplicable: { [ENTRIES.tenant]: 'otherAccess' },
  },
]

type EntriesInput = Parameters<Port['commitEntries']>[0]

const entriesVariants: readonly Variant<Fixture>[] = [
  {
    name: 'readWork leaves out the saved progress',
    fails: [ENTRIES.revision, ENTRIES.continue],
    fixture: variant(real => ({
      readWork: async input => {
        const answer = await real.readWork(input)
        if (!('ok' in answer)) return answer
        const { entriesProgress: _progress, ...snapshot } = answer.ok
        return succeed(snapshot)
      },
    })),
  },
  {
    name: 'commitEntries asks the access check of a public read',
    fails: [ENTRIES.access],
    fixture: () => {
      const base = memorySessionTransactionsFixture()
      return {
        ...base,
        port: {
          ...base.port,
          commitEntries: async input => {
            await base.port.readWork(base.access)
            return base.port.commitEntries(input)
          },
        },
      }
    },
  },
  {
    name: 'the receipt names another evidence than the batch evidence of the commit',
    fails: [ENTRIES.commit, ENTRIES.revision],
    fixture: variant(real => ({
      commitEntries: async input => {
        const answer = await real.commitEntries(input)
        return 'ok' in answer ? succeed({ ...answer.ok, interpreted: evidence('variant') }) : answer
      },
    })),
  },
  {
    name: 'history leaves out the progress row',
    fails: [ENTRIES.revision],
    fixture: variant(real => ({
      history: {
        ...real.history,
        begin: async input => {
          const page = await real.history.begin(input)
          return 'ok' in page
            ? succeed({
                ...page.ok,
                entries: page.ok.entries.filter(entry => entry.kind !== 'entries.interpreted'),
              })
            : page
        },
      },
    })),
  },
  {
    name: 'a recall commits again under a fresh identity',
    fails: [ENTRIES.recall],
    fixture: variant(real => {
      const seen = new Set<string>()
      return {
        commitEntries: async (input: EntriesInput) => {
          const text = JSON.stringify(input)
          if (!seen.has(text)) {
            seen.add(text)
            return real.commitEntries(input)
          }
          const operation =
            `${input.observation.operation}/again` as typeof input.observation.operation
          return real.commitEntries({ ...input, observation: { ...input.observation, operation } })
        },
      }
    }),
  },
  {
    name: 'an entries conflict is reported as unavailable',
    fails: [ENTRIES.conflict],
    fixture: variant(real => ({
      commitEntries: async input => {
        const answer = await real.commitEntries(input)
        return 'failure' in answer && answer.failure.kind === 'conflict'
          ? fail({ kind: 'unavailable' as const, owner: 'variant', diagnostic: 'conflict hidden' })
          : answer
      },
    })),
  },
  {
    name: 'without rollback: a refused commitEntries keeps a write',
    fails: [ENTRIES.continue, ENTRIES.conflict, ENTRIES.refusal, ENTRIES.tenant, ENTRIES.access],
    fixture: variant(real => {
      const fixture = memorySessionTransactionsFixture()
      let writes = 0
      return {
        commitEntries: async input => {
          const answer = await real.commitEntries(input)
          if ('failure' in answer) {
            writes += 1
            await real.commit({
              access: fixture.access,
              command: {
                kind: 'accept',
                input: {
                  tenant: fixture.access.tenant,
                  session: fixture.access.session,
                  operation: fixture.operation(`kept-write-${writes}`),
                  value: ordinaryInput(`kept-write-${writes}`),
                },
              },
              guards: [],
            })
          }
          return answer
        },
      }
    }),
  },
  {
    name: 'queryOperation answers conflict for an entries operation',
    fails: [ENTRIES.recall, ENTRIES.conflict, ENTRIES.query],
    fixture: variant(real => {
      const committed = new Set<string>()
      return {
        commitEntries: async input => {
          const answer = await real.commitEntries(input)
          if ('ok' in answer) committed.add(answer.ok.operation)
          return answer
        },
        queryOperation: async input =>
          committed.has(input.operation)
            ? fail({ kind: 'conflict' as const, operation: input.operation })
            : real.queryOperation(input),
      }
    }),
  },
  {
    name: 'commitEntries answers for the session of another tenant',
    fails: [ENTRIES.tenant],
    fixture: variant(real => {
      const fixture = memorySessionTransactionsFixture()
      return {
        commitEntries: async input =>
          real.commitEntries({
            ...input,
            observation: { ...input.observation, tenant: fixture.access.tenant },
          }),
      }
    }),
  },
]

describe('the commitEntries suite', () => {
  it('is well formed: unique names and a clause for every case', () => {
    expectWellFormed(entriesCases)
    expect(entriesCases.map(item => item.name)).toEqual(Object.values(ENTRIES))
  })

  itPassesLegal(entriesCases, entriesLegal)
  itFailsExactly(entriesCases, entriesVariants)

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(entriesCases, entriesVariants)
  })
})
