// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import {
  ActionTooltip,
  Ago,
  CodeSurface,
  CountPill,
  Disclosure,
  DoneIcon,
  EmptyState,
  EntityChip,
  FactList,
  FactRow,
  GlideMenu,
  IconButton,
  ImpactPanel,
  InlineConfirm,
  InlineNotice,
  LoadingIndicator,
  LoadingState,
  PageColumn,
  PageHeader,
  ReceiptPill,
  SaveReceipt,
  STATE_LABELS,
  StateWord,
  StatusMark,
  StatusPill,
  TooltipProvider,
  TraceHeader,
  TraceRow,
  TraceRows,
  ValuePill,
  formatInstant,
  formatRelative,
} from '../src/index.ts'
import { CopyButton } from '../src/patterns/ai/copy-button.tsx'
import { Shimmer } from '../src/patterns/ai/shimmer.tsx'

beforeAll(() => {
  Object.assign(Element.prototype, {
    scrollIntoView: () => undefined,
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})

afterEach(cleanup)

it('IconButton is named by its label and reports a click', () => {
  const onClick = vi.fn()
  render(
    <TooltipProvider>
      <IconButton label="删除" onClick={onClick}>
        <DoneIcon />
      </IconButton>
    </TooltipProvider>,
  )
  const button = screen.getByRole('button', { name: '删除' })
  expect(button.getAttribute('data-variant')).toBe('ghost')
  expect(button.getAttribute('data-size')).toBe('icon')
  fireEvent.click(button)
  expect(onClick).toHaveBeenCalledTimes(1)
})

it('ActionTooltip wraps an existing control without renaming it', () => {
  render(
    <ActionTooltip label="去哪里">
      <a href="/x">链接</a>
    </ActionTooltip>,
  )
  expect(screen.getByRole('link', { name: '链接' })).toBeTruthy()
})

it('CopyButton writes the value to the clipboard and says it was copied', async () => {
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  render(<CopyButton value="abc" label="复制" copiedLabel="已复制" />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
  })
  expect(writeText).toHaveBeenCalledWith('abc')
  expect(screen.getByRole('button', { name: '已复制' })).toBeTruthy()
})

it('CopyButton says it failed when the clipboard refuses', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: async () => {
        throw new Error('no')
      },
    },
    configurable: true,
  })
  render(<CopyButton value="abc" label="复制" copiedLabel="已复制" failedLabel="复制失败" />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
  })
  expect(screen.getByRole('button', { name: '复制失败' })).toBeTruthy()
})

it('Disclosure folds and unfolds its content and keeps aria-expanded true to it', () => {
  render(<Disclosure label="详情">内部内容</Disclosure>)
  const trigger = screen.getByRole('button', { name: '详情' })
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(trigger.getAttribute('data-state')).toBe('open')
  expect(screen.getByText('内部内容')).toBeTruthy()
  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

it('EmptyState shows one sentence, a hint and an action', () => {
  render(
    <EmptyState
      title="还没有会话"
      hint="新建一个开始"
      action={<button type="button">新建</button>}
    />,
  )
  expect(screen.getByText('还没有会话').className).toContain('empty-state-title')
  expect(screen.getByText('新建一个开始')).toBeTruthy()
  expect(screen.getByRole('button', { name: '新建' })).toBeTruthy()
})

it('InlineNotice carries its tone, title and body, and an alert role for a failure', () => {
  render(
    <InlineNotice tone="danger" title="保存失败">
      磁盘已满
    </InlineNotice>,
  )
  const notice = screen.getByRole('alert')
  expect(notice.getAttribute('data-tone')).toBe('danger')
  expect(notice.textContent).toContain('保存失败')
  expect(notice.textContent).toContain('磁盘已满')
})

it('InlineNotice runs its action, dismisses, and shows its detail behind a disclosure', () => {
  const onClick = vi.fn()
  const onDismiss = vi.fn()
  render(
    <InlineNotice
      tone="info"
      action={{ label: '重试', onClick }}
      onDismiss={onDismiss}
      detail="code 7"
    >
      提示
    </InlineNotice>,
  )
  expect(screen.getByRole('status').getAttribute('data-tone')).toBe('info')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(onClick).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(onDismiss).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '详情' }))
  expect(screen.getByText('code 7')).toBeTruthy()
})

it('LoadingIndicator is decorative and LoadingState names itself', () => {
  const { container } = render(<LoadingIndicator size="sm" />)
  const mark = container.querySelector('[data-loading-indicator]')
  expect(mark?.getAttribute('aria-hidden')).toBe('true')
  expect(mark?.getAttribute('data-size')).toBe('sm')
  cleanup()
  render(<LoadingState label="加载中" />)
  expect(screen.getByRole('status', { name: '加载中' })).toBeTruthy()
})

it('PageHeader shows title, description and actions; PageColumn is a plain block, not a landmark', () => {
  const { container } = render(
    <PageColumn>
      <PageHeader
        title="设置"
        description="管理账号"
        actions={<button type="button">保存</button>}
      />
    </PageColumn>,
  )
  expect(container.querySelector('div.page-column')).toBeTruthy()
  expect(screen.queryByRole('main')).toBeNull()
  expect(screen.getByRole('heading', { level: 1, name: '设置' })).toBeTruthy()
  expect(screen.getByText('管理账号')).toBeTruthy()
  expect(screen.getByRole('button', { name: '保存' })).toBeTruthy()
})

it('SaveReceipt says saved once there is a time, and nothing before it', () => {
  const { rerender } = render(<SaveReceipt at={undefined} />)
  expect(screen.queryByTestId('save-receipt')).toBeNull()
  rerender(<SaveReceipt at={1} />)
  expect(screen.getByTestId('save-receipt').textContent).toContain('已保存')
})

it('FactList renders its terms and values as a definition list', () => {
  render(
    <FactList aria-label="事实">
      <FactRow term="名称">甲</FactRow>
      <FactRow term="状态">好</FactRow>
    </FactList>,
  )
  expect(screen.getAllByRole('term').map(term => term.textContent)).toEqual(['名称', '状态'])
  expect(screen.getAllByRole('definition').map(value => value.textContent)).toEqual(['甲', '好'])
})

it('CodeSurface shows the format name and the text, with a copy control when asked', () => {
  const { container } = render(
    <CodeSurface
      name="json"
      text='{"a":1}'
      copy={{ label: '复制', copiedLabel: '已复制', failedLabel: '失败' }}
    />,
  )
  expect(screen.getByText('json')).toBeTruthy()
  expect(container.querySelector('pre')?.textContent).toBe('{"a":1}')
  expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
})

it('Ago shows an age in words and keeps the instant on the element', () => {
  const at = '2026-01-01T00:00:00.000Z'
  const now = Date.parse(at) + 5 * 60_000
  render(<Ago at={at} now={now} />)
  const time = screen.getByText('5 分钟前')
  expect(time.tagName).toBe('TIME')
  expect(time.getAttribute('datetime')).toBe(at)
  expect(time.getAttribute('title')).toBe(formatInstant(at))
})

it('Ago shows an unreadable instant exactly as given', () => {
  render(<Ago at="不是时间" now={0} />)
  expect(screen.getByText('不是时间').tagName).toBe('SPAN')
})

it.each([
  [10, '刚刚'],
  [120, '2 分钟前'],
  [3 * 3600, '3 小时前'],
  [4 * 86400, '4 天前'],
])('formatRelative words %i seconds as %s', (seconds, words) => {
  const base = Date.parse('2026-06-01T00:00:00.000Z')
  expect(formatRelative(new Date(base - seconds * 1000).toISOString(), base)).toBe(words)
})

it('formatRelative and Ago take the words from the caller when given', () => {
  const words = {
    justNow: 'just now',
    minutes: (count: number) => `${count} min ago`,
    hours: (count: number) => `${count} h ago`,
    days: (count: number) => `${count} d ago`,
  }
  const base = Date.parse('2026-06-01T00:00:00.000Z')
  const before = (seconds: number) => new Date(base - seconds * 1000).toISOString()
  expect(formatRelative(before(10), base, words)).toBe('just now')
  expect(formatRelative(before(120), base, words)).toBe('2 min ago')
  expect(formatRelative(before(3 * 3600), base, words)).toBe('3 h ago')
  expect(formatRelative(before(4 * 86400), base, words)).toBe('4 d ago')
  render(<Ago at={before(300)} now={base} words={words} />)
  expect(screen.getByText('5 min ago').tagName).toBe('TIME')
})

it('formatRelative gives a dash for no instant or an unreadable one', () => {
  expect(formatRelative(null, 0)).toBe('—')
  expect(formatRelative('x', 0)).toBe('—')
})

it('StateWord says the shared word, or the caller words for a named fact', () => {
  const { container } = render(<StateWord state="saved" />)
  const word = container.querySelector('[data-state-word]')
  expect(word?.textContent).toBe('已保存')
  expect(word?.getAttribute('data-fact')).toBe('done')
  cleanup()
  render(<StateWord state="saved" labels={{ ...STATE_LABELS, saved: 'Saved' }} />)
  expect(screen.getByText('Saved')).toBeTruthy()
  cleanup()
  render(<StateWord fact="failed">出错了</StateWord>)
  expect(screen.getByText('出错了').getAttribute('data-tone')).toBe('danger')
})

it('StatusPill carries its fact and tone and the word', () => {
  const { container } = render(
    <StatusPill fact="waiting" token="待批">
      等待中
    </StatusPill>,
  )
  const pill = container.querySelector('[data-status-pill]')
  expect(pill?.getAttribute('data-fact')).toBe('waiting')
  expect(pill?.textContent).toContain('等待中')
  expect(pill?.textContent).toContain('待批')
})

it('CountPill writes a count in one look, capped at 99+, named when asked', () => {
  const { container } = render(
    <>
      <CountPill count={3} />
      <CountPill count={100} label="100 张等你回答" />
    </>,
  )
  const pills = [...container.querySelectorAll('[data-count-pill]')]
  expect(pills.map(pill => pill.textContent)).toEqual(['3', '99+'])
  expect(pills[0]?.hasAttribute('aria-label')).toBe(false)
  expect(pills[1]?.getAttribute('aria-label')).toBe('100 张等你回答')
})

it('CountPill is amber for what waits on an answer and neutral for a count that waits on no one', () => {
  const { container } = render(
    <>
      <CountPill count={2} />
      <CountPill count={5} tone="neutral" />
    </>,
  )
  const pills = [...container.querySelectorAll('[data-count-pill]')]
  expect(pills.map(pill => pill.getAttribute('data-tone'))).toEqual(['waiting', 'neutral'])
})

it('StatusMark draws a different mark for each phase', () => {
  const { container } = render(
    <>
      <StatusMark phase="running" tone="info" />
      <StatusMark phase="settled" tone="good" icon={DoneIcon} />
      <StatusMark phase="pending" tone="neutral" />
    </>,
  )
  expect(container.querySelectorAll('[data-loading-indicator]').length).toBe(1)
  expect(container.querySelectorAll('svg[data-icon="done"]').length).toBe(1)
  expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3)
})

it('ValuePill and ReceiptPill show their words and tones', () => {
  const { container } = render(
    <>
      <ValuePill tone="good" mono>
        42
      </ValuePill>
      <ReceiptPill tone="unknown" meta="#7">
        结果未知
      </ReceiptPill>
    </>,
  )
  expect(screen.getByText('42').className).toContain('font-mono')
  const receipt = container.querySelector('[data-receipt-pill]')
  expect(receipt?.getAttribute('data-outcome')).toBe('unknown')
  expect(receipt?.textContent).toContain('结果未知')
  expect(receipt?.textContent).toContain('#7')
})

it('ReceiptPill says a refusal with the refusing mark in the ending tone, never as accepted', () => {
  const { container } = render(
    <>
      <ReceiptPill tone="declined">已拒绝</ReceiptPill>
      <ReceiptPill tone="cancelled">已取消</ReceiptPill>
      <ReceiptPill tone="accepted">已接受</ReceiptPill>
    </>,
  )
  const [declined, cancelled, accepted] = [...container.querySelectorAll('[data-receipt-pill]')]
  expect(declined?.getAttribute('data-outcome')).toBe('declined')
  expect(declined?.getAttribute('data-tone')).toBe(cancelled?.getAttribute('data-tone'))
  expect(declined?.getAttribute('data-tone')).not.toBe(accepted?.getAttribute('data-tone'))
  expect(declined?.querySelector('svg')?.getAttribute('data-icon')).toBe('close')
  expect(accepted?.querySelector('svg')?.getAttribute('data-icon')).toBe('done')
})

it('EntityChip is a link, a button or plain by what it is given, and removes on request', () => {
  const onClick = vi.fn()
  const onRemove = vi.fn()
  const { container } = render(
    <>
      <EntityChip kind="contact" label="王" href="/c/1" />
      <EntityChip
        kind="matter"
        label="事项"
        onClick={onClick}
        onRemove={onRemove}
        removeLabel="移除事项"
      />
    </>,
  )
  expect(screen.getByRole('link', { name: '王' }).getAttribute('href')).toBe('/c/1')
  fireEvent.click(screen.getByRole('button', { name: '事项' }))
  expect(onClick).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '移除事项' }))
  expect(onRemove).toHaveBeenCalledTimes(1)
  expect(container.querySelectorAll('[data-entity-chip]').length).toBe(2)
})

it('Shimmer marks itself only while active', () => {
  const { rerender } = render(<Shimmer active>想一想</Shimmer>)
  expect(screen.getByText('想一想').className).toContain('omne-shimmer')
  rerender(<Shimmer active={false}>想一想</Shimmer>)
  expect(screen.getByText('想一想').className).not.toContain('omne-shimmer')
})

it('Trace header folds its rows and each row tells its status', () => {
  const onToggle = vi.fn()
  render(
    <>
      <TraceHeader
        state="settled"
        label="过程"
        expanded={false}
        controls="rows"
        onToggle={onToggle}
      />
      <TraceRows>
        <TraceRow status="done" statusLabel="已完成" verb="读取文件" chip="a.txt" meter="2 秒" />
        <TraceRow status="failed" statusLabel="失败" verb="写入文件" />
      </TraceRows>
    </>,
  )
  const header = screen.getByRole('button', { name: '过程' })
  expect(header.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(header)
  expect(onToggle).toHaveBeenCalledTimes(1)
  expect(screen.getAllByRole('listitem').length).toBe(2)
  expect(screen.getByText('已完成')).toBeTruthy()
  expect(screen.getByText('读取文件')).toBeTruthy()
  expect(screen.getByText('a.txt')).toBeTruthy()
})

it('InlineConfirm arms on the first press and commits only on the second', () => {
  const onConfirm = vi.fn()
  render(
    <TooltipProvider>
      <InlineConfirm
        tone="danger"
        confirmLabel="确认删除"
        consequence="不可恢复"
        onConfirm={onConfirm}
      >
        删除
      </InlineConfirm>
    </TooltipProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: '删除' }))
  expect(onConfirm).not.toHaveBeenCalled()
  expect(screen.getByText('不可恢复')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

it('InlineConfirm backs out with its cancel label and with Escape', () => {
  const onConfirm = vi.fn()
  render(
    <TooltipProvider>
      <InlineConfirm tone="default" confirmLabel="确定" cancelLabel="算了" onConfirm={onConfirm}>
        执行
      </InlineConfirm>
    </TooltipProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: '执行' }))
  fireEvent.click(screen.getByRole('button', { name: '算了' }))
  expect(screen.getByRole('button', { name: '执行' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '执行' }))
  fireEvent.keyDown(screen.getByRole('button', { name: '确定' }), { key: 'Escape' })
  expect(screen.getByRole('button', { name: '执行' })).toBeTruthy()
  expect(onConfirm).not.toHaveBeenCalled()
})

it('InlineConfirm says cancel in Chinese unless the caller says otherwise', () => {
  render(
    <TooltipProvider>
      <InlineConfirm tone="default" confirmLabel="确定" onConfirm={() => undefined}>
        执行
      </InlineConfirm>
    </TooltipProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: '执行' }))
  expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
})

it('ImpactPanel lists what changes and what stays, and confirms or cancels', async () => {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <ImpactPanel
      open
      onOpenChange={onOpenChange}
      title="删除会话"
      description="删除后不可恢复"
      affected={
        <ul>
          <li>三条消息</li>
        </ul>
      }
      kept="附件仍在"
      confirmLabel="删除"
      tone="danger"
      onConfirm={onConfirm}
    />,
  )
  const dialog = await screen.findByRole('dialog', { name: '删除会话' })
  expect(dialog.getAttribute('data-tone')).toBe('danger')
  expect(screen.getByRole('heading', { name: '会改变什么' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: '会保留什么' })).toBeTruthy()
  expect(screen.getByText('三条消息')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '删除' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

it('GlideMenu shows the selected block for the selected row, and takes it away when none is selected', () => {
  const rows = (selected: string | null) => (
    <GlideMenu>
      <div data-glide-row data-selected={selected === 'a'}>
        甲
      </div>
      <div data-glide-row data-selected={selected === 'b'}>
        乙
      </div>
    </GlideMenu>
  )
  const { container, rerender } = render(rows('a'))
  const block = (): Element | null => container.querySelector('[data-glide-highlight="selected"]')
  expect(block()?.getAttribute('data-shown')).toBe('true')
  rerender(rows('b'))
  expect(block()?.getAttribute('data-shown')).toBe('true')
  rerender(rows(null))
  expect(block()?.getAttribute('data-shown')).toBe('false')
})

it('GlideMenu moves its hover block onto the row the pointer or focus reaches and hides it on leaving', () => {
  const { container } = render(
    <GlideMenu>
      <button type="button" data-glide-row>
        甲
      </button>
    </GlideMenu>,
  )
  const hover = (): HTMLElement | null =>
    container.querySelector<HTMLElement>('[data-glide-highlight=""]')
  expect(hover()?.style.opacity).toBe('0')
  fireEvent.pointerOver(screen.getByRole('button', { name: '甲' }))
  expect(hover()?.style.opacity).toBe('1')
  fireEvent.pointerLeave(container.firstElementChild as Element)
  expect(hover()?.style.opacity).toBe('0')
})
