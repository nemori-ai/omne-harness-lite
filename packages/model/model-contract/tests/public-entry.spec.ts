import { fileURLToPath } from 'node:url'
import ts from '@typescript/typescript6'
import { expect, it } from 'vitest'

// The grouping of the two entries follows the rules of tool-contract SPEC「公开入口的分组」, recorded
// for this package in docs/public-api.md「提供者协议入口」. The import scan and the closure table of
// the split are in the PR that changed the grouping (tmp/issue-683/scan.md), not here.

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))

/** Every export name of a built declaration entry, `export *` chains resolved, types included. */
function exportedNames(declaration: string): string[] {
  const path = `${packageDirectory}dist/${declaration}`
  const program = ts.createProgram([path], { noEmit: true, skipLibCheck: true, types: [] })
  const checker = program.getTypeChecker()
  const file = program.getSourceFile(path)
  const module = file === undefined ? undefined : checker.getSymbolAtLocation(file)
  if (module === undefined) throw new Error(`${path} is not a built module declaration`)
  return checker
    .getExportsOfModule(module)
    .map(symbol => symbol.name)
    .sort()
}

it('the root entry exports exactly the runtime values of the consumer face', async () => {
  const root = (await import('@omne-harness/model-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      'MODEL_IDENTITY_MAX_LENGTH',
      'MODEL_IDENTITY_PREFIXES',
      'MODEL_REFERENCE_MAX_LENGTH',
      'applyModelStreamDelta',
      'compareOutputCursors',
      'decodeDispatchId',
      'decodeModelCallId',
      'decodeModelDiagnosticCursor',
      'decodeModelDiagnosticId',
      'decodeModelInstanceId',
      'decodeModelInvocationRef',
      'decodeModelOperationId',
      'decodeOutputCursor',
      'decodeResultVersion',
      'decodeRevision',
      'deriveGuardControlOperation',
      'diffModelStream',
      'encodeModelInvocationRef',
      'judgeModelDelivery',
      'resolveModelInvocationRef',
    ].sort(),
  )
})

it('the provider entry exports exactly the runtime values of the provider protocol, and none of the root', async () => {
  const provider = (await import('@omne-harness/model-contract/provider')) as Record<
    string,
    unknown
  >
  expect(Object.keys(provider).sort()).toEqual(
    [
      'MODEL_INPUT_LIMITS',
      'MODEL_SEND',
      'compareRevisions',
      'continuedMessages',
      'decodeCredentialId',
      'decodeModelOperationRef',
      'decodeReadId',
      'encodeModelOperationRef',
      'judgeAdmit',
      'judgeFixedModelRequest',
      'judgeReplayDeclaration',
      'projectReplay',
      'resolveModelOperationRef',
      'sameCredentialHolder',
    ].sort(),
  )
  const root = (await import('@omne-harness/model-contract')) as Record<string, unknown>
  for (const name of Object.keys(provider)) expect(Object.keys(root)).not.toContain(name)
})

it('exports every name, type or value, from exactly one of the root and provider entries', () => {
  // Rule 5: the root is not empty. 「一名一入口」: no name is on both built entries. The exact
  // name lists of each entry are the export inventory (tests/exports.spec.ts).
  const root = exportedNames('index.d.ts')
  const provider = exportedNames('provider/index.d.ts')
  expect(root.length).toBeGreaterThan(0)
  expect(provider.length).toBeGreaterThan(0)
  expect(new Set(root).size).toBe(root.length)
  expect(new Set(provider).size).toBe(provider.length)
  expect(root.filter(name => provider.includes(name))).toEqual([])
})

it('keeps the testing and conformance names off the provider entry', async () => {
  // Rule 7: the provider entry exports no double and no suite.
  const provider = exportedNames('provider/index.d.ts')
  const testing = exportedNames('testing/index.d.ts')
  const conformance = exportedNames('conformance/index.d.ts')
  expect(provider.filter(name => testing.includes(name))).toEqual([])
  expect(provider.filter(name => conformance.includes(name))).toEqual([])
  const runtime = await import('@omne-harness/model-contract/provider')
  expect(Object.keys(runtime)).not.toContain('createScriptedModelProvider')
  expect(Object.keys(runtime)).not.toContain('checkModelProviderConformance')
})
