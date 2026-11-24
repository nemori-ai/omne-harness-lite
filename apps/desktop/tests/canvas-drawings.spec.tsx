// @vitest-environment happy-dom
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, render, screen } from '@testing-library/react'
import { canvasProtocol } from '@omne-harness/canvas-protocol'
import {
  canvasAppRender,
  canvasElement,
  createCanvasUiModule,
  type CanvasAppSubject,
  type CanvasElementSubject,
} from '@omne-harness/canvas-ui/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import type { KeyRender, RenderPointSink, ShellLogin } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { AppTooltipProvider } from '@omne-harness/ui-kit'
import { parseInstant } from '@omne-harness/utc-instant'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DesktopShell, shellPlugin } from '../src/page/shell/service.ts'
import { createShellState } from '../src/page/shell/state.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const parsed = parseInstant('2026-11-24T10:00:00Z')
if (!parsed.ok) throw new Error('the instant of the case does not parse')
const WHEN = parsed.value

beforeAll(() => {
  const still = () => ({ cancel: () => undefined, finished: Promise.resolve() })
  Object.assign(Element.prototype, { animate: still })
})
afterEach(cleanup)

const settle = () =>
  act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })

const login: ShellLogin = {
  state: () => 'signed-in',
  subscribe: () => () => undefined,
  login: async () => 'signed-in',
  logout: async () => 'signed-out',
}

const thing = (id: string, kind: string, ref: string, x: number) => ({
  id,
  reference: { kind, ref },
  state: 'on',
  at: { x, y: 80 },
  size: { width: 200, height: 120 },
  rank: 1,
  pile: null,
  locked: false,
  by: { kind: 'human' },
  when: WHEN,
})

const declared = (name: string, label: string) => ({
  kind: 'declared',
  name,
  label,
  summary: label,
  reference: label,
})

const canvasClient = {
  look: async () => ({
    outcome: 'succeeded',
    body: {
      sheet: {
        width: 1600,
        height: 900,
        grid: 8,
        size: { min: { width: 120, height: 64 }, max: { width: 900, height: 900 } },
        footprint: { width: 160, height: 80 },
      },
      items: [thing('a', 'canvas.app', 'clock', 80), thing('b', 'test.note', 'n1', 600)],
      piles: [],
      revision: 1,
    },
  }),
  kinds: async () => ({
    outcome: 'succeeded',
    body: { kinds: [declared('canvas.app', '小应用'), declared('test.note', '便签')] },
  }),
  observe: { 'observe-changes': () => (async function* () {})() },
}

function putting<S>(root: Context, name: string, point: RenderPointSink<S>, key: string) {
  const render: KeyRender<S> = () => <p>{name}</p>
  return root.plugin({
    name,
    inject: ['shell'],
    apply: ctx => void point.put(ctx.shell, key, render),
  })
}

describe('two drawings on one key, on the desktop shell', () => {
  it('the page of the canvas names both, for a canvas app and for a kind', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    await root.plugin(shellPlugin(createShellState(login)))
    await serveProtocol(root, canvasProtocol, canvasClient as never)
    await root.plugin(createCanvasUiModule({ preferences: { read: () => null, write: () => {} } }))
    await putting<CanvasAppSubject>(root, 'clock-one', canvasAppRender, 'clock')
    await putting<CanvasAppSubject>(root, 'clock-two', canvasAppRender, 'clock')
    await putting<CanvasElementSubject>(root, 'notes-one', canvasElement, 'test.note')
    await putting<CanvasElementSubject>(root, 'notes-two', canvasElement, 'test.note')
    const shell = root.get('shell') as unknown as DesktopShell
    const [back] = shell.items('back')
    render(
      <AppTooltipProvider>{back!.render({ scope: TENANT, turn: () => {} })}</AppTooltipProvider>,
    )
    await settle()
    expect(screen.getByText('这个名字有两份，互相冲突：clock-one、clock-two')).toBeTruthy()
    expect(screen.getByText('这一类有两份画法，互相冲突：notes-one、notes-two')).toBeTruthy()
  })
})
