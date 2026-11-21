import { readFileSync, readdirSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  RequestContextService,
  RequestContextTrustService,
  requestContextKey,
  requestContextTrustKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { createScriptedRequestContextTrust } from '@omne-harness/request-context-cordis-contract/testing'
import type { RequestContextTrust } from '@omne-harness/request-context-cordis-contract'

const src = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
function sourceFiles(dir = ''): string[] {
  return readdirSync(new URL(`../src/${dir}`, import.meta.url), { withFileTypes: true }).flatMap(
    entry =>
      entry.isDirectory()
        ? sourceFiles(`${dir}${entry.name}/`)
        : entry.name.endsWith('.ts')
          ? [`${dir}${entry.name}`]
          : [],
  )
}

class ProbeTrust extends RequestContextTrustService<string> {
  readonly scripted: RequestContextTrust<string> = createScriptedRequestContextTrust<string>({
    keys: [],
    grants: [],
  })
  get principalBinding() {
    return this.scripted.principalBinding
  }
  get registrationAuthority() {
    return this.scripted.registrationAuthority
  }
}

describe('request context trust service', () => {
  it('derives its key from the one static field', () => {
    expect(RequestContextTrustService.provide).toBe('requestContextTrust')
    expect(requestContextTrustKey).toBe(RequestContextTrustService.provide)
  })
  it('a subclass provides the key and a consumer injects it by the derived key', async () => {
    const ctx = new Context()
    const seen: unknown[] = []
    ctx.plugin(ProbeTrust)
    await ctx.plugin({
      inject: [requestContextTrustKey],
      apply(c) {
        seen.push(c.requestContextTrust)
      },
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBeInstanceOf(ProbeTrust)
  })
  it('a consumer stays unapplied while the trust key is absent and runs after it appears', async () => {
    const ctx = new Context()
    let applied = 0
    await ctx.plugin({
      inject: [requestContextTrustKey],
      apply() {
        applied++
      },
    })
    expect(applied).toBe(0)
    const provider = await ctx.plugin(ProbeTrust)
    expect(applied).toBe(1)
    await provider.dispose()
    expect(ctx.get(requestContextTrustKey)).toBeUndefined()
  })
  it('the trust object is not the requestContext service and does not alter its key', () => {
    expect(requestContextKey).toBe('requestContext')
    expect(RequestContextService.provide).toBe('requestContext')
  })
  it('the key literal is written once in the source', () => {
    const files = sourceFiles()
    const hits = files.flatMap(file =>
      [...src(file).matchAll(/['"]requestContextTrust['"]/g)].map(() => file),
    )
    expect(hits).toEqual(['cordis.ts'])
  })
})
