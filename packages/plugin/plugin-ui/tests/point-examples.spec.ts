import type { Context } from '@deepseek-ai/cordis'
import { readManifest, type Member } from '@omne-harness/plugin-protocol'
import { installOn } from '@omne-harness/plugin-ui'
import { changesOn, definePart, tenantScope } from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import { ReferenceShell, exampleOf, startShellOf } from '@omne-harness/shell-contract/testing'
import { describe, expect, it } from 'vitest'

const ALICE =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

class Framed extends ReferenceShell {
  constructor(ctx: Context) {
    super(ctx)
    this.tenant = ALICE
    this.declareOwn([
      { name: 'shell.app', label: '整个应用', summary: '窗口里的一切', depths: ['tokens'] },
    ])
  }

  protected override knowsToken(name: string): boolean {
    return name === '--omne-accent'
  }
}

const parts = [
  definePart({ name: 'session.composer.send', label: '发送', summary: 's', depths: ['style'] }),
  definePart({
    name: 'session.transcript.agent-message',
    label: '消息',
    summary: 's',
    depths: ['render'],
  }),
]

async function world() {
  const started = await startShellOf(Framed)
  let inside: ShellService | undefined
  await started.root.plugin({
    name: 'session-ui',
    inject: ['shell'],
    apply(ctx: Context) {
      for (const part of parts) part.declare(ctx.shell)
    },
  })
  await started.root.plugin({
    name: 'loader',
    inject: ['shell'],
    apply(ctx: Context) {
      inside = ctx.shell
    },
  })
  return { shell: inside!, outer: started.shell }
}

/** The example of a point as a plugin of one member: the manifest a person would copy it into, read by the reader. */
function pluginOf(example: string): Readonly<{ members: readonly Member[]; file?: string }> {
  const [first = '', , ...rest] = example.split('\n')
  const text = `{"schema":1,"name":"copied","summary":"s","client":{"members":[${first}]}}`
  const read = readManifest(text)
  if (read.kind !== 'read') throw new Error(read.reason)
  const members = read.manifest.client?.members ?? []
  return rest.length === 0 ? { members } : { members, file: rest.join('\n') }
}

describe('the example a point of the shell gives, put by the loader as a plugin writes it', () => {
  it('each example is read as a member of a manifest and is installed', async () => {
    const { shell, outer } = await world()
    const points = outer.described().points.filter(point => point.contract.example !== undefined)
    expect(points.map(point => point.name)).toEqual(
      expect.arrayContaining(['shell.tokens', 'shell.part-style', 'shell.part-render']),
    )
    for (const { name, contract } of points) {
      if (contract.binding !== 'run') continue
      const { members, file } = pluginOf(contract.example ?? '')
      expect(exampleOf(contract).member.point, name).toBe(name)
      const installed = await installOn(
        shell,
        { name: `copied-${name.replace(/\W/gu, '-')}`, version: 'v1', members },
        tenantScope(ALICE),
        file === undefined
          ? undefined
          : {
              load: async () =>
                import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(file)}`),
              given: { React: { createElement: (...args: unknown[]) => args } },
            },
      )
      expect(installed.kind, `${name}: ${JSON.stringify(installed)}`).toBe('installed')
    }
    const standing = changesOn(outer.registry(), tenantScope(ALICE), n => n === '--omne-accent')
    const mine = standing.standing.filter(each => !each.builtIn).map(each => each.point)
    expect(mine).toEqual(expect.arrayContaining(['shell.tokens', 'shell.part-style']))
  })
})
