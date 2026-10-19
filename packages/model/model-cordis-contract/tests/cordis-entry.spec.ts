import { expect, it } from 'vitest'

it('the cordis entry exports the service definitions with their keys, and no other value', async () => {
  const cordis = (await import('@omne-harness/model-cordis-contract/cordis')) as Record<
    string,
    unknown
  >
  const definitions = {
    ModelClockService: 'modelClock',
    ModelCommandsService: 'modelCommands',
    ModelConverterAuthorityService: 'modelConverterAuthority',
    ModelConvertersService: 'modelConverters',
    ModelCredentialService: 'modelCredential',
    ModelDiagnosticsService: 'modelDiagnostics',
    ModelHostAuthorityService: 'modelHostAuthority',
    ModelInstanceHostService: 'modelInstanceHost',
    ModelInstancesService: 'modelInstances',
    ModelMessageConversionService: 'modelMessageConversion',
    ModelProfileMaintenanceService: 'modelProfileMaintenance',
    ModelProfilesService: 'modelProfiles',
    ModelPublicationAuthorityService: 'modelPublicationAuthority',
    ModelRequestPreparationService: 'modelRequestPreparation',
    ModelRetryPolicyService: 'modelRetryPolicy',
    ModelRuntimeService: 'modelRuntime',
    ModelSendBoundaryService: 'modelSendBoundary',
  }
  const keyName = (service: string) =>
    `${service[0]?.toLowerCase()}${service.slice(1, -'Service'.length)}Key`
  expect(Object.keys(cordis).sort()).toEqual(
    [...Object.keys(definitions), ...Object.keys(definitions).map(keyName)].sort(),
  )
  for (const [service, key] of Object.entries(definitions)) {
    expect(cordis[keyName(service)], service).toBe(key)
  }
})
