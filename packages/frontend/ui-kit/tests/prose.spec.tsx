// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PROSE_TRANSLATIONS, Prose } from '../src/index.ts'

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
  })
}

async function renderProse(text: string, props: { unlinked?: boolean; ownWords?: boolean } = {}) {
  const view = render(<Prose text={text} {...props} />)
  await settle()
  return view
}

it('draws headings, lists, quotes and rules as their elements inside the prose root', async () => {
  const { container } = await renderProse(
    [
      '# 一级',
      '',
      '## 二级',
      '',
      '- 甲',
      '- 乙',
      '',
      '1. 一',
      '2. 二',
      '',
      '> 引文',
      '',
      '---',
    ].join('\n'),
  )
  const root = container.querySelector('.omne-prose')
  expect(root).not.toBeNull()
  expect(root?.querySelector('h1')?.textContent).toBe('一级')
  expect(root?.querySelector('h2')?.textContent).toBe('二级')
  expect([...(root?.querySelectorAll('ul > li') ?? [])].map(li => li.textContent)).toEqual([
    '甲',
    '乙',
  ])
  expect([...(root?.querySelectorAll('ol > li') ?? [])].map(li => li.textContent)).toEqual([
    '一',
    '二',
  ])
  expect(root?.querySelector('blockquote')?.textContent).toContain('引文')
  expect(root?.querySelector('hr')).not.toBeNull()
})

it('draws a table with its header and body cells', async () => {
  const { container } = await renderProse('| 名称 | 值 |\n| --- | --- |\n| 甲 | 1 |\n| 乙 | 2 |')
  expect([...container.querySelectorAll('th')].map(cell => cell.textContent)).toEqual([
    '名称',
    '值',
  ])
  expect([...container.querySelectorAll('td')].map(cell => cell.textContent)).toEqual([
    '甲',
    '1',
    '乙',
    '2',
  ])
})

it('draws a fenced block as a code block carrying its language and its text', async () => {
  const { container } = await renderProse('```ts\nconst x = 1\n```')
  const block = container.querySelector('[data-streamdown="code-block"]')
  expect(block).not.toBeNull()
  expect(block?.getAttribute('data-language')).toBe('ts')
  expect(block?.textContent).toContain('const x = 1')
})

it('draws inline code, emphasis and strong text', async () => {
  const { container } = await renderProse('用 `npm test` 跑 **加粗** 与 *斜体*')
  expect(container.querySelector('code')?.textContent).toBe('npm test')
  expect(container.querySelector('[data-streamdown="strong"]')?.textContent).toBe('加粗')
  expect(container.querySelector('em')?.textContent).toBe('斜体')
})

it('opens a link in a new window with a safe rel', async () => {
  const { container } = await renderProse('见 [说明](https://example.com/doc)')
  const link = container.querySelector('a')
  expect(link?.getAttribute('href')).toBe('https://example.com/doc')
  expect(link?.getAttribute('target')).toBe('_blank')
  expect(link?.getAttribute('rel')).toBe('noreferrer noopener')
})

it('gives an omne:// address no in-app link of its own', async () => {
  const { container } = await renderProse('[会话](omne://conversation/abc)')
  expect(container.querySelector('a')).toBeNull()
  expect(container.textContent).toContain('会话')
})

it('reads its own links as plain words when drawn inside a link', async () => {
  const { container } = await renderProse('见 [说明](https://example.com/doc)', { unlinked: true })
  expect(container.querySelector('a')).toBeNull()
  expect(container.textContent).toContain('说明')
})

it('keeps every character of a text given in three streaming steps', async () => {
  const parts = ['## 标题\n\n第一段文字，', '含有 **加', '粗** 与 `代码`。\n\n- 条目一\n- 条目二']
  const { container, rerender } = render(<Prose text={parts[0]!} isAnimating />)
  await settle()
  rerender(<Prose text={parts[0]! + parts[1]!} isAnimating />)
  await settle()
  rerender(<Prose text={parts.join('')} isAnimating />)
  await settle()
  rerender(<Prose text={parts.join('')} />)
  await settle()
  const text = container.textContent ?? ''
  for (const piece of ['标题', '第一段文字，', '含有', '加粗', '代码', '条目一', '条目二']) {
    expect(text).toContain(piece)
  }
  expect(container.querySelector('[data-streamdown="strong"]')?.textContent).toBe('加粗')
  expect(container.querySelectorAll('li').length).toBe(2)
})

it('shows the words the owner typed as they are unless they are Markdown shaped', async () => {
  const { container } = await renderProse('一行\n两行  留白', { ownWords: true })
  expect(container.querySelector('.omne-prose')).toBeNull()
  expect(container.querySelector('span.whitespace-pre-wrap')?.textContent).toBe('一行\n两行  留白')
  cleanup()
  const markdown = await renderProse('# 标题', { ownWords: true })
  expect(markdown.container.querySelector('h1')?.textContent).toBe('标题')
})

it('names its Markdown controls in Chinese unless the caller gives its own words', async () => {
  const { container, rerender } = await renderProse('```ts\nconst x = 1\n```')
  const labels = () =>
    [...container.querySelectorAll('[data-streamdown="code-block"] button')].map(
      button => button.getAttribute('title') ?? button.getAttribute('aria-label'),
    )
  expect(labels()).toContain(PROSE_TRANSLATIONS.copyCode)
  rerender(
    <Prose
      text={'```ts\nconst x = 1\n```'}
      translations={{ ...PROSE_TRANSLATIONS, copyCode: 'Copy code' }}
    />,
  )
  await settle()
  expect(labels()).toContain('Copy code')
})
