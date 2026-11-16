import { afterEach, describe, expect, it } from 'vitest'
import {
  observe,
  startAccessFixture,
  type AccessFixture,
  type AccessFixtureOptions,
} from './support/access-kit.ts'

const fixtures: AccessFixture[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.stop()))
})

async function entry(options?: AccessFixtureOptions): Promise<AccessFixture> {
  const fixture = await startAccessFixture(options)
  fixtures.push(fixture)
  return fixture
}

const NOTE = { noteId: 'n-1', title: 'first note' }
const ROUNDS = 3

describe('the login check of a running observation, through the entry', () => {
  it.each(['throw', 'reject'] as const)(
    'ends with unavailable, not denied, when the identity port fails by a %s, and the observation leaves once',
    async kind => {
      const fixture = await entry()
      const client = observe(fixture.port, 'watch-note')
      const feed = await fixture.notes.opened(1)
      fixture.accessIdentity.identifyLogin = { kind }
      await client.ended
      expect(client.events()).toEqual([{ kind: 'ended', reason: 'unavailable' }])
      await feed.returned
      expect(feed.context.signal.aborted).toBe(true)
      expect(fixture.log.leaveCounts).toEqual([1])
    },
  )

  it('keeps a valid login silent round after round, then writes the revocation after the frames, and nothing after it', async () => {
    const fixture = await entry()
    const client = observe(fixture.port, 'watch-note')
    const feed = await fixture.notes.opened(1)
    const opening = fixture.accessIdentity.calls.length
    await fixture.accessIdentity.returned('identifyLogin', opening + ROUNDS)
    expect(client.events()).toEqual([])
    expect(feed.context.signal.aborted).toBe(false)

    feed.push(NOTE)
    feed.push({ ...NOTE, title: 'second note' })
    await client.waitForEvents(2)
    expect(feed.context.signal.aborted).toBe(false)

    fixture.accessIdentity.identifyLogin = { kind: 'answer', value: { outcome: 'denied' } }
    await client.ended
    feed.push({ ...NOTE, title: 'third note' })
    await feed.returned
    expect(client.events()).toEqual([
      { kind: 'frame', frame: NOTE },
      { kind: 'frame', frame: { ...NOTE, title: 'second note' } },
      { kind: 'ended', reason: 'denied' },
    ])
    expect(feed.context.signal.aborted).toBe(true)
    expect(fixture.log.leaveCounts).toEqual([1])
  })
})
