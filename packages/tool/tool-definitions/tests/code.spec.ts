import { afterAll, describe, expect, it } from 'vitest'
import {
  acquisitionRef,
  originRef,
  type EnvironmentBinding,
  type ProgramFacility,
  type ProviderAcquireInput,
} from '@omne-harness/execution-environment-contract'
import { createMemoryResourceLedger } from '@omne-harness/execution-environment-contract/testing'
import { createProgramProvider } from '@omne-harness/execution-environment-program'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import type {
  ProgramCallAnswer,
  ProgramCallFailureKind,
  ProgramFunction,
  ProgramTools,
} from '@omne-harness/tool-contract'
import { attachProgramTools, deriveDefinition } from '@omne-harness/tool-contract/provider'
import { ordinaryReturnFixture, testingTenant } from '@omne-harness/tool-contract/testing'
import {
  codeToolModule,
  createCodeAuthor,
  type CodeAuthorEnvironment,
} from '@omne-harness/tool-definitions'
import { value } from './run-author.ts'

const tenant = testingTenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`)
const origin = originRef('code-spec')
const scope = { ref: 'code-spec-scope' } as ProviderAcquireInput['scope']
const binding: EnvironmentBinding = { kind: 'stateless_sandbox', scope, origin }
const provider = createProgramProvider()
let serial = 0

async function environmentOf(): Promise<CodeAuthorEnvironment> {
  const receipt = await provider.acquire({
    acquisition: acquisitionRef(`code-spec-${String(++serial)}`),
    origin,
    scope,
    tenant,
    ledger: createMemoryResourceLedger().ledger,
    placement: {
      kind: 'placement',
      requirement: {
        allowedBindings: [binding],
        facilities: ['program'],
        isolation: ['restricted-js'],
      },
      binding,
      provider: { name: provider.name, generation: provider.generation, version: provider.version },
      continuity: provider.continuity,
      quotaDomain: provider.quotaDomain,
    },
  })
  if (receipt.kind !== 'acquired') throw new Error(receipt.kind)
  const facility: ProgramFacility<unknown> | undefined = receipt.lease.facility('program')
  if (facility === undefined) throw new Error('no program facility')
  return {
    program: {
      run: request =>
        facility.run({
          ...request,
          requestId: `code-spec-request-${String(++serial)}`,
          access: { principal: 'someone', tenant },
          origin,
          binding,
        }),
    },
  }
}
afterAll(async () => {
  await provider.retire()
})

const adoption = { owner: 'test', name: 'code-spec', revision: '1', digest: 'sha256:code-spec' }
const schema = (properties: Readonly<Record<string, string>>): JsonValue => ({
  kind: 'object',
  entries: [
    { key: 'type', value: { kind: 'string', value: 'object' } },
    {
      key: 'properties',
      value: {
        kind: 'object',
        entries: Object.entries(properties).map(([key, type]) => ({
          key,
          value: {
            kind: 'object',
            entries: [{ key: 'type', value: { kind: 'string', value: type } }],
          },
        })),
      },
    },
  ],
})
function declared(
  tool: string,
  command: string | null,
  returns: Readonly<Record<string, string>> | null,
): ProgramFunction {
  const base = ordinaryReturnFixture(adoption)
  return {
    entry: command === null ? tool : `${tool}.${command}`,
    tool,
    command,
    summary: `${command ?? tool} of the fixture`,
    unless: [],
    parameters: schema({ path: 'string' }),
    external: false,
    returns:
      returns === null
        ? base
        : {
            ...base,
            program: {
              kind: 'json',
              contract: adoption,
              schema: { id: 'value', revision: '1', digest: 'sha256:value' },
              definition: { schema: schema(returns), vocabulary: adoption, descriptions: [] },
              maxBytes: 65_536,
              external: false,
            },
          },
  }
}
const FUNCTIONS = [
  declared('Files', 'list', { entries: 'array' }),
  declared('Files', 'read', { text: 'string' }),
  declared('Files', 'write', null),
  declared('Lookup', null, { found: 'boolean' }),
]

const tree = (given: unknown): JsonValue => {
  if (given === null) return { kind: 'null' }
  if (typeof given === 'string') return { kind: 'string', value: given }
  if (typeof given === 'boolean') return { kind: 'boolean', value: given }
  if (typeof given === 'number') return { kind: 'number', lexeme: String(given) }
  if (Array.isArray(given)) return { kind: 'array', items: given.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(given as object).map(([key, member]) => ({ key, value: tree(member) })),
  }
}
const plain = (given: JsonValue): unknown => {
  if (given.kind === 'object')
    return Object.fromEntries(given.entries.map(entry => [entry.key, plain(entry.value)]))
  if (given.kind === 'array') return given.items.map(plain)
  if (given.kind === 'number') return Number(given.lexeme)
  return given.kind === 'null' ? null : given.value
}
const valued = (given: unknown): ProgramCallAnswer => ({
  kind: 'value',
  value: given === undefined ? null : tree(given),
  external: false,
})
const refusal = (kind: ProgramCallFailureKind, message: string): ProgramCallAnswer => ({
  kind: 'failure',
  failure: { kind, effect: kind === 'failed' ? 'unknown' : 'none', message },
})

type Handler = (args: Record<string, unknown>, ordinal: number) => Promise<ProgramCallAnswer>

/** The capability a host would attach, scripted: what was called, in what order, how many at once. */
type Faults = Readonly<{ functions?: boolean; settle?: boolean; none?: boolean }>
const down = { kind: 'unavailable', dependency: 'view', diagnostic: 'down' } as const

function scripted(handlers: Readonly<Record<string, Handler>>, faults: Faults = {}) {
  const calls: (readonly [number, string, unknown])[] = []
  const pending = new Set<Promise<unknown>>()
  let inFlight = 0
  let most = 0
  let settled = 0
  const tools: ProgramTools = {
    functions: async () =>
      faults.functions === true ? fail(down) : succeed(faults.none === true ? [] : FUNCTIONS),
    call(asked) {
      const args = plain(asked.arguments) as Record<string, unknown>
      calls.push([asked.ordinal, asked.entry, args])
      inFlight += 1
      most = Math.max(most, inFlight)
      const handler = handlers[asked.entry] ?? (async () => refusal('unsupported', 'no handler'))
      const answer = handler(args, asked.ordinal).finally(() => {
        inFlight -= 1
      })
      pending.add(answer)
      return answer
    },
    async settle() {
      await Promise.allSettled(pending)
      settled += 1
      return faults.settle === true ? fail(down) : succeed({ phase: 'sealed', positions: [] })
    },
  }
  return { tools, calls, most: () => most, settled: () => settled }
}

const LIMITS = {
  resultMaxBytes: 65_536,
  computeMs: 2_000,
  memoryBytes: 64 * 1024 * 1024,
  outputBytes: 65_536,
  calls: 50,
  callsInFlight: 8,
  sourceBytes: 4096,
}
function authorOf(overrides: Partial<typeof LIMITS> = {}) {
  return value(createCodeAuthor(tree({ ...LIMITS, ...overrides })))
}

async function run(
  command: 'execute' | 'help',
  args: Record<string, unknown>,
  tools: ProgramTools | null,
  options: Readonly<{ limits?: Partial<typeof LIMITS>; signal?: AbortSignal }> = {},
): Promise<string> {
  const registration = readToolRegistration(authorOf(options.limits))
  if (registration?.kind !== 'commands') throw new Error('commands')
  const operation = registration.operations.find(([name]) => name === command)?.[1]
  if (operation === undefined) throw new Error('command')
  const text = JSON.stringify(args)
  const parsed = operation.author.parameters.parse({
    original: text,
    effective: text,
    complete: true,
  })
  if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
  const base = createIndependentToolScope({
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    signal: options.signal ?? new AbortController().signal,
    process: null,
    waits: null,
  })
  if ('failure' in base) throw new Error(JSON.stringify(base.failure))
  const attached =
    tools === null ? base.ok : attachProgramTools(base.ok, { value: tools, close: async () => {} })
  const answer = await executeTool(
    parsed.ok,
    operation.author.executor,
    await environmentOf(),
    attached,
  )
  if ('failure' in answer) throw new Error(String(Reflect.get(answer.failure, 'reason')))
  return answer.ok as string
}
const execute = (
  code: string,
  tools: ProgramTools | null,
  options: Parameters<typeof run>[3] = {},
  input?: unknown,
) => run('execute', input === undefined ? { code } : { code, input }, tools, options)

const REPORTS: Readonly<Record<string, string>> = {
  a: 'paid',
  b: 'overdue since May',
  c: 'overdue',
}
const files = (gate?: Promise<void>): Readonly<Record<string, Handler>> => ({
  'Files.list': async () => valued({ entries: Object.keys(REPORTS) }),
  'Files.read': async args => {
    await gate
    return valued({ text: REPORTS[String(args['path']).split('/').at(-1) ?? ''] ?? '' })
  },
  'Files.write': async () => valued(undefined),
  Lookup: async args => valued({ found: args['path'] === 'a' }),
})

describe('Code execute', () => {
  it('runs calls in order, by condition and together, and gives back only what the program returns', async () => {
    const release = Promise.withResolvers<void>()
    const world = scripted(files(release.promise))
    const answer = execute(
      `const { entries } = await Files.list({ path: "reports" })
const pages = await Promise.all(entries.map((name: string) => Files.read({ path: "reports/" + name })))
const overdue = pages.filter(page => page.text.includes("overdue")).length
if (overdue > 5) await Files.write({ path: "alarm", text: "many" })
const known = await tools.Lookup({ path: entries[0] })
console.log("checked", entries.length)
return { overdue, first: known.found, wrote: await tools.Files.write({ path: "out", text: String(overdue) }) }`,
      world.tools,
    )
    await expect.poll(() => world.calls.length).toBe(4)
    expect(world.most()).toBe(3)
    release.resolve()
    expect(await answer).toBe(
      'done Code execute\nresult:\n{"overdue":2,"first":true,"wrote":null}\nconsole:\nchecked 3',
    )
    expect(world.calls.map(([ordinal, entry]) => [ordinal, entry])).toEqual([
      [1, 'Files.list'],
      [2, 'Files.read'],
      [3, 'Files.read'],
      [4, 'Files.read'],
      [5, 'Lookup'],
      [6, 'Files.write'],
    ])
    expect(world.calls[5]?.[2]).toEqual({ path: 'out', text: '2' })
    expect(world.settled()).toBe(1)
  })

  it('reads input as a constant, starts every program empty and says so when nothing is returned', async () => {
    const world = scripted({})
    expect(
      await execute('return [input.n * 2, typeof globalThis.kept]; ', world.tools, {}, { n: 21 }),
    ).toBe('done Code execute\nresult:\n[42,"undefined"]')
    expect(await execute('globalThis.kept = 1', world.tools)).toBe(
      'done Code execute\nresult:\n(the program returned nothing)',
    )
    expect(await execute('return typeof globalThis.kept', world.tools)).toContain('"undefined"')
  })

  it('a call that does not complete throws ToolError the program can catch, with kind, tool, command and effect', async () => {
    const world = scripted({
      'Files.read': async () => refusal('denied', 'the owner said no'),
      Lookup: async () => refusal('failed', 'it broke'),
    })
    const answer = await execute(
      `const seen = []
for (const call of [() => Files.read({ path: "x" }), () => Lookup({ path: "y" })])
  try { await call() } catch (error) {
    seen.push([error instanceof ToolError, error.name, error.kind, error.tool, error.command, error.effect, error.message])
  }
return seen`,
      world.tools,
    )
    expect(JSON.parse(answer.split('\n')[2] ?? '')).toEqual([
      [true, 'ToolError', 'denied', 'Files', 'read', 'none', 'Files.read: the owner said no'],
      [true, 'ToolError', 'failed', 'Lookup', null, 'unknown', 'Lookup: it broke'],
    ])
  })

  it.each([
    'denied',
    'unsupported',
    'invalid',
    'limit',
    'unavailable',
    'failed',
    'interrupted',
    'no-response',
    'unknown',
  ] as const)('the failure %s reaches the program under that name', async kind => {
    const world = scripted({ Lookup: async () => refusal(kind, 'why') })
    const answer = await execute(
      'try { await Lookup({ path: "x" }) } catch (error) { return [error.kind, error.effect] }',
      world.tools,
    )
    expect(answer).toContain(JSON.stringify([kind, kind === 'failed' ? 'unknown' : 'none']))
  })

  it('refuses a program longer than its limit before anything runs', async () => {
    const world = scripted(files())
    await expect(
      execute(`return ${'1 + '.repeat(40)}1`, world.tools, { limits: { sourceBytes: 100 } }),
    ).rejects.toThrow(
      /^Error: Code execute failed kind=too-large\nThe program is 168 bytes; the limit is 100\.\nNothing ran\.$/u,
    )
    expect(
      await execute('return "é".length', world.tools, { limits: { sourceBytes: 18 } }),
    ).toContain('result:\n1')
    expect(world.settled()).toBe(1)
  })

  it('takes its limits from the operator only: a call cannot bring its own', async () => {
    const registration = readToolRegistration(authorOf())
    if (registration?.kind !== 'commands') throw new Error('commands')
    const operation = registration.operations.find(([name]) => name === 'execute')?.[1]
    for (const extra of ['computeMs', 'limits', 'calls']) {
      const text = JSON.stringify({ code: 'return 1', [extra]: 10 ** 9 })
      expect(
        operation?.author.parameters.parse({ original: text, effective: text, complete: true }),
      ).toEqual({ failure: { kind: 'invalid', reason: `invalid-field:${extra}` } })
    }
    for (const missing of [{}, { input: 1 }, { code: 7 }]) {
      const text = JSON.stringify(missing)
      expect(
        operation?.author.parameters.parse({ original: text, effective: text, complete: true }),
      ).toHaveProperty('failure')
    }
  })

  it('an uncaught failure fails the call: the kind, the line, and that nothing is rerun', async () => {
    const world = scripted({ 'Files.read': async () => refusal('unavailable', 'no place') })
    await expect(
      execute('const first = 1\nawait Files.read({ path: "x" })\nreturn first', world.tools),
    ).rejects.toThrow(
      /^Error: Code execute failed kind=threw line=2\nToolError: Files\.read: no place\nCalls that completed keep their effects\. The program is not rerun\.$/u,
    )
    await expect(execute('console.log("before")\nnull.x', world.tools)).rejects.toThrow(
      /kind=threw line=2\nTypeError: .*\n.*\nconsole:\nbefore/su,
    )
  })

  it('refuses what is not a program before anything runs, and names the line', async () => {
    const world = scripted(files())
    await expect(execute('const a = 1\nconst b = = 2', world.tools)).rejects.toThrow(
      /^Error: Code execute failed kind=syntax line=2\nExpression expected\nNothing ran\.$/u,
    )
    await expect(execute('import fs from "node:fs"\nreturn 1', world.tools)).rejects.toThrow(
      /kind=syntax line=1\n.*\nThere is nothing to import: each tool is a global object/u,
    )
    await expect(execute('const a = 1\\nreturn a +', world.tools)).rejects.toThrow(
      /kind=syntax line=1\n.*\nThe code arrived as one line with the two characters \\n in it/u,
    )
    expect(world.calls).toEqual([])
    expect(world.settled()).toBe(0)
  })

  it('ends a program that passes a limit and names the limit', async () => {
    const world = scripted(files())
    await expect(
      execute('for (;;) {}', world.tools, { limits: { computeMs: 200 } }),
    ).rejects.toThrow(/kind=exceeded limit=compute-time/u)
    await expect(
      execute('for (let i = 0; i < 5; i++) await Lookup({ path: "a" })', world.tools, {
        limits: { calls: 3 },
      }),
    ).rejects.toThrow(/kind=exceeded limit=calls/u)
    await expect(
      execute('return "x".repeat(5000)', world.tools, { limits: { outputBytes: 1000 } }),
    ).rejects.toThrow(/kind=exceeded limit=output/u)
    await expect(execute('return [1, () => 2]', world.tools)).rejects.toThrow(
      /kind=invalid-output at=\$\[1\]/u,
    )
  })

  it('makes no more calls at once than its limit: the one beyond it gets ToolError limit and is not made', async () => {
    const release = Promise.withResolvers<void>()
    const world = scripted(files(release.promise))
    const answer = execute(
      `const all = await Promise.allSettled(["a", "b", "c"].map(name => Files.read({ path: name })))
return all.map(one => one.status === "fulfilled" ? one.value.text : [one.reason.kind, one.reason.effect, one.reason.message])`,
      world.tools,
      { limits: { callsInFlight: 2 } },
    )
    await expect.poll(() => world.calls.length).toBe(2)
    release.resolve()
    expect(await answer).toContain(
      '["paid","overdue since May",["limit","none","Files.read: more than 2 calls at once; this one was not made. Await some before making more."]]',
    )
    expect(world.calls.map(([ordinal]) => ordinal)).toEqual([1, 2])
  })

  it('does not report done before the calls it made have ended, awaited or not', async () => {
    const release = Promise.withResolvers<void>()
    const world = scripted(files(release.promise))
    let done = false
    const answer = execute('void Files.read({ path: "a" })\nreturn "early"', world.tools).then(
      text => {
        done = true
        return text
      },
    )
    await expect.poll(() => world.calls.length).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(done).toBe(false)
    release.resolve()
    expect(await answer).toContain('"early"')
  })

  it('stops the program when the call is stopped', async () => {
    const controller = new AbortController()
    const world = scripted({ 'Files.read': () => new Promise(() => {}) })
    const answer = execute('await Files.read({ path: "a" })', world.tools, {
      signal: controller.signal,
    })
    await expect.poll(() => world.calls.length).toBe(1)
    controller.abort()
    await expect(answer).rejects.toThrow(/kind=aborted/u)
  })

  it('stops at once when the call was already stopped, and fails when its calls cannot be settled', async () => {
    const stopped = new AbortController()
    stopped.abort()
    const world = scripted(files())
    await expect(
      execute('for (;;) await Lookup({ path: "a" })', world.tools, { signal: stopped.signal }),
    ).rejects.toThrow(/kind=aborted/u)
    const unsettled = scripted(files(), { settle: true })
    await expect(execute('return 1', unsettled.tools)).rejects.toThrow(
      /^Error: Code execute: the calls of the program could not be settled \(unavailable\)\. Calls that completed keep their effects\. The program is not rerun\.$/u,
    )
  })

  it('gives the line-break hint only for one line that carries a literal backslash-n', async () => {
    const world = scripted(files())
    await expect(execute('const a = 1\nconst b = = 2\nreturn "\\n"', world.tools)).rejects.toThrow(
      /^Error: Code execute failed kind=syntax line=2\nExpression expected\nNothing ran\.$/u,
    )
    await expect(execute('const b = = 2', world.tools)).rejects.toThrow(
      /^Error: Code execute failed kind=syntax line=1\nExpression expected\nNothing ran\.$/u,
    )
  })

  it('answers unavailable when the functions of this call cannot be listed', async () => {
    const world = scripted({}, { functions: true })
    expect(await execute('return 1', world.tools)).toBe(
      'rejected reason=unavailable Code execute: unavailable',
    )
    expect(await run('help', {}, world.tools)).toBe(
      'rejected reason=unavailable Code help: unavailable',
    )
    expect(await run('help', {}, null)).toBe(
      'rejected reason=unavailable Code help: program calls are not attached to this call',
    )
  })

  it('answers unavailable without the capability, and passes on what the facility refuses', async () => {
    expect(await execute('return 1', null)).toMatch(/^rejected reason=unavailable Code execute/u)
    const world = scripted({})
    expect(await execute('return 1', world.tools, { limits: { memoryBytes: 2 ** 40 } })).toMatch(
      /^Code execute: rejected request="[^"]+" reason=invalidInput$/u,
    )
  })
})

describe('Code help', () => {
  it('gives the rules, the limits here and every function a program can call now, with types', async () => {
    const text = await run('help', {}, scripted({}).tools)
    expect(text).toMatch(/^done Code help\nProgram\n/u)
    expect(text).toContain(
      'Limits: 2 s of computing (waiting for a call does not count), 64 MiB of memory, 50 tool calls with at most 8 at once, 65536 bytes of result, 4096 bytes of program.',
    )
    expect(text).toContain(
      'declare const Files: {\n  /** list of the fixture */\n  list(params: { path?: string }): Promise<{ entries?: unknown[] }>',
    )
    expect(text).toContain('  write(params: { path?: string }): Promise<void>')
    expect(text).toContain(
      'declare function Lookup(params: { path?: string }): Promise<{ found?: boolean }>',
    )
    expect(text).toContain('declare class ToolError extends Error')
    expect(text).toMatch(
      /Promise<void>\n\}\n\/\*\* Lookup of the fixture \*\/\ndeclare function Lookup/u,
    )
  })

  it('shows one tool when asked, and names the callable ones when the name is not one of them', async () => {
    const one = await run('help', { name: 'Lookup' }, scripted({}).tools)
    expect(one).toMatch(
      /^done Code help Lookup\n\/\*\* Lookup of the fixture \*\/\ndeclare function Lookup/u,
    )
    expect(one).not.toContain('Files')
    expect(await run('help', { name: 'Shell' }, scripted({}).tools)).toBe(
      'rejected reason=notFound Code help: Shell has no function a program can call now. Callable: Files, Lookup',
    )
    expect(await run('help', { name: 'Shell' }, scripted({}, { none: true }).tools)).toBe(
      'rejected reason=notFound Code help: Shell has no function a program can call now. Callable: none',
    )
  })
})

describe('the definition of Code', () => {
  it('is one flat command tool behind one automatic gate, closed to programs and to the background, and needs a restricted place with the program facility', () => {
    const author = authorOf()
    const definition = deriveDefinition(
      {
        asset: { name: 'Code', adoption: { ...adoption, name: 'Code' } },
        requiredCapabilities: [],
      },
      author.facts,
    )
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(definition.encoding).toBe('flat')
    expect(definition.backgroundAllowed).toBe(false)
    expect(definition.programmable).not.toBe(true)
    expect(
      definition.commands.map(command => [command.name, command.release, command.program]),
    ).toEqual([
      ['execute', { gate: 'run' }, undefined],
      ['help', { gate: 'run' }, undefined],
    ])
    expect(definition.gates).toEqual([{ id: 'run', title: '运行程序', default: 'auto' }])
    const need = definition.declarations.environment?.value
    expect(need === undefined ? null : plain(need)).toEqual({
      facilities: ['program'],
      isolation: ['restricted-js'],
      layers: ['stateless_sandbox'],
    })
  })

  it('is offered as a module whose executor names this author', () => {
    expect(codeToolModule.createAuthor).toBe(createCodeAuthor)
    expect(codeToolModule.executor).toMatchObject({
      owner: '@omne-harness/tool-definitions',
      name: 'Code',
      revision: '1',
    })
  })

  it.each(Object.keys(LIMITS))('refuses a construction without %s', name => {
    const { [name as keyof typeof LIMITS]: _dropped, ...rest } = LIMITS
    expect(createCodeAuthor(tree(rest))).toEqual({
      failure: { field: 'construction', reason: `missing-field:${name}` },
    })
  })
})
