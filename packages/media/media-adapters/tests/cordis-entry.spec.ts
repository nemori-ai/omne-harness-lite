import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { mediaIntakePlugin } from '@omne-harness/media-adapters/cordis'
import type { Custody } from '@omne-harness/media-contract'
import { MediaService } from '@omne-harness/media-cordis-contract/cordis'
import { sessionBeforeIntakePlugin } from '@omne-harness/session-cordis-contract/cordis'

const holds: unknown[] = []
class Media extends MediaService {
  readonly uploads = {} as MediaService['uploads']
  readonly variants = {} as MediaService['variants']
  readonly reads = {} as MediaService['reads']
  readonly custody = {
    hold: async input => {
      holds.push(input.ref)
      return { ok: { facts: { kind: 'image', widthPixels: 2, heightPixels: 1 } } }
    },
  } as Pick<Custody, 'hold'> as Custody
}
const names = (root: Context) => root.sessionBeforeIntake.current().map(each => each.name)

describe('the ./cordis entry', () => {
  it('exports the plugin of the intake adapter', async () => {
    const cordis = (await import('@omne-harness/media-adapters/cordis')) as Record<string, unknown>
    expect(Object.keys(cordis)).toEqual(['mediaIntakePlugin'])
  })

  it('registers media.references while media and the registration point are there', async () => {
    const root = new Context()
    await root.plugin(sessionBeforeIntakePlugin)
    root.plugin(mediaIntakePlugin)
    expect(names(root)).toEqual([])
    const media = await root.plugin(Media)
    expect(names(root)).toEqual(['media.references'])
    const ref = { storage: 'memory', key: 'k', mediaType: 'image/png', bytes: '3', digest: 'd' }
    const block = { kind: 'image', id: 'b1', ref }
    const message = { id: 'm', role: 'user', blocks: [block] }
    const verdict = await root.sessionBeforeIntake.current()[0]!.run({
      original: message,
      effective: message,
      source: 'session.member',
      request: { input: 'in-1', operation: 'op-1' },
      access: { principal: null, tenant: 't', session: 's' },
    } as never)
    expect(verdict).toMatchObject({ kind: 'pass', effective: { blocks: [{ facts: {} }] } })
    expect(holds).toEqual([ref])
    await media.dispose()
    expect(names(root)).toEqual([])
  })

  it('stays out while the registration point is not there', async () => {
    const root = new Context()
    await root.plugin(Media)
    root.plugin(mediaIntakePlugin)
    expect(root.get('sessionBeforeIntake')).toBeUndefined()
    await root.plugin(sessionBeforeIntakePlugin)
    expect(names(root)).toEqual(['media.references'])
  })
})
