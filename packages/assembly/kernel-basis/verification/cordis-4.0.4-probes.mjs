import { Context, Service } from '@deepseek-ai/cordis'

const results = []

function record(name, observed) {
  results.push({ name, observed })
}

async function callerContext() {
  class Registry extends Service {
    constructor(ctx) {
      super(ctx, 'registry')
    }
    track() {
      return this.ctx.effect(() => {
        this.tracked = true
        return () => {
          this.tracked = false
        }
      })
    }
  }
  const root = new Context()
  const registryFiber = await root.plugin(Registry)
  const registry = root.get('registry')
  const caller = await root.plugin({
    name: 'caller',
    inject: ['registry'],
    apply(ctx) {
      ctx.get('registry').track()
    },
  })
  const whileCallerLives = registry.tracked === true
  await caller.dispose()
  record('caller-context', {
    effectRemovedWhenCallerDisposes: whileCallerLives && registry.tracked === false,
    registryStaysActive: registryFiber.state === 2,
  })
}

async function isolateVisibility() {
  const root = new Context()
  await root.plugin({
    name: 'provider',
    apply(ctx) {
      ctx.provide('scoped', 'parent-instance')
    },
  })
  let propertyError = null
  let getResult = 'unset'
  await root.plugin({
    name: 'parent',
    inject: ['scoped'],
    async apply(ctx) {
      await ctx.isolate('scoped').plugin({
        name: 'child',
        apply(child) {
          try {
            void child.scoped
          } catch (error) {
            propertyError = error instanceof Error ? error.message : String(error)
          }
          getResult = child.get('scoped')
        },
      })
    },
  })
  record('isolate', {
    propertyError,
    getResult: getResult === undefined ? 'undefined' : getResult,
  })
}

async function providerReplacement() {
  const root = new Context()
  let runs = 0
  let seen = []
  await root.plugin({
    name: 'consumer',
    inject: ['svc'],
    apply(ctx) {
      runs += 1
      seen.push(ctx.get('svc'))
    },
  })
  const pendingBeforeProvider = runs
  const provider = await root.plugin({
    name: 'provider',
    apply(ctx) {
      ctx.provide('svc', 'a')
    },
  })
  const afterProvide = runs
  provider.ctx.set('svc', 'b')
  await new Promise(resolve => setTimeout(resolve, 0))
  const afterSet = runs
  const seenAfterSet = [...seen]
  const getAfterSet = root.get('svc')
  await provider.dispose()
  const afterDispose = runs
  await root.plugin({
    name: 'next-provider',
    apply(ctx) {
      ctx.provide('svc', 'c')
    },
  })
  record('provider-replacement', {
    pendingBeforeProvider,
    afterProvide,
    afterSet,
    seenAfterSet,
    getAfterSet,
    afterDispose,
    afterNextProvider: runs,
  })
}

async function missingDependency() {
  const root = new Context()
  let ran = false
  const waiting = await root.plugin({
    name: 'needs-missing',
    inject: ['missing'],
    apply() {
      ran = true
    },
  })
  record('missing-dependency', {
    stateWhenAwaitReturns: waiting.state,
    applyRan: ran,
  })
}

async function asyncErrorAfterActive() {
  const root = new Context()
  const unhandled = []
  const onUnhandled = reason => {
    unhandled.push(reason instanceof Error ? reason.message : String(reason))
  }
  process.on('unhandledRejection', onUnhandled)
  const fiber = await root.plugin({
    name: 'active-then-reject',
    apply(ctx) {
      ctx.effect(() => {
        void Promise.reject(new Error('after-active'))
        return () => {}
      })
    },
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  const stateAfterRejection = fiber.state
  process.off('unhandledRejection', onUnhandled)
  record('async-error-after-active', {
    stateAfterRejection,
    unhandled,
  })
}

await callerContext()
await isolateVisibility()
await providerReplacement()
await missingDependency()
await asyncErrorAfterActive()
console.log(JSON.stringify({ node: process.version, results }, null, 2))
