import assert from 'node:assert/strict'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SkillEntrySource, SkillSourceFile } from './entry-source.ts'
import { conformanceCase, type ConformanceCase } from './testing-case.ts'

export type EntrySourceFixture<P> = Readonly<{
  source: SkillEntrySource<P>
  /** One who may read the Skill named `known`. */
  access: Access<P>
  /** One who may read none of this source's Skills. */
  stranger: Access<P>
  known: string
}>

const reading = () => ({
  range: { start: 0, length: 65_536 },
  signal: new AbortController().signal,
})

export function skillEntrySourceConformance<P>(): readonly ConformanceCase<
  EntrySourceFixture<P>
>[] {
  type F = EntrySourceFixture<P>
  return [
    conformanceCase<F>('SE1', 'every listed Skill carries the prefix and a label', async f => {
      const listed = await f.source.list(f.access)
      assert.ok('ok' in listed)
      assert.ok(listed.ok.some(entry => entry.name === f.known))
      for (const entry of listed.ok) {
        assert.ok(entry.name.startsWith(f.source.prefix), entry.name)
        assert.ok(entry.label.length > 0, entry.name)
      }
    }),
    conformanceCase<F>(
      'SE2',
      'a listed Skill reads with its label, and its files list; a name it never listed is not found',
      async f => {
        const read = await f.source.read(f.access, f.known, reading())
        assert.ok('ok' in read)
        assert.ok(read.ok.label.length > 0)
        const files = await f.source.listFiles(f.access, f.known, new AbortController().signal)
        assert.ok('ok' in files)
        assert.ok(files.ok.files.some(file => file.path === 'SKILL.md'))
        const unknown = `${f.source.prefix}nothing__here`
        assert.deepEqual(await f.source.read(f.access, unknown, reading()), fail('not-found'))
        assert.deepEqual(
          await f.source.listFiles(f.access, unknown, new AbortController().signal),
          fail('not-found'),
        )
      },
    ),
    conformanceCase<F>(
      'SE3',
      'one who may not read them is shown none, and is answered as if they were not there',
      async f => {
        const listed = await f.source.list(f.stranger)
        assert.ok('ok' in listed)
        assert.equal(
          listed.ok.some(entry => entry.name === f.known),
          false,
        )
        assert.deepEqual(await f.source.read(f.stranger, f.known, reading()), fail('not-found'))
      },
    ),
  ]
}

export type MemorySkill = Readonly<{
  description: string
  body: string
  files?: Readonly<Record<string, string>>
}>

/** A source over Skills kept in memory, read by those `may` lets read them. */
export function createMemorySkillEntrySource<P>(
  options: Readonly<{
    prefix: string
    label: string
    skills: Readonly<Record<string, MemorySkill>>
    may?: (access: Access<P>) => boolean
  }>,
): SkillEntrySource<P> {
  const may = options.may ?? (() => true)
  const skill = (access: Access<P>, name: string) =>
    may(access) ? options.skills[name] : undefined
  const page = (text: string, start: number, length: number) =>
    succeed({
      text: text.slice(start, start + length),
      start,
      total: text.length,
      label: options.label,
    })
  return {
    prefix: options.prefix,
    async list(access) {
      if (!may(access)) return succeed([])
      return succeed(
        Object.entries(options.skills).map(([name, found]) => ({
          name,
          description: found.description,
          label: options.label,
        })),
      )
    },
    async read(access, name, { range }) {
      const found = skill(access, name)
      return found === undefined ? fail('not-found') : page(found.body, range.start, range.length)
    },
    async readFile(access, name, path, { range }) {
      const found = skill(access, name)
      if (found === undefined) return fail('not-found')
      const text = path === 'SKILL.md' ? found.body : found.files?.[path]
      return text === undefined ? fail('file-not-found') : page(text, range.start, range.length)
    },
    async listFiles(access, name) {
      const found = skill(access, name)
      if (found === undefined) return fail('not-found')
      const files: SkillSourceFile[] = [
        { path: 'SKILL.md', size: found.body.length },
        ...Object.entries(found.files ?? {}).map(([path, text]) => ({ path, size: text.length })),
      ]
      return succeed({ files, label: options.label })
    },
  }
}
