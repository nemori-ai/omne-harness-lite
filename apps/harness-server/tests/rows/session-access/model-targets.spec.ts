import { describe, expect, it } from 'vitest'
import {
  profileCovers,
  type ModalityRequirement,
  type ModelProfile,
  type ProfileResolution,
} from '@omne-harness/model-contract'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import type { ModelViewRow } from '@omne-harness/session-contract'
import {
  SELECTION_REQUIREMENT_SOURCE,
  modelTargetsOf,
  readModelView,
  targetOf,
} from '../../../src/rows/session-access/model-targets.ts'

const adoption = {
  owner: 'pi-ai-anthropic',
  name: 'anthropic/claude-sonnet-5',
  revision: '3',
  digest: 'd'.repeat(64),
}
const source = {
  owner: 'model-profiles',
  record: 'snapshot',
  revision: '1',
  digest: 'e'.repeat(64),
}
const profile = { adoption } as unknown as ModelProfile

function resolved(
  changes: Partial<Extract<ProfileResolution, { kind: 'resolved' }>> = {},
): ProfileResolution {
  return {
    kind: 'resolved',
    profile,
    source,
    selectable: true,
    reasons: [],
    credential: 'available',
    shadowed: [],
    ...changes,
  }
}

describe('what a resolved route means for a selection', () => {
  it.each(['unknown-name', 'withdrawn', 'excluded'] as const)(
    'an absent profile (%s) is refused with that reason',
    reason => {
      expect(targetOf({ kind: 'absent', reason })).toEqual({ kind: 'refused', reason })
    },
  )

  it.each(['modality', 'locked', 'scope'] as const)(
    'a profile that is not selectable (%s) is refused with its first reason',
    reason => {
      expect(targetOf(resolved({ selectable: false, reasons: [reason, 'scope'] }))).toEqual({
        kind: 'refused',
        reason,
      })
    },
  )

  it('a profile that is not selectable without a reason answers unavailable, not a refusal', () => {
    expect(targetOf(resolved({ selectable: false, reasons: [] }))).toEqual({ kind: 'unavailable' })
  })

  it.each([
    ['available', 'available'],
    ['missing', 'missing'],
    ['unreadable', 'unknown'],
    ['unavailable', 'unknown'],
  ] as const)(
    'a selectable profile with a %s credential is selectable, its basis the profile adoption',
    (credential, expected) => {
      expect(targetOf(resolved({ credential }))).toEqual({
        kind: 'selectable',
        credential: expected,
        basis: {
          owner: adoption.owner,
          record: adoption.name,
          revision: '3',
          digest: adoption.digest,
        },
      })
    },
  )
})

describe('the port over the profiles service', () => {
  it('answers no port when the profiles service is absent', () => {
    expect(modelTargetsOf(undefined)).toBeUndefined()
  })

  it('asks for the route with a text requirement, and answers unavailable when Model cannot answer', async () => {
    const asked: unknown[] = []
    let answer: Awaited<ReturnType<ModelProfiles<unknown>['resolve']>> = { ok: resolved() }
    const profiles = {
      resolve: async (input: unknown) => {
        asked.push(input)
        return answer
      },
    } as unknown as ModelProfiles<unknown>
    const port = modelTargetsOf(profiles)
    const call = { principal: { id: 'p' } as never, tenant: 't' as never, route: adoption.name }
    expect((await port?.check(call))?.kind).toBe('selectable')
    expect(asked).toEqual([
      { ...call, required: { modalities: ['text'], source: SELECTION_REQUIREMENT_SOURCE } },
    ])
    answer = { failure: { kind: 'unavailable', dependency: 'model-profiles', diagnostic: 'x' } }
    expect(await port?.check(call)).toEqual({ kind: 'unavailable' })
  })
})

type Message = ModelViewRow['message']

describe('a target judged for the history of a session', () => {
  const visibility = { toHuman: true, toModel: true }
  const medium = (
    id: string,
    mediaType: string,
    kind = 'file',
    transcript: string | null = null,
  ) => ({
    kind,
    id,
    visibility,
    ref: { storage: 'local', key: `k-${id}`, mediaType, bytes: '3', digest: `sha256:${id}` },
    transcript,
  })
  const message = (n: number, ...blocks: unknown[]): Message =>
    ({ id: `msg_${String(n)}`, role: 'user', blocks }) as unknown as Message
  const words = { kind: 'text', id: 'blk_words', visibility, text: 'look' }
  const HISTORY = [
    message(1, words, medium('blk_picture', 'image/png', 'image')),
    message(2, medium('blk_described', 'image/png', 'image', 'a red circle')),
    message(3, medium('blk_scan', 'application/pdf')),
  ]
  const session = 'session-1' as never
  const call = {
    principal: { id: 'p' } as never,
    tenant: 't' as never,
    route: adoption.name,
    session,
  }

  /** Profiles whose one route takes what `definition` says: it judges the requirement as Model does. */
  function world(definition: Pick<ModelProfile['definition'], 'input' | 'fileTypes'>) {
    const asked: ModalityRequirement[] = []
    const taking = { adoption, definition } as unknown as ModelProfile
    const profiles = {
      resolve: async (input: { required: ModalityRequirement }) => {
        asked.push(input.required)
        const covered = profileCovers(definition, input.required)
        return {
          ok: resolved({
            profile: taking,
            selectable: covered,
            reasons: covered ? [] : ['modality'],
          }),
        }
      },
    } as unknown as ModelProfiles<unknown>
    return { asked, profiles }
  }
  const reading = (messages: readonly Message[] | null) => {
    const reads: unknown[] = []
    const read = async (input: unknown) => (reads.push(input), messages)
    return { reads, read }
  }

  it('asks Model for what the history needs natively, and names the blocks a model does not read', async () => {
    const { asked, profiles } = world({ input: ['text'] })
    const { reads, read } = reading(HISTORY)
    expect(await modelTargetsOf(profiles, read)?.check(call)).toEqual({
      kind: 'refused',
      reason: 'modality',
      blocks: [
        { message: HISTORY[0]?.id, block: 'blk_picture' },
        { message: HISTORY[2]?.id, block: 'blk_scan' },
      ],
    })
    expect(reads).toEqual([{ tenant: 't', session }])
    expect(asked).toEqual([
      {
        modalities: ['text', 'image'],
        fileTypes: ['application/pdf'],
        source: SELECTION_REQUIREMENT_SOURCE,
      },
    ])
  })

  it('a model that reads pictures is still stopped by the scan, and only the scan is named', async () => {
    const { profiles } = world({ input: ['text', 'image'] })
    expect(await modelTargetsOf(profiles, reading(HISTORY).read)?.check(call)).toMatchObject({
      reason: 'modality',
      blocks: [{ message: HISTORY[2]?.id, block: 'blk_scan' }],
    })
  })

  it('a model that reads all of it is selectable; so is any model over a history of words', async () => {
    const all = world({ input: ['text', 'image'], fileTypes: ['application/pdf'] })
    expect((await modelTargetsOf(all.profiles, reading(HISTORY).read)?.check(call))?.kind).toBe(
      'selectable',
    )
    const plain = world({ input: ['text'] })
    const wordsOnly = reading([message(1, words), HISTORY[1] as Message])
    expect((await modelTargetsOf(plain.profiles, wordsOnly.read)?.check(call))?.kind).toBe(
      'selectable',
    )
    expect(plain.asked).toEqual([{ modalities: ['text'], source: SELECTION_REQUIREMENT_SOURCE }])
  })

  it('a history that cannot be read is unavailable, never an empty history; Model is not asked', async () => {
    const { asked, profiles } = world({ input: ['text', 'image'] })
    expect(await modelTargetsOf(profiles, reading(null).read)?.check(call)).toEqual({
      kind: 'unavailable',
    })
    expect(await modelTargetsOf(profiles)?.check(call)).toEqual({ kind: 'unavailable' })
    const failing = async () => Promise.reject(new Error('the log is away'))
    expect(await modelTargetsOf(profiles, failing)?.check(call)).toEqual({ kind: 'unavailable' })
    expect(asked).toEqual([])
  })

  it('a target judged with no session, as when a session is created, needs words only', async () => {
    const { asked, profiles } = world({ input: ['text'] })
    const { reads, read } = reading(HISTORY)
    const { session: _session, ...creating } = call
    expect((await modelTargetsOf(profiles, read)?.check(creating))?.kind).toBe('selectable')
    expect([reads, asked]).toEqual([
      [],
      [{ modalities: ['text'], source: SELECTION_REQUIREMENT_SOURCE }],
    ])
  })
})

describe('reading the whole model view of a session', () => {
  type Read = Parameters<typeof readModelView>[0]
  type Page = Awaited<ReturnType<Read>>
  const row = (id: string) => ({ message: { id } }) as never
  const page = (ids: string[], next: string | null): Page =>
    ({ ok: { kind: 'page', basis: { epoch: 'e1', upper: '9' }, rows: ids.map(row), next } }) as Page
  const CHANGED = { ok: { kind: 'epoch-changed', current: { epoch: 'e2', upper: '1' } } } as Page
  const scripted = (...pages: Page[]) => {
    const asked: unknown[] = []
    const read: Read = async at => (asked.push(at), pages.shift() ?? CHANGED)
    return { asked, read }
  }

  it('follows the pages on the basis the first one gave, and joins their messages in order', async () => {
    const { asked, read } = scripted(page(['a', 'b'], 'c1'), page(['c'], null))
    expect(await readModelView(read)).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(asked).toEqual([
      { basis: null, after: null, pageBytes: 1_048_576 },
      { basis: { epoch: 'e1', upper: '9' }, after: 'c1', pageBytes: 1_048_576 },
    ])
  })

  it('starts over when the epoch changes under the read, and keeps nothing of the old epoch', async () => {
    const { asked, read } = scripted(page(['old'], 'c1'), CHANGED, page(['new'], null))
    expect(await readModelView(read)).toEqual([{ id: 'new' }])
    expect(asked.at(-1)).toEqual({ basis: null, after: null, pageBytes: 1_048_576 })
  })

  it('answers null when a page fails, and when the epoch keeps changing', async () => {
    const failed = { failure: { kind: 'unavailable', owner: 'storage', diagnostic: 'x' } } as Page
    expect(await readModelView(scripted(page(['a'], 'c1'), failed).read)).toBeNull()
    const { asked, read } = scripted()
    expect(await readModelView(read)).toBeNull()
    expect(asked).toHaveLength(3)
  })
})
