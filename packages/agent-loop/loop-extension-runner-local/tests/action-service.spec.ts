// @module-tag slow
// Real SQL manifest, version history, JSONL and service dispatch. Model origin and access use explicit fixtures.
import { expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import {
  encodeRunnerAdmissionToken,
  type OfficialAdmissionContribution,
  type RunnerServiceHost,
} from '@omne-harness-lite/loop-extension-runner'
import type { AdmissionResult } from '@omne-harness-lite/tool-admission'
import { createLoopExtensionRunner } from '../src/service.ts'
import { batchHost, piece } from './action-support.ts'
import { chainHost } from './runner-chain-support.ts'

test('the service captures a real manifest chain, authorizes the host source and replays actions without judgment', async () => {
  const facts = await chainHost([piece('example:guard', 'observe'), piece()])
  const h = await batchHost(undefined, undefined, {
    tenant: facts.binding.tenant,
    session: unwrap(parseOpaqueIdentifier(facts.binding.session, 'SessionRef')),
  })
  const release = vi.fn()
  const host: RunnerServiceHost = {
    acquireDispatch: vi.fn(async () => ({ ...h.scope, sources: facts.sources, release })),
    acquireReplay: vi.fn(async () => ({ ...h.scope, sources: facts.sources, release })),
  }
  const authorize = vi.spyOn(h.access, 'authorize')
  const service = createLoopExtensionRunner({
    log: h.log,
    host,
    access: h.access,
    isActive: () => true,
  })
  const judge = vi.fn<OfficialAdmissionContribution>(async (access, scope, pass, batch) => {
    const source = await service.admissionPassSource.read(access, scope, pass)
    if (source.kind !== 'found') return { kind: 'failed', reason: 'unavailable' }
    return {
      kind: 'decisions',
      results: batch.map((candidate, index): AdmissionResult => {
        const token = encodeRunnerAdmissionToken(candidate.call, source.record.finalKeys[index])
        if (typeof token !== 'string') throw new Error('Invalid formal locator')
        return { kind: 'allow', token }
      }) as [AdmissionResult, ...AdmissionResult[]],
    }
  })
  service.implementations.registerAdmission(judge)
  const ordinary = vi.fn(async () => ({ kind: 'output' as const, value: { kind: 'observed' } }))
  service.implementations.registerBuiltin('example:guard', ordinary)
  try {
    expect(
      await facts.registry.fill(
        facts.binding.session,
        facts.evaluation,
        'evaluation_one',
        facts.order,
      ),
    ).toHaveProperty('snapshots')
    const result = await service.runner.dispatch(h.request, new AbortController().signal)
    expect(result).toMatchObject({
      gate: { kind: 'available' },
      admissions: [
        { callId: 'a', token: expect.any(String) },
        { callId: 'b', token: expect.any(String) },
      ],
    })
    expect(judge).toHaveBeenCalledTimes(1)
    expect(ordinary).toHaveBeenCalledTimes(2)
    expect(authorize).toHaveBeenCalledWith(h.source.access, h.source.scope, 'run.advance')
    const append = vi.spyOn(h.log, 'append')
    judge.mockClear()
    ordinary.mockClear()
    authorize.mockClear()
    const replay = await service.runner.replay({
      position: 'before_action',
      subject: h.request.actions[0]!,
      anchor: h.request.anchors[0]!,
      manifest: h.request.manifest,
      run: h.request.run,
    })
    expect(replay).toEqual('failure' in result ? undefined : result.results[0]?.conclusions)
    expect(judge).not.toHaveBeenCalled()
    expect(ordinary).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
    expect(authorize).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(2)

    authorize.mockResolvedValue({ kind: 'rejected', reason: 'notAuthorized' })
    expect(await service.runner.dispatch(h.request, new AbortController().signal)).toEqual({
      failure: 'unavailable',
    })
    expect(judge).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(3)
  } finally {
    service.closeAdmission()
    await service.drain()
    await h.close()
    await facts.close()
  }
})
