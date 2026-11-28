// @module-tag source-text
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ratchet, tally } from './ratchet.ts'
import { DESKTOP_PAGE, FILES, KIT, REPOSITORY } from './scope.ts'

/**
 * FE-I35: a reference such as `visual-standard/references/timing.md#1-界面的一只钟` sends a reader to one place in the
 * visual standard skill, so that place exists. The scanned sources and the two specs that point at the skill are
 * read; a file that does not exist, or a heading anchor the file does not have, is counted. Anchors are made the way
 * the repository's Markdown check makes them (`tools/spec-tools`, `doc_support.slug`): lower case, everything but
 * word characters, hyphens and spaces removed, spaces turned into hyphens, `-1`, `-2` after a repeated heading.
 */
const SKILL = '.meta_harness/agents/skills/visual-standard'
/** The spec of the group the shared kit belongs to, and the desktop application's spec. */
const SPECS = [join(KIT, '..', 'SPEC.md'), join(DESKTOP_PAGE, '..', '..', 'SPEC.md')]
/** The skill's file names are ASCII paths; an anchor is what `slug` leaves, or its percent-encoding. */
const REFERENCE = /visual-standard\/([\w./-]+\.md)#([\p{L}\p{N}_%-]+)/gu

function slug(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}_\- ]/gu, '')
    .replaceAll(' ', '-')
}

/** A heading's text as the Markdown parser reads it: inline code, link text and image text stay, markup goes. */
function headingText(heading: string): string {
  return heading
    .replaceAll(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replaceAll(/<[^>]+>/gu, '')
    .replaceAll(/(\*\*|__|\*|`)(.+?)\1/gu, '$2')
    .replace(/\s+#+\s*$/u, '')
    .trim()
}

/** Every anchor a Markdown file has: its headings outside code fences and front matter, and explicit `id`/`name`. */
export function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>()
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, '')
  let fence: string | undefined
  for (const line of body.split(/\r?\n/u)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1]
    if (marker !== undefined && (fence === undefined || marker.startsWith(fence))) {
      fence = fence === undefined ? marker : undefined
      continue
    }
    const heading = fence === undefined ? /^\s{0,3}#{1,6}\s+(.*)$/u.exec(line)?.[1] : undefined
    if (heading === undefined) continue
    const base = slug(headingText(heading))
    let name = base
    for (let suffix = 1; anchors.has(name); suffix += 1) name = `${base}-${suffix}`
    anchors.add(name)
  }
  for (const match of body.matchAll(/<a\s[^>]*\b(?:id|name)=["']([^"']+)["']/gu))
    anchors.add(match[1] ?? '')
  return anchors
}

function decoded(anchor: string): string {
  try {
    return decodeURIComponent(anchor)
  } catch {
    return anchor
  }
}

/**
 * Each reference into the skill whose file or anchor is missing, as `visual-standard/<file>#<anchor>`. `read` gives
 * the text of a file under the skill, trying the path as written and the canonical one, or `undefined`.
 */
export function danglingReferences(
  text: string,
  read: (file: string) => string | undefined,
): string[] {
  const found: string[] = []
  for (const match of text.matchAll(REFERENCE)) {
    const file = match[1] ?? ''
    const anchor = decoded(match[2] ?? '')
    const markdown = read(file)
    if (markdown === undefined || !headingAnchors(markdown).has(anchor))
      found.push(`visual-standard/${file}#${anchor}`)
  }
  return found
}

function readSkillFile(file: string): string | undefined {
  const path = [join(REPOSITORY, SKILL, file), join(REPOSITORY, SKILL, 'canonical', file)].find(
    candidate => existsSync(candidate),
  )
  return path === undefined ? undefined : readFileSync(path, 'utf8')
}

describe('visual standard references', () => {
  it('points only at files and anchors the visual standard skill has', () => {
    const sources = [
      ...FILES.map(file => ({ path: file.path, text: file.text })),
      ...SPECS.map(path => ({ path, text: readFileSync(join(REPOSITORY, path), 'utf8') })),
    ]
    const found = sources.flatMap(({ path, text }) =>
      danglingReferences(text, readSkillFile).map(reference => `${path} | ${reference}`),
    )
    const report = ratchet('references', tally(found))
    expect(report.missing, 'no baseline: write it once with DESIGN_GATES_SEED=1').toBe(false)
    expect(report.added, 'references to anchors the visual standard skill does not have').toEqual(
      [],
    )
    expect(
      report.stale,
      'fixed references; shrink references.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('reads the specs that point at the skill', () => {
    expect(SPECS).toEqual(['packages/frontend/SPEC.md', 'apps/desktop/SPEC.md'])
    expect(readSkillFile('references/timing.md')).toBe(
      readSkillFile('canonical/references/timing.md'),
    )
  })

  it('tells an anchor that exists from one that does not', () => {
    const markdown = [
      '---',
      'name: x',
      '---',
      '# 时长',
      '## 1. 界面的一只钟',
      '```md',
      '## 不是标题',
      '```',
      '## `--omne-duration` 与 **曲线**',
      '## 1. 界面的一只钟',
      '<a id="ring-room"></a>',
    ].join('\n')
    expect([...headingAnchors(markdown)]).toEqual([
      '时长',
      '1-界面的一只钟',
      '--omne-duration-与-曲线',
      '1-界面的一只钟-1',
      'ring-room',
    ])
    const files = new Map([['references/timing.md', markdown]])
    const source = [
      '见 visual-standard/references/timing.md#1-界面的一只钟 与 [环](visual-standard/references/timing.md#ring-room)。',
      '`visual-standard/references/timing.md#%E6%97%B6%E9%95%BF`；visual-standard/references/timing.md#不是标题；',
      'visual-standard/references/gone.md#时长；visual-standard/canonical/SKILL.md 没有锚点。',
    ].join('\n')
    expect(danglingReferences(source, file => files.get(file))).toEqual([
      'visual-standard/references/timing.md#不是标题',
      'visual-standard/references/gone.md#时长',
    ])
  })
})
