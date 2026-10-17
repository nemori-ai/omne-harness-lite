import { expectTypeOf, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  MODEL_IDENTITY_MAX_LENGTH,
  MODEL_IDENTITY_PREFIXES,
  compareOutputCursors,
  compareRevisions,
  decodeDispatchId,
  decodeModelCallId,
  decodeModelDiagnosticCursor,
  decodeModelDiagnosticId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeReadId,
  decodeResultVersion,
  decodeRevision,
} from '@omne-harness/model-contract'
import type {
  Access,
  ActorRef,
  Adoption,
  Admit,
  CallAccess,
  ConsumerRef,
  DispatchId,
  FixedModelRequest,
  Identity,
  ModelCallId,
  ModelDiagnosticCursor,
  ModelDiagnosticId,
  ModelIdentityKey,
  ModelIdentityRejection,
  ModelInstanceId,
  ModelOperationId,
  Mutation,
  OutputCursor,
  Parameter,
  ReadId,
  ResultCapacity,
  ResultVersion,
  Revision,
  Supplier,
  ToolDeclaration,
} from '@omne-harness/model-contract'
import {
  call,
  capacity,
  consumer,
  credential,
  cursor,
  instance,
  json,
  operation,
  request,
  revision,
  supplier,
  tenant,
} from './values.ts'

it('every brand is the Identity of its own key and is also a string', () => {
  expectTypeOf<ModelCallId>().toEqualTypeOf<Identity<'ModelCallId'>>()
  expectTypeOf<DispatchId>().toEqualTypeOf<Identity<'ModelDispatchId'>>()
  expectTypeOf<ModelInstanceId>().toEqualTypeOf<Identity<'ModelInstanceId'>>()
  expectTypeOf<ModelOperationId>().toEqualTypeOf<Identity<'ModelOperationId'>>()
  expectTypeOf<ResultVersion>().toEqualTypeOf<Identity<'ModelResultVersion'>>()
  expectTypeOf<OutputCursor>().toEqualTypeOf<Identity<'ModelOutputCursor'>>()
  expectTypeOf<ReadId>().toEqualTypeOf<Identity<'ModelReadId'>>()
  expectTypeOf<Revision>().toEqualTypeOf<Identity<'ModelRevision'>>()
  expectTypeOf<ModelCallId>().toExtend<string>()
})

it('a plain string and another brand are not accepted where a brand is required', () => {
  // @ts-expect-error a string is not a ModelCallId
  const fromString: ModelCallId = 'mcall_1'
  // @ts-expect-error a ModelInstanceId is not a ModelCallId
  const instanceAsCall: ModelCallId = instance
  // @ts-expect-error a ModelCallId is not a DispatchId
  const callAsDispatch: DispatchId = call
  // @ts-expect-error a Revision is not an OutputCursor
  const revisionAsCursor: OutputCursor = revision
  void [fromString, instanceAsCall, callAsDispatch, revisionAsCursor]
  expectTypeOf<string>().not.toExtend<ModelOperationId>()
  expectTypeOf<ModelCallId>().not.toExtend<ModelOperationId>()
  expectTypeOf<Revision>().not.toExtend<OutputCursor>()
})

it('ModelIdentityKey lists the eleven brand keys and no exported type name', () => {
  expectTypeOf<ModelIdentityKey>().toEqualTypeOf<
    | 'ModelCallId'
    | 'ModelDispatchId'
    | 'ModelInstanceId'
    | 'ModelOperationId'
    | 'ModelReadId'
    | 'ModelDiagnosticId'
    | 'ModelDiagnosticCursor'
    | 'ModelRevision'
    | 'ModelResultVersion'
    | 'ModelOutputCursor'
    | 'ModelCredentialId'
  >()
  expectTypeOf<'DispatchId'>().not.toExtend<ModelIdentityKey>()
})

// @ts-expect-error DispatchId is the exported type name, not a brand key
type ByTypeName = ModelIdentityRejection<'DispatchId'>

it('ModelIdentityRejection carries the brand key and a closed reason', () => {
  expectTypeOf<
    ModelIdentityRejection<'ModelDispatchId'>['field']
  >().toEqualTypeOf<'ModelDispatchId'>()
  expectTypeOf<ModelIdentityRejection<'ModelRevision'>['reason']>().toEqualTypeOf<
    'type' | 'empty' | 'length' | 'prefix' | 'character' | 'leading-zero'
  >()
  const rejected: ModelIdentityRejection<'ModelCallId'> = { field: 'ModelCallId', reason: 'prefix' }
  const wrongField: ModelIdentityRejection<'ModelCallId'> = {
    // @ts-expect-error a field of another brand
    field: 'ModelDispatchId',
    reason: 'type',
  }
  const wrongReason: ModelIdentityRejection<'ModelCallId'> = {
    field: 'ModelCallId',
    // @ts-expect-error an unlisted reason
    reason: 'blank',
  }
  expectTypeOf<ByTypeName['field']>().toBeString()
  void [rejected, wrongField, wrongReason]
})

it('adoption, consumer and actor references are plain readonly records', () => {
  const adoption: Adoption = { owner: 'o', name: 'n', revision: '1', digest: 'd' }
  const ref: ConsumerRef = consumer
  const actor: ActorRef = { owner: 'o', subject: 's', revision: '1' }
  // @ts-expect-error digest is required
  const noDigest: Adoption = { owner: 'o', name: 'n', revision: '1' }
  void [adoption, ref, actor, noDigest]
})

it('access inputs carry the tenant and nest the call and the operation', () => {
  const access: Access<string> = { principal: 'p', tenant }
  const callAccess: CallAccess<string> = { ...access, call }
  const mutation: Mutation<string> = { ...callAccess, operation }
  expectTypeOf(mutation.operation).toEqualTypeOf<ModelOperationId>()
  expectTypeOf<Mutation<string>>().toExtend<CallAccess<string>>()
  // @ts-expect-error the tenant is required
  const noTenant: Access<string> = { principal: 'p' }
  // @ts-expect-error an instance is not a call
  const instanceAsCall: CallAccess<string> = { ...access, call: instance }
  // @ts-expect-error a plain string is not an operation
  const loose: Mutation<string> = { ...callAccess, operation: 'op' }
  void [noTenant, instanceAsCall, loose]
  expectTypeOf<TenantId>().toEqualTypeOf<Access<string>['tenant']>()
})

it('Parameter is a closed union of kinds', () => {
  const values: Parameter[] = [
    { kind: 'temperature', value: 0.2 },
    { kind: 'top-p', value: 0.9 },
    { kind: 'max-output-tokens', value: '128' },
    { kind: 'stop', value: ['end'] },
    {
      kind: 'extension',
      definition: { owner: 'o', name: 'n', revision: '1', digest: 'd' },
      value: json,
    },
  ]
  // @ts-expect-error a limit is a decimal string
  const numeric: Parameter = { kind: 'max-output-tokens', value: 128 }
  // @ts-expect-error an unlisted kind
  const unknownKind: Parameter = { kind: 'seed', value: 1 }
  void [values, numeric, unknownKind]
})

it('a request value names its suppliers, tools and capacity', () => {
  const declaration: ToolDeclaration = { name: 'n', description: 'd', argumentsSchema: json }
  const capacities: ResultCapacity = capacity
  const route: Supplier['credential'][] = [{ kind: 'tenant', id: credential }, { kind: 'factory' }]
  // @ts-expect-error a credential kind outside tenant and factory
  const secret: Supplier['credential'] = { kind: 'secret', id: credential }
  // @ts-expect-error a plain string is not a credential id
  const loose: Supplier['credential'] = { kind: 'tenant', id: 'c' }
  // @ts-expect-error a request needs at least one supplier
  const noSupplier: FixedModelRequest = { ...request, suppliers: [] }
  void [declaration, capacities, route, secret, loose, noSupplier]
  expectTypeOf(request.suppliers[0]).toEqualTypeOf<Supplier>()
  expectTypeOf(supplier).toEqualTypeOf<Supplier>()
})

it('Admit combines the mutation, the fixed request, the consumer and the capacity', () => {
  const admit: Admit<string> = {
    principal: 'p',
    tenant,
    call,
    operation,
    request,
    consumer,
    capacity,
  }
  // @ts-expect-error the consumer reference is required
  const noConsumer: Admit<string> = { principal: 'p', tenant, call, operation, request, capacity }
  void [admit, noConsumer]
})

it('each decoder returns its own brand and a rejection that names the brand key', () => {
  expectTypeOf(decodeModelCallId).toEqualTypeOf<
    (text: unknown) => Outcome<ModelCallId, ModelIdentityRejection<'ModelCallId'>>
  >()
  expectTypeOf(decodeDispatchId).toEqualTypeOf<
    (text: unknown) => Outcome<DispatchId, ModelIdentityRejection<'ModelDispatchId'>>
  >()
  expectTypeOf(decodeModelInstanceId).toEqualTypeOf<
    (text: unknown) => Outcome<ModelInstanceId, ModelIdentityRejection<'ModelInstanceId'>>
  >()
  expectTypeOf(decodeModelOperationId).toEqualTypeOf<
    (text: unknown) => Outcome<ModelOperationId, ModelIdentityRejection<'ModelOperationId'>>
  >()
  expectTypeOf(decodeReadId).toEqualTypeOf<
    (text: unknown) => Outcome<ReadId, ModelIdentityRejection<'ModelReadId'>>
  >()
  expectTypeOf(decodeResultVersion).toEqualTypeOf<
    (text: unknown) => Outcome<ResultVersion, ModelIdentityRejection<'ModelResultVersion'>>
  >()
  expectTypeOf(decodeRevision).toEqualTypeOf<
    (text: unknown) => Outcome<Revision, ModelIdentityRejection<'ModelRevision'>>
  >()
  expectTypeOf(decodeOutputCursor).toEqualTypeOf<
    (text: unknown) => Outcome<OutputCursor, ModelIdentityRejection<'ModelOutputCursor'>>
  >()
  expectTypeOf(decodeModelDiagnosticId).toEqualTypeOf<
    (text: unknown) => Outcome<ModelDiagnosticId, ModelIdentityRejection<'ModelDiagnosticId'>>
  >()
  expectTypeOf(decodeModelDiagnosticCursor).toEqualTypeOf<
    (
      text: unknown,
    ) => Outcome<ModelDiagnosticCursor, ModelIdentityRejection<'ModelDiagnosticCursor'>>
  >()
})

it('a decoded value goes into Access, CallAccess and Mutation, and a dispatch does not', () => {
  const decodedCall = decodeModelCallId('mcall_a')
  const decodedOperation = decodeModelOperationId('mop_a')
  if ('ok' in decodedCall && 'ok' in decodedOperation) {
    const callAccess: CallAccess<string> = { principal: 'p', tenant, call: decodedCall.ok }
    const mutation: Mutation<string> = { ...callAccess, operation: decodedOperation.ok }
    void mutation
  }
  const decodedDispatch = decodeDispatchId('mdisp_a')
  if ('ok' in decodedDispatch) {
    // @ts-expect-error a decoded DispatchId is not a call
    const wrong: CallAccess<string> = { principal: 'p', tenant, call: decodedDispatch.ok }
    void wrong
  }
})

it('the comparators take the brand of their own sequence only', () => {
  expectTypeOf(compareRevisions).toEqualTypeOf<(left: Revision, right: Revision) => -1 | 0 | 1>()
  expectTypeOf(compareOutputCursors).toEqualTypeOf<
    (left: OutputCursor, right: OutputCursor) => -1 | 0 | 1
  >()
  // @ts-expect-error a cursor is not a revision
  compareRevisions(cursor, cursor)
  // @ts-expect-error a revision is not a cursor
  compareOutputCursors(revision, revision)
  // @ts-expect-error a plain string is not a revision
  compareRevisions('1', '2')
})

it('the limit and the prefix table are literal values, and no other helper is published', () => {
  expectTypeOf<typeof MODEL_IDENTITY_MAX_LENGTH>().toEqualTypeOf<256>()
  expectTypeOf<(typeof MODEL_IDENTITY_PREFIXES)['ModelCallId']>().toEqualTypeOf<'mcall_'>()
  // @ts-expect-error the package publishes no comparator for result versions
  void import('@omne-harness/model-contract').then(root => root.compareResultVersions)
})
