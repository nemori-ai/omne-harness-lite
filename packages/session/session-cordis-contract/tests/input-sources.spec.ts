import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { inputSourceName, type InputSourceDeclaration } from '@omne-harness/session-contract'
import {
  sessionInputSourcesKey,
  sessionInputSourcesPlugin,
} from '@omne-harness/session-cordis-contract/cordis'

const NAME = inputSourceName('probe.task')
const declaration: InputSourceDeclaration = {
  name: NAME,
  label: 'Probe task',
  accepts: { subject: 'system', component: 'probe', screened: false },
  wake: 'always',
}

function contributor(name: string, declared = declaration) {
  return {
    name,
    inject: [sessionInputSourcesKey],
    apply(ctx: Context) {
      ctx.sessionInputSources.register(declared)
    },
  }
}

async function tree() {
  const root = new Context()
  await root.plugin(sessionInputSourcesPlugin)
  return root
}

describe('the registration point session.input-sources (IC-13)', () => {
  it('a contribution is there while its plugin is loaded and gone when it unloads', async () => {
    const root = await tree()
    expect(root.sessionInputSources.lookup(NAME)).toEqual({ kind: 'absent' })
    const fiber = await root.plugin(contributor('probe'))
    expect(root.sessionInputSources.lookup(NAME)).toEqual({ kind: 'registered', declaration })
    await fiber.dispose()
    expect(root.sessionInputSources.lookup(NAME)).toEqual({ kind: 'absent' })
  })

  it('the withdrawal of one contributor leaves the declaration of another', async () => {
    const root = await tree()
    const other = { ...declaration, name: inputSourceName('probe.other') }
    const first = await root.plugin(contributor('first'))
    await root.plugin(contributor('second', other))
    await first.dispose()
    expect(root.sessionInputSources.lookup(NAME)).toEqual({ kind: 'absent' })
    expect(root.sessionInputSources.lookup(other.name)).toMatchObject({ kind: 'registered' })
  })

  it('a second declaration of a name fails its own contributor and keeps the first', async () => {
    const root = await tree()
    await root.plugin(contributor('first'))
    const quiet = { ...declaration, wake: 'never' } as const
    await expect(root.plugin(contributor('second', quiet))).rejects.toThrow(/already registered/u)
    expect(root.sessionInputSources.lookup(NAME)).toMatchObject({ declaration: { wake: 'always' } })
  })

  it('the service going away takes every declaration with it', async () => {
    const root = new Context()
    const service = await root.plugin(sessionInputSourcesPlugin)
    await root.plugin(contributor('probe'))
    await service.dispose()
    expect(root.get(sessionInputSourcesKey)).toBeUndefined()
  })
})
