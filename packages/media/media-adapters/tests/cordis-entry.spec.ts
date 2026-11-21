import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  MediaModelSourcePlugin,
  MediaToolStorePlugin,
  mediaIntakePlugin,
} from '@omne-harness/media-adapters/cordis'
import type { Custody } from '@omne-harness/media-contract'
import { MediaService } from '@omne-harness/media-cordis-contract/cordis'
import { sessionBeforeIntakePlugin } from '@omne-harness/session-cordis-contract/cordis'

const holds: unknown[] = []
const opens: unknown[] = []
const puts: unknown[] = []
class Media extends MediaService {
  readonly uploads = {} as MediaService['uploads']
  readonly variants: MediaService['variants'] = {
    open: async input => {
      opens.push(input.ref)
      return { failure: { kind: 'too-large' } }
    },
  }
  readonly reads = {} as MediaService['reads']
  readonly representations = {} as MediaService['representations']
  readonly custody = {
    hold: async input => {
      holds.push(input.ref)
      return { ok: { facts: { kind: 'image', widthPixels: 2, heightPixels: 1 } } }
    },
    put: async input => {
      puts.push(input.holder)
      return { failure: { kind: 'unsupported-type' } }
    },
  } as Pick<Custody, 'hold' | 'put'> as Custody
}
const names = (root: Context) => root.sessionBeforeIntake.current().map(each => each.name)

describe('the ./cordis entry', () => {
  it('exports the plugins of the intake adapter, the media source of Model and the converter category', async () => {
    const cordis = (await import('@omne-harness/media-adapters/cordis')) as Record<string, unknown>
    expect(Object.keys(cordis).sort()).toEqual([
      'MediaModelSourcePlugin',
      'MediaToolStorePlugin',
      'converterCategoryPlugin',
      'mediaIntakePlugin',
    ])
    expect(mediaIntakePlugin.name).toBe('media-intake')
  })

  it('provides modelMediaSource while media is there, and a held read after it left is unavailable', async () => {
    const root = new Context()
    root.plugin(MediaModelSourcePlugin)
    expect(root.get('modelMediaSource')).toBeUndefined()
    const media = await root.plugin(Media)
    const source = root.get('modelMediaSource')
    const ref = { storage: 'memory', key: 'k', mediaType: 'image/png', bytes: '3', digest: 'd' }
    const read = () =>
      source?.open(
        {
          principal: null,
          tenant: 't' as never,
          reference: ref,
          limits: { mediaTypes: ['image/png'], maxBytes: 9, image: null },
        },
        new AbortController().signal,
      )
    expect(await read()).toEqual({ failure: { kind: 'too-large' } })
    expect(opens).toEqual([ref])
    await media.dispose()
    expect(root.get('modelMediaSource')).toBeUndefined()
    expect(await read()).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'media is not there' },
    })
    expect(opens).toEqual([ref])
  })

  it('provides toolMediaStore while media is there, and a held put after it left is unavailable', async () => {
    const root = new Context()
    root.plugin(MediaToolStorePlugin)
    expect(root.get('toolMediaStore')).toBeUndefined()
    const media = await root.plugin(Media)
    const store = root.get('toolMediaStore')
    const holder = { owner: 'o', work: 'w', position: 'p', purpose: 'product' }
    const put = () =>
      store?.put({
        principal: null,
        tenant: 't' as never,
        holder,
        mediaType: 'image/png',
        bytes: new Uint8Array([1]),
      })
    expect(await put()).toMatchObject({ failure: { kind: 'unsupported' } })
    expect(puts).toEqual([holder])
    await media.dispose()
    expect(root.get('toolMediaStore')).toBeUndefined()
    expect(await put()).toMatchObject({ failure: { kind: 'unavailable', operation: 'media.put' } })
    expect(puts).toEqual([holder])
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
    const screening = {
      original: message,
      effective: message,
      source: 'session.member',
      request: { input: 'in-1', operation: 'op-1' },
      access: { principal: null, tenant: 't', session: 's' },
    } as never
    const verdict = await root.sessionBeforeIntake.current()[0]!.run(screening)
    expect(verdict).toMatchObject({ kind: 'pass', effective: { blocks: [{ facts: {} }] } })
    expect(holds).toEqual([ref])
    const [inFlight] = root.sessionBeforeIntake.current()
    await media.dispose()
    expect(names(root)).toEqual([])
    expect(await inFlight!.run(screening)).toMatchObject({ kind: 'unavailable' })
    expect(holds).toEqual([ref])
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
