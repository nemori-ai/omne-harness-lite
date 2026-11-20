import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { IntakeProcessor } from '@omne-harness/session-contract'
import {
  sessionBeforeIntakeKey,
  sessionBeforeIntakePlugin,
} from '@omne-harness/session-cordis-contract/cordis'

const processor = (name: string): IntakeProcessor<unknown> => ({
  name,
  run: async () => ({ kind: 'pass' }),
})

function contributor(name: string, ...processors: IntakeProcessor<unknown>[]) {
  return {
    name,
    inject: [sessionBeforeIntakeKey],
    apply(ctx: Context) {
      for (const each of processors) ctx.sessionBeforeIntake.register(each)
    },
  }
}
const names = (root: Context) => root.sessionBeforeIntake.current().map(each => each.name)

async function tree() {
  const root = new Context()
  await root.plugin(sessionBeforeIntakePlugin)
  return root
}

describe('the registration point session.before-intake (IC-13)', () => {
  it('a processor is there while its plugin is loaded and gone when it unloads', async () => {
    const root = await tree()
    expect(names(root)).toEqual([])
    const fiber = await root.plugin(contributor('media', processor('media.references')))
    expect(names(root)).toEqual(['media.references'])
    await fiber.dispose()
    expect(names(root)).toEqual([])
  })

  it('the processors of every contributor are listed in the order of their names', async () => {
    const root = await tree()
    const first = await root.plugin(contributor('media', processor('media.references')))
    await root.plugin(contributor('audit', processor('audit.words'), processor('audit.b')))
    expect(names(root)).toEqual(['audit.b', 'audit.words', 'media.references'])
    await first.dispose()
    expect(names(root)).toEqual(['audit.b', 'audit.words'])
  })

  it('a second processor of a name fails its own contributor and keeps the first', async () => {
    const root = await tree()
    const first = processor('media.references')
    await root.plugin(contributor('first', first))
    await expect(root.plugin(contributor('second', processor('media.references')))).rejects.toThrow(
      /already registered/u,
    )
    expect(root.sessionBeforeIntake.current()).toEqual([first])
  })

  it('the service going away takes every processor with it', async () => {
    const root = new Context()
    const service = await root.plugin(sessionBeforeIntakePlugin)
    await root.plugin(contributor('media', processor('media.references')))
    await service.dispose()
    expect(root.get(sessionBeforeIntakeKey)).toBeUndefined()
  })
})
