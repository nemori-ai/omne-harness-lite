import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolAccessGuard } from '@omne-harness/tool'
import type { ToolInstanceId } from '@omne-harness/tool-contract'
import type { ToolDirectory } from '@omne-harness/tool-contract/provider'
import {
  ToolInstancesService,
  type ToolPublicationAuthority,
  type ToolRegistrationInput,
  type ToolRegistration,
  type ToolRegistrationFailure,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  createLocalToolInstanceDirectory,
  instanceCallKey,
  qualifyInstanceAccess,
} from './instance-directory.ts'

export function publishRuntimeInstances(ctx: Context, access: ToolAccessGuard<unknown>): void {
  const authority: ToolPublicationAuthority<unknown> = ctx.toolPublicationAuthority
  const directories = new Map<
    ToolInstanceId,
    ReturnType<typeof createLocalToolInstanceDirectory<unknown>>
  >()
  const owners = new Map<string, ToolInstanceId>()
  let retired = false
  class Instances extends ToolInstancesService<unknown> {
    override connect: ToolDirectory<unknown>['connect'] = async request => {
      const allowed = await qualifyInstanceAccess(access, request, 'lookup')
      if ('failure' in allowed) return allowed
      if (retired)
        return fail({
          kind: 'unavailable',
          dependency: 'toolInstances',
          diagnostic: 'The directory is retired.',
        })
      const key = instanceCallKey(request)
      if ('failure' in key) return key
      const instance = owners.get(key.ok)
      const route = instance === undefined ? undefined : directories.get(instance)
      return route === undefined
        ? succeed({ kind: 'no-live-route' })
        : route.directory.connect(request)
    }
    override async register(
      request: ToolRegistrationInput<unknown>,
    ): Promise<Outcome<ToolRegistration, ToolRegistrationFailure>> {
      let result: Promise<Outcome<ToolRegistration, ToolRegistrationFailure>> = Promise.resolve(
        fail({ kind: 'unavailable', diagnostic: 'No live publication effect.' }),
      )
      this.ctx.effect(() => {
        const verified = authority.check(request)
        if ('failure' in verified) {
          result = Promise.resolve(verified)
          return () => {}
        }
        if (retired) return () => {}
        const [execution, handle] = request.publication
        const key = instanceCallKey(execution)
        if ('failure' in key) {
          result = Promise.resolve(fail({ kind: 'denied' }))
          return () => {}
        }
        const current = owners.get(key.ok)
        if (current !== undefined && current !== execution.instance) {
          result = Promise.resolve(fail({ kind: 'conflict' }))
          return () => {}
        }
        let directory = directories.get(execution.instance)
        if (directory === undefined) {
          directory = createLocalToolInstanceDirectory({ access, instance: execution.instance })
          directories.set(execution.instance, directory)
        }
        const routes = directory
        let live = true
        const published = routes.publish(execution, handle)
        result = published.then(async answer => {
          if ('failure' in answer) return fail({ kind: 'invalid', reason: answer.failure.kind })
          const release = async () => {
            const removed = await routes.withdraw(answer.ok)
            if ('ok' in removed && removed.ok.removed && owners.get(key.ok) === execution.instance)
              owners.delete(key.ok)
            return 'ok' in removed ? removed.ok : { removed: false }
          }
          if (!live || retired) {
            await release()
            return fail({ kind: 'stale-publication' })
          }
          owners.set(key.ok, execution.instance)
          return succeed({ receipt: answer.ok, release })
        })
        return async () => {
          live = false
          const registration = await result
          if ('ok' in registration) await registration.ok.release()
        }
      }, 'toolInstances.register')
      return result
    }
  }
  new Instances(ctx, authority)
  ctx.effect(() => () => {
    retired = true
    owners.clear()
    directories.clear()
  })
}
