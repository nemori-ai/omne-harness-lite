import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  projectAssetSettings,
  summarizeVersion,
  type AssetSettingsProjection,
} from '@omne-harness/assets'
import { SettingsIdSchema } from '@omne-harness/settings'
import {
  SettingsProjectionBindingSchema,
  type SettingsProjectionBinding,
} from '@omne-harness/settings-local'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { digest, equal, identity, json, withinBudget } from './encoding.ts'
import {
  assetLookupSchema,
  assetResultSchema,
  captureExcludedSchema,
  heldCapabilityLookupSchema,
  changeHoldingSchema,
  domainSchema,
  HANDLER,
  holdSchema,
  LIST_HANDLER,
  listLookupSchema,
  listResultSchema,
  holdingLookupSchema,
  holdingResultSchema,
  mutationSchema,
  PARTICIPANT,
  PROTOCOL,
  publishMetadataSchema,
  summaryResultSchema,
  domainResultSchema,
  versionLookupSchema,
  versionResultSchema,
  versionsLookupSchema,
  versionsResultSchema,
  type Failure,
  type Mutation,
} from './schema.ts'
import { createPublishedPackages, type PackageRecords } from './packages.ts'
import {
  freshDomainRevision,
  publicationRecall,
  receiptResult,
  type SameOperation,
} from './results.ts'
import { createLocalUploads } from './uploads.ts'
import type {
  AssetsLocal,
  AssetsLocalOptions,
  AssetsMutationResult,
  AssetsPublish,
  AssetsPublishAndHold,
} from './types.ts'
const fail = (reason: Failure['reason']): Failure => ({ kind: 'rejected', reason })

export type CaptureScope = Readonly<{ excluded: readonly string[] }>

function captureFacts(
  kind: 'capture' | 'capturePublication',
  binding: SettingsProjectionBinding,
  scope: CaptureScope,
): FactCommandV2 {
  return {
    participant: PARTICIPANT,
    facts: {
      kind,
      binding: json(SettingsProjectionBindingSchema.parse(binding)),
      excluded: json(captureExcludedSchema.parse([...new Set(scope.excluded)].sort())),
    },
  }
}
const PROJECTION_REJECTIONS = {
  invalid_body: 'invalid_input',
  invalid_declaration: 'invalid_input',
  unknown_category: 'unknown_category',
  provider_unavailable: 'unavailable',
} as const satisfies Record<
  Extract<AssetSettingsProjection, { kind: 'rejected' }>['reason'],
  Failure['reason']
>
/** A management view without named targets captures every holding except those of `scope.excluded`. */
export function assetsSettingsProjectionCommand(
  binding: SettingsProjectionBinding,
  scope: CaptureScope,
): FactCommandV2 {
  return captureFacts('capture', binding, scope)
}
export function assetsPublicationCommand(
  binding: SettingsProjectionBinding,
  scope: CaptureScope,
): FactCommandV2 {
  return captureFacts('capturePublication', binding, scope)
}
function publishCommand(
  options: AssetsLocalOptions,
  input: AssetsPublish,
  holding?: AssetsPublishAndHold['holding'],
) {
  if (!withinBudget(input)) return fail('limit_exceeded')
  const metadata = publishMetadataSchema.safeParse({
    operationId: input.operationId,
    assetRef: input.assetRef,
    expectedRevision: input.expectedRevision,
  })
  if (!metadata.success) return fail('invalid_input')
  const projection = projectAssetSettings(options.categories, {
    assetRef: metadata.data.assetRef,
    pinned: input.pinned,
  })
  if (projection.kind === 'rejected') return fail(PROJECTION_REJECTIONS[projection.reason])
  const declaration =
    projection.kind === 'none'
      ? projection
      : {
          kind: 'declared',
          definition: projection.definition,
          definitionRef: {
            providerId: projection.definition.providerId,
            definitionId: projection.definition.definitionId,
            version: projection.definition.version,
            digest: digest(projection.definition),
          },
        }
  const command = mutationSchema.safeParse({
    ...metadata.data,
    kind: holding === undefined ? 'publish' : 'publishAndHold',
    category: input.pinned.identity.category,
    name: input.pinned.identity.name,
    version: input.pinned.version,
    source: input.pinned.source,
    body: input.pinned.body,
    declaration,
    summary: summarizeVersion(options.categories, input.pinned),
    ...(holding === undefined ? {} : { holding }),
  })
  return command.success ? command.data : fail('invalid_input')
}
function sameCommand(command: Mutation): SameOperation {
  return recorded => equal(recorded, command)
}
/** A retry reads the asset revision anew, so the recorded expected revision is not part of the input. */
function samePublication(command: Mutation): SameOperation {
  const input = (mutation: Mutation) =>
    'expectedRevision' in mutation ? { ...mutation, expectedRevision: 0 } : mutation
  return recorded => equal(input(recorded), input(command))
}
type ReadKind =
  | 'asset'
  | 'holding'
  | 'version'
  | 'heldCapability'
  | 'summary'
  | 'domain'
  | 'list'
  | 'versions'

function storageRead(options: Pick<AssetsLocalOptions, 'storage' | 'domain'>) {
  return async (kind: ReadKind, lookup: unknown) => {
    const result = await options.storage.read({
      domain: options.domain,
      handler: kind === 'list' || kind === 'versions' ? LIST_HANDLER : HANDLER,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input: json({ kind, domain: options.domain, lookup }),
    })
    return result.kind === 'read'
      ? result.output
      : fail(
          result.kind === 'unavailable' && result.reason === 'closing' ? 'closing' : 'unavailable',
        )
  }
}

type Store = Pick<
  AssetsLocalOptions,
  'storage' | 'domain' | 'combinationVersion' | 'manifestDigest' | 'onCommitted'
>

function signal(options: Store, revision: number | undefined): void {
  if (revision === undefined) return
  try {
    options.onCommitted?.({ domain: options.domain, revision })
  } catch {
    return
  }
}

async function commitMutation(
  options: Store,
  command: Mutation,
  same: SameOperation = sameCommand(command),
): Promise<AssetsMutationResult> {
  try {
    const result = await options.storage.commit({
      identity: identity(options.domain, command.operationId),
      combinationVersion: options.combinationVersion,
      manifestDigest: options.manifestDigest,
      commands: [
        {
          participant: PARTICIPANT,
          facts: { kind: 'mutate', binding: json({ domain: options.domain, command }) },
        },
      ],
    })
    const mapped = receiptResult(result, options.domain, command.operationId, same)
    if (mapped.kind === 'committed' && mapped.changed)
      signal(options, freshDomainRevision(result, options.domain, command.operationId))
    return mapped.kind === 'not_found'
      ? { kind: 'unknown', operationId: command.operationId }
      : mapped
  } catch {
    return { kind: 'unknown', operationId: command.operationId }
  }
}

async function recallOperation(options: Store, operationId: string, same?: SameOperation) {
  try {
    return receiptResult(
      await options.storage.query(identity(options.domain, operationId)),
      options.domain,
      operationId,
      same,
    )
  } catch {
    return { kind: 'unknown' as const, operationId }
  }
}

export function createAssetsLocal(input: AssetsLocalOptions): AssetsLocal {
  const options = { ...input, domain: domainSchema.parse(input.domain) }
  if (options.domain.scope.kind !== 'tenant')
    throw new TypeError('Assets-local requires a tenant domain')
  SettingsIdSchema.parse(options.combinationVersion)
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(options.manifestDigest)
  const active = new Set<Promise<unknown>>()
  let closed: Promise<void> | undefined
  function run<T>(task: () => Promise<T>): Promise<T | Failure> {
    if (closed) return Promise.resolve(fail('closing'))
    const promise = Promise.resolve()
      .then(task)
      .catch(() => fail('unavailable'))
    active.add(promise)
    void promise.then(() => active.delete(promise))
    return promise
  }
  const commit = (command: Mutation, same?: SameOperation) => commitMutation(options, command, same)
  async function change(value: unknown): Promise<AssetsMutationResult> {
    if (!withinBudget(value)) return fail('limit_exceeded')
    const parsed = mutationSchema.safeParse(value)
    return parsed.success ? commit(parsed.data) : fail('invalid_input')
  }
  const read = storageRead(options)
  function lookup<T>(kind: ReadKind, schema: z.ZodType, result: z.ZodType<T>) {
    return (input: unknown) =>
      run(async () => {
        const parsed = schema.safeParse(input)
        return parsed.success ? result.parse(await read(kind, parsed.data)) : fail('invalid_input')
      })
  }
  const local: Omit<AssetsLocal, 'packages' | 'uploads'> = {
    readAsset: input =>
      run(async () => {
        const parsed = assetLookupSchema.safeParse(input)
        if (!parsed.success) return fail('invalid_input')
        const result = assetResultSchema.parse(await read('asset', parsed.data))
        if (
          result.kind === 'asset' &&
          (result.asset.assetRef !== parsed.data.assetRef ||
            !equal(result.asset.domain, options.domain))
        )
          return fail('unavailable')
        return result
      }),
    publish: input =>
      run(async () => {
        const command = publishCommand(options, input)
        return command.kind === 'rejected' ? command : commit(command)
      }),
    publishAndHold: input =>
      run(async () => {
        const { holding, ...published } = input
        const command = publishCommand(options, published, holding)
        return command.kind === 'rejected' ? command : commit(command, samePublication(command))
      }),
    hold: input =>
      run(async () => {
        if (!withinBudget(input)) return fail('limit_exceeded')
        const parsed = holdSchema.safeParse(input)
        return parsed.success ? change({ kind: 'hold', ...parsed.data }) : fail('invalid_input')
      }),
    changeHolding: input =>
      run(async () => {
        if (!withinBudget(input)) return fail('limit_exceeded')
        const parsed = changeHoldingSchema.safeParse(input)
        return parsed.success
          ? change({ kind: 'changeHolding', ...parsed.data })
          : fail('invalid_input')
      }),
    readHolding: lookup('holding', holdingLookupSchema, holdingResultSchema),
    readVersion: lookup('version', versionLookupSchema, versionResultSchema),
    readHeldCapability: input =>
      run(async () => {
        const parsed = heldCapabilityLookupSchema.safeParse({
          category: input.capability.category,
          name: input.capability.name,
        })
        return parsed.success
          ? holdingResultSchema.parse(await read('heldCapability', parsed.data))
          : fail('invalid_input')
      }),
    listHeld: lookup('list', listLookupSchema, listResultSchema),
    listVersions: lookup('versions', versionsLookupSchema, versionsResultSchema),
    readSummary: lookup('summary', versionLookupSchema, summaryResultSchema),
    domainRevision: () => run(async () => domainResultSchema.parse(await read('domain', null))),
    getOperation: operationId =>
      run(async () => {
        if (!SettingsIdSchema.safeParse(operationId).success) return fail('invalid_input')
        return recallOperation(options, operationId)
      }),
    recallPublication: operationId =>
      run(async () => {
        if (!SettingsIdSchema.safeParse(operationId).success) return fail('invalid_input')
        try {
          const queried = await options.storage.query(identity(options.domain, operationId))
          return publicationRecall(queried, options.domain, operationId)
        } catch {
          return { kind: 'unknown' as const, operationId }
        }
      }),
    recallChange: ({ operationId, holdingRef, change }) =>
      run(async () => {
        if (!SettingsIdSchema.safeParse(operationId).success) return fail('invalid_input')
        return recallOperation(
          options,
          operationId,
          recorded =>
            recorded.kind === 'changeHolding' &&
            recorded.holdingRef === holdingRef &&
            equal(recorded.change, change),
        )
      }),
    close() {
      return (closed ??= Promise.allSettled(active).then(() => undefined))
    },
  }
  const packages = createPublishedPackages({
    root: options.packageRoot,
    holdingScope: options.domain.scope.tenant,
    categories: options.categories,
    afterStep: options.afterPackageStep,
    durability: options.packageDurability,
    records: packageRecordsOf(local),
  })
  return { ...local, packages, uploads: uploadsOf(options) }
}

function uploadsOf(options: AssetsLocalOptions) {
  return createLocalUploads({
    root: options.uploads === undefined ? undefined : options.packageRoot,
    categories: options.categories,
    policy: options.uploads ?? { idleMs: 0, maxOpen: 0, partBytes: 0 },
    clock: options.clock,
  })
}

function packageRecordsOf(local: Omit<AssetsLocal, 'packages' | 'uploads'>): PackageRecords {
  return {
    publishAndHold: local.publishAndHold,
    async readAssetRevision(assetRef) {
      const result = await local.readAsset({ assetRef })
      if (result.kind === 'rejected') return { failure: result.reason }
      return { ok: result.kind === 'asset' ? result.asset.revision : 0 }
    },
    async readVersionRecord(assetRef, version) {
      const asset = await local.readAsset({ assetRef })
      if (asset.kind === 'rejected') return { failure: asset.reason }
      if (asset.kind === 'absent') return { ok: undefined }
      const result = await local.readVersion({ assetRef, version })
      if (result.kind === 'rejected') return { failure: result.reason }
      if (result.kind === 'absent') return { ok: undefined }
      const { category, name, body } = result.version
      return { ok: { category, name, body } }
    },
  }
}
