import { assetsProtocol } from '@omne-harness/assets-protocol'
import { calendarProtocol } from '@omne-harness/calendar-protocol'
import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { goalProtocol } from '@omne-harness/goal-protocol'
import { humanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { interfaceProtocol } from '@omne-harness/interface-protocol'
import { mcpProtocol } from '@omne-harness/mcp-protocol'
import { mediaProtocol } from '@omne-harness/media-protocol'
import { modelProtocol } from '@omne-harness/model-protocol'
import { notificationProtocol } from '@omne-harness/notification-protocol'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import type { ProtocolContract } from '@omne-harness/public-contract'
import { scheduleProtocol } from '@omne-harness/schedule-protocol'
import { sessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { slashCommandProtocol } from '@omne-harness/slash-command-protocol'
import { toolProtocol } from '@omne-harness/tool-protocol'
import { usageProtocol } from '@omne-harness/usage-protocol'
import { workspaceProtocol } from '@omne-harness/workspace-protocol'

export const domainProtocols: readonly ProtocolContract[] = [
  identityProtocol,
  sessionProtocol,
  sessionDiagnosticsProtocol,
  slashCommandProtocol,
  assetsProtocol,
  humanInterventionProtocol,
  goalProtocol,
  toolProtocol,
  scheduleProtocol,
  calendarProtocol,
  notificationProtocol,
  modelProtocol,
  usageProtocol,
  mediaProtocol,
  workspaceProtocol,
  pluginProtocol,
  mcpProtocol,
  canvasProtocol,
  interfaceProtocol,
]
