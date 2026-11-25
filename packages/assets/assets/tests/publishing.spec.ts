import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  createTenantPublishing,
  publishStanding,
  readBodyText,
  type Candidate,
  type LayerInput,
  type PublishStanding,
  type BodyContract,
  type CapabilityId,
  type JsonValue,
  type PackageReader,
  type TenantActing,
  type TenantPublisher,
  type TenantPublishOutcome,
  type TenantPublishRequest,
} from '@omne-harness/assets'

const display = { title: 'Test', summary: 'A category that exists only in these tests.' }

function contract(category: string, directory: boolean): BodyContract {
  return {
    category,
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    ...(directory
      ? {
          layout: {
            namespace: category,
            limits: { files: 1, fileBytes: 1, totalBytes: 1 },
            inspect: async () => ({ ok: { kind: 'object', entries: [] } }),
          },
        }
      : {}),
  }
}

function id(category: string, name: string): CapabilityId {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('identity')
  return made.id
}

function body(): JsonValue {
  const read = readBodyText('null', {
    maxBytes: 16,
    maxDepth: 1,
    maxItems: 1,
    maxMembers: 1,
    maxStringLength: 1,
    maxNumberLength: 1,
  })
  if (read.kind !== 'ok') throw new Error('body')
  return read.value
}

const reader: PackageReader = {
  manifest: async () => ({ ok: { entries: [] } }),
  open: async () => ({ failure: 'entry-not-found' }),
}

type Principal = Readonly<{ tenant: string }>

function setup(
  options: {
    admit?: TenantActing<Principal>['admit']
    publisherOf?: (tenant: string) => Promise<TenantPublisher | undefined>
    answer?: TenantPublishOutcome
    /** A second contribution of `note`: it is a conflict and gives no contract. */
    rival?: true
    standing?: (tenant: string, capability: CapabilityId) => Promise<PublishStanding>
  } = {},
) {
  const categories = createCategoryPoint()
  categories.contribute({ contract: contract('note', false), display, point: 'note.items' })
  if (options.rival === true)
    categories.contribute({ contract: contract('note', false), display, point: 'note.rival' })
  categories.contribute({ contract: contract('bundle', true), display, point: 'bundle.items' })
  categories.contribute({
    contract: contract('tool', false),
    display,
    generalCreation: 'closed',
    point: 'tool.items',
  })
  categories.contribute({
    contract: contract('closed-bundle', true),
    display,
    generalCreation: 'closed',
    point: 'closed-bundle.items',
  })
  const asked: string[] = []
  const published: string[] = []
  const opened: string[] = []
  const answer: TenantPublishOutcome = options.answer ?? {
    kind: 'published',
    version: 'sha256:1',
    holdingRef: 'note/a',
    changed: true,
  }
  const publishing = createTenantPublishing<Principal>({
    acting: {
      admit:
        options.admit ??
        (async input => {
          asked.push(`${input.principal.tenant}->${input.tenant}`)
          return input.principal.tenant === input.tenant ? 'admitted' : 'denied'
        }),
    },
    categories,
    ...(options.standing === undefined ? {} : { standing: options.standing }),
    async publisherOf(tenant) {
      opened.push(tenant)
      if (options.publisherOf !== undefined) return options.publisherOf(tenant)
      return {
        async publish(input) {
          published.push(`${tenant}:${input.capability.category}/${input.capability.name}`)
          return answer
        },
      }
    },
  })
  return { publishing, asked, published, opened }
}

function request(overrides: Partial<TenantPublishRequest<Principal>> = {}) {
  return {
    operationId: 'publish-1',
    tenant: 'alice',
    principal: { tenant: 'alice' },
    capability: id('note', 'a'),
    content: { kind: 'data', body: body() },
    ...overrides,
  } as const satisfies TenantPublishRequest<Principal>
}

describe('the publish service: the cells of table three', () => {
  it('身份答拒绝：denied，不调本机资产', async () => {
    const { publishing, published } = setup({ admit: async () => 'denied' })
    expect(await publishing.publish(request())).toEqual({ kind: 'denied' })
    expect(published).toEqual([])
  })

  it('身份答不了或抛出：unavailable，不调本机资产', async () => {
    for (const admit of [
      async () => 'unavailable' as const,
      async () => {
        throw new Error('identity is down')
      },
    ]) {
      const { publishing, published } = setup({ admit })
      expect(await publishing.publish(request())).toEqual({ kind: 'unavailable' })
      expect(published).toEqual([])
    }
  })

  it('为别的租户发布：拒绝，授权每次调用问一次', async () => {
    const { publishing, asked, published } = setup()
    expect(await publishing.publish(request({ tenant: 'bob' }))).toEqual({ kind: 'denied' })
    await publishing.publish(request())
    await publishing.publish(request())
    expect(asked).toEqual(['alice->bob', 'alice->alice', 'alice->alice'])
    expect(published).toEqual(['alice:note/a', 'alice:note/a'])
  })

  it('类别没登记：unknown-category，不调本机资产', async () => {
    const { publishing, published } = setup()
    expect(await publishing.publish(request({ capability: id('nobody', 'a') }))).toEqual({
      kind: 'unknown-category',
    })
    expect(published).toEqual([])
  })

  it('类别有两份贡献在抢：unavailable，不答没登记，不调本机资产', async () => {
    const { publishing, published } = setup({ rival: true })
    expect(await publishing.publish(request())).toEqual({ kind: 'unavailable' })
    expect(published).toEqual([])
  })

  it('内容的种类与类别不合：invalid，带原因', async () => {
    const { publishing, published } = setup()
    expect(
      await publishing.publish(request({ content: { kind: 'directory', from: reader } })),
    ).toEqual({ kind: 'invalid', reason: 'not-a-directory-category' })
    expect(await publishing.publish(request({ capability: id('bundle', 'a') }))).toEqual({
      kind: 'invalid',
      reason: 'a-directory-category',
    })
    expect(published).toEqual([])
  })

  it('类别声明了不经通用入口新建：invalid、creation-closed，不论内容是哪一种，不调本机资产', async () => {
    const { publishing, published } = setup()
    expect(await publishing.publish(request({ capability: id('tool', 'a') }))).toEqual({
      kind: 'invalid',
      reason: 'creation-closed',
    })
    expect(
      await publishing.publish(
        request({
          capability: id('closed-bundle', 'a'),
          content: { kind: 'directory', from: reader },
        }),
      ),
    ).toEqual({ kind: 'invalid', reason: 'creation-closed' })
    expect(published).toEqual([])
  })

  it('这个租户的本机资产取不到：unavailable', async () => {
    for (const publisherOf of [
      async () => undefined,
      async () => {
        throw new Error('the tenant set does not open')
      },
    ]) {
      const { publishing } = setup({ publisherOf })
      expect(await publishing.publish(request())).toEqual({ kind: 'unavailable' })
    }
  })

  it('本机资产抛出：unknown，带操作标识，之后用同一标识认回', async () => {
    const { publishing } = setup({
      publisherOf: async () => ({
        publish: async () => {
          throw new Error('the commit reply was lost')
        },
      }),
    })
    expect(await publishing.publish(request())).toEqual({
      kind: 'unknown',
      operationId: 'publish-1',
    })
  })

  it.each([
    [{ kind: 'published', version: 'sha256:1', holdingRef: 'note/a', changed: false }],
    [{ kind: 'conflict' }],
    [{ kind: 'operation-conflict' }],
    [{ kind: 'invalid', reason: 'invalid-input' }],
    [{ kind: 'unknown', operationId: 'publish-1' }],
  ] as const)('本机资产的结局原样交出：%o', async answer => {
    const { publishing } = setup({ answer })
    expect(await publishing.publish(request())).toEqual(answer)
  })

  it('目录型交给本机资产的是请求里的读口与能力身份', async () => {
    let given: unknown
    const { publishing } = setup({
      publisherOf: async () => ({
        async publish(input) {
          given = input
          return { kind: 'published', version: 'sha256:2', holdingRef: 'bundle/a', changed: true }
        },
      }),
    })
    const content = { kind: 'directory', from: reader } as const
    expect(await publishing.publish(request({ capability: id('bundle', 'a'), content }))).toEqual({
      kind: 'published',
      version: 'sha256:2',
      holdingRef: 'bundle/a',
      changed: true,
    })
    expect(given).toEqual({ operationId: 'publish-1', capability: id('bundle', 'a'), content })
  })
})

const IRREPLACEABLE: PublishStanding = { kind: 'irreplaceable', layer: 'official' }

describe('the publish service: a name held where it cannot be replaced (table 5.1)', () => {
  it('P3、P7：更宽的层上有不可替换的同名条目，拒绝，原因以 irreplaceable-official 开头并写明是哪一份，不开本机资产', async () => {
    const { publishing, published, opened } = setup({ standing: async () => IRREPLACEABLE })
    const outcome = await publishing.publish(request())
    expect(outcome).toEqual({
      kind: 'invalid',
      reason:
        'irreplaceable-official: note a is held on the official layer and cannot be replaced; nothing was published',
    })
    expect(opened).toEqual([])
    expect(published).toEqual([])
  })

  it('P4、P8：更宽的层读不出，答不可用，不当作没有同名，不开本机资产', async () => {
    for (const standing of [
      async () => ({ kind: 'unavailable' }) as const,
      async () => {
        throw new Error('the registry cannot be read')
      },
    ]) {
      const { publishing, opened } = setup({ standing })
      expect(await publishing.publish(request())).toEqual({ kind: 'unavailable' })
      expect(opened).toEqual([])
    }
  })

  it('P1、P2、P5、P6：没有不可替换的同名条目，照常发布', async () => {
    const { publishing, published } = setup({ standing: async () => ({ kind: 'free' }) })
    expect(await publishing.publish(request())).toMatchObject({ kind: 'published' })
    expect(published).toEqual(['alice:note/a'])
  })

  it('同名判断问的是这次发布的租户与能力，在身份与创建模式之后', async () => {
    const seen: string[] = []
    const { publishing } = setup({
      standing: async (tenant, capability) => {
        seen.push(`${tenant}:${capability.category}/${capability.name}`)
        return { kind: 'free' }
      },
    })
    await publishing.publish(request({ tenant: 'bob' }))
    await publishing.publish(request({ capability: id('tool', 'a') }))
    await publishing.publish(request())
    expect(seen).toEqual(['alice:note/a'])
  })
})

const candidate = (asset: string, locks: Partial<Candidate> = {}): Candidate => ({
  asset,
  version: 'v1',
  disabled: false,
  immutable: false,
  replaceLocked: false,
  ...locks,
})

const read = (layer: string, ...candidates: Candidate[]): LayerInput => ({
  layer,
  state: 'read',
  candidates,
})

describe('how a new holding on a layer stands against the wider layers', () => {
  it('更宽的层上站得住的同名条目不可替换或带替换锁：irreplaceable，写明是哪一层', () => {
    for (const locks of [{ immutable: true }, { replaceLocked: true }]) {
      expect(
        publishStanding([read('official', candidate('o', locks)), read('tenant')], 'tenant'),
      ).toEqual({ kind: 'irreplaceable', layer: 'official' })
    }
  })

  it('中间一层有一份禁用的同名副本，挡住新持有的仍是更宽的层上不可替换的那一份', () => {
    expect(
      publishStanding(
        [
          read('official', candidate('o', { immutable: true })),
          read('organization', candidate('g', { disabled: true })),
          read('tenant'),
        ],
        'tenant',
      ),
    ).toEqual({ kind: 'irreplaceable', layer: 'official' })
  })

  it('这一层已有在持的同名持有（P7）照样被挡', () => {
    expect(
      publishStanding(
        [read('official', candidate('o', { immutable: true })), read('tenant', candidate('t'))],
        'tenant',
      ),
    ).toEqual({ kind: 'irreplaceable', layer: 'official' })
  })

  it('更宽的层没有同名、同名可替换、或那一份已禁用：free', () => {
    for (const official of [
      read('official'),
      read('official', candidate('o')),
      read('official', candidate('o', { immutable: true, disabled: true })),
      { layer: 'official', state: 'not-applicable' } as const,
    ]) {
      expect(publishStanding([official, read('tenant', candidate('t'))], 'tenant')).toEqual({
        kind: 'free',
      })
    }
  })

  it('更宽的层读不出：unavailable；只有更具体的层读不出不影响', () => {
    expect(
      publishStanding([{ layer: 'official', state: 'unavailable' }, read('tenant')], 'tenant'),
    ).toEqual({ kind: 'unavailable' })
    expect(
      publishStanding(
        [read('official'), read('tenant'), { layer: 'workspace', state: 'unavailable' }],
        'tenant',
      ),
    ).toEqual({ kind: 'free' })
  })

  it('最宽的一层自己没有更宽的层：free', () => {
    expect(
      publishStanding([read('official', candidate('o', { immutable: true }))], 'official'),
    ).toEqual({
      kind: 'free',
    })
  })
})

describe('the display of a category says how to make one', () => {
  it('creation 可选；给了就随列出交出，空文本抛装配错误', () => {
    const categories = createCategoryPoint()
    categories.contribute({
      contract: contract('bundle', true),
      display: { ...display, creation: 'A directory with a README at its root.' },
      point: 'bundle.items',
    })
    categories.contribute({ contract: contract('note', false), display, point: 'note.items' })
    expect(categories.list()).toEqual([
      {
        category: 'bundle',
        display: { ...display, creation: 'A directory with a README at its root.' },
        creation: 'directory',
        point: 'bundle.items',
      },
      { category: 'note', display, creation: 'data', point: 'note.items' },
    ])
    expect(() =>
      categories.contribute({
        contract: contract('other', false),
        display: { ...display, creation: '' },
        point: 'other.items',
      }),
    ).toThrow('category display is incomplete')
  })
})
