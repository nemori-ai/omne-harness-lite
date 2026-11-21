import { expect, it } from 'vitest'
import {
  capabilityId,
  pinBody,
  readBodyText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/assets'

const limits: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 100,
  maxStringLength: 100,
  maxNumberLength: 100,
}

function document(text: string): JsonValue {
  const read = readBodyText(text, limits)
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

it('rejects an identity that omits category or name', () => {
  expect(capabilityId('', 'read_file')).toEqual({ ok: false, rejected: 'incomplete-reference' })
  expect(capabilityId('tool', '')).toEqual({ ok: false, rejected: 'incomplete-reference' })
})

it('keeps pinned content after the caller changes the read document', () => {
  const id = capabilityId('tool', 'read_file')
  if (!id.ok) throw new Error('identity')
  const body = document('{"name":"read_file","composes":{"skills":["review"]}}')
  const pinned = pinBody({
    identity: id.id,
    version: 'v3',
    source: 'workspace-w',
    body,
  })
  if (body.kind !== 'object') throw new Error('object')
  const composes = body.entries[1]?.value
  if (composes?.kind !== 'object') throw new Error('composes')
  const skills = composes.entries[0]?.value
  if (skills?.kind !== 'array') throw new Error('skills')
  const skill = skills.items[0]
  if (skill?.kind !== 'string') throw new Error('skill')
  expect(() => {
    ;(skill as { value: string }).value = 'replacement'
  }).toThrow(TypeError)
  expect(pinned.body).not.toBe(body)
  expect(pinned.version).toBe('v3')
  expect(pinned.source).toBe('workspace-w')
  if (pinned.body.kind !== 'object') throw new Error('pinned')
  const pinnedComposes = pinned.body.entries[1]?.value
  if (pinnedComposes?.kind !== 'object') throw new Error('pinned composes')
  const pinnedSkills = pinnedComposes.entries[0]?.value
  if (pinnedSkills?.kind !== 'array' || pinnedSkills.items[0]?.kind !== 'string')
    throw new Error('pinned skill')
  expect(pinnedSkills.items[0].value).toBe('review')
})

it('does not call getters or iterators installed after the body was read', () => {
  const id = capabilityId('tool', 'read_file')
  if (!id.ok) throw new Error('identity')
  const body = document('{"name":"read_file","composes":{"skills":["review"]}}')
  if (body.kind !== 'object') throw new Error('object')
  const name = body.entries[0]?.value
  if (name?.kind !== 'string') throw new Error('name')
  let reads = 0
  expect(() =>
    Object.defineProperty(name, 'value', {
      get() {
        reads += 1
        return 'other'
      },
    }),
  ).toThrow(TypeError)
  let iterations = 0
  expect(() => {
    body.entries[Symbol.iterator] = function () {
      iterations += 1
      return Array.prototype[Symbol.iterator].call(this)
    }
  }).toThrow(TypeError)
  const pinned = pinBody({ identity: id.id, version: 'v3', source: 'workspace-w', body })
  expect(reads).toBe(0)
  expect(iterations).toBe(0)
  if (pinned.body.kind !== 'object') throw new Error('pinned')
  const pinnedName = pinned.body.entries[0]?.value
  if (pinnedName?.kind !== 'string') throw new Error('pinned name')
  expect(pinnedName.value).toBe('read_file')
})

it('rejects a pin whose body was not read', () => {
  const id = capabilityId('tool', 'read_file')
  if (!id.ok) throw new Error('identity')
  expect(() =>
    pinBody({ identity: id.id, version: 'v3', source: 'workspace-w', body: { name: 'read_file' } }),
  ).toThrow(/body was not read/)
})
