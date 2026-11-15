import { z } from 'zod'
import {
  CardRefSchema,
  HitlIdentifierSchema,
  OperationRefSchema,
  RequestRefSchema,
  TenantRefSchema,
} from './values.ts'

const protocol = z.literal('hitl/1')
const pageLimit = z.number().int().min(1).max(100)
export const GetRequestSchema = z
  .strictObject({ protocol, requestRef: RequestRefSchema })
  .readonly()
export const GetCardSchema = z.strictObject({ protocol, cardRef: CardRefSchema }).readonly()
export const PoolFilterSchema = z
  .strictObject({
    states: z
      .array(z.enum(['pending', 'decided', 'invalidated']))
      .min(1)
      .max(3)
      .readonly(),
    originKind: z.enum(['tool', 'agent-extension', 'admission', 'independent']).optional(),
    sessionRef: HitlIdentifierSchema.optional(),
    delivery: z.enum(['pending', 'accepted', 'superseded']).optional(),
  })
  .readonly()
export const ListPoolSchema = z
  .strictObject({
    protocol,
    tenantRef: TenantRefSchema,
    locationRef: HitlIdentifierSchema,
    filter: PoolFilterSchema.default({ states: ['pending'] }),
    cursor: HitlIdentifierSchema.optional(),
    limit: pageLimit,
  })
  .readonly()
export const GetOperationSchema = z
  .strictObject({
    protocol,
    operationRef: OperationRefSchema,
    inputDigest: HitlIdentifierSchema,
  })
  .readonly()
export const ListDeliveriesSchema = z
  .strictObject({
    protocol,
    destination: HitlIdentifierSchema,
    after: HitlIdentifierSchema.optional(),
    limit: pageLimit,
  })
  .readonly()

export type GetRequest = z.infer<typeof GetRequestSchema>
export type GetCard = z.infer<typeof GetCardSchema>
export type PoolFilter = z.infer<typeof PoolFilterSchema>
export type ListPool = z.infer<typeof ListPoolSchema>
export type GetOperation = z.infer<typeof GetOperationSchema>
export type ListDeliveries = z.infer<typeof ListDeliveriesSchema>
