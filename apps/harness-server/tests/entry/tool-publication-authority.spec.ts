// 发布核验（`toolPublicationAuthority` 入口对象）：只有执行与句柄一致、且本运行的记录仓见证过这次原调用的
// 执行与来源证据时才放行；其余一律 denied。Shell、Files 的单次调用不发布实例，组合用例碰不到它，这里单独守。
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import { publicationCheck } from '../../src/entry/tool-runtime-objects.ts'
import { toolRuntimeHolder } from '../../src/rows/tool-runtime/holder.ts'
import { fixtureTenant } from './support.ts'

const TENANT = fixtureTenant('a')
const execution = {
  tenant: TENANT,
  call: 'call-1',
  instance: 'inst-1',
  generation: 'gen-1',
}
const handle = { instance: 'inst-1', generation: 'gen-1' }
const source = { kind: 'invocation', ref: 'source-1' }

function world(witness: boolean) {
  const ctx = { root: {} } as unknown as Context
  if (witness)
    toolRuntimeHolder(ctx).witnessed.set(canonicalDigest([TENANT, 'call-1']), {
      execution: canonicalDigest(execution),
      sources: new Set([canonicalDigest(source)]),
    })
  return publicationCheck(ctx)
}

type Request = Parameters<ReturnType<typeof publicationCheck>>[0]
const request = (overrides: Partial<{ execution: unknown; handle: unknown; authority: unknown }>) =>
  ({
    publication: [overrides.execution ?? execution, overrides.handle ?? handle],
    authority: overrides.authority ?? source,
  }) as unknown as Request

describe('release Tool publication authority', () => {
  it('allows a publication whose execution and source the run witnessed', async () => {
    expect(await world(true)(request({}))).toEqual({ ok: undefined })
  })

  it('denies a publication the run never witnessed', async () => {
    expect(await world(false)(request({}))).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('denies another source, another execution, or a handle of another instance', async () => {
    const check = world(true)
    expect(await check(request({ authority: { kind: 'invocation', ref: 'other' } }))).toMatchObject(
      { failure: { kind: 'denied' } },
    )
    expect(
      await check(request({ execution: { ...execution, generation: 'gen-2' } })),
    ).toMatchObject({ failure: { kind: 'denied' } })
    expect(await check(request({ handle: { ...handle, instance: 'inst-2' } }))).toMatchObject({
      failure: { kind: 'denied' },
    })
  })

  it('denies a publication without a valid tenant', async () => {
    expect(
      await world(true)(request({ execution: { ...execution, tenant: { bogus: true } } })),
    ).toMatchObject({ failure: { kind: 'denied' } })
  })
})
