// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'

import {
  AppointmentIcon,
  BackIcon,
  DirectorySearch,
  EmptyState,
  IconButton,
  Input,
  ListReadingDirectory,
  ListReadingMain,
  ListReadingPage,
  ListReadingRow,
  ListReadingWorkspace,
  PageColumn,
  PageHeader,
  ReadingDocument,
  ReadingState,
  ReadingToolbar,
  RetryIcon,
  Section,
  SettingRow,
  TooltipProvider,
} from '../src/index.ts'

/*
 * The page skeleton (SPEC "页的骨架"). The DOM here computes no layout, so the pattern sheet is read as a small
 * cascade: the rules whose selector matches an element and whose width condition holds at a window width, the most
 * specific winning and the later one on a tie. The values are the declared ones, token names included.
 */
const PATTERNS = readFileSync(join(import.meta.dirname, '../src/patterns/patterns.css'), 'utf8')

interface Rule {
  readonly order: number
  readonly media: string
  readonly selector: string
  readonly specificity: number
  readonly declarations: ReadonlyMap<string, string>
}

/** The pieces of a text between the separators that stand outside parentheses. */
function topLevel(text: string, separator: string): string[] {
  const pieces: string[] = []
  let depth = 0
  let from = 0
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '(') depth += 1
    else if (text[at] === ')') depth -= 1
    else if (text[at] === separator && depth === 0) {
      pieces.push(text.slice(from, at))
      from = at + 1
    }
  }
  pieces.push(text.slice(from))
  return pieces.map(piece => piece.trim()).filter(piece => piece !== '')
}

/** Ids, then classes, attributes and pseudo-classes, then type names, as one comparable number. */
function specificityOf(selector: string): number {
  const ids = (selector.match(/#[\w-]+/gu) ?? []).length
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/gu) ?? []).length
  const bare = selector.replaceAll(/\[[^\]]+\]|\([^)]*\)/gu, '')
  const types = (bare.match(/(?:^|[\s>+~])[a-z][\w-]*/gu) ?? []).length
  return ids * 10_000 + classes * 100 + types
}

function rulesOf(css: string): Rule[] {
  const rules: Rule[] = []
  const walk = (body: string, media: string): void => {
    let at = 0
    while (at < body.length) {
      const open = body.indexOf('{', at)
      if (open < 0) return
      const head = body.slice(at, open).trim()
      let close = open + 1
      for (let depth = 1; depth > 0; close += 1) {
        if (body[close] === '{') depth += 1
        else if (body[close] === '}') depth -= 1
      }
      const inner = body.slice(open + 1, close - 1)
      if (head.startsWith('@media')) walk(inner, head.slice('@media'.length).trim())
      else {
        const declarations = new Map(
          topLevel(inner, ';').map(declaration => {
            const colon = declaration.indexOf(':')
            return [
              declaration.slice(0, colon).trim(),
              declaration
                .slice(colon + 1)
                .replaceAll(/\s+/gu, ' ')
                .trim(),
            ] as const
          }),
        )
        for (const selector of topLevel(head, ','))
          rules.push({
            order: rules.length,
            media,
            selector,
            specificity: specificityOf(selector),
            declarations,
          })
      }
      at = close
    }
  }
  walk(css.replaceAll(/\/\*[\s\S]*?\*\//gu, ''), '')
  return rules
}

const RULES = rulesOf(PATTERNS)

/** Whether a width condition of the sheet holds at a window width; any other condition does not. */
function holds(media: string, width: number): boolean {
  if (media === '') return true
  const match = /^\((min|max)-width:\s*(\d+)px\)$/u.exec(media)
  if (match === null) return false
  return match[1] === 'min' ? width >= Number(match[2]) : width <= Number(match[2])
}

/** The value the pattern sheet gives one property of an element at a window width. */
function cascade(
  element: Element | null | undefined,
  property: string,
  width = 1440,
): string | undefined {
  if (element === null || element === undefined) throw new Error('no element')
  return RULES.filter(
    rule =>
      rule.declarations.has(property) && holds(rule.media, width) && element.matches(rule.selector),
  )
    .sort((a, b) => a.specificity - b.specificity || a.order - b.order)
    .at(-1)
    ?.declarations.get(property)
}

const HAIRLINE = '1px solid var(--omne-line-subtle)'
const CORNER =
  'calc( 4 * var(--omne-space-inline) + var(--omne-control-height) + var(--omne-control-height-touch) )'

beforeAll(() => {
  Object.assign(Element.prototype, {
    scrollIntoView: () => undefined,
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})

afterEach(cleanup)

it('PageHeader draws the one hairline under itself, with the section space above it and, in a column, below it', () => {
  render(
    <PageColumn>
      <PageHeader title="日历" description="日期计算用哪套日历。" />
    </PageColumn>,
  )
  const header = document.querySelector('.page-header')
  expect(cascade(header, 'border-bottom')).toBe(HAIRLINE)
  expect(cascade(header, 'padding-bottom')).toBe('var(--omne-space-section)')
  expect(cascade(header, 'margin-bottom')).toBe('var(--omne-space-section)')
})

it('PageHeader puts the sentence 4 under the title in muted ui type, and draws only the title without one', () => {
  render(<PageHeader title="日历" description="日期计算用哪套日历。" />)
  const text = document.querySelector('.page-header-text')
  expect(cascade(text, 'display')).toBe('grid')
  expect(cascade(text, 'gap')).toBe('var(--spacing)')
  const sentence = screen.getByText('日期计算用哪套日历。')
  expect(sentence.parentElement).toBe(text)
  expect(cascade(sentence, 'color')).toBe('var(--omne-ink-muted)')
  expect(cascade(sentence, 'font-size')).toBe('var(--omne-text-ui)')
  expect(cascade(sentence, 'max-width')).toBe('65ch')
  cleanup()
  render(<PageHeader title="搜索" />)
  expect(screen.getByRole('heading', { level: 1, name: '搜索' })).toBeTruthy()
  expect(document.querySelector('.page-header-description')).toBeNull()
  expect(document.querySelector('.page-header-actions')).toBeNull()
})

it('PageHeader holds its actions at the right, and at the left below 768', () => {
  render(
    <TooltipProvider>
      <PageHeader
        title="日程"
        actions={
          <IconButton label="重读">
            <RetryIcon />
          </IconButton>
        }
      />
    </TooltipProvider>,
  )
  const actions = document.querySelector('.page-header-actions')
  expect(actions?.contains(screen.getByRole('button', { name: '重读' }))).toBe(true)
  expect(cascade(actions, 'justify-content')).toBe('flex-end')
  expect(cascade(actions, 'justify-content', 767)).toBe('flex-start')
})

it('PageHeader keeps out of the corner that holds the home and the sheet toggle below 768', () => {
  render(
    <PageColumn>
      <PageHeader title="通知" />
    </PageColumn>,
  )
  const header = document.querySelector('.page-header')
  expect(cascade(header, 'padding-right')).toBeUndefined()
  expect(cascade(header, '--page-corner', 767)).toBe(CORNER)
  expect(cascade(header, 'padding-right', 767)).toBe(
    'calc(var(--page-corner) - var(--spacing) * 10)',
  )
})

it('Section draws a hairline over each section but the one right under the page header, whose rule it takes', () => {
  render(
    <PageColumn>
      <PageHeader title="日历" />
      <Section id="first" title="生效的日历">
        <p>中国法定节假日</p>
      </Section>
      <Section id="second" title="供应的日历">
        <p>日本法定节假日</p>
      </Section>
    </PageColumn>,
  )
  const [first, second] = document.querySelectorAll('.omne-section')
  expect(cascade(first, 'border-top')).toBe('0')
  expect(cascade(first, 'padding-top')).toBe('0')
  expect(cascade(second, 'border-top')).toBe(HAIRLINE)
  expect(cascade(second, 'padding-top')).toBeUndefined()
  expect(cascade(second, 'padding-block')).toBe('var(--omne-space-section)')
  const title = screen.getByRole('heading', { name: '供应的日历' })
  expect(cascade(title, 'font-size')).toBe('var(--omne-text-body)')
  expect(cascade(title, 'font-weight')).toBe('var(--omne-weight-strong)')
  expect(cascade(second?.querySelector('.omne-section-body'), 'margin-top')).toBe(
    'var(--omne-space-inline)',
  )
})

function Records({
  detail,
  empty = false,
}: {
  readonly detail: boolean
  readonly empty?: boolean
}) {
  return (
    <ListReadingPage title="日程" description="定好的时间与它们的下一次。" detail={detail}>
      <ListReadingWorkspace detail={detail} empty={empty}>
        <ListReadingDirectory>
          {empty ? <p>还没有日程。</p> : <ListReadingRow title="周会" onSelect={() => undefined} />}
        </ListReadingDirectory>
        <ListReadingMain>
          <ReadingState>
            <EmptyState still title="选一个日程看它的安排。" />
          </ReadingState>
        </ListReadingMain>
      </ListReadingWorkspace>
    </ListReadingPage>
  )
}

it('the skeleton carries the data attributes its caller gives to its own root, and keeps its own', () => {
  render(
    <ListReadingPage title="日程" detail={false} data-mark="page" data-detail="theirs">
      <ListReadingWorkspace detail={false} empty={false}>
        <ListReadingDirectory data-mark="directory">
          <ListReadingRow
            title="周会"
            onSelect={() => undefined}
            data-mark="row"
            data-control="theirs"
          />
        </ListReadingDirectory>
        <ListReadingMain data-mark="main">
          <Section id="one" title="生效的日历" data-mark="section">
            <SettingRow label="一行" data-mark="setting" />
          </Section>
        </ListReadingMain>
      </ListReadingWorkspace>
    </ListReadingPage>,
  )
  const marked = (mark: string) => document.querySelector(`[data-mark="${mark}"]`)
  expect(marked('page')?.className).toBe('list-reading')
  expect(marked('page')?.getAttribute('data-detail')).toBe('false')
  expect(marked('directory')?.className).toBe('list-reading-directory')
  expect(marked('row')?.className).toBe('list-reading-row')
  expect(marked('row')?.getAttribute('data-control')).toBe('row')
  expect(marked('main')?.className).toBe('list-reading-main')
  expect(marked('section')?.id).toBe('one')
  expect(marked('setting')?.className).toBe('setting-row')
  expect(document.querySelectorAll('[data-mark]')).toHaveLength(6)
})

const shown = (selector: string, width: number): boolean =>
  cascade(document.querySelector(selector), 'display', width) !== 'none'

it('ListReadingPage spans its page header over the workspace and drops it below 768 while a record is open', () => {
  const { rerender } = render(<Records detail={false} />)
  const header = document.querySelector('.list-reading > .page-header')
  expect(header?.nextElementSibling?.className).toBe('list-reading-workspace')
  expect(cascade(header, 'border-bottom')).toBe(HAIRLINE)
  expect(cascade(header, 'padding')).toBe(
    'var(--omne-space-page) calc(var(--spacing) * 10) var(--omne-space-section)',
  )
  expect(shown('.list-reading > .page-header', 767)).toBe(true)
  expect(cascade(header, 'padding', 767)).toBe(
    'calc(var(--spacing) * 5) var(--page-corner) var(--omne-space-block) calc(var(--spacing) * 4)',
  )
  expect(cascade(header, '--page-corner', 767)).toBe(CORNER)
  rerender(<Records detail />)
  expect(shown('.list-reading > .page-header', 1440)).toBe(true)
  expect(shown('.list-reading > .page-header', 767)).toBe(false)
})

it('ListReadingWorkspace puts the list beside the reading surface, and below 1100 shows the one that matters', () => {
  const { rerender } = render(<Records detail={false} />)
  const directory = document.querySelector('.list-reading-directory')
  expect(cascade(directory, 'width')).toBe('calc(var(--spacing) * 63)')
  expect(cascade(directory, '--list-inset')).toBe('var(--omne-space-block)')
  expect(shown('.list-reading-directory', 1100)).toBe(true)
  expect(shown('.list-reading-main', 1100)).toBe(true)
  expect(shown('.list-reading-directory', 1099)).toBe(true)
  expect(shown('.list-reading-main', 1099)).toBe(false)
  expect(cascade(directory, '--list-inset', 1099)).toBe('calc(var(--spacing) * 10)')
  expect(cascade(directory, '--list-inset', 767)).toBe('calc(var(--spacing) * 4)')
  rerender(<Records detail />)
  expect(shown('.list-reading-directory', 1100)).toBe(true)
  expect(shown('.list-reading-directory', 1099)).toBe(false)
  expect(shown('.list-reading-main', 1099)).toBe(true)
  rerender(<Records detail={false} empty />)
  expect(document.querySelector('.list-reading-list > p')?.textContent).toBe('还没有日程。')
  expect(shown('.list-reading-directory', 1100)).toBe(true)
  expect(shown('.list-reading-directory', 1099)).toBe(false)
  expect(shown('.list-reading-main', 1099)).toBe(true)
})

it('the reading surface says one sentence while idle, and a record reads under a toolbar with its actions', () => {
  render(<Records detail={false} />)
  expect(document.querySelector('.list-reading-main > .list-reading-state')?.textContent).toBe(
    '选一个日程看它的安排。',
  )
  cleanup()
  render(
    <TooltipProvider>
      <ListReadingMain>
        <ReadingToolbar
          name="周会"
          origin="由 Agent 建 · 3 天前"
          back={
            <IconButton label="回到列表">
              <BackIcon />
            </IconButton>
          }
        >
          <IconButton label="重读">
            <RetryIcon />
          </IconButton>
        </ReadingToolbar>
        <ReadingDocument>
          <h2>周会</h2>
        </ReadingDocument>
      </ListReadingMain>
    </TooltipProvider>,
  )
  const toolbar = document.querySelector('.list-reading-toolbar')
  expect(cascade(toolbar, 'border-bottom')).toBe(HAIRLINE)
  expect(cascade(toolbar, 'min-height')).toBe('calc(var(--spacing) * 16)')
  expect(cascade(toolbar, 'padding')).toBe('calc(var(--spacing) * 3) calc(var(--spacing) * 10)')
  expect(toolbar?.firstElementChild).toBe(screen.getByRole('button', { name: '回到列表' }))
  expect(document.querySelector('.list-reading-toolbar-name')?.textContent).toBe('周会')
  expect(document.querySelector('.list-reading-origin')?.textContent).toBe('由 Agent 建 · 3 天前')
  expect(
    document
      .querySelector('.list-reading-toolbar-actions')
      ?.contains(screen.getByRole('button', { name: '重读' })),
  ).toBe(true)
  const reading = document.querySelector('.list-reading-scroll > .list-reading-document')
  expect(reading?.textContent).toBe('周会')
  expect(cascade(reading, 'max-width')).toBe('var(--omne-measure-reading)')
  expect(cascade(reading, 'margin')).toBe('0 auto')
})

it('ListReadingRow marks the selected record on the selected ground, reports a press, and glides inside its scroller', () => {
  const onSelect = vi.fn()
  render(
    <ListReadingDirectory>
      <ListReadingRow
        mark={<AppointmentIcon />}
        title="周会"
        facts="每周一 10:00 · 进行中"
        time="3 天前"
        selected
        onSelect={() => undefined}
      />
      <ListReadingRow title="月报" onSelect={onSelect} />
    </ListReadingDirectory>,
  )
  const selected = screen.getByRole('button', { name: /周会/u })
  const other = screen.getByRole('button', { name: '月报' })
  expect(selected.getAttribute('aria-current')).toBe('true')
  expect(other.hasAttribute('aria-current')).toBe(false)
  expect(cascade(selected, 'background')).toBe('var(--omne-selected)')
  expect(cascade(other, 'background')).toBeUndefined()
  expect(cascade(selected.querySelector('.list-reading-row-mark'), 'color')).toBe(
    'var(--omne-ink-faint)',
  )
  expect(selected.querySelector('.list-reading-row-mark svg')).not.toBeNull()
  expect(selected.querySelector('.list-reading-row-title')?.textContent).toBe('周会')
  const facts = selected.querySelector('.list-reading-row-facts')
  expect(facts?.textContent).toBe('每周一 10:00 · 进行中')
  expect(cascade(facts, '-webkit-line-clamp')).toBe('2')
  expect(selected.querySelector('.list-reading-row-time')?.textContent).toBe('3 天前')
  fireEvent.click(other)
  expect(onSelect).toHaveBeenCalledOnce()
  const scroller = selected.parentElement
  expect(scroller?.matches('.list-reading-list[data-glide-menu]')).toBe(true)
  expect(cascade(scroller, 'overflow')).toBe('auto')
  expect(selected.matches('[data-control="row"][data-glide-row]')).toBe(true)
  const hover = scroller?.querySelector<HTMLElement>('[data-glide-highlight=""]')
  expect(hover?.style.opacity).toBe('0')
  fireEvent.pointerOver(other)
  expect(hover?.style.opacity).toBe('1')
})

function Search() {
  const [value, setValue] = useState('')
  return (
    <DirectorySearch value={value} onChange={setValue} label="搜索日程" clearLabel="清除搜索" />
  )
}

it('DirectorySearch shows its clear control only while it holds text, and clearing empties it', () => {
  render(
    <TooltipProvider>
      <Search />
    </TooltipProvider>,
  )
  const field = screen.getByRole('textbox', { name: '搜索日程' })
  expect(field.getAttribute('placeholder')).toBe('搜索日程')
  expect(document.querySelector('.list-reading-search > svg')).not.toBeNull()
  expect(screen.queryByRole('button', { name: '清除搜索' })).toBeNull()
  fireEvent.change(field, { target: { value: '周会' } })
  fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
  expect((field as HTMLInputElement).value).toBe('')
  expect(screen.queryByRole('button', { name: '清除搜索' })).toBeNull()
  expect(document.activeElement).toBe(field)
})

it('SettingRow stacks its halves below 1100 and puts the control at the right from 1100; the notice spans the row', () => {
  render(
    <div>
      <SettingRow
        label="中国法定节假日"
        hint="Asia/Shanghai · 版本 seed-1"
        notice={<p>没有读到这份日历。</p>}
      >
        <span>生效</span>
      </SettingRow>
      <SettingRow label="日本法定节假日" />
    </div>,
  )
  const [row, last] = document.querySelectorAll('.setting-row')
  const control = row?.querySelector('.setting-row-control')
  expect(row?.querySelector('.setting-row-label')?.textContent).toBe('中国法定节假日')
  const hint = row?.querySelector('.setting-row-hint')
  expect(hint?.textContent).toBe('Asia/Shanghai · 版本 seed-1')
  expect(cascade(hint, 'color')).toBe('var(--omne-ink-muted)')
  expect(cascade(row, 'grid-template-columns', 1100)).toBe('minmax(0, 1fr) minmax(0, max-content)')
  expect(cascade(control, 'justify-self', 1100)).toBe('end')
  expect(cascade(row, 'grid-template-columns', 1099)).toBeUndefined()
  expect(cascade(control, 'justify-self', 1099)).toBeUndefined()
  expect(cascade(row?.querySelector('.setting-row-notice'), 'grid-column')).toBe('1 / -1')
  expect(cascade(row, 'border-bottom')).toBe(HAIRLINE)
  expect(cascade(last, 'border-bottom')).toBe('0')
  expect(last?.querySelector('.setting-row-control')).toBeNull()
  expect(last?.querySelector('.setting-row-hint')).toBeNull()
})

it('SettingRow names the control it labels, so pressing the label works the control', () => {
  render(
    <SettingRow label="时区" controlId="zone" hint="IANA 时区名。">
      <Input id="zone" />
    </SettingRow>,
  )
  expect(screen.getByLabelText('时区').id).toBe('zone')
})
