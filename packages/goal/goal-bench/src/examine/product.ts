import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { DATA } from '../data.ts'

const text = z.string().min(1)
const path = z.string().regex(/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/u)
const id = z.string().regex(/^A[1-9]\d*$/u)
const EditSchema = z.strictObject({ path, find: text, replace: z.string() })
const BreakSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  criterion: id,
  edits: z.array(EditSchema).min(1),
})
const CriterionSchema = z.strictObject({ statement: text, method: text, check: text })

export const ProductSchema = z.strictObject({
  id: z.string().regex(/^x\d\d-[a-z0-9-]+$/u),
  source: text,
  purpose: text,
  files: z.record(path, z.string()),
  criteria: z.array(CriterionSchema).min(2),
  breaks: z.array(BreakSchema).min(3),
  mended: text,
  spoiled: z.tuple([text, text]),
})
/** A piece of finished work every criterion of which holds, the ways to break one criterion each, and a program per criterion that tells held from broken. */
export type Product = z.infer<typeof ProductSchema>
export type Break = z.infer<typeof BreakSchema>
export type Files = Readonly<Record<string, string>>
export type Truth = 'holds' | 'fails'

export const criterionId = (index: number): string => `A${String(index + 1)}`

export function loadProducts(directory = join(DATA, 'products')): readonly Product[] {
  return readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .toSorted()
    .map(name => {
      const parsed = ProductSchema.safeParse(
        JSON.parse(readFileSync(join(directory, name), 'utf8')),
      )
      if (!parsed.success) throw new Error(`${name}: ${z.prettifyError(parsed.error)}`)
      if (`${parsed.data.id}.json` !== name) throw new Error(`${name}: the id is ${parsed.data.id}`)
      return parsed.data
    })
}

const breakOf = (product: Product, name: string): Break => {
  const found = product.breaks.find(entry => entry.name === name)
  if (found === undefined) throw new Error(`${product.id}: no break ${name}`)
  return found
}

/** The files of the product with one break made; each edit replaces a text that stands exactly once. */
export function broken(product: Product, name: string): Files {
  const files: Record<string, string> = { ...product.files }
  for (const edit of breakOf(product, name).edits) {
    const before = files[edit.path]
    if (before === undefined) throw new Error(`${product.id}/${name}: no file ${edit.path}`)
    if (before.split(edit.find).length !== 2)
      throw new Error(`${product.id}/${name}: the text to replace is not there exactly once`)
    files[edit.path] = before.replace(edit.find, () => edit.replace)
  }
  return files
}

const truthOf = (product: Product, name: string | null): Readonly<Record<string, Truth>> =>
  Object.fromEntries(
    product.criteria.map((_, index) => {
      const at = criterionId(index)
      return [at, name !== null && breakOf(product, name).criterion === at ? 'fails' : 'holds']
    }),
  )

export type StepKind = 'clean' | 'broken' | 'mended' | 'spoiled'
/** One state of the work handed to the examiner: its files, and what each criterion is then. `write`: the files the working side writes to get there from the state before. */
export type Step = Readonly<{
  kind: StepKind
  files: Files
  write: Files
  truth: Readonly<Record<string, Truth>>
}>
export type ExamCase = Readonly<{ id: string; product: string; steps: readonly Step[] }>

function changed(from: Files, to: Files): Files {
  return Object.fromEntries(Object.entries(to).filter(([name, body]) => from[name] !== body))
}

function stateOf(product: Product, kind: StepKind, name: string | null, before: Files): Step {
  const files = name === null ? product.files : broken(product, name)
  return { kind, files, write: changed(before, files), truth: truthOf(product, name) }
}

/** The cases of a product: it clean, each break alone, one break examined and then mended, one examined and then replaced by another. The truth comes from which break is made, never from an author. */
export function examCasesOf(product: Product): readonly ExamCase[] {
  const [from, to] = product.spoiled
  const alone = product.breaks
    .map(entry => entry.name)
    .filter(name => name !== product.mended && name !== from)
  const first = (name: string): Step => stateOf(product, 'broken', name, {})
  const cases: [string, readonly Step[]][] = [
    ['clean', [stateOf(product, 'clean', null, {})]],
    ...alone.map((name): [string, readonly Step[]] => [name, [first(name)]]),
    [
      `${product.mended}-then-mended`,
      [first(product.mended), stateOf(product, 'mended', null, broken(product, product.mended))],
    ],
    [`${from}-then-${to}`, [first(from), stateOf(product, 'spoiled', to, broken(product, from))]],
  ]
  return cases.map(([name, steps]) => ({ id: `${product.id}/${name}`, product: product.id, steps }))
}
