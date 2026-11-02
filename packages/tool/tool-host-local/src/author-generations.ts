import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { DurableEvidence } from '@omne-harness/tool-contract'
import type {
  ToolAuthority,
  ToolBindingKey,
  ToolBindingRegistry,
  ToolBindingScope,
  ToolImplementationModule,
  ToolLoader,
} from '@omne-harness/tool-contract/provider'
import { sameBindingKey, sameShape, sameSourceLayer } from '@omne-harness/tool-contract/provider'
import type {
  ToolGenerations,
  ToolLoadFailure,
  ToolResidencyReader,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  createToolAuthorPlugin,
  ToolAuthorContributionError,
  type ToolAuthorConfiguration,
  type ToolAuthorContext,
} from './contribute-tool.ts'
import type { LocalToolContributionVerifier } from './bindings.ts'

export interface LocalToolAuthorSource<P, E, B extends ContentBlock> {
  /** Verifies the asset implementation reference and package digest before importing that module. */
  resolve(authority: ToolAuthority): Promise<
    Outcome<
      Readonly<{
        module: ToolImplementationModule<E, B>
        config: ToolAuthorConfiguration<E, B>
        context: ToolAuthorContext<P>
      }>,
      ToolLoadFailure
    >
  >
}
export type LocalToolGenerationsInput<P, E, B extends ContentBlock> = Readonly<{
  host: Context
  registry: ToolBindingRegistry<P, E, B>
  verifier: LocalToolContributionVerifier<P>
  residency: ToolResidencyReader
  source: LocalToolAuthorSource<P, E, B>
  loaderFor(authority: ToolAuthority): ToolLoader<P, E, B>
  recordRejection(authority: ToolAuthority, reason: string): Promise<DurableEvidence>
}>

export function createLocalToolGenerations<P, E, B extends ContentBlock>(
  input: LocalToolGenerationsInput<P, E, B>,
): ToolGenerations<P, E, B> {
  const handles = new Map<string, Awaited<ReturnType<Context['plugin']>>>()
  const flights = new Map<string, ReturnType<ToolGenerations<P, E, B>['ensureLoaded']>>()
  const keyOf = (key: ToolBindingKey) => canonicalDigest(key)
  const registryFailure = () =>
    fail({ kind: 'unavailable' as const, diagnostic: 'binding registry is unreadable' })
  const check = (authority: ToolAuthority, access: ToolBindingScope<P>) => {
    const verified = input.verifier.verify(authority)
    if ('failure' in verified) return verified
    if ('scope' in access) return verified
    const admission = input.verifier.admits(access, verified.ok.layer)
    return 'failure' in admission ? admission : verified
  }
  const service: ToolGenerations<P, E, B> = {
    loaderFor: input.loaderFor,
    async ensureLoaded(request) {
      const verified = check(request.authority, request.access)
      if ('failure' in verified) return verified
      const authority = verified.ok
      const key = { layer: authority.layer, asset: authority.asset }
      const snapshot = input.registry.snapshot({ scope: 'system' })
      if ('failure' in snapshot) return registryFailure()
      const current = snapshot.ok.find(row => sameBindingKey(row.key, key))
      if (current?.state === 'draining') return fail({ kind: 'draining' })
      const id = keyOf(key)
      const existing = flights.get(id)
      if (existing !== undefined) return existing
      const flight: ReturnType<typeof service.ensureLoaded> = Promise.resolve().then(async () => {
        try {
          const resolved = await input.source.resolve(authority)
          if ('failure' in resolved) return resolved
          if (!sameBindingKey(resolved.ok.config.authority, key))
            return fail({ kind: 'invalid', reason: 'module source changed the authority' })
          if (current !== undefined)
            return current.digest === resolved.ok.module.executor.digest
              ? succeed({ key, state: 'recognized' })
              : fail({ kind: 'conflict' })
          const fiber = input.host.plugin(
            createToolAuthorPlugin(resolved.ok.module, resolved.ok.context),
            resolved.ok.config,
          )
          try {
            await fiber
          } catch (error) {
            await fiber.dispose()
            if (error instanceof ToolAuthorContributionError) {
              const { failure } = error
              if (failure.kind === 'denied') return fail({ kind: 'denied' })
              if (failure.kind === 'conflict') return fail({ kind: 'conflict' })
              if (failure.kind === 'invalid')
                return fail({
                  kind: 'rejected',
                  evidence: await input.recordRejection(authority, failure.reason),
                })
            }
            return fail({ kind: 'unavailable', diagnostic: 'author fiber failed to load' })
          }
          if (fiber.state !== 2) {
            await fiber.dispose()
            return fail({ kind: 'unavailable', diagnostic: 'author fiber did not become active' })
          }
          const after = input.registry.snapshot({ scope: 'system' })
          if ('failure' in after) {
            await fiber.dispose()
            return registryFailure()
          }
          if (!after.ok.some(row => sameBindingKey(row.key, key))) {
            await fiber.dispose()
            return fail({
              kind: 'unavailable',
              diagnostic: 'author fiber published no contribution',
            })
          }
          handles.set(id, fiber)
          return succeed({ key, state: 'loaded' })
        } catch {
          return fail({ kind: 'unavailable', diagnostic: 'author source or fiber failed' })
        }
      })
      flights.set(id, flight)
      try {
        return await flight
      } finally {
        flights.delete(id)
      }
    },
    async unload({ key }) {
      const before = input.registry.snapshot({ scope: 'system' })
      if ('failure' in before) return registryFailure()
      if (!before.ok.some(row => sameBindingKey(row.key, key))) return fail({ kind: 'unknown-key' })
      input.registry.reopen(key)
      const closed = input.registry.close(key)
      if ('failure' in closed) return closed
      const retain = () => {
        input.registry.reopen(key)
        return succeed({ state: 'retained' as const })
      }
      const cursors = new Set<string>()
      let after: string | null = null
      do {
        let page
        try {
          page = await input.residency.referencing({ scope: 'system', key, after })
        } catch {
          return retain()
        }
        if ('failure' in page) return retain()
        const snapshot = input.registry.snapshot({ scope: 'system' })
        if ('failure' in snapshot) return retain()
        for (const holder of page.ok.items) {
          if (!tenantCodec.encode(holder.tenant).ok) return retain()
          const serving = snapshot.ok.some(
            row =>
              !sameBindingKey(row.key, key) &&
              row.state === 'live' &&
              sameShape(row.shape, holder.shape) &&
              (row.key.layer.kind === 'official' ||
                (row.key.layer.kind === 'organization' &&
                  row.key.layer.organization.text === holder.tenant.organization.text) ||
                sameSourceLayer(row.key.layer, { kind: 'tenant', tenant: holder.tenant })),
          )
          if (!serving) return retain()
        }
        after = page.ok.next
        if (after !== null) {
          if (cursors.has(after)) return retain()
          cursors.add(after)
        }
      } while (after !== null)
      const drain = input.registry.drain(key)
      if ('failure' in drain) return drain
      if (drain.ok.pins !== '0') return succeed({ state: 'draining' })
      const handle =
        handles.get(keyOf(key)) ??
        [...input.host.registry.values()]
          .flatMap(runtime => [...runtime.fibers])
          .find(
            fiber =>
              String(fiber.uid) === before.ok.find(row => sameBindingKey(row.key, key))?.fiber &&
              fiber.parent === input.host,
          )
      if (handle === undefined) return retain()
      try {
        await handle.dispose()
      } catch {
        return fail({ kind: 'unavailable', diagnostic: 'author disposal is incomplete' })
      }
      handles.delete(keyOf(key))
      return succeed({ state: 'released' })
    },
    async sweep() {
      return fail({
        kind: 'unavailable',
        diagnostic: 'complete retained-authority directory is unavailable',
      })
    },
  }
  return service
}
