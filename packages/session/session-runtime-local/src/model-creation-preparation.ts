import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type { CallKey } from '@omne-harness-lite/messages'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  judgeModelProfileDocument,
  validate as profileShape,
  type ModelProfile,
  type ModelProfileSnapshot,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { winningRow, type ProfileRow } from '@omne-harness-lite/model-profile-directory'
import {
  createModelCallCreationInput,
  readSettlementPrefix,
  type OpenCallInput,
  type ServiceInvalidInput,
  type SessionRuntimeBinding,
  type SettlementRegistration,
  type SessionModelCreationInput,
  type SessionModelCreationResult,
} from '@omne-harness-lite/model-request-runtime'
import { authorizedCalibration } from './model-request-calibration.ts'

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function snapshotOf(profile: ModelProfile): ModelProfileSnapshot | undefined {
  const candidate = {
    adaptation: profile.adaptation,
    providers: profile.providers,
    allowFallback: profile.allowFallback,
    inputModalities: profile.inputModalities,
    outputModalities: profile.outputModalities,
    maxInputTokens: profile.maxInputTokens,
    maxOutputTokens: profile.maxOutputTokens,
    inputConstraints: profile.inputConstraints,
    upstreamInputLimits: profile.upstreamInputLimits,
    ...(profile.parameters === undefined ? {} : { parameters: profile.parameters }),
    updatedAt: profile.updatedAt,
  }
  const copied = copyJsonValue(candidate)
  return 'ok' in copied && profileShape('ModelProfileSnapshot', copied.ok).valid
    ? (copied.ok as unknown as ModelProfileSnapshot)
    : undefined
}

function mergedParameters(
  profile: ModelProfile,
  override: ModelRequestParameters | undefined,
): { readonly parameters: ModelRequestParameters } | ServiceInvalidInput {
  const base = profile.parameters ?? {}
  const combined = {
    ...base,
    ...override,
    ...(base.extra === undefined && override?.extra === undefined
      ? {}
      : { extra: { ...base.extra, ...override?.extra } }),
  }
  const copied = copyJsonValue(combined)
  if (!('ok' in copied)) return { invalidInput: { reason: 'malformed' } }
  const judged = judgeModelProfileDocument('ModelRequestParameters', copied.ok)
  if ('rejected' in judged) return { invalidInput: { reason: judged.rejected } }
  const parameters = copied.ok as ModelRequestParameters
  if (
    parameters.maxOutputTokens !== undefined &&
    ExactDecimal.from(parameters.maxOutputTokens).compare(
      ExactDecimal.from(profile.maxOutputTokens),
    ) > 0
  )
    return { invalidInput: { reason: 'max_output_exceeds_profile' } }
  return { parameters }
}

function readRows(value: unknown): readonly ProfileRow[] | undefined {
  if (!Array.isArray(value)) return undefined
  const copied = copyJsonValue(value)
  if (!('ok' in copied) || !Array.isArray(copied.ok)) return undefined
  return copied.ok.every(
    item =>
      object(item) &&
      'ok' in judgeModelProfileDocument('ModelProfileRef', item.ref) &&
      'ok' in judgeModelProfileDocument('ModelProfile', item.profile),
  )
    ? (copied.ok as unknown as readonly ProfileRow[])
    : undefined
}

function judgeCatalogRows(
  request: OpenCallInput,
  rawRows: Awaited<ReturnType<SessionRuntimeBinding['catalog']['listProfiles']>>,
) {
  const rows = readRows(rawRows)
  if (rows === undefined) return { unavailable: true } as const
  const matching = rows.filter(row => row.ref.routeName === request.target)
  if (matching.length === 0) return { profileNotFound: true } as const
  const winner = winningRow(rows, request.target, [request.target])
  if (winner === undefined) return { undispatched: 'withdrawn' } as const
  return { winner } as const
}
function judgeSelectionCompatibility(
  session: SessionRuntimeBinding,
  winner: ProfileRow,
  projection: Awaited<ReturnType<SessionRuntimeBinding['selection']['projection']>>,
) {
  if ('unknown' in projection) return { unavailable: true } as const
  const compatible = session.selection.compatible(winner.profile, projection.known)
  if ('invalidInput' in compatible || 'unavailable' in compatible)
    return { unavailable: true } as const
  if ('blocked' in compatible) return { undispatched: 'modality_mismatch' } as const
  return { compatible: true } as const
}
function judgeCredentialPresence(
  present: Awaited<ReturnType<SessionRuntimeBinding['catalog']['credentialPresent']>>,
) {
  if ('failure' in present) return { unavailable: true } as const
  if (!present.present) return { undispatched: 'credential_unavailable' } as const
  return { present: true } as const
}
async function readFreshFacts(
  session: SessionRuntimeBinding,
  callId: CallKey['callId'],
  registration: SettlementRegistration,
  request: OpenCallInput,
  calibration: SessionModelCreationInput['calibration'],
) {
  const holding = await registration.start(
    'read',
    async () => await session.selection.sessionTenancy.holdingTenant(request.session),
  ).completion
  if (!('tenant' in holding) || !tenantIdEquals(holding.tenant, session.log.tenant))
    return { unavailable: true } as const
  const rawRows = await registration.start(
    'read',
    async () => await session.catalog.listProfiles(holding.tenant),
  ).completion
  const selected = judgeCatalogRows(request, rawRows)
  if (!('winner' in selected)) return selected
  const { winner } = selected
  const prefix = await readSettlementPrefix({ binding: session.log, registration })
  if ('unavailable' in prefix) return { unavailable: true } as const
  const projection = await registration.start(
    'read',
    async () => await session.selection.projection(prefix.prefix),
  ).completion
  const compatible = judgeSelectionCompatibility(session, winner, projection)
  if (!('compatible' in compatible)) return compatible
  const present = await registration.start(
    'read',
    async () => await session.catalog.credentialPresent(session.log.tenant, winner.ref.origin),
  ).completion
  const credential = judgeCredentialPresence(present)
  if (!('present' in credential)) return credential
  const calibrated = authorizedCalibration(
    prefix.prefix,
    request.messages,
    {
      callId,
      dispatch: 1,
      ...(request.run === undefined ? {} : { run: request.run, attempt: request.attempt }),
    },
    calibration,
  )
  return 'unavailable' in calibrated
    ? ({ unavailable: true } as const)
    : ({
        winner,
        calibration: calibrated.calibration,
        outputHistory: calibrated.outputHistory,
      } as const)
}
type SelectedFacts = Extract<Awaited<ReturnType<typeof readFreshFacts>>, { winner: unknown }>
type FreshSelection = SelectedFacts & {
  snapshot: ModelProfileSnapshot
  parameters: ModelRequestParameters
}
function selectFreshBinding(
  checked: SelectedFacts,
  request: OpenCallInput,
): FreshSelection | ServiceInvalidInput | { unavailable: true } {
  const { winner } = checked
  const snapshot = snapshotOf(winner.profile)
  if (snapshot === undefined) return { unavailable: true } as const
  const merged = mergedParameters(winner.profile, request.parameters)
  if ('invalidInput' in merged) return merged
  if (snapshot.adaptation.definition.modelId !== request.target)
    return { invalidInput: { reason: 'malformed' } } as const
  return {
    winner,
    snapshot,
    parameters: merged.parameters,
    calibration: checked.calibration,
    outputHistory: checked.outputHistory,
  } as const
}

export async function prepareSessionModelCreation(
  input: SessionModelCreationInput,
): Promise<SessionModelCreationResult> {
  const { session, request, key, tools, registration, calibration } = input
  const checked = await readFreshFacts(session, key.callId, registration, request, calibration)
  if (!('calibration' in checked)) return checked
  const selected = selectFreshBinding(checked, request)
  if (!('winner' in selected)) return selected
  const { winner, snapshot, parameters } = selected
  const selectedBy =
    request.targetChangedBy === undefined
      ? request.basis.selectedBy
      : { extension: capabilityCanonicalString(request.targetChangedBy) }
  return {
    prepared: {
      calibration: selected.calibration,
      outputHistory: selected.outputHistory,
      content: {
        kind: 'created',
        ref: key,
        creationKey: request.creationKey,
        origin: {
          tenant: session.log.tenant,
          session: session.log.session,
          ...(request.run === undefined ? {} : { run: request.run, attempt: request.attempt }),
        },
        input: createModelCallCreationInput(request, session.sourceVersions),
        status: 'accepted',
        adopted: {
          profile: winner.ref,
          profileSnapshot: snapshot,
          adaptation: snapshot.adaptation,
          parameters,
          selectedBy,
          messages: request.messages,
          tools,
          contextSources: {},
        },
      },
    },
  }
}
