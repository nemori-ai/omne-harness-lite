import {
  defineSchema,
  zodDefinition,
  type SchemaRef,
  type StandardTyped,
} from '@omne-harness/schema-provider'
import { z } from 'zod'
import { environmentNeedAdoption } from './need-declaration.ts'

// Facility keys and isolation claims are open vocabularies, so both are any non-empty string, as in
// `schema/environment-need.schema.json`. Layers are the four binding kinds.
const needShape = z.strictObject({
  facilities: z.array(z.string().min(1)),
  isolation: z.array(z.string().min(1)),
  layers: z.array(
    z.enum(['host_machine', 'stateless_sandbox', 'session_sandbox', 'tenant_sandbox']),
  ),
})

/**
 * What `environmentNeedSchemaRef` projects: the declaration as plain strings. The open facility and
 * isolation vocabularies are not narrowed to the registered keys, because registration is checked
 * when an acquisition asks for a key.
 */
export type EnvironmentNeedProjection = z.output<typeof needShape>

/**
 * The declaration shape as a schema-provider `SchemaRef`. A caller in an execution domain passes it
 * with its own provider to `validate`, so the declaration is checked by the shared provider. It is
 * the same shape as `environmentNeedSchema` and the JSON Schema file; the `schema-ref.spec.ts` test
 * holds the two in step. The schema id and revision follow `environmentNeedAdoption`.
 */
export const environmentNeedSchemaRef: SchemaRef<EnvironmentNeedProjection> = defineSchema({
  id: `${environmentNeedAdoption.owner}.${environmentNeedAdoption.name}`,
  load: () =>
    Promise.resolve(
      zodDefinition({
        revision: environmentNeedAdoption.revision,
        numbers: 'exact-or-reject',
        schema: needShape satisfies StandardTyped<EnvironmentNeedProjection>,
      }),
    ),
})
