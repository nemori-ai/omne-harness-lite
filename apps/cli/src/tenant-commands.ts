import { assetCommand } from './asset-command.ts'
import { calendarCommand } from './calendar-command.ts'
import { callCommand } from './call-command.ts'
import type { CommandSpec } from './cli-types.ts'
import { mcpCommand } from './mcp-command.ts'
import { mediaCommand } from './media-command.ts'
import { notificationCommand } from './notification-command.ts'
import { scheduleCommand } from './schedule-command.ts'
import { settingCommand } from './setting-command.ts'
import { workspaceCommand } from './workspace-command.ts'

/** The commands of the domains of the acting tenant, in the order the help lists them. */
export const tenantCommands: readonly CommandSpec[] = [
  calendarCommand,
  scheduleCommand,
  notificationCommand,
  workspaceCommand,
  settingCommand,
  assetCommand,
  mcpCommand,
  mediaCommand,
  callCommand,
]
