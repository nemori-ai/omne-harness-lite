import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type EnvironmentBinding,
  type OutputChunk,
  type ProviderAcquireInput,
} from '@omne-harness/execution-environment-contract'
import {
  createMemoryFileSystem,
  createMemoryResourceLedger,
  createScriptedCommandFacility,
  createScriptedEnvironmentProvider,
  environmentProviderConformance,
  runConformanceCase,
  type ProviderConformanceSubject,
} from '@omne-harness/execution-environment-contract/testing'

const tenant = (() => {
  const t = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!t.ok) throw new Error('tenant fixture')
  return t.value
})()
const binding: EnvironmentBinding = { kind: 'host_machine' }
const origin = originRef('tool-round-trip')
const access = { principal: 'tool', tenant }
const scopeRef = 'round-trip'
function isScope(value: string): value is ProviderAcquireInput['scope']['ref'] {
  return value.length > 0
}
if (!isScope(scopeRef)) throw new Error('scope fixture')
const scope: ProviderAcquireInput['scope'] = { ref: scopeRef }
const text = new TextEncoder()
const bytes = (value: string) => text.encode(value)
let sequence = 0
const request = () => ({ requestId: `r${++sequence}`, access, origin, binding })

/** The two doubles in one scripted provider, put together the way #790 does. */
function environment() {
  const fs = createMemoryFileSystem({ files: { 'notes.txt': 'hello' } })
  const cmd = createScriptedCommandFacility(() => ({
    kind: 'started',
    output: [{ stream: 'stdout', data: 'ok\n' }],
  }))
  const provider = createScriptedEnvironmentProvider({
    facilities: ['files', 'command'],
    isolation: ['filesystem-root'],
    lease: { files: fs.facility, command: cmd.facility },
    async retire() {
      fs.close()
      cmd.close()
      return { kind: 'drained' }
    },
  })
  const input: ProviderAcquireInput = {
    acquisition: acquisitionRef('round-trip'),
    origin,
    tenant,
    scope,
    ledger: createMemoryResourceLedger().ledger,
    placement: {
      kind: 'placement',
      binding,
      requirement: {
        allowedBindings: [binding],
        facilities: ['files', 'command'],
        isolation: ['filesystem-root'],
      },
      provider: { name: provider.name, generation: provider.generation, version: provider.version },
      continuity: provider.continuity,
      quotaDomain: provider.quotaDomain,
    },
  }
  return { fs, provider, input }
}

it('writes a file, reads it back, refuses a stale version and a path outside the root, then runs a command', async () => {
  const { fs, provider, input } = environment()
  const receipt = await provider.acquire(input)
  if (receipt.kind !== 'acquired') throw new Error(receipt.kind)
  const files = receipt.lease.facility('files')
  const command = receipt.lease.facility('command')
  if (!files || !command) throw new Error('lease lacks a facility')

  const before = await files.read({
    ...request(),
    path: 'notes.txt',
    named: fs.objectToken('notes.txt') ?? null,
  })
  if (before.kind !== 'done') throw new Error(before.kind)
  const written = await files.write({
    ...request(),
    path: 'notes.txt',
    named: fs.objectToken('notes.txt') ?? null,
    bytes: bytes('hello world'),
    mode: 'replace',
    expectedVersion: before.value.version,
  })
  expect(written.kind).toBe('done')
  const after = await files.read({
    ...request(),
    path: 'notes.txt',
    named: fs.objectToken('notes.txt') ?? null,
  })
  expect(after).toMatchObject({ kind: 'done', value: { bytes: bytes('hello world') } })

  const stale = await files.write({
    ...request(),
    path: 'notes.txt',
    named: fs.objectToken('notes.txt') ?? null,
    bytes: bytes('lost update'),
    mode: 'replace',
    expectedVersion: before.value.version,
  })
  expect(stale).toMatchObject({ kind: 'rejected', reason: 'conflict' })
  const outside = await files.write({
    ...request(),
    path: '../outside.txt',
    named: fs.objectToken('') ?? null,
    bytes: bytes('x'),
    mode: 'create',
  })
  expect(outside).toMatchObject({ kind: 'rejected', reason: 'notAuthorized' })
  expect(fs.peek('notes.txt')).toEqual(bytes('hello world'))

  const started = await command.start({
    ...request(),
    executable: 'cat',
    args: ['notes.txt'],
    cwd: '.',
    env: {},
    outputMode: 'separate',
  })
  if (started.kind !== 'done') throw new Error(started.kind)
  const chunks: OutputChunk[] = []
  for await (const chunk of started.value.output) chunks.push(chunk)
  expect(chunks).toEqual([{ stream: 'stdout', data: bytes('ok\n'), observedOffset: 0 }])
  expect(await started.value.result).toMatchObject({
    kind: 'completed',
    exit: { kind: 'code', code: 0 },
  })

  await provider.retire()
  expect(
    await files.read({
      ...request(),
      path: 'notes.txt',
      named: fs.objectToken('notes.txt') ?? null,
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'closed' })
  expect(
    await command.start({
      ...request(),
      executable: 'true',
      args: [],
      cwd: '.',
      env: {},
      outputMode: 'separate',
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'closed' })
})

/** The provider suite with the memory file system as the held facility. */
function filesSubject(): ProviderConformanceSubject {
  const fs = createMemoryFileSystem({ files: { 'held.txt': 'before' } })
  const provider = createScriptedEnvironmentProvider({
    facilities: ['files'],
    lease: { files: fs.facility },
    async retire() {
      fs.close()
      return { kind: 'drained' }
    },
  })
  return {
    provider,
    binding,
    scope,
    tenant,
    facility: 'files',
    hooks: {
      async prepareHeldOperation({ lease, input }) {
        const files = lease.facility('files')
        if (!files) throw new Error('missing files')
        return {
          run: () =>
            files.write({
              requestId: 'late-write',
              access: { principal: 'suite', tenant },
              origin: input.origin,
              binding: input.placement.binding,
              path: 'held.txt',
              named: fs.objectToken('held.txt') ?? null,
              bytes: bytes('after'),
              mode: 'replace',
            }),
          async effectSnapshot() {
            return fs.peek('held.txt')
          },
        }
      },
    },
    async dispose() {
      await provider.retire()
    },
  }
}

it('passes the provider suite with the memory file system as the held facility', async () => {
  const verdicts = []
  for (const test of environmentProviderConformance({ subject: filesSubject }))
    verdicts.push(await runConformanceCase(test))
  const notApplicable = verdicts.filter(v => v.status === 'not-applicable').map(v => v.name)
  // The double gives no in-flight hold hook, so only the drain case does not apply.
  expect(notApplicable).toEqual(['V-EE18.retire-waits-for-in-flight'])
  expect(
    verdicts.find(v => v.name === 'V-EE18.held-facility-refuses-new-operations-after-retire'),
  ).toEqual({ name: 'V-EE18.held-facility-refuses-new-operations-after-retire', status: 'pass' })
  expect(verdicts).toHaveLength(16)
})

it('fails the retire case when the provider does not close the memory file system', async () => {
  const broken = (): ProviderConformanceSubject => {
    const subject = filesSubject()
    subject.provider.retire = async () => ({ kind: 'drained' })
    return subject
  }
  const test = environmentProviderConformance({ subject: broken }).find(
    t => t.name === 'V-EE18.held-facility-refuses-new-operations-after-retire',
  )
  if (!test) throw new Error('missing case')
  await expect(runConformanceCase(test)).rejects.toThrow()
})
