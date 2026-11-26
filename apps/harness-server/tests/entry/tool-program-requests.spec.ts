import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { testingSourceEntry } from '@omne-harness/tool-contract/testing'
import {
  createProgramFunctions,
  createProgramTargetRequests,
  type ProgramRequestPorts,
} from '../../src/entry/tool-program-requests.ts'
import { targetResidency } from '../../src/entry/tool-target-residency.ts'
import { tree } from '../rows/tool-host/support.ts'
import { forwardWorld } from './tool-forward-support.ts'

type World = Awaited<ReturnType<typeof forwardWorld>>

const portsOf = (world: World, over: Partial<ProgramRequestPorts> = {}): ProgramRequestPorts => ({
  release: () => world.release,
  catalog: () => world.catalog,
  view: () => world.view,
  operatorSettings: () => ({}),
  ...over,
})
const codeParent = (world: World) => ({ ...world.parent, request: world.request('Code') })
const read = { name: 'Files', command: 'read', arguments: tree({ path: 'a.txt' }) }
const run = { name: 'Shell', command: 'execute', arguments: tree({ script: 'echo hi' }) }

async function onWorld(body: (world: World) => Promise<void>) {
  const world = await forwardWorld()
  try {
    await body(world)
  } finally {
    await world.close()
  }
}

describe('the trusted source of the request of a program call', () => {
  it('takes a resident target, inherits what the parent pinned, and gives the target its own limits', () =>
    onWorld(async world => {
      const directory = { path: '/srv/blog', workspace: null }
      const parent = codeParent(world)
      const pinned = { ...parent, request: { ...parent.request, directory } }
      const made = await createProgramTargetRequests(portsOf(world))(pinned, read)
      if ('failure' in made) throw new Error(JSON.stringify(made))
      const target = made.ok
      expect(target.availability).toMatchObject({ name: 'Files' })
      expect(target.command).toBe('read')
      for (const key of ['context', 'workspace', 'resources', 'scope', 'requesterScope'] as const)
        expect(target[key]).toEqual(parent.request[key])
      expect(target.directory).toEqual(directory)
      expect(target.mode).toBe('foreground')
      expect(target.batchDecision).toBeNull()
      expect(target).not.toHaveProperty('invocation')
      expect(parent.request.limits.foregroundMs).toBe(234)
      expect(target.limits).toMatchObject({
        concurrency: null,
        scopeBudget: null,
        backgroundAfterMs: null,
      })
      expect(target.limits.foregroundMs).not.toBe(234)
      const bare = await createProgramTargetRequests(portsOf(world))(parent, read)
      expect('ok' in bare && bare.ok).not.toHaveProperty('directory')
    }))

  it('TL-51 writes the intent itself where the command needs one, and none where it does not', () =>
    onWorld(async world => {
      const prepare = createProgramTargetRequests(portsOf(world))
      const shell = await prepare(codeParent(world), run)
      if ('failure' in shell) throw new Error(JSON.stringify(shell))
      const said = 'called by a program that Code runs'
      expect(JSON.parse(shell.ok.arguments.effective)).toEqual({
        command: 'execute',
        intent: said,
        params: { script: 'echo hi' },
      })
      expect(shell.ok.label).toMatchObject({ intent: said, tool: 'Shell', command: 'execute' })
      const files = await prepare(codeParent(world), read)
      if ('failure' in files) throw new Error(JSON.stringify(files))
      expect(JSON.parse(files.ok.arguments.effective)).not.toHaveProperty('intent')
      expect(files.ok.label.intent).toBeNull()
    }))

  it('answers only a parent that is the Code of the release, by its adoption and not its name', () =>
    onWorld(async world => {
      const prepare = createProgramTargetRequests(portsOf(world))
      expect(await prepare(world.parent, read)).toMatchObject({
        failure: { kind: 'unavailable', dependency: 'program-target' },
      })
      const code = world.request('Code')
      const forged = {
        ...code,
        availability: {
          ...code.availability,
          definition: {
            ...code.availability.definition,
            adoption: { ...code.availability.definition.adoption, digest: 'forged' },
          },
        },
      }
      expect(await prepare({ ...world.parent, request: forged }, read)).toMatchObject({
        failure: { kind: 'unavailable' },
      })
    }))

  it('refuses a target the view does not list, a target that is not there, and unreadable limits', () =>
    onWorld(async world => {
      const none = { read: async () => ({ ok: { ...(await listed(world)), entries: [] } }) }
      const unlisted = createProgramTargetRequests(portsOf(world, { view: () => none }))
      expect(await unlisted(codeParent(world), read)).toMatchObject({
        failure: { kind: 'denied', action: 'target-not-included' },
      })
      const prepare = createProgramTargetRequests(portsOf(world))
      expect(
        await prepare(codeParent(world), { name: 'Nothing', command: null, arguments: tree({}) }),
      ).toMatchObject({ failure: { kind: 'invalid', field: 'name' } })
      const unset = createProgramTargetRequests(
        portsOf(world, { operatorSettings: () => undefined }),
      )
      expect(await unset(codeParent(world), run)).toMatchObject({
        failure: { kind: 'unavailable', dependency: 'program-target' },
      })
    }))
})

async function listed(world: World) {
  const view = await world.view.read({ principal: world.principal, tenant: world.tenant })
  if ('failure' in view) throw new Error('view')
  return view.ok
}

describe('the functions of the tools a program names', () => {
  it('are those of the programmable tools among the names, and never Tools or Code', () =>
    onWorld(async world => {
      const names = ['Files', 'Shell', 'Tools', 'Code', 'Ask', 'nothing', 'const']
      const functions = await createProgramFunctions(portsOf(world))(codeParent(world), names)
      if ('failure' in functions) throw new Error(JSON.stringify(functions))
      const entries = functions.ok.map(one => one.entry)
      expect(entries).toContain('Files.read')
      expect(entries).toContain('Shell.execute')
      expect(entries.filter(entry => /^(Tools|Code|Ask)\./u.test(entry))).toEqual([])
      expect(new Set(entries).size).toBe(entries.length)
      const only = await createProgramFunctions(portsOf(world))(codeParent(world), ['Shell'])
      expect('ok' in only && only.ok.map(one => one.tool)).toEqual(['Shell'])
    }))

  // TL-75: what a program may call is resolved from the names it wrote, whatever the catalog holds.
  it('judge only the names that are tools, and never search the catalog', () =>
    onWorld(async world => {
      const open = testingSourceEntry({
        name: 'probe__open',
        category: 'probe',
        program: { maxBytes: 1024 },
      })
      const found = {
        kind: 'available',
        definition: open.definition,
        executor: open.executor,
        layer: { kind: 'tenant', tenant: world.tenant },
      } as const
      const judged: (readonly string[])[] = []
      let searches = 0
      const catalog: World['catalog'] = {
        ...world.catalog,
        search: async () => {
          searches += 1
          return fail({ kind: 'unavailable', dependency: 'catalog', diagnostic: 'not for this' })
        },
        inspectEach: async request => {
          judged.push(request.names)
          const rest = await world.catalog.inspectEach({
            ...request,
            names: request.names.filter(name => name !== 'probe__open'),
          })
          if ('failure' in rest) return rest
          return succeed(
            request.names.includes('probe__open') ? [...rest.ok, succeed(found)] : rest.ok,
          )
        },
      }
      const sourced = { owns: (name: string) => name.startsWith('probe__'), entry: () => undefined }
      const ports = portsOf(world, { catalog: () => catalog, sourced: () => sourced })
      // A program of a thousand identifiers that names two tools.
      const words = Array.from({ length: 1000 }, (_, index) => `word${String(index)}`)
      const names = [...words, 'Files', 'probe__open', 'probe__open']
      const functions = await createProgramFunctions(ports)(codeParent(world), names)
      if ('failure' in functions) throw new Error(JSON.stringify(functions))
      const entries = functions.ok.map(one => one.entry)
      expect(entries).toContain('Files.read')
      expect(entries.filter(entry => entry.startsWith('probe__'))).toEqual(['probe__open.run'])
      expect(judged).toEqual([['Files', 'probe__open']])
      expect(searches).toBe(0)
      expect(await createProgramFunctions(ports)(codeParent(world), words)).toEqual({ ok: [] })
      expect(judged).toHaveLength(1)
    }))

  it('are not given when the names cannot be judged now', () =>
    onWorld(async world => {
      const failure = { kind: 'unavailable', dependency: 'catalog', diagnostic: 'down' } as const
      const inspectEach = (async () => fail(failure)) as World['catalog']['inspectEach']
      const ports = portsOf(world, { catalog: () => ({ ...world.catalog, inspectEach }) })
      expect(await createProgramFunctions(ports)(codeParent(world), ['Files'])).toEqual({ failure })
    }))

  it('are not given to a call that is not the Code of the release, nor without a catalog', () =>
    onWorld(async world => {
      expect(await createProgramFunctions(portsOf(world))(world.parent, ['Files'])).toMatchObject({
        failure: { kind: 'unavailable' },
      })
      const blind = createProgramFunctions(portsOf(world, { catalog: () => undefined }))
      expect(await blind(codeParent(world), ['Files'])).toMatchObject({
        failure: { kind: 'unavailable' },
      })
    }))
})

describe('what the view must say of the target of a program call', () => {
  it('is only that it lists the target: resident or not', () =>
    onWorld(async world => {
      const access = { principal: world.principal, tenant: world.tenant }
      const files = world.request('Files').availability
      const toy = world.request('ToyEcho').availability
      expect(await targetResidency(world.view, access, files, 'listed')).toEqual({ ok: undefined })
      expect(await targetResidency(world.view, access, toy, 'listed')).toEqual({ ok: undefined })
      expect(await targetResidency(world.view, access, files, 'nonresident')).toMatchObject({
        failure: { action: 'resident-tools-require-direct-call' },
      })
      expect(await targetResidency(undefined, access, files, 'listed')).toMatchObject({
        failure: { kind: 'unavailable' },
      })
    }))
})
