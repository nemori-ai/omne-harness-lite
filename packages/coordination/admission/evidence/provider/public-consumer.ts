import { createAdmissionCoordinator } from '@omne-harness-lite/admission'
import type {
  AdmissionCoordinator,
  AdmissionHost,
  CommittedNotice,
  ExactUse,
  OwnerPublication,
  PreparedAdmission,
} from '@omne-harness-lite/admission'
import type { Diagnostics } from '@omne-harness-lite/diagnostics'
import type { PreparedCommit, RecordWriter } from '@omne-harness-lite/records'

declare const writer: RecordWriter
declare const diagnostics: Diagnostics
declare const commit: PreparedCommit

const host: AdmissionHost = createAdmissionCoordinator(writer, diagnostics)
const issuer = host.createUseIssuer('runtime-owner')
const use: ExactUse = issuer.capture(
  { resourceId: 'resource', generation: 'generation', epoch: 'epoch' },
  {
    retainAt: () => undefined,
    release: async () => ({ status: 'released' }),
  },
)
const publication: OwnerPublication = {
  owner: 'records-owner',
  publishLogical: () => undefined,
  publishDurable: () => undefined,
}
const admission: PreparedAdmission = {
  composition: 'action_execution',
  commit,
  publications: [publication],
  uses: [use],
}

host.coordinator.enter(frame => host.coordinator.submit(frame, admission))

const unsubscribe: ReturnType<AdmissionHost['subscribeCommitted']> = host.subscribeCommitted(
  (notice: CommittedNotice) =>
    void `${notice.composition} ${notice.canonicalInput} ${notice.receipt.position.seq}`,
)
unsubscribe()

const isCurrentFrame: AdmissionCoordinator['isCurrentFrame'] = frame =>
  host.coordinator.isCurrentFrame(frame)
void isCurrentFrame

// @ts-expect-error logical publication may not return an arbitrary value
publication.publishLogical = () => 1
