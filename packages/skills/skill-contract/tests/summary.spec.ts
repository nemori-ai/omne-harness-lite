import { describe, expect, it } from 'vitest'
import { digestBytes, readBodyText, type JsonValue, type PackageReader } from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { skillBodyContract } from '@omne-harness/skill-contract'
import { fixtureFiles } from './package-builder.ts'

function readerOf(files: Readonly<Record<string, Uint8Array>>): PackageReader {
  return {
    async manifest() {
      return {
        ok: {
          entries: Object.entries(files).map(([name, bytes]) => ({
            path: name,
            bytes: bytes.length,
            digest: digestBytes(bytes),
          })),
        },
      }
    },
    async open(name) {
      const bytes = files[name]
      return bytes === undefined ? { failure: 'entry-not-found' } : { ok: bytes }
    },
  }
}

const text = (value: string): JsonValue => ({ kind: 'string', value })

/** The body the assets record for a directory version: the declaration plus the manifest. */
async function recordBody(files: Readonly<Record<string, Uint8Array>>): Promise<JsonValue> {
  const inspected = await skillBodyContract().layout?.inspect(readerOf(files))
  if (inspected === undefined || !('ok' in inspected) || inspected.ok.kind !== 'object')
    throw new Error('the fixture does not inspect')
  const entries: JsonValue = {
    kind: 'array',
    items: Object.entries(files).map(([path, bytes]) => ({
      kind: 'object',
      entries: [
        { key: 'path', value: text(path) },
        { key: 'bytes', value: { kind: 'number', lexeme: String(bytes.length) } },
        { key: 'digest', value: text(digestBytes(bytes)) },
      ],
    })),
  }
  const read = readBodyText(
    writeJsonText({
      kind: 'object',
      entries: [
        ...inspected.ok.entries,
        {
          key: 'manifest',
          value: { kind: 'object', entries: [{ key: 'entries', value: entries }] },
        },
      ],
    }),
    {
      maxBytes: 65_536,
      maxDepth: 8,
      maxItems: 64,
      maxMembers: 16,
      maxStringLength: 512,
      maxNumberLength: 20,
    },
  )
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

describe('the asset summary of a Skill version', () => {
  it('gives the name, the description, the file count and the tools it depends on', async () => {
    const body = await recordBody(fixtureFiles('full-skill'))
    expect(skillBodyContract().summarize?.(body, { capabilityName: 'full-skill' })).toEqual({
      title: 'full-skill',
      description: 'Shows every interpreted field and one field that Skill keeps as it is.',
      facts: [
        { name: '文件', text: '5 个' },
        { name: '依赖', text: 'read_file' },
      ],
    })
  })

  it('says 无 when the Skill depends on no tool', async () => {
    const files = fixtureFiles('full-skill')
    const { ['.omne/skill.json']: _dependencies, ...rest } = files
    const body = await recordBody(rest)
    const summary = skillBodyContract().summarize?.(body, { capabilityName: 'full-skill' })
    expect(summary?.facts).toEqual([
      { name: '文件', text: '4 个' },
      { name: '依赖', text: '无' },
    ])
  })

  it('joins several tools with 、, counts no files without a manifest, and gives an empty description when there is none', () => {
    const read = readBodyText(
      JSON.stringify({
        name: 'two-tools',
        tools: [
          { category: 'tool', name: 'read_file' },
          { category: 'tool', name: 'write_file' },
        ],
      }),
      {
        maxBytes: 4096,
        maxDepth: 8,
        maxItems: 16,
        maxMembers: 16,
        maxStringLength: 64,
        maxNumberLength: 8,
      },
    )
    if (read.kind !== 'ok') throw new Error(read.kind)
    expect(skillBodyContract().summarize?.(read.value, { capabilityName: 'two-tools' })).toEqual({
      title: 'two-tools',
      description: '',
      facts: [
        { name: '文件', text: '0 个' },
        { name: '依赖', text: 'read_file、write_file' },
      ],
    })
  })

  it('throws for a body that fails judgment, as the other derivations do', async () => {
    const body = await recordBody(fixtureFiles('full-skill'))
    expect(() => skillBodyContract().summarize?.(body, { capabilityName: 'other' })).toThrow(
      'name-mismatch',
    )
  })
})
