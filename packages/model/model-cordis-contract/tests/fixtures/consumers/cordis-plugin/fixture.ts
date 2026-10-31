import { invocationReference, reservedReference } from './values.ts'
// A Cordis plugin that follows model calls. The assembly (the host plugin in host.ts) provides a
// scripted runtime on the `modelRuntime` key and sends `model-cordis-contract/call-changed`; the
// plugin in plugin.ts depends on the service through the definition entry, asks the runtime for the
// authoritative revision and keeps the newest one. Everything runs in a real Cordis Context.
import { Context, Service } from '@deepseek-ai/cordis'
import { type ModelOperationId, type ModelRuntime } from '@omne-harness/model-contract'
import { compareRevisions } from '@omne-harness/model-contract/provider'
import { ModelRuntimeService, modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { startAssembly } from './host.ts'
import { followerPlugin, newFollowed } from './plugin.ts'
import {
  admissionOf,
  call,
  expect,
  follower,
  newProvider,
  operation,
  tenantA,
  tenantB,
  type Principal,
} from './values.ts'

type Path = Readonly<{
  name: string
  kind: 'normal' | 'failure'
  decision?: string
  run: () => Promise<void>
}>

/** An assembly that serves one call and a plugin that follows it from the revision of its admission. */
async function followedCall() {
  const provider = newProvider()
  const admitted = await provider.admit('a')
  const assembly = await startAssembly(provider.runtime)
  const { fiber, followed } = await assembly.follow({
    principal: follower,
    tenant: tenantA,
    tracked: [
      {
        call: call('a'),
        reference: invocationReference({
          tenant: tenantA,
          call: call('a'),
          admission: admissionOf('a'),
        }),
        known: admitted,
      },
    ],
  })
  return { provider, assembly, fiber, followed, admitted }
}

async function refreshesToTheAuthoritativeRevision(): Promise<void> {
  const { provider, assembly, followed, admitted } = await followedCall()
  try {
    const first = await provider.change('a')
    const second = await provider.change('a')
    expect(compareRevisions(first, admitted) > 0, 'the first change did not commit a revision')
    expect(compareRevisions(second, first) > 0, 'the second change did not commit a revision')
    // The notification names the first change; the runtime already holds the second.
    await assembly.announce(tenantA, call('a'), first)
    expect(assembly.diagnostics().length === 0, `the listener failed: ${assembly.diagnostics()}`)
    expect(followed.refreshed.length === 1, `${followed.refreshed.length} refreshes were recorded`)
    const [refresh] = followed.refreshed
    expect(refresh?.tenant === tenantA, 'the refresh names another tenant')
    expect(refresh.call === call('a'), 'the refresh names another call')
    expect(
      refresh.revision === second,
      `the plugin took ${refresh.revision} and not the authoritative ${second}`,
    )
    expect(followed.known.get(call('a')) === second, 'the known revision was not refreshed')
    expect(assembly.inspections() === 1, 'the plugin did not ask the runtime exactly once')
  } finally {
    await assembly.close()
  }
}

async function otherTenantIsFilteredBeforeAnyQuery(): Promise<void> {
  const { provider, assembly, followed, admitted } = await followedCall()
  try {
    const changed = await provider.change('a')
    await assembly.announce(tenantB, call('a'), changed)
    expect(assembly.inspections() === 0, 'the plugin asked the runtime about another tenant')
    expect(followed.refreshed.length === 0, 'the plugin followed a notification of another tenant')
    expect(followed.known.get(call('a')) === admitted, 'the known revision moved')
    expect(assembly.diagnostics().length === 0, `the listener failed: ${assembly.diagnostics()}`)
  } finally {
    await assembly.close()
  }
}

async function staleNotificationIsNotRefreshed(): Promise<void> {
  const { provider, assembly, followed } = await followedCall()
  try {
    const first = await provider.change('a')
    const second = await provider.change('a')
    await assembly.announce(tenantA, call('a'), second)
    expect(followed.known.get(call('a')) === second, 'the newer notification did not refresh')
    const asked = assembly.inspections()
    // A late notification for an older revision, and a repeat of the one already taken.
    await assembly.announce(tenantA, call('a'), first)
    await assembly.announce(tenantA, call('a'), second)
    expect(followed.known.get(call('a')) === second, 'a stale notification moved the revision back')
    expect(followed.refreshed.length === 1, 'a stale notification was refreshed')
    expect(
      assembly.inspections() === asked,
      'the plugin asked the runtime for a stale notification',
    )
    expect(assembly.diagnostics().length === 0, `the listener failed: ${assembly.diagnostics()}`)
  } finally {
    await assembly.close()
  }
}

async function refusedLookupStopsFollowingTheCall(): Promise<void> {
  const { provider, assembly, followed } = await followedCall()
  try {
    provider.controller.revokeAccess({
      tenant: tenantA,
      call: call('a'),
      principal: follower,
      actions: ['inspect'],
    })
    const changed = await provider.change('a')
    await assembly.announce(tenantA, call('a'), changed)
    expect(
      followed.stopped.length === 1 && followed.stopped[0] === call('a'),
      'the call is still followed',
    )
    expect(!followed.known.has(call('a')), 'the plugin kept the revision of a refused call')
    expect(followed.refreshed.length === 0, 'the plugin refreshed from a refused lookup')
    expect(
      assembly.diagnostics().length === 0,
      'a refusal was treated as a failure of the listener',
    )
    expect(assembly.inspections() === 1, 'the plugin did not ask exactly once')

    const later = await provider.change('a')
    await assembly.announce(tenantA, call('a'), later)
    expect(assembly.inspections() === 1, 'the plugin kept asking about a call it stopped following')
    expect(
      followed.known.size === 0 && followed.refreshed.length === 0,
      'the plugin followed again',
    )
  } finally {
    await assembly.close()
  }
}

/**
 * The plugin follows the call under an admission that makes its lookup end without a call state;
 * the sender must see the failure of the listener while the committed change and the plugin's own
 * state stay as they were.
 */
async function lookupEndsWithoutAStateAndTheSenderKeepsTheCommit(
  trackedAdmission: ModelOperationId,
  runtimeAnswer?: 'invalid',
): Promise<void> {
  const provider = newProvider()
  const admitted = await provider.admit('a')
  const reference = trackedAdmission.startsWith('mop_--')
    ? reservedReference({ tenant: tenantA, call: call('a'), admission: trackedAdmission })
    : invocationReference({ tenant: tenantA, call: call('a'), admission: trackedAdmission })
  if (runtimeAnswer !== undefined) {
    // Ask the runtime itself, not through the assembly, so the count of the plugin's lookups is unchanged.
    const answer: Awaited<ReturnType<typeof provider.runtime.calls.inspect>> = await Reflect.apply(
      provider.runtime.calls.inspect,
      provider.runtime.calls,
      [{ principal: follower, tenant: tenantA, reference }],
    )
    expect(
      'failure' in answer &&
        answer.failure.kind === runtimeAnswer &&
        answer.failure.kind === 'invalid' &&
        answer.failure.field === 'admission' &&
        answer.failure.reason === 'not-original',
      `the runtime did not answer ${runtimeAnswer} as a value`,
    )
  }
  const assembly = await startAssembly(provider.runtime)
  try {
    const { followed }: Awaited<ReturnType<typeof assembly.follow>> = await Reflect.apply(
      assembly.follow,
      assembly,
      [
        {
          principal: follower,
          tenant: tenantA,
          tracked: [{ call: call('a'), reference, known: admitted }],
        },
      ],
    )
    const changed = await provider.change('a')
    await assembly.announce(tenantA, call('a'), changed)
    expect(assembly.inspections() === 1, 'the plugin did not ask the runtime exactly once')
    expect(
      assembly.diagnostics().length === 1,
      `${assembly.diagnostics().length} failures reached the sender`,
    )
    expect(
      assembly.diagnostics().every(text => text.includes(String(call('a')))),
      'the failure does not name the call',
    )
    expect(followed.known.get(call('a')) === admitted, 'the failed lookup moved the revision')
    expect(followed.refreshed.length === 0, 'the plugin refreshed from a lookup without a state')
    expect(followed.stopped.length === 0, 'a failed lookup stopped the plugin following')
    expect(
      (await provider.state('a')).revision === changed,
      'the failed listener changed the committed call',
    )
  } finally {
    await assembly.close()
  }
}

// An existing call with another valid admission is invalid, never authoritatively unaccepted.
const unacceptedAdmissionIsRaisedToTheSender = () =>
  lookupEndsWithoutAStateAndTheSenderKeepsTheCommit(operation('admit-unknown'), 'invalid')

// A value that starts with `--` is reserved, so the runtime fails the lookup with `invalid`.
const failedLookupIsLeftToTheSender = () =>
  lookupEndsWithoutAStateAndTheSenderKeepsTheCommit(operation('--reserved'))

async function theServiceIsTheDefinitionOnItsKey(): Promise<void> {
  const { assembly, followed } = await followedCall()
  try {
    expect(
      ModelRuntimeService.provide === modelRuntimeKey,
      'the key constant is not the key of the definition',
    )
    expect(assembly.Hosted.provide === modelRuntimeKey, 'the host provides another key')
    expect(followed.received.length === 1, 'the plugin did not run exactly once')
    expect(
      followed.received[0] instanceof ModelRuntimeService,
      'the plugin received a service that is not an instance of the definition',
    )
    expect(followed.received[0] instanceof assembly.Hosted, 'the plugin received another service')
  } finally {
    await assembly.close()
  }
}

/**
 * A class with the members of the runtime that does not extend the definition, provided on the
 * key of the definition. Cordis serves it to the plugin all the same: the key is all that the
 * injection checks. It is the plugin that tells the two apart, by `instanceof` against the one
 * class that the definition entry exports, and refuses to run.
 */
class LookAlike extends Service {
  static readonly provide = modelRuntimeKey
  readonly calls: ModelRuntime<Principal>['calls']
  readonly consumption: ModelRuntime<Principal>['consumption']
  readonly instances: ModelRuntime<Principal>['instances']
  constructor(ctx: Context, runtime: ModelRuntime<Principal>) {
    super(ctx, LookAlike.provide)
    this.calls = runtime.calls
    this.consumption = runtime.consumption
    this.instances = runtime.instances
  }
}

async function lookAlikeOnTheKeyIsRefusedByThePlugin(): Promise<void> {
  const provider = newProvider()
  const admitted = await provider.admit('a')
  const root = new Context()
  const other = newFollowed()
  const host = root.plugin({
    name: 'look-alike-host',
    apply(ctx: Context) {
      new LookAlike(ctx, provider.runtime)
    },
  })
  await host
  const served = root.get(modelRuntimeKey)
  expect(served instanceof LookAlike, 'the look-alike is not what the key serves')
  expect(
    !(served instanceof ModelRuntimeService),
    'the look-alike is an instance of the definition',
  )
  const fiber = root.plugin(followerPlugin, {
    principal: follower,
    tenant: tenantA,
    tracked: [
      {
        call: call('a'),
        reference: invocationReference({
          tenant: tenantA,
          call: call('a'),
          admission: admissionOf('a'),
        }),
        known: admitted,
      },
    ],
    followed: other,
  })
  try {
    let refusal = ''
    try {
      await fiber
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error)
    }
    expect(
      refusal.includes(modelRuntimeKey),
      `the plugin ran, or refused without naming the key: "${refusal}"`,
    )
    expect(other.started === 0, 'the plugin ran against a service that is not the definition')
    expect(other.received.length === 0, 'the plugin took the look-alike as its runtime')
    expect(other.known.size === 0, 'the refused plugin left state behind')
    // Nothing listens: a notification that would refresh a running plugin changes nothing.
    const changed = await provider.change('a')
    await root.parallel('model-cordis-contract/call-changed', tenantA, call('a'), changed)
    expect(other.refreshed.length === 0, 'the refused plugin followed a notification')
  } finally {
    await fiber.dispose()
    await host.dispose()
  }
}

async function unloadedPluginStopsResponding(): Promise<void> {
  const { provider, assembly, fiber, followed } = await followedCall()
  try {
    const first = await provider.change('a')
    await assembly.announce(tenantA, call('a'), first)
    expect(
      followed.known.get(call('a')) === first,
      'the plugin did not respond while it was loaded',
    )
    const asked = assembly.inspections()

    await fiber.dispose()
    const second = await provider.change('a')
    await assembly.announce(tenantA, call('a'), second)
    expect(assembly.inspections() === asked, 'the plugin still asked the runtime after unloading')
    expect(followed.known.get(call('a')) === first, 'the plugin still refreshed after unloading')
    expect(followed.refreshed.length === 1, 'the plugin still recorded a refresh after unloading')
  } finally {
    await assembly.close()
  }
}

export const fixture = {
  role: 'cordis-plugin',
  paths: [
    {
      name: 'a notification is followed by a look at the runtime and the plugin takes the revision found there',
      kind: 'normal',
      run: refreshesToTheAuthoritativeRevision,
    },
    {
      name: 'a notification of another tenant is dropped before the runtime is asked',
      kind: 'normal',
      run: otherTenantIsFilteredBeforeAnyQuery,
    },
    {
      name: 'the runtime the plugin receives is the definition class on the key of its constant',
      kind: 'normal',
      run: theServiceIsTheDefinitionOnItsKey,
    },
    {
      name: 'a plugin that is unloaded no longer answers notifications',
      kind: 'normal',
      run: unloadedPluginStopsResponding,
    },
    {
      name: 'a notification that is not newer than the known revision is not refreshed',
      kind: 'failure',
      decision:
        'the plugin keeps its known revision and does not ask the runtime again for a notification that is not newer',
      run: staleNotificationIsNotRefreshed,
    },
    {
      name: 'a class with the same members on the key of the definition is served by Cordis and refused by the plugin',
      kind: 'failure',
      decision:
        "the plugin does not run on a service that is not an instance of the definition class, keeps no state and listens to nothing; Cordis serves whatever is provided on the key, so the check is the consumer's (docs/object-model.md: the Service identity is the one export of this package, and a class with the same shape does not replace it; docs/cordis.md: an interface of the same shape proves nothing)",
      run: lookAlikeOnTheKeyIsRefusedByThePlugin,
    },
    {
      name: 'a runtime that refuses the lookup ends the following of that call',
      kind: 'failure',
      decision:
        'the plugin stops following the call and drops its revision, and asks the runtime nothing more about it',
      run: refusedLookupStopsFollowingTheCall,
    },
    {
      name: 'an admission that the runtime does not accept is raised to the sender of the notification and changes nothing',
      kind: 'failure',
      decision:
        'the runtime rejects the non-original admission, the plugin raises it as a failure of its listener, the sender records it and keeps the committed change, and the plugin keeps following with the revision it had',
      run: unacceptedAdmissionIsRaisedToTheSender,
    },
    {
      name: 'a lookup that fails is left to the sender of the notification and changes nothing',
      kind: 'failure',
      decision:
        'the plugin does not catch the failure of the lookup, the sender records the failure of the listener and keeps the committed change, and the plugin keeps following with the revision it had',
      run: failedLookupIsLeftToTheSender,
    },
  ],
} satisfies { role: string; paths: readonly Path[] }
