import { Context } from '@deepseek-ai/cordis'
import { createRunnerImplementationRegistry } from '@omne-harness-lite/loop-extension-runner-local'
import { LoopExtensionImplementationsService } from '@omne-harness-lite/loop-extension-runner/cordis'
import type { RunnerImplementations } from '@omne-harness-lite/loop-extension-runner'
import { SessionAccessService } from '@omne-harness-lite/session-tenancy/cordis'
import { SessionLogBackingService } from '@omne-harness-lite/session-log/cordis'
import {
  ToolActionHistoryService,
  ToolAdmissionPassSourceService,
} from '@omne-harness-lite/tool-admission/cordis'
import type {
  ToolActionHistoryOperations,
  ToolAdmissionPassSourceOperations,
} from '@omne-harness-lite/tool-admission'
import type { SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import { fixture } from './provider-fixture.ts'

/** Controlled business facts, actual Cordis fibers and the real contribution registry. */
export async function cordisFixture() {
  const f = fixture()
  await f.provider.close()
  f.borrow.mockClear()
  f.release.mockClear()
  const ctx = new Context(),
    registry = createRunnerImplementationRegistry()
  class Access extends SessionAccessService {
    authorize(...args: Parameters<SessionAccessOperations['authorize']>) {
      return f.authority.authorize(...args)
    }
  }
  class Backing extends SessionLogBackingService {
    get ownerGeneration() {
      return f.backing.ownerGeneration
    }
    borrow() {
      return f.backing.borrow()
    }
  }
  class Source extends ToolAdmissionPassSourceService {
    read(...args: Parameters<ToolAdmissionPassSourceOperations['read']>) {
      return f.source.read(...args)
    }
  }
  class History extends ToolActionHistoryService {
    inspect(...args: Parameters<ToolActionHistoryOperations['inspect']>) {
      return f.history.inspect(...args)
    }
  }
  class Implementations extends LoopExtensionImplementationsService {
    registerBuiltin(...args: Parameters<RunnerImplementations['registerBuiltin']>) {
      const remove = this.ctx.effect(() => registry.registerBuiltin(...args))
      return () => {
        void remove()
      }
    }
    registerAdmission(...args: Parameters<RunnerImplementations['registerAdmission']>) {
      const remove = this.ctx.effect(() => registry.registerAdmission(...args))
      return () => {
        void remove()
      }
    }
  }
  const infrastructure = ctx.plugin({
    name: 'admission-test-inputs',
    apply(inner: Context) {
      new Access(inner)
      new Backing(inner)
      new Source(inner)
      new Implementations(inner)
    },
  })
  await infrastructure
  const historyPlugin = {
    name: 'admission-test-history',
    apply(inner: Context) {
      new History(inner)
    },
  }
  return {
    f,
    ctx,
    registry,
    historyPlugin,
    async close() {
      await ctx.fiber.dispose()
      registry.closeAdmission()
      await registry.drain()
    },
  }
}
