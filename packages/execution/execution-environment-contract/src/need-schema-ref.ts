import {
  defineSchema,
  zodDefinition,
  type SchemaRef,
  type StandardTyped,
} from '@omne-harness/schema-provider'
import { z } from 'zod'
import { environmentNeedAdoption } from './need-declaration.ts'

const needShape = z.strictObject({
  facilities: z.array(z.string().min(1)),
  isolation: z.array(z.string().min(1)),
  layers: z.array(
    z.enum(['host_machine', 'stateless_sandbox', 'session_sandbox', 'tenant_sandbox']),
  ),
})

export type EnvironmentNeedProjection = z.output<typeof needShape>

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
