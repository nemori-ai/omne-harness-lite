import { tenantIdSchema, type TenantId } from '@omne-harness/notification-contract'
import { notificationPersistenceParticipant } from '@omne-harness/notification-local'
import {
  createDomainBindings,
  type Combination,
  type TenantBindingPorts as DomainBindingPorts,
} from '../storage/tenant-bindings.ts'

export const NOTIFICATION_PARTICIPANTS = [notificationPersistenceParticipant]

export type { Combination }
export type TenantBindingPorts = DomainBindingPorts<TenantId>

/** Each tenant's notifications live in its own domain, where the combination is registered. */
export function createTenantBindings(ports: TenantBindingPorts) {
  return createDomainBindings(ports, NOTIFICATION_PARTICIPANTS, text => tenantIdSchema.parse(text))
}
