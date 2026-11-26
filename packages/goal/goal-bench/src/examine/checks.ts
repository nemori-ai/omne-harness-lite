import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { broken, criterionId, type Files, type Product } from './product.ts'

export const MINIMUM = Object.freeze({ products: 8, breaks: 3 })
const CHECK_MS = 20_000

export function writeFiles(directory: string, files: Files): void {
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true })
    writeFileSync(join(directory, name), body)
  }
}

/** Runs the check of each criterion on these files: true where it exits with 0. The check is a program kept outside the work, run from inside it. */
export function checked(product: Product, files: Files): readonly boolean[] {
  const root = mkdtempSync(join(tmpdir(), 'goal-bench-product-'))
  try {
    return product.criteria.map((criterion, index) => {
      const work = join(root, `work-${String(index)}`)
      const program = join(root, `check-${String(index)}.cjs`)
      mkdirSync(work)
      writeFiles(work, files)
      writeFileSync(program, criterion.check)
      const ran = spawnSync(process.execPath, [program], { cwd: work, timeout: CHECK_MS })
      return ran.status === 0
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function stateIssues(product: Product, label: string, files: Files, fails: string | null) {
  return checked(product, files).flatMap((held, index) => {
    const at = criterionId(index)
    const ought = at !== fails
    if (held === ought) return []
    return [`${product.id}/${label}: the check of ${at} ${held ? 'passes' : 'fails'}`]
  })
}

/** What is wrong with a product: its checks must all pass on it clean, and each break must fail the check of its own criterion and no other. */
export function productIssues(product: Product): readonly string[] {
  const names = product.breaks.map(entry => entry.name)
  const ids = new Set(product.criteria.map((_, index) => criterionId(index)))
  const shape = [
    ...(new Set(names).size === names.length ? [] : [`${product.id}: two breaks share a name`]),
    ...product.breaks
      .filter(entry => !ids.has(entry.criterion))
      .map(entry => `${product.id}/${entry.name}: no criterion ${entry.criterion}`),
    ...[product.mended, ...product.spoiled]
      .filter(name => !names.includes(name))
      .map(name => `${product.id}: mended and spoiled name the break ${name}, which is not there`),
    ...(new Set([product.mended, ...product.spoiled]).size === 3
      ? []
      : [`${product.id}: mended and the two of spoiled must be three breaks`]),
  ]
  if (shape.length > 0) return shape
  return [
    ...stateIssues(product, 'clean', product.files, null),
    ...product.breaks.flatMap(entry =>
      stateIssues(product, entry.name, broken(product, entry.name), entry.criterion),
    ),
  ]
}

export function productSetIssues(products: readonly Product[]): readonly string[] {
  const few = products
    .filter(product => product.breaks.length < MINIMUM.breaks)
    .map(product => `${product.id}: fewer than ${String(MINIMUM.breaks)} breaks`)
  const size =
    products.length < MINIMUM.products
      ? [`${String(products.length)} products, fewer than ${String(MINIMUM.products)}`]
      : []
  return [...size, ...few, ...products.flatMap(productIssues)]
}
