import { Context, type Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  ModelClockService,
  ModelCommandsService,
  ModelConverterAuthorityService,
  ModelDiagnosticsService,
  ModelHostAuthorityService,
  ModelInstanceHostService,
  ModelMessageConversionService,
  ModelProfileMaintenanceService,
  ModelProfilesService,
  ModelPublicationAuthorityService,
  ModelRequestPreparationService,
  ModelRetryPolicyService,
  ModelRuntimeService,
  ModelSendBoundaryService,
  modelClockKey,
  modelCommandsKey,
  modelConverterAuthorityKey,
  modelDiagnosticsKey,
  modelHostAuthorityKey,
  modelInstanceHostKey,
  modelMessageConversionKey,
  modelProfileMaintenanceKey,
  modelProfilesKey,
  modelPublicationAuthorityKey,
  modelRequestPreparationKey,
  modelRetryPolicyKey,
  modelRuntimeKey,
  modelSendBoundaryKey,
} from '../src/cordis.ts'

// The definitions are abstract, so each provider below only fills the members with stubs that
// fail if called. These tests check how a definition is published, not what a provider does.
async function unused(): Promise<never> {
  throw new Error('not called')
}

class Clock extends ModelClockService {
  readonly now = () => '2026-01-01T00:00:00.000Z'
  readonly waitUntil = unused
}
class Profiles extends ModelProfilesService<unknown> {
  readonly list = unused
  readonly resolve = unused
}
class ProfileMaintenance extends ModelProfileMaintenanceService<unknown> {
  readonly change = unused
  readonly inspect = unused
}
class RequestPreparation extends ModelRequestPreparationService<unknown> {
  readonly prepare = unused
}
class MessageConversion extends ModelMessageConversionService<unknown> {
  readonly prepare = unused
}
class HostAuthority extends ModelHostAuthorityService<unknown> {
  readonly resolve = unused
}
class ConverterAuthority extends ModelConverterAuthorityService<unknown> {
  readonly check = () => ({ ok: undefined })
}
class Diagnostics extends ModelDiagnosticsService<unknown> {
  readonly list = unused
}
class RetryPolicy extends ModelRetryPolicyService<unknown> {
  readonly decide = unused
  readonly inspect = unused
}

class Runtime extends ModelRuntimeService<unknown> {
  readonly calls = {
    admit: unused,
    inspect: unused,
    dispatches: unused,
    cancel: unused,
  }
  readonly consumption = {
    beginRead: unused,
    readNext: unused,
    closeRead: unused,
    acknowledge: unused,
  }
  readonly instances = { connect: unused }
}
class Commands extends ModelCommandsService<unknown> {
  readonly admit = unused
  readonly recall = unused
  readonly scanPending = unused
  readonly loadRecovery = unused
  readonly claim = unused
  readonly prepareDispatch = unused
  readonly recordMaterialization = unused
  readonly recordSend = unused
  readonly openReceiveWindow = unused
  readonly preserve = unused
  readonly recordLateFact = unused
  readonly prepareRetry = unused
  readonly decideRetry = unused
  readonly settle = unused
  readonly control = unused
  readonly acquireRead = unused
  readonly nextRead = unused
  readonly endRead = unused
  readonly handoff = unused
  readonly advanceCleanup = unused
  readonly query = unused
  readonly dispatches = unused
}
class SendBoundary extends ModelSendBoundaryService<unknown> {
  readonly send = unused
}
class InstanceHost extends ModelInstanceHostService<unknown> {
  readonly schedule = unused
  readonly publish = unused
  readonly withdraw = unused
  readonly directory = { connect: unused }
}
class PublicationAuthority extends ModelPublicationAuthorityService<unknown> {
  readonly check = () => ({ ok: undefined })
}

type Provider = new (ctx: Context) => Service
type Definition = { readonly provide: string } & (abstract new (ctx: Context) => Service)

const definitions: readonly (readonly [string, string, Definition, Provider])[] = [
  ['modelClock', modelClockKey, ModelClockService, Clock],
  ['modelProfiles', modelProfilesKey, ModelProfilesService, Profiles],
  [
    'modelProfileMaintenance',
    modelProfileMaintenanceKey,
    ModelProfileMaintenanceService,
    ProfileMaintenance,
  ],
  [
    'modelRequestPreparation',
    modelRequestPreparationKey,
    ModelRequestPreparationService,
    RequestPreparation,
  ],
  [
    'modelMessageConversion',
    modelMessageConversionKey,
    ModelMessageConversionService,
    MessageConversion,
  ],
  ['modelHostAuthority', modelHostAuthorityKey, ModelHostAuthorityService, HostAuthority],
  [
    'modelConverterAuthority',
    modelConverterAuthorityKey,
    ModelConverterAuthorityService,
    ConverterAuthority,
  ],
  ['modelDiagnostics', modelDiagnosticsKey, ModelDiagnosticsService, Diagnostics],
  ['modelRetryPolicy', modelRetryPolicyKey, ModelRetryPolicyService, RetryPolicy],
  ['modelRuntime', modelRuntimeKey, ModelRuntimeService, Runtime],
  ['modelCommands', modelCommandsKey, ModelCommandsService, Commands],
  ['modelSendBoundary', modelSendBoundaryKey, ModelSendBoundaryService, SendBoundary],
  ['modelInstanceHost', modelInstanceHostKey, ModelInstanceHostService, InstanceHost],
  [
    'modelPublicationAuthority',
    modelPublicationAuthorityKey,
    ModelPublicationAuthorityService,
    PublicationAuthority,
  ],
]

describe.each(definitions)('%s', (expected, key, definition, Provider) => {
  it('is written once: the class names the key and the exported constant takes it from the class', () => {
    expect(definition.provide).toBe(expected)
    expect(key).toBe(definition.provide)
  })

  it('is served as ctx.<key> by a provider and is gone when the provider fiber is disposed', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(Provider)
    await fiber
    const served: unknown = ctx.get(key)
    expect(served).toBeInstanceOf(definition)
    expect(served).toBeInstanceOf(Provider)
    await fiber.dispose()
    expect(ctx.get(key)).toBeUndefined()
  })
})

it('gives every definition its own key', () => {
  const keys = definitions.map(([, key]) => key)
  expect(new Set(keys).size).toBe(keys.length)
})
