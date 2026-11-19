import { assetsProtocol } from '@omne-harness/assets-protocol'
import { calendarProtocol } from '@omne-harness/calendar-protocol'
import { humanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { modelProtocol } from '@omne-harness/model-protocol'
import { notificationProtocol } from '@omne-harness/notification-protocol'
import type { ProtocolContract } from '@omne-harness/public-contract'
import { scheduleProtocol } from '@omne-harness/schedule-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { toolProtocol } from '@omne-harness/tool-protocol'

export const domainProtocols: readonly ProtocolContract[] = [
  identityProtocol,
  sessionProtocol,
  assetsProtocol,
  humanInterventionProtocol,
  toolProtocol,
  scheduleProtocol,
  calendarProtocol,
  notificationProtocol,
  modelProtocol,
]
