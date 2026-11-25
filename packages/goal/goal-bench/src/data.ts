import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { ParentSchema, type Parent } from './case.ts'

export const DATA = join(import.meta.dirname, '..', 'data')

/** The parents of a directory, in the order of their file names. */
export function loadParents(directory = join(DATA, 'parents')): readonly Parent[] {
  return readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .toSorted()
    .map(name => {
      const parsed = ParentSchema.safeParse(JSON.parse(readFileSync(join(directory, name), 'utf8')))
      if (!parsed.success) throw new Error(`${name}: ${z.prettifyError(parsed.error)}`)
      if (`${parsed.data.id}.json` !== name) throw new Error(`${name}: the id is ${parsed.data.id}`)
      return parsed.data
    })
}

/** The digest a sign-off names: it stands only while the parent is the same, byte for byte of its data. */
export const digestOf = (parent: Parent): string =>
  `sha256:${createHash('sha256').update(JSON.stringify(parent)).digest('hex')}`

export const SignOffSchema = z.strictObject({
  parent: z.string().min(1),
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  checks: z.literal('passed'),
  signedBy: z.string().min(1),
  at: z.string().min(1),
})
export type SignOff = z.infer<typeof SignOffSchema>

export function loadSignOffs(file = join(DATA, 'signoff.json')): readonly SignOff[] {
  return z.array(SignOffSchema).parse(JSON.parse(readFileSync(file, 'utf8')))
}

/** Parents whose truth nobody signed, or that changed after it was signed. */
export function unsigned(
  parents: readonly Parent[],
  signed: readonly SignOff[],
): readonly string[] {
  const by = new Map(signed.map(entry => [entry.parent, entry.digest]))
  return parents.filter(parent => by.get(parent.id) !== digestOf(parent)).map(parent => parent.id)
}
