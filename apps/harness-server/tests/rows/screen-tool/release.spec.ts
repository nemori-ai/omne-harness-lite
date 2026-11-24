// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { bodyOf } from '../../r9/support.ts'
import {
  executionFailures,
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
  type ReleaseTreeOptions,
} from '../../support/release-tree.ts'
import { mediaClientOf, noisePng } from '../media-access/support.ts'

type Offered = Awaited<ReturnType<NonNullable<ReleaseTreeOptions['hostScreen']>['screen']>>
type Backend = Extract<Offered, { kind: 'offered' }>['backend']
type Message = Readonly<{ role: string; content: unknown; tool_calls?: readonly unknown[] }>
type Received = Parameters<GatewayScript>[0]

const LEFT = {
  id: 'left',
  name: 'Built-in',
  primary: true,
  pixels: { width: 64, height: 48 },
  scale: 2,
  origin: { x: 0, y: 0 },
}
const RIGHT = {
  id: 'right',
  name: 'External',
  primary: false,
  pixels: { width: 48, height: 40 },
  scale: 1,
  origin: { x: 32, y: 0 },
}
const FRAMES: Readonly<Record<string, Uint8Array>> = {
  left: noisePng(64, 48),
  right: noisePng(48, 40),
}
const base64Of = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

/** A machine with two screens that never reads a real one; `permission` is what its system answers. */
function twoScreens(permission: 'satisfied' | 'unsatisfied' = 'satisfied'): Backend {
  return {
    name: 'fixture',
    verification: 'contract-suite',
    permission: async () => permission,
    list: async () => [LEFT, RIGHT],
    capture: async ({ screen, region }) => {
      const png = FRAMES[screen]
      const { pixels } = screen === 'right' ? RIGHT : LEFT
      if (png === undefined) return 'not-found'
      if (region === null) return { png, ...pixels }
      return {
        png: noisePng(region.width, region.height),
        width: region.width,
        height: region.height,
      }
    },
  }
}
const offering = (backend: Backend) => ({
  screen: async (): Promise<Offered> => ({ kind: 'offered', backend }),
})
const offeringNone = {
  screen: async (): Promise<Offered> => ({ kind: 'absent', reason: 'fixture' }),
}

/** `region:x:y:width:height` asks Screen for a rectangle; any other argument names the screen, or the path of Files. */
function paramsOf(tool: string, argument: string | undefined) {
  if (argument === undefined) return {}
  if (tool !== 'Screen') return { path: argument }
  const [kind, ...sides] = argument.split(':')
  if (kind !== 'region') return { screen: argument }
  const [x, y, width, height] = sides.map(Number)
  return { region: { x, y, width, height } }
}

/** A model that makes the one call its last user message names, then answers with words. */
function calling() {
  const received: Received[] = []
  const pick = toolCallsByRequest(body => {
    const { messages } = JSON.parse(body) as { messages: readonly Message[] }
    const at = messages.findLastIndex(message => message.role === 'user')
    const asked = /CALL (\w+) (\w+)(?: ([\w.:]+))?/u.exec(
      JSON.stringify(messages[at]?.content ?? ''),
    )
    const called = messages.slice(at + 1).some(message => (message.tool_calls?.length ?? 0) > 0)
    if (asked === null || called) return []
    const [, tool = '', command = '', argument] = asked
    const params = paramsOf(tool, argument)
    return [
      {
        id: `call_${String(at)}`,
        tool,
        arguments: JSON.stringify({ command, intent: 'test call', params }),
      },
    ]
  })
  const script: GatewayScript = request => {
    received.push(request)
    return pick(request)
  }
  return { received, script }
}

async function emptySession(tree: ReleaseTree): Promise<string> {
  const created = await tree.cli(['create-session', '--definition', 'coding'])
  expect(created.status, created.stderr).toBe(0)
  return String(bodyOf(created)['session'])
}

async function called(tree: ReleaseTree, session: string, call: string, runs = 1) {
  const sent = await tree.cli(['send-input', '--session', session, '--text', `CALL ${call}`])
  expect(sent.status, sent.stderr).toBe(0)
  const entries = await pollUntil(
    `${String(runs)} Runs of the session to end`,
    () => historyOf(tree, session),
    found => found.filter(each => each.kind === 'run.terminal').length >= runs,
  )
  return { entries, results: toolResults(entries) }
}

type Block = Readonly<{ kind: string; ref?: { key: string; mediaType: string; bytes: string } }>
function blocksOf(value: unknown): Block[] {
  if (Array.isArray(value)) return value.flatMap(blocksOf)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  const own = typeof record['kind'] === 'string' && 'id' in record ? [record as Block] : []
  return [...own, ...Object.values(record).flatMap(blocksOf)]
}
const picturesOf = (entries: Awaited<ReturnType<typeof called>>['entries']) =>
  entries
    .filter(entry => entry.kind === 'message.tool')
    .flatMap(entry => blocksOf(entry.payload))
    .filter(block => block.kind === 'image')

const bypass = { permission: 'bypass-permissions' }

describe('Screen on the release tree, over a machine with two screens (C20)', () => {
  it(
    'lists the screens, and a frame of the primary screen or of the named one reaches the model as its own bytes',
    { tags: ['slow'], timeout: 480_000 },
    async () => {
      const { received, script } = calling()
      const options = { script, ...bypass, hostScreen: offering(twoScreens()) }
      const exitCode = await onReleaseTree(options, async tree => {
        const { client, tenant } = mediaClientOf(tree.port, tree.home)
        const session = await emptySession(tree)
        const listed = await called(tree, session, 'Screen screens')
        expect(listed.results.at(-1)).toBe(
          [
            'done Screen screens',
            'screen="left" name="Built-in" primary=true pixels=64x48 scale=2 origin=0,0',
            'screen="right" name="External" primary=false pixels=48x40 scale=1 origin=32,0',
          ].join('\n'),
        )
        const before = received.length
        const primary = await called(tree, session, 'Screen capture', 2)
        expect(primary.results.at(-1)).toMatch(
          /^done Screen capture screen="left" name="Built-in" screen_pixels=64x48 scale=2 region=0,0,64x48 image_pixels=64x48 taken_at=\d{4}-\d\d-\d\dT[\d:.]+Z$/u,
        )
        const [stored, ...others] = picturesOf(primary.entries)
        expect(others).toEqual([])
        expect(stored?.ref).toMatchObject({
          mediaType: 'image/png',
          bytes: String(FRAMES['left']!.byteLength),
        })
        expect(await client['describe-media']({ tenant, ref: stored!.ref as never })).toMatchObject(
          {
            body: { state: 'held', facts: { kind: 'image', widthPixels: 64, heightPixels: 48 } },
          },
        )
        const sent = base64Of(FRAMES['left']!)
        const after = received.slice(before)
        expect(after.map(request => request.rawBody.includes(sent))).toEqual([false, true])
        const named = await called(tree, session, 'Screen capture right', 3)
        expect(named.results.at(-1)).toContain('screen="right" name="External"')
        expect(picturesOf(named.entries)).toHaveLength(2)
        const zoomed = await called(tree, session, 'Screen capture region:8:4:16:12', 4)
        expect(zoomed.results.at(-1)).toMatch(
          /^done Screen capture screen="left" name="Built-in" screen_pixels=64x48 scale=2 region=8,4,16x12 image_pixels=16x12 /u,
        )
        expect(picturesOf(zoomed.entries)).toHaveLength(3)
        const empty = await called(tree, session, 'Screen capture region:0:0:0:12', 5)
        expect(empty.results.at(-1)).toMatch(/^Screen capture: /u)
        expect(empty.results.at(-1)).toContain(
          'A rectangle of the screen to take instead of all of it',
        )
        expect(picturesOf(empty.entries)).toHaveLength(3)
        expect(executionFailures(tree.storageRoot)).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'an identifier the machine does not have is refused, not replaced by the primary screen; without the permission of the system nothing is handed out',
    { tags: ['slow'], timeout: 480_000 },
    async () => {
      const { script } = calling()
      const stranger = await onReleaseTree(
        { script, ...bypass, hostScreen: offering(twoScreens()) },
        async tree => {
          const session = await emptySession(tree)
          const { entries, results } = await called(tree, session, 'Screen capture gone')
          expect(results).toEqual([
            'rejected reason=notFound screen="gone" is not a screen of this machine; list them with screens',
          ])
          expect(picturesOf(entries)).toEqual([])
        },
      )
      expect(stranger).toBe(0)
      const unpermitted = await onReleaseTree(
        { script, ...bypass, hostScreen: offering(twoScreens('unsatisfied')) },
        async tree => {
          const session = await emptySession(tree)
          const { entries, results } = await called(tree, session, 'Screen capture')
          expect(results).toHaveLength(1)
          expect(results[0]).toMatch(
            /^rejected reason=notAuthorized the system has not permitted reading the screen/u,
          )
          expect(picturesOf(entries)).toEqual([])
        },
      )
      expect(unpermitted).toBe(0)
    },
  )
})

describe('where Screen cannot work it says why, and what can work goes on (C20, C22)', () => {
  it(
    'on a machine with no screen backend a call of Screen is answered as unavailable and does not run; Files reads as before',
    { tags: ['slow'], timeout: 480_000 },
    async () => {
      const { received, script } = calling()
      const options = { script, ...bypass, hostScreen: offeringNone }
      const exitCode = await onReleaseTree(options, async tree => {
        const session = await emptySession(tree)
        const { entries, results } = await called(tree, session, 'Screen capture')
        expect(results).toEqual([
          'Screen is not available now (dependency-unavailable:screen.read). Continue without it.',
        ])
        expect(picturesOf(entries)).toEqual([])
        expect(received.filter(request => request.rawBody.includes('image_url'))).toEqual([])
        const read = await called(tree, session, 'Files list .', 2)
        expect(read.results.at(-1)).toMatch(/^done /u)
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'the release tree without the row media-tool-store: capture answers that nothing can store its product; screens runs',
    { tags: ['slow'], timeout: 480_000 },
    async () => {
      const { received, script } = calling()
      const hostScreen = offering(twoScreens())
      const options = { script, ...bypass, hostScreen, withoutRows: ['media-tool-store'] }
      const exitCode = await onReleaseTree(options, async tree => {
        const session = await emptySession(tree)
        const { entries, results } = await called(tree, session, 'Screen capture')
        expect(results).toEqual([
          'Screen: the command "capture" is not available now (products-unstorable). This deployment has nowhere to store what the command produces. Continue without it.',
        ])
        expect(picturesOf(entries)).toEqual([])
        const listed = await called(tree, session, 'Screen screens', 2)
        expect(listed.results.at(-1)).toContain('screen="left" name="Built-in" primary=true')
        expect(received.filter(request => request.rawBody.includes('image_url'))).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})
