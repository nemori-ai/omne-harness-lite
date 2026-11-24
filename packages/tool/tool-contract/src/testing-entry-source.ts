import assert from 'node:assert/strict'
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import type { ToolDefinition } from './definitions.ts'
import {
  judgeToolSourceListing,
  type ToolEntrySource,
  type ToolSourceCall,
  type ToolSourceEntry,
  type ToolSourceListing,
} from './entry-source.ts'
import type { Access } from './identity.ts'
import type { ToolRenderedResult } from './results.ts'
import { conformanceCase, type ConformanceCase } from './testing-case.ts'
import { structuredReturnFixture } from './testing-returns.ts'
import { adoption, digestOf, tenantKey } from './testing-values.ts'

/** A lawful entry of a source: a commands tool whose commands each take one string, `text`. */
export function testingSourceEntry(
  input: Readonly<{
    name: string
    category: string
    capability?: string
    commands?: readonly string[]
    revision?: string
    unavailable?: string
  }>,
): ToolSourceEntry {
  const commands = input.commands ?? ['run']
  const facts = [input.name, commands, input.revision ?? '1']
  const definition: ToolDefinition = {
    adoption: {
      owner: 'conformance',
      name: input.name,
      revision: input.revision ?? '1',
      digest: digestOf(facts),
    },
    name: input.name,
    description: `The ${input.name} entry of a testing source.`,
    requiredCapabilities: [],
    backgroundAllowed: false,
    declarations: {
      adoption: adoption('declarations'),
      environment: null,
      attachments: [],
      inputModalities: [],
      outputModalities: [],
      settings: null,
    },
    kind: 'commands',
    encoding: 'wrapped',
    commands: commands.map(command => ({
      name: command,
      summary: `Runs ${command}.`,
      parameters: {
        kind: 'declared',
        value: {
          schema: {
            kind: 'object',
            entries: [
              { key: 'type', value: { kind: 'string', value: 'object' } },
              {
                key: 'properties',
                value: {
                  kind: 'object',
                  entries: [
                    {
                      key: 'text',
                      value: {
                        kind: 'object',
                        entries: [{ key: 'type', value: { kind: 'string', value: 'string' } }],
                      },
                    },
                  ],
                },
              },
            ],
          },
          vocabulary: adoption('json-schema'),
          descriptions: [{ path: 'text', text: 'The text value.' }],
        },
      },
      returns: structuredReturnFixture(adoption('ToolResult')),
    })),
  }
  return {
    capability: {
      category: input.category,
      name: input.capability ?? input.name.slice(input.name.indexOf('__') + 2),
    },
    definition,
    executor: adoption(`${input.name}-executor`),
    availability:
      input.unavailable === undefined
        ? { kind: 'available' }
        : { kind: 'known-unavailable', reason: input.unavailable },
  }
}

export type MemoryToolEntrySource<P, B extends ContentBlock> = ToolEntrySource<P, B> &
  Readonly<{ calls: readonly ToolSourceCall<P>[] }>

/** A source whose listing is scripted for each asker; it selects from what it last listed to the tenant. */
export function createMemoryToolEntrySource<P, B extends ContentBlock>(
  input: Readonly<{
    prefix: string
    listing(access: Access<P>): ToolSourceListing | Promise<ToolSourceListing>
    execute(call: ToolSourceCall<P>): Promise<ToolRenderedResult<B>>
  }>,
): MemoryToolEntrySource<P, B> {
  const listed = new Map<string, readonly ToolSourceEntry[]>()
  const calls: ToolSourceCall<P>[] = []
  return {
    prefix: input.prefix,
    calls,
    async list(access) {
      const listing = await input.listing(access)
      listed.set(tenantKey(access.tenant), listing.entries)
      return succeed(listing)
    },
    select: (access, name) =>
      listed.get(tenantKey(access.tenant))?.find(entry => entry.definition.name === name),
    execute(call) {
      calls.push(call)
      return input.execute(call)
    },
  }
}

export type ToolEntrySourceFixture<P, B extends ContentBlock> = Readonly<{
  source: ToolEntrySource<P, B>
  /** An asker to whom the source lists at least one available entry. */
  owner: Access<P>
  /** An asker of another tenant, who holds nothing the owner holds. */
  stranger: Access<P>
}>

async function listingOf<P, B extends ContentBlock>(
  source: ToolEntrySource<P, B>,
  access: Access<P>,
): Promise<ToolSourceListing> {
  const answer = await source.list(access)
  if ('failure' in answer) assert.fail(`list: ${JSON.stringify(answer.failure)}`)
  return answer.ok
}

const namesOf = (listing: ToolSourceListing): readonly string[] => [
  ...listing.entries.map(entry => entry.definition.name),
  ...listing.withheld.map(entry => entry.name),
]

export function toolEntrySourceConformance<P, B extends ContentBlock>(): readonly ConformanceCase<
  ToolEntrySourceFixture<P, B>
>[] {
  type F = ToolEntrySourceFixture<P, B>
  return [
    conformanceCase<F>(
      'entry-source',
      'the listing stands: every name is under the prefix and every definition is lawful',
      async ({ source, owner }) => {
        const listing = await listingOf(source, owner)
        const judged = judgeToolSourceListing(source.prefix, listing)
        if ('failure' in judged) assert.fail(`listing: ${JSON.stringify(judged.failure)}`)
        assert.ok(
          listing.entries.some(entry => entry.availability.kind === 'available'),
          'the fixture lists an available entry to the owner',
        )
      },
    ),

    conformanceCase<F>(
      'entry-source',
      'select answers the entry the last listing left, with the same definition and executor',
      async ({ source, owner }) => {
        const listing = await listingOf(source, owner)
        for (const entry of listing.entries) {
          const selected = source.select(owner, entry.definition.name)
          assert.deepEqual(selected?.definition.adoption, entry.definition.adoption)
          assert.deepEqual(selected?.executor, entry.executor)
          assert.deepEqual(selected?.capability, entry.capability)
        }
      },
    ),

    conformanceCase<F>(
      'entry-source',
      'a name the listing did not give is not selected',
      async ({ source, owner }) => {
        const listing = await listingOf(source, owner)
        const absent = `${source.prefix}never_listed_${namesOf(listing).length}`
        assert.equal(source.select(owner, absent), undefined)
        assert.equal(source.select(owner, 'outside_the_prefix'), undefined)
        for (const { name } of listing.withheld) assert.equal(source.select(owner, name), undefined)
      },
    ),

    conformanceCase<F>(
      'entry-source',
      'another tenant neither lists nor selects what the owner holds',
      async ({ source, owner, stranger }) => {
        const held = namesOf(await listingOf(source, owner))
        const foreign = await source.list(stranger)
        const seen = 'ok' in foreign ? namesOf(foreign.ok) : []
        assert.deepEqual(
          seen.filter(name => held.includes(name)),
          [],
        )
        for (const name of held) assert.equal(source.select(stranger, name), undefined)
      },
    ),

    conformanceCase<F>(
      'entry-source',
      'listing again with nothing changed gives the same entries',
      async ({ source, owner }) => {
        const facts = (listing: ToolSourceListing) =>
          listing.entries.map(entry => [
            entry.definition.adoption,
            entry.executor,
            entry.capability,
            entry.availability,
          ])
        const first = await listingOf(source, owner)
        const second = await listingOf(source, owner)
        assert.deepEqual(facts(second), facts(first))
        assert.deepEqual(second.withheld, first.withheld)
      },
    ),
  ]
}
