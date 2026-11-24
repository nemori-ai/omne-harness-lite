import { act, render, screen, within } from '@testing-library/react'
import type {
  CanvasBody,
  CanvasItemBody,
  CanvasKindBody,
  CanvasPileBody,
} from '@omne-harness/canvas-protocol'
import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { AppTooltipProvider } from '@omne-harness/ui-kit'
import { parseInstant } from '@omne-harness/utc-instant'
import type { CanvasClient, CanvasPreference, CanvasPreferences } from '../../src/index.ts'
import { createCanvasUiModule } from '../../src/cordis.ts'
import { createFakeClient, type Call } from './fake-client.ts'
import { startConnected } from './reference-shell.ts'

export const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
export const OPERATIONS = Object.keys(canvasProtocol.operations)
/** The least and most sizes and the footprint differ from any deployment's, so a number written into the module shows. */
export const SHEET = {
  width: 1600,
  height: 900,
  grid: 8,
  size: { min: { width: 96, height: 48 }, max: { width: 320, height: 240 } },
  footprint: { width: 176, height: 96 },
}
export const NOTE = 'test.note'
export const NOTE_KIND: CanvasKindBody = {
  kind: 'declared',
  name: NOTE,
  label: '便签',
  summary: '一张便签',
  reference: '便签的标识',
}
const parsed = parseInstant('2026-11-24T10:00:00Z')
if (!parsed.ok) throw new Error('the instant of the cases does not parse')
const WHEN: CanvasItemBody['when'] = parsed.value

export const tick = () => new Promise(resolve => setTimeout(resolve, 0))
export const settle = () => act(tick)

export function item(id: string, over: Partial<CanvasItemBody> = {}): CanvasItemBody {
  return {
    id,
    reference: { kind: NOTE, ref: `ref-${id}` },
    state: 'on',
    at: { x: 80, y: 80 },
    size: { width: 200, height: 120 },
    rank: 1,
    pile: null,
    locked: false,
    by: { kind: 'human' },
    when: WHEN,
    ...over,
  }
}

export function pile(id: string, over: Partial<CanvasPileBody> = {}): CanvasPileBody {
  return { id, name: null, at: { x: 800, y: 400 }, by: { kind: 'human' }, when: WHEN, ...over }
}

export const canvas = (
  items: readonly CanvasItemBody[],
  piles: readonly CanvasPileBody[] = [],
): CanvasBody => ({ sheet: SHEET, items: [...items], piles: [...piles], revision: 1 })

/** A device store in memory; a case may make it throw, or hold text that is not a preference. */
export function memoryPreferences(held: Partial<Record<CanvasPreference, string>> = {}) {
  const kept = new Map(Object.entries(held))
  const writes: [CanvasPreference, string][] = []
  const preferences: CanvasPreferences = {
    read: name => kept.get(name) ?? null,
    write(name, text) {
      writes.push([name, text])
      kept.set(name, text)
    },
  }
  return { preferences, writes }
}

export type Opened = Awaited<ReturnType<typeof opened>>

/** The back drawn on the reference shell for the tenant, its first reads not answered yet. */
export async function opening(
  preferences: CanvasPreferences = memoryPreferences().preferences,
  turn: () => void = () => undefined,
) {
  const started = await startConnected()
  started.shell.tenant = TENANT
  const fake = createFakeClient<CanvasClient>(OPERATIONS)
  await serveProtocol(started.root, canvasProtocol, fake.client)
  await started.root.plugin(createCanvasUiModule({ preferences }))
  const [back] = started.shell.items('back')
  if (back === undefined) throw new Error('nothing is on the back')
  const view = render(
    <AppTooltipProvider>{back.render({ scope: TENANT, turn })}</AppTooltipProvider>,
  )
  return { ...started, fake, view }
}

/** The back with the canvas read as given, and the kinds as given. */
export async function opened(
  body: CanvasBody,
  kinds: readonly CanvasKindBody[] | 'unreadable' = [NOTE_KIND],
  preferences?: CanvasPreferences,
  turn?: () => void,
) {
  const world = await opening(preferences, turn)
  ;(await world.fake.next('look')).answer({ outcome: 'succeeded', body })
  const kindsCall = await world.fake.next('kinds')
  kindsCall.answer(
    kinds === 'unreadable'
      ? { outcome: 'basis-unavailable' }
      : { outcome: 'succeeded', body: { kinds } },
  )
  await settle()
  return world
}

/** Answers the read that follows a command, as the server would after it. */
export async function reread(world: Opened, body: CanvasBody): Promise<Call> {
  const look = await world.fake.next('look')
  look.answer({ outcome: 'succeeded', body })
  await settle()
  return look
}

export const page = (id: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[data-item="${id}"] [data-slot="paper-page"]`)
  if (found === null) throw new Error(`no page for ${id}`)
  return found
}

export const handle = (id: string): HTMLElement =>
  within(page(id)).getByRole('button', { name: new RegExp(`ref-${id}$`, 'u') })

export const placedAt = (element: HTMLElement) => ({
  x: Number(element.style.getPropertyValue('--omne-paper-x')),
  y: Number(element.style.getPropertyValue('--omne-paper-y')),
  width: Number(element.style.getPropertyValue('--omne-paper-w')),
  height: Number(element.style.getPropertyValue('--omne-paper-h')),
})

export { screen }
