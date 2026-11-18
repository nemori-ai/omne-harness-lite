import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  createTenantPublishing,
  readBodyText,
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
  } = {},
) {
  const categories = createCategoryPoint()
  categories.contribute({ contract: contract('note', false), display })
  categories.contribute({ contract: contract('bundle', true), display })
  categories.contribute({ contract: contract('tool', false), display, generalCreation: 'closed' })
  categories.contribute({
    contract: contract('closed-bundle', true),
    display,
    generalCreation: 'closed',
  })
  const asked: string[] = []
  const published: string[] = []
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
    publisherOf:
      options.publisherOf ??
      (async tenant => ({
        async publish(input) {
          published.push(`${tenant}:${input.capability.category}/${input.capability.name}`)
          return answer
        },
      })),
  })
  return { publishing, asked, published }
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
    [{ kind: 'removed' }],
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

describe('the display of a category says how to make one', () => {
  it('creation 可选；给了就随列出交出，空文本抛装配错误', () => {
    const categories = createCategoryPoint()
    categories.contribute({
      contract: contract('bundle', true),
      display: { ...display, creation: 'A directory with a README at its root.' },
    })
    categories.contribute({ contract: contract('note', false), display })
    expect(categories.list()).toEqual([
      {
        category: 'bundle',
        display: { ...display, creation: 'A directory with a README at its root.' },
        creation: 'directory',
      },
      { category: 'note', display, creation: 'data' },
    ])
    expect(() =>
      categories.contribute({
        contract: contract('other', false),
        display: { ...display, creation: '' },
      }),
    ).toThrow('category display is incomplete')
  })
})
