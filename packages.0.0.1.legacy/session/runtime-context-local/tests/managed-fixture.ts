import { Context } from '@deepseek-ai/cordis'
import { AssemblyLifetimeService } from '@omne-harness-lite/assembly-lifecycle/cordis'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import { SessionLogBackingService } from '@omne-harness-lite/session-log/cordis'
import { SessionAccessService } from '@omne-harness-lite/session-tenancy/cordis'
import { ClockService } from '@omne-harness-lite/offer-expiry/cordis'
import { instantFromRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import { StorageService } from '@omne-harness-lite/storage/cordis'
import { createRuntimeContextLocal } from '../src/cordis.ts'
import { at, host } from './fixture.ts'

export async function managedHost(
  options: {
    beforeStorageRead?: () => Promise<void>
    release?: () => Promise<void>
    binding?: ReturnType<typeof createRuntimeContextLocal>
    now?: Clock['now']
  } = {},
) {
  const h = await host(),
    ctx = new Context(),
    binding = options.binding ?? createRuntimeContextLocal()
  h.owner.closeAdmission()
  await h.owner.drain()
  const lifetime = createAssemblyLifetime(['context'], binding.closeAdmission)
  if (!lifetime.tryClaim()) throw new Error('fixture lifetime not claimed')
  const port = lifetime.port('context')
  const time = instantFromRfc3339(at)
  if (!('ok' in time)) throw new Error('fixture clock invalid')
  const instant = time.ok
  let borrows = 0,
    releases = 0
  class Log extends SessionLogBackingService {
    ownerGeneration = 'original'
    borrow = () => {
      borrows++
      return {
        log: h.log,
        release: async () => {
          await options.release?.()
          releases++
        },
      }
    }
  }
  class Sql extends StorageService {
    read: StorageService['read'] = async fn => {
      await options.beforeStorageRead?.()
      return h.storage.read(fn)
    }
    write = h.storage.write.bind(h.storage)
  }
  class Lifetime extends AssemblyLifetimeService {
    isCurrent = port.isCurrent
    register = port.register
    retainClose = port.retainClose
  }
  class Access extends SessionAccessService {
    authorize = h.auth.operations.authorize
  }
  class Time extends ClockService {
    now = options.now ?? (async () => instant)
  }
  const dependencies = await ctx.plugin({
    name: 'managed-context-fixture',
    apply(inner: Context) {
      new Log(inner)
      new Sql(inner)
      new Lifetime(inner)
      new Access(inner)
      new Time(inner)
    },
  })
  const fiber = await Promise.resolve(ctx.plugin(binding.plugin, {})).catch(async error => {
    // A rejected mount has not registered owned work. Do not stop a factory owned elsewhere.
    await dependencies.dispose()
    await ctx.fiber.dispose()
    await h.close()
    throw error
  })
  return {
    h,
    ctx,
    binding,
    lifetime,
    fiber,
    get borrows() {
      return borrows
    },
    get releases() {
      return releases
    },
    async close() {
      await lifetime.close()
      await fiber.dispose()
      await dependencies.dispose()
      await ctx.fiber.dispose()
      await h.close()
    },
  }
}
