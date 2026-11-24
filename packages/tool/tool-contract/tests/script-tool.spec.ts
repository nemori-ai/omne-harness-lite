import { describe, expect, it } from 'vitest'
import {
  digestBytes,
  judgePackageContent,
  type BodyContract,
  type PackageReader,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { toolBodyContract } from '@omne-harness/tool-contract'
import {
  SCRIPT_EXECUTOR,
  SCRIPT_MODULE,
  checkScriptArguments,
  readScriptConstruction,
  scriptConstructionOf,
  scriptParametersSchema,
  scriptToolAuthoring,
  scriptToolLayout,
} from '@omne-harness/tool-contract/provider'

const utf8 = new TextEncoder()

function packageOf(files: Readonly<Record<string, string>>): PackageReader {
  const bytes = new Map(Object.entries(files).map(([path, text]) => [path, utf8.encode(text)]))
  return {
    manifest: async () => ({
      ok: {
        entries: [...bytes].map(([path, content]) => ({
          path,
          bytes: content.byteLength,
          digest: digestBytes(content),
        })),
      },
    }),
    async open(path) {
      const found = bytes.get(path)
      return found === undefined ? { failure: 'entry-not-found' } : { ok: found }
    },
  }
}

const contract: BodyContract = { ...toolBodyContract(), layout: scriptToolLayout }
const TOOL = {
  name: 'wordcount',
  summary: 'Count the words of a text.',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string', description: 'The text to count.' } },
    required: ['text'],
  },
  run: { program: 'python3', script: 'count.py' },
  effect: 'read',
}
const SCRIPT = 'import json, sys\nprint(len(json.load(sys.stdin)["text"].split()))\n'

const judge = (tool: unknown, files: Readonly<Record<string, string>> = { 'count.py': SCRIPT }) =>
  judgePackageContent(
    contract,
    packageOf({ 'tool.json': typeof tool === 'string' ? tool : JSON.stringify(tool), ...files }),
    'wordcount',
  )

async function refusal(tool: unknown, files?: Readonly<Record<string, string>>): Promise<string> {
  const judged = await judge(tool, files)
  if ('ok' in judged) throw new Error('the package was accepted')
  return judged.failure.kind === 'invalid-package' ? judged.failure.reason : judged.failure.kind
}

describe('a tool written as a directory with tool.json and a script', () => {
  it('reads tool.json into the body every tool has: not programmable, implemented by the script executor', async () => {
    const judged = await judge(TOOL)
    if (!('ok' in judged)) throw new Error(JSON.stringify(judged.failure))
    const { manifest, ...body } = JSON.parse(writeJsonText(judged.ok.body)) as Record<
      string,
      unknown
    >
    expect(body).toEqual({
      name: 'wordcount',
      programmable: false,
      requiredCapabilities: [],
      composes: { skills: [] },
      implementation: {
        executor: SCRIPT_EXECUTOR,
        module: SCRIPT_MODULE,
        construction: {
          summary: TOOL.summary,
          parameters: TOOL.parameters,
          run: TOOL.run,
          effect: 'read',
        },
      },
    })
    expect(Object.keys(manifest as object)).toEqual(['entries'])
    expect(contract.deriveDeclarations(judged.ok.body).entries).toEqual([])
    expect(scriptConstructionOf(judged.ok.body)).toMatchObject({
      ok: {
        run: { program: 'python3', script: 'count.py', args: [] },
        effect: 'read',
        timeoutMs: 60_000,
        parameters: { required: ['text'] },
      },
    })
  })

  it('gives the same version to the same files, and another to a changed script', async () => {
    const first = await judge(TOOL)
    const again = await judge(TOOL)
    const changed = await judge(TOOL, { 'count.py': `${SCRIPT}# changed\n` })
    if (!('ok' in first) || !('ok' in again) || !('ok' in changed)) throw new Error('refused')
    expect(again.ok.version).toBe(first.ok.version)
    expect(changed.ok.version).not.toBe(first.ok.version)
  })

  it.each([
    [
      'another executor',
      { ...TOOL, executor: 'module' },
      'tool.json: executor is "module"; a tool made here runs a script: leave executor out',
    ],
    [
      'a script outside the directory',
      { ...TOOL, run: { program: 'python3', script: '../count.py' } },
      'tool.json: run.script is not a path inside the directory of the tool',
    ],
    [
      'an absolute script path',
      { ...TOOL, run: { program: 'python3', script: '/tmp/count.py' } },
      'tool.json: run.script is not a path inside the directory of the tool',
    ],
    [
      'a script that is not a file of the directory',
      { ...TOOL, run: { program: 'python3', script: 'other.py' } },
      'tool.json: run.script names other.py, which is not a file of the directory',
    ],
    [
      'parameters that are not an object schema',
      { ...TOOL, parameters: { type: 'string' } },
      'tool.json: parameters is not {type: "object", properties, required?}',
    ],
    [
      'a keyword of JSON Schema that is not read',
      {
        ...TOOL,
        parameters: { type: 'object', properties: { text: { type: 'string', pattern: '^a+$' } } },
      },
      'tool.json: parameters.properties.text has "pattern", which is not read; a parameter is {type, description?, enum?} with type string, number, integer or boolean, or {type: "array", items: {type}, description?}',
    ],
    [
      'a required parameter that is not declared',
      { ...TOOL, parameters: { type: 'object', properties: {}, required: ['text'] } },
      'tool.json: parameters.required is not a list of declared parameter names',
    ],
    [
      'no effect',
      { ...TOOL, effect: undefined },
      'tool.json: effect is missing: write "read" when the script changes nothing, else "write"',
    ],
    [
      'no summary',
      { ...TOOL, summary: ' ' },
      'tool.json: summary is missing, or is not text of 1 to 2000 characters',
    ],
    ['a field that is not read', { ...TOOL, gates: [] }, 'tool.json: "gates" is not read'],
    [
      'a time limit past the most',
      { ...TOOL, timeoutMs: 6_000_000 },
      'tool.json: timeoutMs is not a whole number from 1000 to 600000',
    ],
    ['text that is not JSON', '{name', 'tool.json: it is not JSON'],
  ])('refuses %s, and says why', async (_label, tool, reason) => {
    expect(await refusal(tool)).toBe(reason)
  })

  it('refuses a name that is not the name it is published under, and a directory without tool.json', async () => {
    expect(await refusal({ ...TOOL, name: 'counter' })).toBe('name-mismatch')
    const judged = await judgePackageContent(
      contract,
      packageOf({ 'count.py': SCRIPT }),
      'wordcount',
    )
    expect(JSON.stringify(judged)).toContain('the directory has no tool.json at its root')
  })

  it('says how one is written with an example that is read as it stands', async () => {
    const lines = scriptToolAuthoring.split('\n')
    const tool = lines.find(line => line.startsWith('{"name"')) ?? ''
    const script = lines
      .slice(lines.indexOf('and count.py beside it:') + 1)
      .slice(0, 2)
      .join('\n')
    const judged = await judgePackageContent(
      contract,
      packageOf({ 'tool.json': tool, 'count.py': `${script}\n` }),
      'wordcount',
    )
    expect('ok' in judged ? 'accepted' : judged.failure).toBe('accepted')
  })
})

describe('the arguments of a call of a script tool', () => {
  const read = readScriptConstruction({
    summary: 'x',
    effect: 'write',
    run: { program: 'node', script: 'a.js' },
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        count: { type: 'integer' },
        mode: { type: 'string', enum: ['fast', 'slow'] },
        tags: { type: 'array', items: { type: 'string' } },
        strict: { type: 'boolean' },
      },
      required: ['text'],
    },
  })
  if (!('ok' in read)) throw new Error(read.failure.reason)
  const { parameters } = read.ok
  const check = (value: unknown) => {
    const checked = checkScriptArguments(parameters, value)
    return 'ok' in checked ? 'ok' : checked.failure.reason
  }

  it('accepts what is declared, with every optional one left out or given', () => {
    expect(check({ text: 'a' })).toBe('ok')
    expect(check({ text: 'a', count: 2, mode: 'fast', tags: ['x'], strict: true })).toBe('ok')
  })

  it.each([
    [{ count: 1 }, 'text is required'],
    [{ text: 'a', other: 1 }, 'other is not a parameter of this tool'],
    [{ text: 1 }, 'text is not string'],
    [{ text: 'a', count: 1.5 }, 'count is not integer'],
    [{ text: 'a', mode: 'medium' }, 'mode is not one of ["fast","slow"]'],
    [{ text: 'a', tags: ['x', 1] }, 'tags is not a list of string'],
    [{ text: 'a', strict: 'yes' }, 'strict is not boolean'],
    ['a', 'the arguments are not an object'],
  ])('refuses %j: %s', (value, reason) => {
    expect(check(value)).toBe(reason)
  })

  it('shows the model a schema of exactly the declared parameters', () => {
    expect(scriptParametersSchema(parameters)).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: {
        text: { type: 'string' },
        count: { type: 'integer' },
        mode: { type: 'string', enum: ['fast', 'slow'] },
        tags: { type: 'array', items: { type: 'string' } },
        strict: { type: 'boolean' },
      },
    })
  })
})
