// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  advance,
  bodyOf,
  placingsOf,
  problemsOf,
  type Entered,
  type Phase,
} from '../src/create-steps.ts'
import { McpCreateForm } from '../src/create-form.tsx'
import type { McpCreating, McpRow, McpSnapshot } from '../src/index.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  endpoint,
  fakeGovernance,
  otherRow,
  permissionRow,
  readOf,
  TENANT,
} from './fixtures/fake-governance.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

const ENTERED: Entered = {
  name: 'docs',
  target: 'https://docs.example/mcp',
  auth: 'none',
  key: '',
  clientId: '',
  clientSecret: '',
}
const nobody = () => false
const notice = (text: string) => ({ kind: 'refused', text }) as const
const withCreating = (
  creating: McpCreating,
  ...holdings: ReturnType<typeof endpoint>[]
): McpSnapshot => ({
  ...readOf(...holdings),
  creating,
})
const rowsOf = (writes: Partial<Record<string, McpRow['write']>> = {}) => [
  permissionRow(),
  otherRow('docs/target', 'ordinary', 'target', writes['target']),
  otherRow('docs/credential', 'secret', 'credential', writes['credential']),
]

describe('what a filled form asks for', () => {
  it('C1 a name and an address are checked before anything is sent', () => {
    expect(problemsOf(ENTERED, nobody)).toEqual({})
    expect(problemsOf({ ...ENTERED, target: 'http://127.0.0.1:8931/mcp' }, nobody)).toEqual({})
    expect(problemsOf({ ...ENTERED, target: 'http://localhost/mcp' }, nobody)).toEqual({})
    expect(problemsOf({ ...ENTERED, name: 'Docs' }, nobody).name).toBe(
      '名字只能有小写字母、数字和短横，不超过 64 个字。',
    )
    expect(problemsOf({ ...ENTERED, name: 'a'.repeat(65) }, nobody).name).toBeDefined()
    expect(problemsOf(ENTERED, name => name === 'docs').name).toBe(
      '已经有一个叫 docs 的接入点：换一个名字，或者到它那一段里改地址。',
    )
    expect(problemsOf({ ...ENTERED, target: 'http://docs.example/mcp' }, nobody).target).toBe(
      '地址要以 https:// 开头；本机的服务才能用 http://127.0.0.1 或 http://localhost。',
    )
    expect(problemsOf({ ...ENTERED, target: '' }, nobody).target).toBeDefined()
  })

  it('C2 what is written once it is made: the address, then the key or the client, only what its auth has and was filled in', () => {
    expect(placingsOf(ENTERED)).toEqual([
      { item: 'target', secret: false, value: 'https://docs.example/mcp' },
    ])
    expect(placingsOf({ ...ENTERED, auth: 'static', key: ' sk-1 ' })).toEqual([
      { item: 'target', secret: false, value: 'https://docs.example/mcp' },
      { item: 'credential', secret: true, value: ' sk-1 ' },
    ])
    expect(placingsOf({ ...ENTERED, auth: 'static' })).toHaveLength(1)
    expect(placingsOf({ ...ENTERED, auth: 'none', key: 'sk-1', clientId: 'c' })).toHaveLength(1)
    expect(placingsOf({ ...ENTERED, auth: 'oauth', clientId: 'Iv1', clientSecret: 's' })).toEqual([
      { item: 'target', secret: false, value: 'https://docs.example/mcp' },
      { item: 'client-id', secret: false, value: 'Iv1' },
      { item: 'client-secret', secret: true, value: 's' },
    ])
  })
})

describe('one 新建, cell by cell', () => {
  const before: McpCreating = { kind: 'done', text: '已新建 old。' }
  const creating: Phase = {
    kind: 'creating',
    name: 'docs',
    placings: placingsOf({ ...ENTERED, auth: 'static', key: 'sk-1' }),
    before,
  }

  it('C3 creating waits on the answer before it, on sending and on unknown; a refusal goes back to editing with the reason', () => {
    expect(advance(creating, withCreating(before)).phase).toBe(creating)
    expect(advance(creating, withCreating({ kind: 'sending' })).phase).toBe(creating)
    const unknown = { kind: 'unknown', confirming: false, notice: notice('不知道') } as const
    expect(advance(creating, withCreating(unknown)).phase).toBe(creating)
    expect(advance(creating, withCreating({ kind: 'refused', notice: notice('同名') }))).toEqual({
      phase: { kind: 'editing', notice: notice('同名') },
    })
    expect(advance(creating, { kind: 'reading' }).phase).toBe(creating)
  })

  it('C4 made: waits until the endpoint and its row are listed, then writes the address once', () => {
    const done = { kind: 'done', text: '已新建 docs。' } as const
    expect(advance(creating, withCreating(done)).phase).toMatchObject({
      kind: 'placing',
      sent: null,
    })
    const listed = advance(creating, withCreating(done, endpoint('docs', rowsOf())))
    expect(listed).toEqual({
      phase: { kind: 'placing', name: 'docs', placings: creating.placings, sent: 'docs/target' },
      act: {
        key: 'docs/target',
        placing: { item: 'target', secret: false, value: 'https://docs.example/mcp' },
      },
    })
    const again = advance(
      listed.phase,
      withCreating(done, endpoint('docs', rowsOf({ target: { kind: 'submitting' } }))),
    )
    expect(again).toEqual({ phase: listed.phase })
  })

  it('C5 each write that succeeds moves to the next, the key as a secret; all written is placed', () => {
    const placing: Phase = {
      kind: 'placing',
      name: 'docs',
      placings: creating.placings,
      sent: 'docs/target',
    }
    const targetDone = advance(
      placing,
      withCreating(before, endpoint('docs', rowsOf({ target: { kind: 'succeeded' } }))),
    )
    expect(targetDone.act).toEqual({
      key: 'docs/credential',
      placing: { item: 'credential', secret: true, value: 'sk-1' },
    })
    const all = advance(
      targetDone.phase,
      withCreating(
        before,
        endpoint(
          'docs',
          rowsOf({ target: { kind: 'succeeded' }, credential: { kind: 'succeeded' } }),
        ),
      ),
    )
    expect(all).toEqual({ phase: { kind: 'placed', name: 'docs' } })
  })

  it.each([
    ['refused', { kind: 'refused', notice: notice('被拒') }],
    ['unconfirmed', { kind: 'unconfirmed', notice: notice('没认回') }],
    [
      'unknown',
      { kind: 'unknown', confirming: false, notice: { kind: 'unknown', text: '不知道' } },
    ],
  ] as const)('C6 a write answered %s stops there and says which one', (_case, write) => {
    const placing: Phase = {
      kind: 'placing',
      name: 'docs',
      placings: creating.placings,
      sent: 'docs/target',
    }
    expect(
      advance(placing, withCreating(before, endpoint('docs', rowsOf({ target: write })))),
    ).toEqual({
      phase: { kind: 'stopped', name: 'docs', item: 'target', notice: write.notice },
    })
  })

  it('C7 editing, placed and stopped do not move on their own', () => {
    for (const phase of [
      { kind: 'editing' },
      { kind: 'placed', name: 'docs' },
      { kind: 'stopped', name: 'docs', item: 'target', notice: notice('x') },
    ] as const)
      expect(advance(phase, withCreating(before, endpoint('docs', rowsOf())))).toEqual({ phase })
  })
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
  })
}

function fill(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('the form', () => {
  it('F1 a wrong name or address is said under its field and nothing is sent', async () => {
    const fake = fakeGovernance(readOf())
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
    await settle()
    fill('名字（必填）', 'Docs')
    fill('地址（必填）', 'docs.example')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    expect(screen.getByText('名字只能有小写字母、数字和短横，不超过 64 个字。')).toBeTruthy()
    expect(
      screen.getByText(
        '地址要以 https:// 开头；本机的服务才能用 http://127.0.0.1 或 http://localhost。',
      ),
    ).toBeTruthy()
    expect(fake.calls.filter(call => call.startsWith('create'))).toEqual([])
  })

  it('F2 with a key: makes it, writes the address, then the key as a secret, says it is added and asks it for its actions; the key is in no call', async () => {
    const fake = fakeGovernance(readOf())
    const refreshed: string[] = []
    const status = {
      'read-endpoint': () => new Promise(() => undefined),
      'refresh-endpoint': (body: { name: string }) => {
        refreshed.push(body.name)
        return Promise.resolve({ outcome: 'succeeded', body: { kind: 'published' } })
      },
    } as never
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={status} />)
    await settle()
    fill('名字（必填）', 'docs')
    fill('地址（必填）', 'https://docs.example/mcp')
    fireEvent.click(screen.getByRole('button', { name: '密钥' }))
    await settle()
    fill('密钥', 'sk-very-secret')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    expect(fake.calls).toContain('create docs name=docs,transport=streamable-http,auth=static')
    act(() =>
      fake.show(withCreating({ kind: 'done', text: '已新建 docs。' }, endpoint('docs', rowsOf()))),
    )
    await settle()
    expect(fake.calls).toContain('setValue docs/target string:https://docs.example/mcp')
    act(() =>
      fake.show(
        withCreating(
          { kind: 'done', text: '已新建 docs。' },
          endpoint('docs', rowsOf({ target: { kind: 'succeeded' } })),
        ),
      ),
    )
    await settle()
    expect(fake.calls).toContain('setSecret docs/credential')
    act(() =>
      fake.show(
        withCreating(
          { kind: 'done', text: '已新建 docs。' },
          endpoint(
            'docs',
            rowsOf({ target: { kind: 'succeeded' }, credential: { kind: 'succeeded' } }),
          ),
        ),
      ),
    )
    await settle()
    expect(screen.getByText('已加上 docs。它在下面，连上之后列出它的动作。')).toBeTruthy()
    expect(fake.calls.join('\n')).not.toContain('sk-very-secret')
    expect((screen.getByLabelText('名字（必填）') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('名字只能有小写字母、数字和短横，不超过 64 个字。')).toBeNull()
    expect(refreshed).toEqual(['docs'])
  })

  it('F3 a refused 新建 says why and keeps what was filled in', async () => {
    const fake = fakeGovernance(readOf())
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
    await settle()
    fill('名字（必填）', 'docs')
    fill('地址（必填）', 'https://docs.example/mcp')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    act(() => fake.show(withCreating({ kind: 'refused', notice: notice('这一层不能新建。') })))
    await settle()
    expect(screen.getByText('这一层不能新建。')).toBeTruthy()
    expect((screen.getByLabelText('地址（必填）') as HTMLInputElement).value).toBe(
      'https://docs.example/mcp',
    )
  })

  it('F4 a 新建 whose answer is unknown offers 再确认一次', async () => {
    const fake = fakeGovernance(readOf())
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
    await settle()
    fill('名字（必填）', 'docs')
    fill('地址（必填）', 'https://docs.example/mcp')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    act(() =>
      fake.show(
        withCreating({
          kind: 'unknown',
          confirming: false,
          notice: { kind: 'unknown', text: '不知道加上没有。' },
        }),
      ),
    )
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '再确认一次' }))
    expect(fake.calls).toContain('confirmCreate')
  })
})

describe('the edges the mutation found unguarded', () => {
  it('C1c spaces around the name and the address are not a problem; 64 characters is the longest name', () => {
    expect(
      problemsOf({ ...ENTERED, name: '  docs  ', target: '  https://docs.example/mcp ' }, nobody),
    ).toEqual({})
    expect(problemsOf({ ...ENTERED, name: 'a'.repeat(64) }, nobody)).toEqual({})
    expect(placingsOf({ ...ENTERED, target: ' https://docs.example/mcp ' })).toEqual([
      { item: 'target', secret: false, value: 'https://docs.example/mcp' },
    ])
  })

  it('C1b the body is the name without spaces around it, streamable-http and the auth chosen', () => {
    expect(bodyOf({ ...ENTERED, name: ' docs ', auth: 'oauth' })).toEqual({
      kind: 'object',
      entries: [
        { key: 'name', value: { kind: 'string', value: 'docs' } },
        { key: 'transport', value: { kind: 'string', value: 'streamable-http' } },
        { key: 'auth', value: { kind: 'string', value: 'oauth' } },
      ],
    })
  })

  it('C3b creating waits while nothing is sent yet; made, it writes to the endpoint of its own name among others', () => {
    const before: McpCreating = { kind: 'done', text: '已新建 old。' }
    const creating: Phase = {
      kind: 'creating',
      name: 'docs',
      placings: placingsOf(ENTERED),
      before,
    }
    expect(advance(creating, withCreating({ kind: 'none' })).phase).toBe(creating)
    const done = { kind: 'done', text: '已新建 docs。' } as const
    const other = endpoint('other', [otherRow('other/target', 'ordinary', 'target')])
    expect(advance(creating, withCreating(done, other, endpoint('docs', rowsOf()))).act?.key).toBe(
      'docs/target',
    )
  })

  it('F0 before anything is sent no field says it is wrong; after, each wrong one is marked', async () => {
    const fake = fakeGovernance(readOf())
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
    await settle()
    expect(screen.getByText('小写字母、数字和短横。agent 用这个名字叫它。')).toBeTruthy()
    fill('名字（必填）', 'Docs')
    expect(screen.queryByText('名字只能有小写字母、数字和短横，不超过 64 个字。')).toBeNull()
    expect(screen.getByLabelText('名字（必填）').getAttribute('aria-invalid')).toBe('false')
    fill('地址（必填）', 'docs.example')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    expect(screen.getByLabelText('名字（必填）').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('地址（必填）').getAttribute('aria-invalid')).toBe('true')
  })

  it('F1b one field wrong is enough to send nothing; a name the tenant holds is said and nothing is sent', async () => {
    const fake = fakeGovernance(readOf(endpoint('docs', rowsOf())))
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
    await settle()
    fill('名字（必填）', 'fresh')
    fill('地址（必填）', 'docs.example')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    expect(screen.getByLabelText('名字（必填）').getAttribute('aria-invalid')).toBe('false')
    fill('名字（必填）', 'docs')
    fill('地址（必填）', 'https://docs.example/mcp')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    expect(
      screen.getByText('已经有一个叫 docs 的接入点：换一个名字，或者到它那一段里改地址。'),
    ).toBeTruthy()
    expect(fake.calls.filter(call => call.startsWith('create'))).toEqual([])
  })

  it('F1c while a 新建 is on its way 添加 cannot be pressed and the form says what it is doing', async () => {
    const fake = fakeGovernance(readOf())
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
    await settle()
    fill('名字（必填）', 'docs')
    fill('地址（必填）', 'https://docs.example/mcp')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    expect((screen.getByRole('button', { name: '添加' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('正在加 docs……')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(fake.calls.filter(call => call.startsWith('create'))).toHaveLength(1)
    act(() => fake.show(withCreating({ kind: 'done', text: '已新建 docs。' })))
    await settle()
    expect(screen.getByText('正在设 docs 的地址……')).toBeTruthy()
    expect((screen.getByRole('button', { name: '添加' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('the form, second round of the mutation', () => {
  it('F5 starts empty with 不用 chosen and its hint; 密钥 shows the key field only then', async () => {
    const fake = fakeGovernance(readOf())
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
    await settle()
    expect((screen.getByLabelText('名字（必填）') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('地址（必填）') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: '不用' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('对方不要求登录，例如 DeepWiki。')).toBeTruthy()
    expect(screen.getByText('服务的 MCP 地址，一般以 /mcp 结尾。')).toBeTruthy()
    expect(screen.getByLabelText('地址（必填）').getAttribute('aria-invalid')).toBe('false')
    expect(screen.queryByLabelText('密钥')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '密钥' }))
    await settle()
    expect((screen.getByLabelText('密钥') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('对方不要求登录，例如 DeepWiki。')).toBeNull()
  })

  it('F6 a name with spaces around it is sent without them; without a status the end does not fail', async () => {
    const fake = fakeGovernance(readOf())
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
    await settle()
    fill('名字（必填）', '  docs ')
    fill('地址（必填）', 'https://docs.example/mcp')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    expect(fake.calls).toContain('create docs name=docs,transport=streamable-http,auth=none')
    act(() =>
      fake.show(withCreating({ kind: 'done', text: '已新建 docs。' }, endpoint('docs', rowsOf()))),
    )
    await settle()
    act(() =>
      fake.show(
        withCreating(
          { kind: 'done', text: '已新建 docs。' },
          endpoint('docs', rowsOf({ target: { kind: 'succeeded' } })),
        ),
      ),
    )
    await settle()
    expect(screen.getByText('已加上 docs。它在下面，连上之后列出它的动作。')).toBeTruthy()
  })

  it('F7 while the governance port is still reading the form is drawn and 添加 sends nothing', async () => {
    const fake = fakeGovernance({ kind: 'reading' })
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
    await settle()
    fill('名字（必填）', 'docs')
    fill('地址（必填）', 'https://docs.example/mcp')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    expect(fake.calls.filter(call => call.startsWith('create'))).toEqual([])
  })

  it.each([
    ['target', '地址'],
    ['credential', '密钥'],
  ] as const)(
    'F8 a write of %s refused stops the form and names that item',
    async (item, label) => {
      const fake = fakeGovernance(readOf())
      render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
      await settle()
      fill('名字（必填）', 'docs')
      fill('地址（必填）', 'https://docs.example/mcp')
      fireEvent.click(screen.getByRole('button', { name: '密钥' }))
      await settle()
      fill('密钥', 'sk-1')
      fireEvent.click(screen.getByRole('button', { name: '添加' }))
      await settle()
      const refused = { kind: 'refused', notice: notice('被拒了。') } as const
      const writes =
        item === 'target'
          ? { target: refused }
          : { target: { kind: 'succeeded' } as const, credential: refused }
      act(() =>
        fake.show(
          withCreating({ kind: 'done', text: '已新建 docs。' }, endpoint('docs', rowsOf())),
        ),
      )
      await settle()
      if (item === 'credential') {
        act(() =>
          fake.show(
            withCreating(
              { kind: 'done', text: '已新建 docs。' },
              endpoint('docs', rowsOf({ target: { kind: 'succeeded' } })),
            ),
          ),
        )
        await settle()
      }
      act(() =>
        fake.show(
          withCreating({ kind: 'done', text: '已新建 docs。' }, endpoint('docs', rowsOf(writes))),
        ),
      )
      await settle()
      expect(
        screen.getByText(`docs 已经加上，${label}没设上：被拒了。 在下面 docs 那一段里改。`),
      ).toBeTruthy()
    },
  )

  it('C1d the name and the address are matched whole', () => {
    for (const name of ['docs-', '-docs', 'do--cs', 'docs!', 'docs x'])
      expect(problemsOf({ ...ENTERED, name }, nobody).name).toBeDefined()
    expect(problemsOf({ ...ENTERED, name: 'my-docs-2' }, nobody)).toEqual({})
    for (const target of [
      'xhttps://docs.example/mcp',
      'http://127.0.0.1.evil.example/mcp',
      'http://localhost:80x/mcp',
      'http://127.0.0.1/a b',
    ])
      expect(problemsOf({ ...ENTERED, target }, nobody).target).toBeDefined()
    expect(problemsOf({ ...ENTERED, target: 'http://127.0.0.1' }, nobody)).toEqual({})
  })
})

describe('the form, third round of the mutation', () => {
  it('F9 OAuth with an application registered: the client identifier as a value and its secret as a secret, after the address', async () => {
    const fake = fakeGovernance(readOf())
    render(<McpCreateForm governance={fake.governance} tenant={TENANT} status={null} />)
    await settle()
    fill('名字（必填）', 'gh')
    fill('地址（必填）', 'https://gh.example/mcp')
    fireEvent.click(screen.getByRole('button', { name: 'OAuth 登录' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '对方要求先登记一个应用？（例如 GitHub）' }))
    await settle()
    fill('客户端标识', ' Iv1.abc ')
    fill('客户端密钥（对方给了才填）', 'cs-very-secret')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await settle()
    expect(fake.calls).toContain('create gh name=gh,transport=streamable-http,auth=oauth')
    const rows = (writes: Partial<Record<string, McpRow['write']>>) => [
      otherRow('gh/target', 'ordinary', 'target', writes['target']),
      otherRow('gh/client-id', 'ordinary', 'client-id', writes['client-id']),
      otherRow('gh/client-secret', 'secret', 'client-secret', writes['client-secret']),
    ]
    const done = { kind: 'done', text: '已新建 gh。' } as const
    const ok = { kind: 'succeeded' } as const
    act(() => fake.show(withCreating(done, endpoint('gh', rows({})))))
    await settle()
    act(() => fake.show(withCreating(done, endpoint('gh', rows({ target: ok })))))
    await settle()
    act(() => fake.show(withCreating(done, endpoint('gh', rows({ target: ok, 'client-id': ok })))))
    await settle()
    expect(fake.calls).toContain('setValue gh/target string:https://gh.example/mcp')
    expect(fake.calls).toContain('setValue gh/client-id string:Iv1.abc')
    expect(fake.calls).toContain('setSecret gh/client-secret')
    expect(fake.calls.join('\n')).not.toContain('cs-very-secret')
  })
})

it('C2b what was typed under another auth is not written: a client secret left from OAuth is not written for a key, nor a key for OAuth', () => {
  expect(
    placingsOf({ ...ENTERED, auth: 'static', key: 'k', clientId: 'c', clientSecret: 's' }).map(
      p => p.item,
    ),
  ).toEqual(['target', 'credential'])
  expect(
    placingsOf({ ...ENTERED, auth: 'oauth', key: 'k', clientSecret: 's' }).map(p => p.item),
  ).toEqual(['target', 'client-secret'])
  expect(
    placingsOf({ ...ENTERED, auth: 'none', key: 'k', clientId: 'c', clientSecret: 's' }).map(
      p => p.item,
    ),
  ).toEqual(['target'])
})
