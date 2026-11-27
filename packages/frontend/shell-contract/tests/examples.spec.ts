import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { Contract } from '@omne-harness/dynamis'
import {
  LAYOUT_POINT,
  RENDER_POINT,
  STYLE_POINT,
  TOKENS_POINT,
  defineRenderPoint,
  definePart,
  shellContracts,
  tenantScope,
  type PartDeclaration,
} from '@omne-harness/shell-contract'
import {
  ReferenceShell,
  putExample,
  render,
  startShellOf,
} from '@omne-harness/shell-contract/testing'

const app: PartDeclaration = {
  name: 'shell.app',
  label: '整个应用',
  summary: '窗口里的一切',
  depths: ['tokens', 'style'],
}

const ALICE = '{"organization":"org_1","account":"acc_alice"}'

class Themed extends ReferenceShell {
  constructor(ctx: Context) {
    super(ctx)
    this.declareOwn([app])
  }

  protected override knowsToken(name: string): boolean {
    return name === '--omne-accent'
  }
}

function place(root: Context, name: string, put: (ctx: Context) => void): Fiber {
  return root.plugin({ name, inject: ['shell'], apply: put })
}

async function world() {
  const started = await startShellOf(Themed)
  await place(started.root, 'session-ui', ctx => {
    definePart({
      name: 'session.composer.send',
      label: '发送按钮',
      summary: '发出这条消息',
      depths: ['tokens', 'style'],
    }).declare(ctx.shell)
    definePart({
      name: 'session.transcript.agent-message',
      label: 'Agent 的回复',
      summary: 'Agent 说的一条话',
      depths: ['render'],
    }).declare(ctx.shell)
  })
  const contract = (point: string): Contract => {
    const told = started.shell.described().points.find(each => each.name === point)
    if (told === undefined) throw new Error(`${point} is not declared`)
    return told.contract
  }
  return { ...started, contract }
}

type Element = Readonly<{
  type: string
  props: Readonly<Record<string, unknown>>
  children: unknown[]
}>

const React = {
  createElement: (
    type: string,
    props: Readonly<Record<string, unknown>> | null,
    ...children: unknown[]
  ): Element => ({
    type,
    props: props ?? {},
    children,
  }),
}

describe('the example of each point the shell declares', () => {
  it('puts the brand colour on the whole app', async () => {
    const { shell, contract } = await world()
    shell.tenant = ALICE
    await putExample(shell, contract(TOKENS_POINT), {}, tenantScope(ALICE))
    expect(shell.changes().refused).toEqual([])
    expect(shell.changes().css).toContain(':root{--omne-accent:#0a7a4a;}')
  })

  it('styles the send button at rest and in hover', async () => {
    const { shell, contract } = await world()
    await putExample(shell, contract(STYLE_POINT))
    expect(shell.changes().refused).toEqual([])
    expect(shell.changes().css).toContain(
      '[data-omne-part="session.composer.send"]{border-radius:999px;}[data-omne-part="session.composer.send"]:hover{opacity:0.9;}',
    )
  })

  it('draws a part around the drawing it shipped with, with the name of the part on its root', async () => {
    const { shell, contract } = await world()
    await putExample(shell, contract(RENDER_POINT), { React })
    expect(shell.changes().refused).toEqual([])
    const drawn = shell.drawn(
      'session.transcript.agent-message',
      () => 'built-in',
      {},
    ) as unknown as Element
    expect(drawn.type).toBe('div')
    expect(drawn.props['data-omne-part']).toBe('session.transcript.agent-message')
    expect(drawn.children).toEqual(['built-in'])
  })

  it('orders the pages of the navigation', async () => {
    const { root, shell, contract } = await world()
    await place(root, 'pages', ctx => {
      for (const [id, order] of [
        ['conversation', 0],
        ['notifications', 5],
        ['assets', 10],
      ] as const)
        ctx.shell.contribute('pages', { id, title: id, order, icon: 'topics', render })
    })
    await putExample(shell, contract(LAYOUT_POINT))
    expect(shell.changes().refused).toEqual([])
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(shell.items('pages').map(item => item.id)).toEqual([
      'assets',
      'conversation',
      'notifications',
    ])
  })

  it('names the theme and the brand colour where an agent looks for them', async () => {
    const { contract } = await world()
    expect(contract(TOKENS_POINT).summary).toMatch(/^The theme: /u)
    expect(contract(TOKENS_POINT).summary).toContain('put tokens on shell.app')
    expect(contract(STYLE_POINT).conformance).toContain(
      'base or one of hover, focus-visible, active, selected, open, disabled',
    )
  })

  it('gives no example for the login gate, fixed when the app is built; each other place gives a member of its own point and its file', () => {
    for (const contract of shellContracts) {
      if (contract.name === 'shell.gate') {
        expect(contract.example).toBeUndefined()
        expect(contract.summary).toMatch(
          / Fixed when the app is built: a plugin cannot add to it while the app runs\.$/u,
        )
        continue
      }
      const [member = '', file = ''] = (contract.example ?? '').split('\n')
      expect(JSON.parse(member)).toMatchObject({ point: contract.name, key: '' })
      expect(file).toMatch(/^\S+\.js:$/u)
      expect(contract.summary).toContain('A plugin adds to it while the app runs, for its tenant')
    }
  })
})

describe('a point whose host draws by key', () => {
  it('says what its subject is in what it gives, and carries its example', () => {
    const point = defineRenderPoint({
      name: 'notes.call',
      key: 'the name of the tool',
      summary: 'How a call is drawn.',
      subject: 'name and state of the call',
      example: '{"point":"notes.call","key":"Files","module":"a.js","export":"a"}',
    })
    expect(point.contract.gives).toBe(
      'the scope of the tenant, the subject (name and state of the call), and generic, the drawing the host uses when nothing is put',
    )
    expect(point.contract.example).toBe(
      '{"point":"notes.call","key":"Files","module":"a.js","export":"a"}',
    )
  })
})
