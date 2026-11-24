import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { capabilityId } from '@omne-harness/assets'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decide, type ResidentSegment } from '@omne-harness/session-contract'
import type { CatalogEntry } from '@omne-harness/skill-contract'
import { AdoptionSourcesImpl } from '../../../src/rows/adoption-sources/sources.ts'
import { plannedResidents } from '../../../src/rows/adoption-sources/residents.ts'
import { provideSessionSkills } from '../../../src/rows/skills/session-skills.ts'
import { agentAdoptionsConfig } from '../../../src/rows/agent-adoptions/config.ts'
import { tableMappings } from '../../../src/rows/agent-adoptions/held-definitions.ts'
import { buildTable } from '../../../src/rows/agent-adoptions/table.ts'
import { got } from '../../entry/support.ts'
import { access, createCommand, entryConfig, factsOf, mappingConfig } from '../adoptions/support.ts'
import { releaseFixture } from '../tool-host/support.ts'

type Plain = Record<string, unknown>
type Answer = Outcome<readonly CatalogEntry[], 'unknown'>

const HEADING = [
  '## Skills kept at hand',
  'Each line is a skill: its name, then what it is for. Read one with Skills read before you use it.',
]

function entryOf(name: string, description: string, standIn = false): CatalogEntry {
  const id = capabilityId('skill', name)
  if (!id.ok) throw new Error(name)
  const named = { capability: id.id, name: name as never, description }
  return standIn
    ? { kind: 'stand-in', ...named, reason: 'disabled' as never }
    : { kind: 'adopted', ...named, dependencies: [] }
}

const skillRef = (name: string) => ({ capability: { category: 'skill', name }, resident: true })

const withSkills = (...names: string[]) =>
  mappingConfig(
    entryConfig('alpha', {
      definition: {
        category: 'AgentDefinition',
        type: 'master',
        summary: 'Takes notes.',
        name: 'alpha',
        references: names.map(skillRef),
        attributes: [],
      },
    }),
  )

type Asked = { tenant: TenantId; names: string[] }

function fakeSkills(ctx: Context, answer: (tenant: TenantId) => Answer, asked: Asked[]) {
  provideSessionSkills(ctx, async (tenant, capabilities) => {
    const names = capabilities.map(capability => capability.name)
    asked.push({ tenant, names })
    const given = answer(tenant)
    return 'ok' in given ? succeed(given.ok.filter(entry => names.includes(entry.name))) : given
  })
}

const disposers: (() => Promise<unknown> | unknown)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

async function sourceWith(config: Plain, answer: ((tenant: TenantId) => Answer) | null) {
  const fixture = await releaseFixture()
  const asked: Asked[] = []
  if (answer !== null) {
    const fork = fixture.root.plugin({
      name: 'session-skills-probe',
      apply(ctx: Context) {
        fakeSkills(ctx, answer, asked)
      },
    })
    await fork
    disposers.push(() => fork.dispose())
  }
  const table = await buildTable(agentAdoptionsConfig.parse(config))
  const reported: string[] = []
  let source: AdoptionSourcesImpl | undefined
  await fixture.root.plugin({
    name: 'adoption-source-probe',
    apply(ctx: Context) {
      source = new AdoptionSourcesImpl(ctx, tableMappings(table), reason => {
        reported.push(reason)
      })
    },
  })
  return { fixture, source: got(source, 'adoption source'), reported, asked }
}

async function initialOf(source: AdoptionSourcesImpl) {
  const command = createCommand('alpha')
  const outcome = await source.prepare(command, access)
  if (!('ok' in outcome)) throw new Error(`expected material: ${JSON.stringify(outcome)}`)
  return {
    command,
    guards: outcome.ok,
    initial: factsOf(outcome.ok[0]!)['initialAdoption'] as Plain,
  }
}

describe('a definition that keeps Skills resident: what the creation adopts', () => {
  it('a Skill the tenant holds, enabled or kept as a stand-in, is a line of one segment, in the order of the definition', async () => {
    const { source, reported, asked } = await sourceWith(withSkills('tidy-notes', 'off'), () =>
      succeed([entryOf('off', 'Was on once.', true), entryOf('tidy-notes', 'Tidies notes.')]),
    )
    const { initial, command, guards } = await initialOf(source)
    const segments = initial['newSegments'] as ResidentSegment[]
    expect(segments).toHaveLength(1)
    expect(segments[0]!.key).toBe('skills')
    expect(segments[0]!.text).toBe(
      [...HEADING, '- tidy-notes: Tidies notes.', '- off: Was on once.'].join('\n'),
    )
    expect(segments[0]!.sources.map(item => [item.category, item.name])).toEqual([
      ['skill', 'tidy-notes'],
      ['skill', 'off'],
    ])
    expect(segments[0]!.sources.map(item => item.digest)).toEqual(
      ['- tidy-notes: Tidies notes.', '- off: Was on once.'].map(
        line => `sha256:${createHash('sha256').update(line).digest('hex')}`,
      ),
    )
    expect(reported).toEqual([])
    expect(asked).toEqual([{ tenant: access.tenant, names: ['tidy-notes', 'off'] }])

    // The session writes the segment once, in the same commit as the adoption.
    const decision = decide(null, command, guards, null, { compaction: null })
    if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
    const written = decision.entries.filter(
      entry => entry.kind === 'session.prompt-segment-admitted',
    )
    expect(written).toHaveLength(1)
    expect(JSON.stringify(written[0])).toContain(JSON.stringify(segments[0]!.text).slice(1, -1))
    expect(decision.entries.some(entry => entry.kind === 'session.adoption')).toBe(true)
  })

  it('a Skill the tenant does not hold is left out, said why, and the session is made', async () => {
    const { source, reported } = await sourceWith(withSkills('tidy-notes', 'never'), () =>
      succeed([entryOf('tidy-notes', 'Tidies notes.')]),
    )
    const { initial } = await initialOf(source)
    expect((initial['newSegments'] as ResidentSegment[])[0]!.text).not.toContain('never')
    expect(reported).toEqual(['resident skill never: this tenant does not hold it'])
  })

  it('no Skill held: no segment at all, and the session is made', async () => {
    const { source, reported } = await sourceWith(withSkills('never'), () => succeed([]))
    const { initial } = await initialOf(source)
    expect(initial).not.toHaveProperty('newSegments')
    expect(reported).toEqual(['resident skill never: this tenant does not hold it'])
  })

  it('a catalog that cannot be read now, or that is not there, records nothing and says it cannot be read, not that the Skill is missing', async () => {
    for (const answer of [() => fail('unknown' as const), null]) {
      const { source, reported } = await sourceWith(withSkills('tidy-notes', 'more'), answer)
      const { initial } = await initialOf(source)
      expect(initial).not.toHaveProperty('newSegments')
      expect(reported).toEqual([
        'resident skills tidy-notes, more: the Skill catalog cannot be read now',
      ])
    }
  })

  it('without the access of the session the catalog is not asked: nothing is recorded, and it says so', async () => {
    const { fixture, asked } = await sourceWith(withSkills('a'), () =>
      succeed([entryOf('a', 'first')]),
    )
    const reported: string[] = []
    const planned = await plannedResidents(
      fixture.root,
      [{ category: 'skill', name: 'a' }],
      undefined,
      reason => reported.push(reason),
    )
    expect(planned).toEqual({ ok: { residents: [], keys: [] } })
    expect(reported).toEqual(['resident skills a: the Skill catalog cannot be read now'])
    expect(asked).toEqual([])
  })

  it('asks the catalog as the tenant of the session: another tenant’s Skill of the same name is not that tenant’s', async () => {
    const own = access.tenant
    const { source, reported } = await sourceWith(withSkills('tidy-notes'), tenant =>
      succeed(tenant === own ? [] : [entryOf('tidy-notes', 'Belongs to another tenant.')]),
    )
    const { initial } = await initialOf(source)
    expect(initial).not.toHaveProperty('newSegments')
    expect(reported).toEqual(['resident skill tidy-notes: this tenant does not hold it'])
  })
})

describe('a definition that gains a resident Skill: what the next adoption point adds', () => {
  it('keeps the segment the session has and adds a line for the new Skill only', async () => {
    const { fixture } = await sourceWith(withSkills('a'), () =>
      succeed([entryOf('a', 'first'), entryOf('b', 'second')]),
    )
    const kept: ResidentSegment = {
      key: 'skills',
      text: [...HEADING, '- a: first'].join('\n'),
      sources: [{ category: 'skill', name: 'a', digest: 'sha256:a' }],
    }
    const planned = await plannedResidents(
      fixture.root,
      [
        { category: 'skill', name: 'a' },
        { category: 'skill', name: 'b' },
      ],
      access,
      () => {},
      null,
      {
        residents: [],
        residentKeys: [],
        segments: [{ key: 'another', text: 'not of the skills', sources: [] }, kept],
      },
    )
    if (!('ok' in planned)) throw new Error(JSON.stringify(planned))
    expect(planned.ok.segments).toEqual([
      {
        key: 'skills',
        text: `${kept.text}\n- b: second`,
        sources: [...kept.sources, { category: 'skill', name: 'b', digest: expect.any(String) }],
      },
    ])
  })

  it('adds nothing when every resident Skill is already in the segment', async () => {
    const { fixture } = await sourceWith(withSkills('a'), () => succeed([entryOf('a', 'changed')]))
    const planned = await plannedResidents(
      fixture.root,
      [{ category: 'skill', name: 'a' }],
      access,
      () => {},
      null,
      {
        residents: [],
        residentKeys: [],
        segments: [
          {
            key: 'skills',
            text: [...HEADING, '- a: first'].join('\n'),
            sources: [{ category: 'skill', name: 'a', digest: 'sha256:a' }],
          },
        ],
      },
    )
    expect(planned).toEqual({ ok: { residents: [], keys: [] } })
  })
})
