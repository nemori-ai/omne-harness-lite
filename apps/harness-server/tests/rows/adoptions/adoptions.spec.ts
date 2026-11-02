// APP-2: the `agent-adoptions` and `adoption-sources` rows. The table of the deployment mapping is
// parsed once from the row configuration. These tests go through the serve tree and the service keys
// that the other rows use, and they judge what a consumer can observe.
import { agentEvaluator } from '@omne-harness/agent'
import type { AdoptionEvidenceCommand } from '@omne-harness/session-contract'
import { modesAdoptionOf } from '@omne-harness/server-entry/cordis'
import { describe, expect, test } from 'vitest'
import { agentAdoptionsConfig } from '../../../src/rows/agent-adoptions/config.ts'
import { buildTable } from '../../../src/rows/agent-adoptions/table.ts'
import {
  access,
  adoptionOf,
  candidateOf,
  createCommand,
  entryConfig,
  factsOf,
  mappingConfig,
  modesOf,
  reloadCommand,
  serveRows,
  startRunCommand,
  withLiveTree,
  type Captured,
} from './support.ts'

/**
 * The consumers of the two faces, reduced to the one rule that matters here: they write only when
 * the adoption side answered with material or a resolved definition. The counters stand for the
 * Session transaction port and the Agent instance host. They are replacements, not the real ports.
 */
function consumers(services: Captured) {
  const sessionCommits: unknown[] = []
  const agentReservations: unknown[] = []
  return {
    sessionCommits,
    agentReservations,
    async create(command: AdoptionEvidenceCommand) {
      const prepared = await services.source.prepare(command)
      if ('ok' in prepared) sessionCommits.push({ command, guards: prepared.ok })
      return prepared
    },
    async reserve(adoption: Parameters<Captured['agent']['resolve']>[0]['adoption']) {
      const resolved = await services.agent.resolve({ ...access, adoption })
      if ('ok' in resolved) agentReservations.push(resolved.ok.definition.name)
      return resolved
    },
  }
}

const failureOf = (outcome: object) => ('failure' in outcome ? outcome.failure : undefined)

describe('one table, one content identity', () => {
  test('the Agent face, the trusted service and the Session source read the same table object', async () => {
    const { value } = await withLiveTree(mappingConfig(), ({ agent, mappings, source }) => ({
      identities: [agent.mappings.identity, mappings.identity, source.mappings.identity],
      sameEntries: [
        agent.mappings.entries() === source.mappings.entries(),
        mappings.entries() === source.mappings.entries(),
      ],
    }))
    expect(value.identities[0]).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(new Set(value.identities).size).toBe(1)
    expect(value.sameEntries).toEqual([true, true])
  })

  test('the material of every command names the identity of that table', async () => {
    const { value } = await withLiveTree(mappingConfig(), async ({ mappings, source }) => {
      const created = await source.prepare(createCommand('alpha'))
      const started = await source.prepare(startRunCommand(candidateOf('alpha')))
      const reloaded = await source.prepare(reloadCommand(candidateOf('beta')))
      return { identity: mappings.identity, created, started, reloaded }
    })
    for (const prepared of [value.created, value.started, value.reloaded]) {
      if (!('ok' in prepared)) throw new Error('expected material')
      expect(prepared.ok).toHaveLength(1)
      expect(factsOf(prepared.ok[0]!)).toMatchObject({ version: 1, table: value.identity })
    }
  })

  test('the identity follows the content of the table and not the order of its keys', async () => {
    const parse = (config: unknown) => buildTable(agentAdoptionsConfig.parse(config))
    const first = await parse(mappingConfig())
    const reordered = await parse({
      mappings: [
        {
          ...entryConfig('alpha'),
          modes: {
            collaboration: 'co-work',
            environment: modesOf().environment,
            permission: 'never',
          },
        },
        entryConfig('beta'),
      ],
    })
    const changed = await parse(
      mappingConfig(entryConfig('alpha', { modes: modesOf('auto-drive') }), entryConfig('beta')),
    )
    expect(reordered.mappings.identity).toBe(first.mappings.identity)
    expect(changed.mappings.identity).not.toBe(first.mappings.identity)
  })

  test('changing only the mode default of one definition changes the material of that definition alone', async () => {
    // The creation names the modes adoption of the table it is prepared against, as the server entry does.
    const materialOf = async (config: unknown) =>
      (
        await withLiveTree(config, async ({ mappings, source }) => {
          const prepare = async (name: string) => {
            const entry = mappings.byName(name)
            if (entry === undefined) throw new Error(`${name} is missing`)
            const prepared = await source.prepare(
              createCommand(name, {
                modes: { kind: 'tenant-default', source: modesAdoptionOf(entry) },
              }),
            )
            if (!('ok' in prepared)) throw new Error('expected material')
            return factsOf(prepared.ok[0]!)['entry']
          }
          return { alpha: await prepare('alpha'), beta: await prepare('beta') }
        })
      ).value
    const before = await materialOf(mappingConfig())
    const after = await materialOf(
      mappingConfig(entryConfig('alpha', { modes: modesOf('auto-drive') }), entryConfig('beta')),
    )
    expect(after.alpha).not.toBe(before.alpha)
    expect(after.beta).toBe(before.beta)
  })
})

describe('an unknown definition produces no business write', () => {
  test('an unknown name gets a failure and the Session consumer commits nothing', async () => {
    const { value } = await withLiveTree(mappingConfig(), async services => {
      const run = consumers(services)
      const unknown = await run.create(createCommand('missing'))
      const writesAfterUnknown = run.sessionCommits.length
      const known = await run.create(createCommand('alpha'))
      return { unknown, writesAfterUnknown, known, writesAfterKnown: run.sessionCommits.length }
    })
    expect(failureOf(value.unknown)).toMatchObject({ kind: 'invalid', field: 'definition' })
    expect(value.writesAfterUnknown).toBe(0)
    // Positive control: the same consumer does write for a known definition.
    expect('ok' in value.known).toBe(true)
    expect(value.writesAfterKnown).toBe(1)
  })

  test('an unknown name is not answered with the first entry or any default definition', async () => {
    const { value } = await withLiveTree(mappingConfig(), ({ source }) =>
      source.prepare(createCommand('gamma')),
    )
    expect('ok' in value).toBe(false)
    expect(JSON.stringify(value)).not.toContain('alpha')
  })

  test.each([
    [
      'candidate digest',
      createCommand('alpha', {
        definition: { name: 'alpha', candidate: adoptionOf('test-assets', 'other') },
      }),
      'definition.candidate',
    ],
    [
      'execution',
      createCommand('alpha', { execution: adoptionOf('test-agent', 'other') }),
      'execution',
    ],
    [
      'entry contract',
      createCommand('alpha', { entryContract: adoptionOf('test-entry', 'other') }),
      'entryContract',
    ],
    [
      'required identities',
      createCommand('alpha', { requiredIdentities: [] }),
      'requiredIdentities',
    ],
    [
      'explicit modes',
      createCommand('alpha', { modes: { kind: 'explicit', value: modesOf('auto-drive') } }),
      'modes',
    ],
    [
      'tenant default source',
      createCommand('alpha', {
        modes: { kind: 'tenant-default', source: adoptionOf('x', 'tenant-defaults') },
      }),
      'modes',
    ],
  ])('a creation whose %s differs from its mapping entry is refused', async (_, command, field) => {
    const { value } = await withLiveTree(mappingConfig(), services =>
      consumers(services).create(command),
    )
    expect(failureOf(value)).toMatchObject({ kind: 'invalid', field })
  })

  test('a creation that names the modes adoption of its entry is accepted', async () => {
    const { value } = await withLiveTree(mappingConfig(), ({ mappings, source }) => {
      const entry = mappings.byName('alpha')
      if (entry === undefined) throw new Error('alpha is missing')
      return source.prepare(
        createCommand('alpha', {
          modes: { kind: 'tenant-default', source: modesAdoptionOf(entry) },
        }),
      )
    })
    expect('ok' in value).toBe(true)
  })

  test('a run start or reload with a candidate outside the table is refused', async () => {
    const { value } = await withLiveTree(mappingConfig(), async ({ source }) => ({
      started: await source.prepare(startRunCommand(candidateOf('missing'))),
      reloaded: await source.prepare(reloadCommand(candidateOf('missing'))),
      otherRevision: await source.prepare(
        startRunCommand({ ...candidateOf('alpha'), revision: '2' }),
      ),
    }))
    for (const outcome of [value.started, value.reloaded, value.otherRevision])
      expect(failureOf(outcome)).toMatchObject({ kind: 'invalid', field: 'candidate' })
  })

  test('commands without a definition give no material and are not refused', async () => {
    const { value } = await withLiveTree(mappingConfig(), async ({ source }) => {
      const outcomes = []
      for (const kind of ['completeInitialization', 'change', 'freeze'] as const)
        outcomes.push(
          await source.prepare({
            kind,
            input: { ...access },
          } as unknown as AdoptionEvidenceCommand),
        )
      return outcomes
    })
    for (const outcome of value) expect(outcome).toEqual({ ok: [] })
  })

  test('the Agent face resolves a known adoption and refuses an unknown one without a reservation', async () => {
    const { value } = await withLiveTree(mappingConfig(), async services => {
      const run = consumers(services)
      const unknown = await run.reserve(candidateOf('missing'))
      const writesAfterUnknown = run.agentReservations.length
      const known = await run.reserve(candidateOf('alpha'))
      return { unknown, writesAfterUnknown, known, reservations: run.agentReservations }
    })
    expect(failureOf(value.unknown)).toMatchObject({ kind: 'invalid', field: 'adoption' })
    expect(value.writesAfterUnknown).toBe(0)
    // Positive control: the same consumer does reserve for the known adoption.
    if (!('ok' in value.known)) throw new Error('expected a resolution')
    expect(value.reservations).toEqual(['alpha'])
    expect(value.known.ok).toMatchObject({
      definition: { category: 'AgentDefinition', name: 'alpha' },
      extensions: [],
    })
    expect(value.known.ok.evaluator).toBe(agentEvaluator)
  })

  test('a malformed adoption is invalid and a handover has no target in wave 1', async () => {
    const { value } = await withLiveTree(mappingConfig(), async ({ agent }) => {
      const snapshot = {} as never
      const original = {} as never
      return {
        malformed: await agent.resolve({ ...access, adoption: { owner: '' } as never }),
        handoverUnknown: await agent.handover({
          ...access,
          from: candidateOf('alpha'),
          to: candidateOf('missing'),
          snapshot,
          original,
        }),
        handoverKnown: await agent.handover({
          ...access,
          from: candidateOf('alpha'),
          to: candidateOf('beta'),
          snapshot,
          original,
        }),
      }
    })
    expect(failureOf(value.malformed)).toMatchObject({ kind: 'invalid', field: 'adoption' })
    expect(failureOf(value.handoverUnknown)).toMatchObject({ kind: 'invalid', field: 'to' })
    expect(failureOf(value.handoverKnown)).toEqual({ kind: 'unsupported' })
  })
})

describe('the mapping is read once from the distribution and checked at the entry', () => {
  test('a valid mapping starts both rows and nothing else is needed', async () => {
    const run = await serveRows(mappingConfig())
    expect(run.result.exitCode).toBe(0)
    expect(run.state('agent-adoptions')).toMatchObject({ state: 'ACTIVE' })
    expect(run.state('adoption-sources')).toMatchObject({ state: 'ACTIVE' })
    expect(run.result.implementations).toMatchObject({ real: 2 })
  })

  const dup = entryConfig('alpha')
  const withoutMember = (entry: Record<string, unknown>, member: string) =>
    Object.fromEntries(Object.entries(entry).filter(([key]) => key !== member))
  test.each([
    ['no mappings member', {}, 'mappings'],
    ['an empty mapping', { mappings: [] }, 'mappings'],
    ['an unknown member of the config', { ...mappingConfig(), extra: 1 }, 'extra'],
    [
      'an unknown member of an entry',
      mappingConfig(entryConfig('alpha', { tenantDefaults: 'x' })),
      'tenantDefaults',
    ],
    [
      'an entry without modes',
      mappingConfig(withoutMember(entryConfig('alpha'), 'modes')),
      'mappings.0.modes',
    ],
    [
      'a mode value outside the set',
      mappingConfig(entryConfig('alpha', { modes: { ...modesOf(), permission: 'always' } })),
      'mappings.0.modes.permission',
    ],
    [
      'a duplicate definition name',
      mappingConfig(dup, entryConfig('alpha', { candidate: candidateOf('alpha-2') })),
      'mappings.1.name',
    ],
    [
      'a duplicate candidate',
      mappingConfig(dup, entryConfig('beta', { candidate: candidateOf('alpha') })),
      'mappings.1.candidate',
    ],
    [
      'a definition body that Agent refuses',
      mappingConfig(
        entryConfig('alpha', {
          definition: {
            category: 'AgentDefinition',
            name: 'alpha',
            references: 'none',
            attributes: [],
          },
        }),
      ),
      'mappings.0.definition',
    ],
    [
      'a definition body of another name',
      mappingConfig(
        entryConfig('alpha', {
          definition: { category: 'AgentDefinition', name: 'beta', references: [], attributes: [] },
        }),
      ),
      'mappings.0.definition.name',
    ],
    [
      'an extension declaration that Agent refuses',
      mappingConfig(entryConfig('alpha', { extensions: [{}] })),
      'mappings.0.extensions.0',
    ],
  ])(
    '%s fails the row, names the missing or wrong field and blocks its consumer',
    async (_, config, path) => {
      const run = await serveRows(config)
      expect(run.result.exitCode).toBe(3)
      expect(run.result.accepting).toBe(false)
      const state = run.state('agent-adoptions')
      expect(state).toMatchObject({ state: 'FAILED' })
      expect(JSON.stringify(state?.['error'])).toContain(path)
      expect(run.state('adoption-sources')).toMatchObject({
        state: 'PENDING',
        blockedBy: ['agent-adoptions'],
      })
    },
  )

  test('the rejection names the field and never repeats the rejected value', async () => {
    const marker = 'MARKER-VALUE-4f9a'
    const run = await serveRows(
      mappingConfig(entryConfig('alpha', { modes: { ...modesOf(), permission: marker } })),
    )
    const output = JSON.stringify([run.records, run.stderr])
    expect(output).toContain('permission')
    expect(output).not.toContain(marker)
  })
})
