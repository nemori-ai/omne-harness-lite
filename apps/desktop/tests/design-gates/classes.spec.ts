// @module-tag source-text
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ratchet, tally } from './ratchet.ts'
import { DESKTOP_PAGE, REPOSITORY } from './scope.ts'
import { cssRules, selectorClasses, STYLESHEETS } from './css-text.ts'
import {
  field,
  isString,
  jsxName,
  moduleOf,
  nodes,
  packageExports,
  parseModule,
  resolveImport,
  SCRIPTS,
  type SyntaxNode,
  visit,
} from './script-text.ts'

/**
 * FE-I29: a stylesheet only styles what it is imported with, and a class only looks like something when a rule names
 * it. Two things are counted:
 *
 * - a scanned stylesheet that no scanned file imports, through a relative path or through a member's package export
 *   (the modules export their sheet and the desktop page imports it);
 * - a class written literally in a `className` (or `*ClassName`) of a scanned TSX file that has no rule in the
 *   scanned stylesheets, is not a utility of the Tailwind build the desktop page ships, and is not one of
 *   Tailwind's `group`/`peer` markers.
 *
 * The utilities are judged by Tailwind's own compiler loaded with the desktop page's stylesheet, so the kit's theme
 * and variants count. The compiler is the one the desktop build uses: `@tailwindcss/node`, reached through the
 * desktop's own `@tailwindcss/vite`. A class put together at run time is not literal and is not read.
 */
const CLASS_ATTRIBUTE = /^(?:className|[a-z]\w*ClassName)$/u
const CLASS_COMBINERS = new Set(['cn', 'clsx', 'cx', 'twMerge'])
const MARKERS = /^(?:group|peer)(?:\/[\w-]+)?$/u
const ENTRY = join(REPOSITORY, DESKTOP_PAGE, 'styles.css')

interface DesignSystem {
  candidatesToCss(candidates: string[]): (string | null)[]
}

async function tailwindUtilities(): Promise<DesignSystem> {
  const fromDesktop = createRequire(join(REPOSITORY, DESKTOP_PAGE, '..', '..', 'package.json'))
  const fromPlugin = createRequire(fromDesktop.resolve('@tailwindcss/vite'))
  const compiler = fromPlugin('@tailwindcss/node') as {
    __unstable__loadDesignSystem(css: string, options: { base: string }): Promise<DesignSystem>
  }
  return compiler.__unstable__loadDesignSystem(readFileSync(ENTRY, 'utf8'), {
    base: dirname(ENTRY),
  })
}

function split(text: string): string[] {
  return text.split(/\s+/u).filter(token => token !== '')
}

/** The classes a template literal writes whole: a token touching an interpolation is only part of a class. */
function templateClasses(template: SyntaxNode): string[] {
  const parts = nodes(template, 'quasis').map(part => (part['value'] as { raw: string }).raw)
  return parts.flatMap((part, index) => {
    const tokens = part.split(/(\s+)/u)
    return tokens.filter((token, at) => {
      if (token.trim() === '') return false
      const touchesBefore = at === 0 && index > 0
      const touchesAfter = at === tokens.length - 1 && index < parts.length - 1
      return !touchesBefore && !touchesAfter
    })
  })
}

/** The class names an expression in a class attribute writes literally. */
export function literalClasses(node: SyntaxNode | undefined): string[] {
  if (node === undefined) return []
  if (isString(node)) return split(String(node['value']))
  switch (node.type) {
    case 'TemplateLiteral':
      return templateClasses(node)
    case 'JSXExpressionContainer':
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
      return literalClasses(field(node, 'expression'))
    case 'ConditionalExpression':
      return [
        ...literalClasses(field(node, 'consequent')),
        ...literalClasses(field(node, 'alternate')),
      ]
    case 'LogicalExpression':
      return node['operator'] === '&&'
        ? literalClasses(field(node, 'right'))
        : [...literalClasses(field(node, 'left')), ...literalClasses(field(node, 'right'))]
    case 'ArrayExpression':
      return nodes(node, 'elements').flatMap(element => literalClasses(element))
    case 'ObjectExpression':
      return nodes(node, 'properties').flatMap(property => {
        const key = field(property, 'key')
        if (key === undefined || property['computed'] === true) return []
        return key.type === 'Identifier' ? [String(key['name'])] : literalClasses(key)
      })
    case 'CallExpression': {
      const callee = field(node, 'callee')
      if (callee?.type === 'Identifier' && CLASS_COMBINERS.has(String(callee['name'])))
        return nodes(node, 'arguments').flatMap(argument => literalClasses(argument))
      if (callee?.type !== 'MemberExpression' || field(callee, 'property')?.['name'] !== 'join')
        return []
      return literalClasses(field(callee, 'object'))
    }
    default:
      return []
  }
}

/** Every class a module writes literally in a class attribute, once per occurrence. */
export function renderedClasses(tree: SyntaxNode): string[] {
  const found: string[] = []
  visit(tree, node => {
    if (node.type === 'JSXAttribute' && CLASS_ATTRIBUTE.test(jsxName(field(node, 'name'))))
      found.push(...literalClasses(field(node, 'value')))
  })
  return found
}

/** Every path a stylesheet imports, as written. */
export function cssImports(stylesheet: string): string[] {
  return [...stylesheet.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gu)].map(
    match => match[1] ?? '',
  )
}

/** Every path a module imports, or re-exports everything from, as written. */
export function moduleImports(tree: SyntaxNode): string[] {
  return nodes(tree, 'body')
    .filter(
      statement =>
        statement.type === 'ImportDeclaration' || statement.type === 'ExportAllDeclaration',
    )
    .map(statement => String(field(statement, 'source')?.['value'] ?? ''))
}

const DEFINED = new Set(
  STYLESHEETS.flatMap(file => cssRules(file.text).flatMap(rule => selectorClasses(rule.selector))),
)

describe('classes gate', () => {
  it('adds no stylesheet that nothing imports and no rendered class without a rule', async () => {
    const exported = packageExports()
    const imported = new Set(
      [...SCRIPTS, ...STYLESHEETS].flatMap(file =>
        (file.kind === 'css' ? cssImports(file.text) : moduleImports(moduleOf(file))).flatMap(
          specifier => resolveImport(file.path, specifier, exported) ?? [],
        ),
      ),
    )
    const orphans = STYLESHEETS.filter(file => !imported.has(file.path)).map(
      file => `${file.path} | not imported`,
    )
    const rendered = SCRIPTS.filter(file => file.kind === 'tsx').flatMap(file =>
      renderedClasses(moduleOf(file)).map(name => ({ path: file.path, name })),
    )
    const candidates = [...new Set(rendered.map(({ name }) => name))].filter(
      name => !DEFINED.has(name) && !MARKERS.test(name),
    )
    const utilities = await tailwindUtilities()
    const css = utilities.candidatesToCss(candidates)
    const unstyled = new Set(candidates.filter((_, index) => css[index] === null))
    const bare = rendered
      .filter(({ name }) => unstyled.has(name))
      .map(({ path, name }) => `${path} | .${name}`)
    const report = ratchet('classes', tally([...orphans, ...bare]))
    expect(report.missing, 'no baseline: write it once with DESIGN_GATES_SEED=1').toBe(false)
    expect(
      report.added,
      'an unimported stylesheet or a class with no rule: style it or drop it',
    ).toEqual([])
    expect(
      report.stale,
      'styled or dropped now; shrink classes.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('asks the Tailwind build of the desktop page, with the kit theme, which classes are utilities', async () => {
    const utilities = await tailwindUtilities()
    const css = utilities.candidatesToCss([
      'flex',
      'text-ink-primary',
      'min-h-(--omne-control-height)',
      'dark:text-ink-muted',
      'omne-search-hit-open',
    ])
    expect(css.map(rule => rule !== null)).toEqual([true, true, true, true, false])
  })

  it('reads every literal class and leaves classes made at run time alone', () => {
    const source = `<>
      <p className="omne-note  flex" />
      <p className={'a ' + b} />
      <p className={cn('kit-row', open && 'kit-row-open', tone === 'danger' ? 'kit-danger' : null, { 'kit-quiet': quiet, loud })} />
      <p className={\`omne-card omne-card-\${tone} \${extra} omne-tail\`} />
      <p bodyClassName={['x', y].join(' ')} data-class="not-a-class" />
      <p className={variants({ size: 'lg' })} />
    </>`
    expect(renderedClasses(parseModule('sample.tsx', source))).toEqual([
      'omne-note',
      'flex',
      'kit-row',
      'kit-row-open',
      'kit-danger',
      'kit-quiet',
      'loud',
      'omne-card',
      'omne-tail',
      'x',
    ])
    expect(cssImports(`@import './tokens.css'; @import url("x.css") layer(base);`)).toEqual([
      './tokens.css',
      'x.css',
    ])
    expect(
      moduleImports(
        parseModule('a.tsx', `import './a.css'\nexport * from '@omne-harness/s-ui/s.ts'`),
      ),
    ).toEqual(['./a.css', '@omne-harness/s-ui/s.ts'])
  })
})
