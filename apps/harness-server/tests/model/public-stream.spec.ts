// @module-tag slow
// The public Model stream on the release tree (#1214, RFC-0015 §8「会话观察」). Slow: each case
// starts the release tree in this process and runs the `omne` CLI as child processes. The Model
// supplier is the local HTTPS gateway the release-tree scenarios use.
import { describe, expect, it } from 'vitest'
import { onReleaseTree, pollUntil } from '../support/release-tree.ts'
import { loginAccess, newestMainCall, publicStream, textAnswer } from './public-stream-support.ts'

describe('the public Model stream on the release tree', () => {
  it('publishes modelStreamReferences and modelStreamObservation (defect: the host row opens no observation)', async () => {
    await onReleaseTree({ script: textAnswer('done') }, async tree => {
      const { references, observation } = publicStream(tree.scope)
      expect(references, 'modelStreamReferences').toBeDefined()
      expect(observation, 'modelStreamObservation').toBeDefined()
    })
  })

  it('answers the login principal of the person by the Model authorization table: current is denied', async () => {
    await onReleaseTree({ script: textAnswer('done') }, async tree => {
      const session = await tree.startSession('say done')
      const access = await loginAccess(tree)
      const reference = await pollUntil(
        'the main call registration',
        () => newestMainCall(tree.scope, access, session),
        found => found !== null,
      )
      if (reference === null) throw new Error('unreachable')
      const { references } = publicStream(tree.scope)
      if (references === undefined) throw new Error('modelStreamReferences is not installed')
      expect(await references.current({ access, reference })).toEqual({
        failure: { kind: 'denied', action: 'current' },
      })
    })
  })
})
