import { expectTypeOf, test } from 'vitest'
import type * as Provider from '@omne-harness/mcp-contract/provider'

type ProviderTypes = {
  AdoptedEndpoint: Provider.AdoptedEndpoint
  AdoptionView: Provider.AdoptionView<unknown, unknown>
  CallRequest: Provider.CallRequest
  CatalogStore: Provider.CatalogStore
  CredentialFailure: Provider.CredentialFailure
  CredentialPurpose: Provider.CredentialPurpose
  CredentialUse: Provider.CredentialUse<unknown>
  EligibilityVerdict: Provider.EligibilityVerdict
  HttpCredentialHandle: Provider.HttpCredentialHandle
  HttpPurpose: Provider.HttpPurpose
  ListingPage: Provider.ListingPage
  McpTransport: Provider.McpTransport
  McpTransportFactory: Provider.McpTransportFactory
  ProcessCredentialHandle: Provider.ProcessCredentialHandle
  ProcessEnvironment: Provider.ProcessEnvironment
  ProcessHandle: Provider.ProcessHandle
  ProcessLanding: Provider.ProcessLanding<unknown>
  ProcessPurpose: Provider.ProcessPurpose
  ProcessSetting: Provider.ProcessSetting
  SentCall: Provider.SentCall
  TaskAnswer: Provider.TaskAnswer
  TransportFailure: Provider.TransportFailure
  TransportMaterial: Provider.TransportMaterial
  UseEligibility: Provider.UseEligibility<unknown>
}

test('./provider exports the port types and no value', () => {
  expectTypeOf<ProviderTypes['CredentialUse']>().not.toBeNever()
  expectTypeOf<keyof typeof import('@omne-harness/mcp-contract/provider')>().toEqualTypeOf<never>()
})
