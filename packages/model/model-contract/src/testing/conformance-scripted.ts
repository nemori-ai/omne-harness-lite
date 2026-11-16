import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import type { ModelCallId } from '../index.ts'
import { DEFAULT_REQUEST, DEFAULT_SUPPLIER } from '../conformance/conformance-defaults.ts'
import { instanceId, operationId, versionId } from '../conformance/conformance-kit.ts'
import type { ConformanceHooks, ConformanceSubject } from '../conformance/conformance-types.ts'
import { createScriptedModelProvider } from './provider.ts'
import { createScriptedTransport } from './transport.ts'

export type ScriptedPrincipal = Readonly<{ name: string }>

function tenantOf(account: string, organization: string) {
  const parsedAccount = accountCodec.parse(account)
  const parsedOrganization = organizationCodec.parse(organization)
  if (!parsedAccount.ok || !parsedOrganization.ok)
    throw new RangeError('the scripted conformance subject was given a bad tenant text')
  return tenant(parsedOrganization.value, parsedAccount.value)
}

export function createScriptedConformanceSubject(): ConformanceSubject<ScriptedPrincipal> {
  const principal: ScriptedPrincipal = { name: 'conformance' }
  const { provider, controller } = createScriptedModelProvider<ScriptedPrincipal>({
    instance: instanceId('one'),
  })
  const settled = new Set<ModelCallId>()

  const hooks: ConformanceHooks<ScriptedPrincipal> = {
    async startRun(input) {
      controller.start({ ...input, firstContent: 'none-proven' })
      controller.recordDispatch({
        tenant: input.tenant,
        call: input.call,
        record: {
          dispatch: input.dispatch,
          supplier: DEFAULT_SUPPLIER,
          intent: operationId(`intent-${input.dispatch}`),
          send: 'started',
          firstContent: 'none-proven',
          terminal: null,
          account: null,
          materialization: null,
        },
      })
    },
    async showFacts(input) {
      controller.play(input)
    },
    async settleCall(input) {
      if (settled.has(input.call)) return
      controller.settle({
        tenant: input.tenant,
        call: input.call,
        version: versionId(input.call),
        termination: input.termination,
        parts: input.parts,
        source: {
          owner: 'conformance',
          record: `settlement-${input.call}`,
          revision: '1',
          digest: `digest-settlement-${input.call}`,
        },
        pageSize: input.pageSize,
        pageTargetBytes: input.pageTargetBytes,
      })
      settled.add(input.call)
    },
    async provideEvidence(input) {
      const evidence = {
        owner: 'conformance',
        record: `${input.call}-${input.label}`,
        revision: '1',
        digest: `digest-${input.call}-${input.label}`,
      }
      controller.expectEvidence({ tenant: input.tenant, call: input.call, evidence })
      return evidence
    },
    async failNextWrite(input) {
      controller.commitUnknown({ ...input, query: 'answers' })
    },
    async advanceCleanup(input) {
      controller.setCleanup({ ...input, cleanup: 'released', diagnostic: null })
    },
    async blockCleanup(input) {
      controller.setCleanup({
        ...input,
        cleanup: 'blocked',
        diagnostic: 'the cleanup cannot go on',
      })
    },
    async withdrawInstance(input) {
      controller.withdrawInstance(input)
    },
    async replaceInstance(input) {
      controller.replaceInstance(input)
    },
    async disconnectObservers(input) {
      controller.disconnectObservers(input)
    },
    async revokeAccess(input) {
      controller.revokeAccess({
        tenant: input.tenant,
        call: input.call,
        principal: input.principal,
        actions: input.action === 'all' ? 'all' : [input.action],
      })
    },
    async failDirectory() {
      controller.failDirectory()
    },
  }

  const scriptedTransport = createScriptedTransport({
    receipt: {
      supplier: DEFAULT_SUPPLIER.adoption,
      representation: DEFAULT_REQUEST.representation,
      payloadDigest: 'payload-digest',
    },
    facts: [
      { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
      { kind: 'block-delta', index: '0', delta: 'hello' },
    ],
    ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
    rejection: null,
  })

  return {
    provider,
    principal,
    tenant: tenantOf('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345'),
    otherTenant: tenantOf('acc_abcdefghjkmnpqrstvwxyz2346', 'org_abcdefghjkmnpqrstvwxyz2346'),
    hooks,
    transport: {
      transport: scriptedTransport.transport,
      sends: () => Math.min(scriptedTransport.counts().start, 1),
    },
  }
}
