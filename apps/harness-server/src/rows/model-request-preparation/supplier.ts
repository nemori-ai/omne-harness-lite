// The credential completion of request preparation (`SupplierPort`). The profile has no
// credential; the host that owns credential scoping completes the supplier with a reference.
//
// The single-machine host publishes factory profiles only (`ModelProfilesLocalPlugin`), and its
// custody is the file vault behind `modelCredential`, which resolves the factory credential. So
// every supplier gets the factory reference and keeps its adoption, recipient and model. A tenant
// credential reference needs a settings source that M2 does not have, so none is offered here.
import type { SupplierPort } from '@omne-harness/model'

export const factorySupplier: SupplierPort<unknown> = ({ supplier }) => ({
  ok: {
    adoption: supplier.adoption,
    recipient: supplier.recipient,
    model: supplier.model,
    credential: { kind: 'factory' },
  },
})
