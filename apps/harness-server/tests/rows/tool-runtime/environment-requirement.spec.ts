import { expect, it } from 'vitest'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { canonicalDigest } from '@omne-harness/tool'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { createReleaseToolIdentity } from '../../../src/rows/tool-runtime/access.ts'
import {
  createReleaseEnvironment,
  RELEASE_ENVIRONMENT_ADOPTION,
} from '../../../src/rows/tool-runtime/environment.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'
import { okOf } from '../../entry/support.ts'

it.each(['Tools', 'TodoItems', 'Web'] as const)(
  'prepares %s with no file or command facilities when it declares no environment',
  async name => {
    const w = await forwardWorld()
    try {
      const holder = toolRuntimeHolder(w.fixture.root)
      const environment = createReleaseEnvironment(holder, createReleaseToolIdentity(holder), {
        filesRoot: '/unused',
        commitAttempts: 4,
        schemaProvider: () => null,
      })
      const request = w.request(name)
      expect(request.environment).toBeNull()
      const answer = await environment.input.plan.requirement({
        principal: w.principal,
        tenant: w.tenant,
        call: w.call,
        preparation: {
          tenant: w.tenant,
          call: w.call,
          operation: okOf(decodeToolOperationId('prepare-no-facilities'), 'operation'),
          adoption: RELEASE_ENVIRONMENT_ADOPTION,
          inputDigest: canonicalDigest(request),
          purpose: 'initial',
          request,
        },
      })
      expect(answer).toEqual({
        ok: { allowedBindings: [{ kind: 'host_machine' }], facilities: [], isolation: [] },
      })
      const files = w.request('Files')
      expect(
        await environment.input.plan.requirement({
          principal: w.principal,
          tenant: w.tenant,
          call: w.call,
          preparation: {
            tenant: w.tenant,
            call: w.call,
            operation: okOf(decodeToolOperationId('prepare-files'), 'operation'),
            adoption: RELEASE_ENVIRONMENT_ADOPTION,
            inputDigest: canonicalDigest(files),
            purpose: 'initial',
            request: files,
          },
        }),
      ).toMatchObject({ failure: { kind: 'unavailable' } })
    } finally {
      await w.close()
    }
  },
)
