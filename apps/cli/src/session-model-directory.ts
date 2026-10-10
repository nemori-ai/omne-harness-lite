import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import {
  isOk,
  parseTenantId,
  parseOpaqueIdentifier,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import type { GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import type { AdmissionSource } from '@omne-harness-lite/session-runtime-local'
import type {
  ModelCatalogRead,
  ModelCatalog,
  CredentialLookup,
  DiagnosticSink,
} from '@omne-harness-lite/model-profile-directory'
import { createLocalModelDirectory } from '@omne-harness-lite/model-profile-directory-local'
import { createLocalCredentialLookup } from '@omne-harness-lite/model-profile-directory-local/local-credentials'
import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory-local/tx-reads'
import {
  createModelReplicaCustodian,
  type ModelReplicaCustodian,
  type ReplicaDiagnostics,
} from '@omne-harness-lite/credential-custodian-local/model-replica'
import {
  officialCatalog,
  officialCatalogRevision,
  createOfficialCatalogProfile,
} from '@omne-harness-lite/pi-ai-transport'
import { createSessionAdmissionProbe } from './session-admission-probe.ts'
import { parseRunLoginBinding } from './session-preparation.ts'

/** Actual fixed tenant and governance source. Key and existing bindings are never synthesized. */
export interface SessionModelDirectoryOptions {
  readonly governance: GovernanceClientOperations
  readonly source: AdmissionSource
  readonly tenant: TenantId
  readonly keyFile: string
  readonly diagnostics: DiagnosticSink
  readonly onDiagnosticFailure: () => void
  readonly replicaDiagnostics: ReplicaDiagnostics
}
export interface SessionModelDirectoryRead {
  readonly catalog: ModelCatalogRead
  readonly credentials: CredentialLookup
}

export type ModelCredentialPublication =
  | { readonly kind: 'stored'; readonly credentialRef: string }
  | {
      readonly kind: 'rejected' | 'unconfirmed'
      readonly credentialRef: string
      readonly stage: 'admission' | 'binding' | 'replica'
      readonly reason: string
    }

interface CredentialPublicationInput {
  readonly credentialRef: string
  readonly body: Uint8Array
}

function captureCredential(input: CredentialPublicationInput) {
  const parsed = parseOpaqueIdentifier(input.credentialRef, 'CredentialRef')
  if (!isOk(parsed) || !(input.body instanceof Uint8Array) || input.body.length === 0)
    throw new TypeError('explicit model credential reference and bytes required')
  return { credentialRef: parsed.ok, body: Uint8Array.from(input.body) }
}

/** The application owns setup. Model consumers receive only the ready read faces. */
export function createSessionModelDirectory(
  storage: AtomicStorage,
  clock: Clock,
  requested: SessionModelDirectoryOptions,
) {
  const source = parseRunLoginBinding(requested.source)
  const tenant = parseTenantId(requested.tenant)
  if (!source || !isOk(tenant) || tenant.ok.account !== source.accountId)
    throw new TypeError('fixed model directory identity required')
  const options = Object.freeze({
    ...requested,
    source: Object.freeze(source),
    tenant: Object.freeze(tenant.ok),
  })
  const probe = createSessionAdmissionProbe(options.governance, options.source, options.tenant)
  let directory: ReturnType<typeof createLocalModelDirectory> | undefined
  let replica: ModelReplicaCustodian | undefined
  let lookup: ReturnType<typeof createLocalCredentialLookup> | undefined
  let catalog: ModelCatalog | undefined
  const publications = new Set<Promise<ModelCredentialPublication>>()
  let stopping = false
  let closing: Promise<void> | undefined
  async function standing(candidate: TenantId) {
    if (stopping || !tenantIdEquals(candidate, options.tenant))
      return { failure: 'unavailable' } as const
    const observed = await probe.verify(options.source, {
      tenant: options.tenant,
      session: null,
      purpose: 'createSession',
      operationKey: 'model-directory-member-observation',
      inputPosition: null,
    })
    if (observed.kind === 'memberValid')
      return { standing: 'effective', role: observed.role } as const
    return observed.kind === 'memberRejected'
      ? ({ standing: 'ineffective' } as const)
      : ({ failure: 'unavailable' } as const)
  }
  async function start(): Promise<SessionModelDirectoryRead> {
    if (stopping) throw new Error('model directory stopped before acquisition')
    const entries = officialCatalog.map(entry => {
      const profile = createOfficialCatalogProfile(
        entry,
        'official-catalog:' + officialCatalogRevision,
      )
      if ('rejected' in profile) throw new Error('invalid official catalog profile')
      return profile.ok
    })
    directory = createLocalModelDirectory({
      storage,
      clock,
      memberships: { standing },
      manifest: { ordinal: officialCatalogRevision, entries },
      factoryConfigured: false,
      diagnostics: options.diagnostics,
      onDiagnosticFailure: options.onDiagnosticFailure,
      withdrawn() {},
    })
    catalog = await directory.ready
    replica = await createModelReplicaCustodian({
      storage,
      clock,
      keyFile: options.keyFile,
      readCredentialBindingIn: createCredentialBindingReader(storage),
      diagnostics: options.replicaDiagnostics,
    })
    lookup = createLocalCredentialLookup({
      storage,
      readBoundReplicaIn: replica.readBoundReplicaIn,
      diagnostics: options.diagnostics,
      onDiagnosticFailure: options.onDiagnosticFailure,
    })
    const credentials = await lookup.ready
    return Object.freeze({
      catalog: Object.freeze({
        readProfile: catalog.readProfile,
        listProfiles: catalog.listProfiles,
        credentialPresent: catalog.credentialPresent,
      }),
      credentials,
    })
  }
  async function closeResources() {
    stopping = true
    await started
    await Promise.allSettled([...publications])
    await lookup?.close()
    await replica?.close()
    await directory?.close()
  }
  const ready = Promise.resolve().then(start)
  void ready.catch(() => {})
  const started = ready.then(
    () => undefined,
    () => undefined,
  )
  function close() {
    if (!closing) {
      const attempt = closeResources()
      closing = attempt
      void attempt.catch(() => {
        if (closing === attempt) closing = undefined
      })
    }
    return closing
  }
  async function publishCredential(
    input: CredentialPublicationInput,
  ): Promise<ModelCredentialPublication> {
    const { credentialRef, body } = captureCredential(input)
    try {
      await ready
      if (stopping || !catalog || !replica)
        return { kind: 'rejected', credentialRef, stage: 'admission', reason: 'closed' }
      const bound = await catalog.bindCredential(options.tenant, options.tenant, credentialRef)
      if ('failure' in bound)
        return {
          kind: bound.failure === 'unavailable' ? 'unconfirmed' : 'rejected',
          credentialRef,
          stage: 'binding',
          reason: bound.failure,
        }
      const stored = await replica.storeBoundReplica({
        loginState: options.source.loginStateHandle,
        tenant: options.tenant,
        sourceRef: credentialRef,
        body,
      })
      if ('stored' in stored && stored.stored) return { kind: 'stored', credentialRef }
      const reason = 'failure' in stored ? stored.failure : 'bindingChanged'
      return {
        kind: reason === 'unavailable' ? 'unconfirmed' : 'rejected',
        credentialRef,
        stage: 'replica',
        reason,
      }
    } finally {
      body.fill(0)
    }
  }
  function publish(input: Parameters<typeof publishCredential>[0]) {
    const job = publishCredential(input)
    publications.add(job)
    void job.then(
      () => publications.delete(job),
      () => publications.delete(job),
    )
    return job
  }
  return Object.freeze({ ready, close, publishCredential: publish })
}
