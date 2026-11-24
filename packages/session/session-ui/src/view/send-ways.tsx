import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  MoreIcon,
} from '@omne-harness/ui-kit'
import type { SendWay } from '../model/composer-handles.ts'

/** While a run goes on: the three ways to send, and the hard stop, each one a press away. */
export function SendWays({
  canSend,
  onSend,
  onForceStop,
}: {
  readonly canSend: boolean
  readonly onSend: (way: SendWay) => void
  readonly onForceStop: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="更多发法" tooltipSide="top">
          <MoreIcon aria-hidden="true" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!canSend} onSelect={() => onSend('send')}>
          发送：交进这一轮
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canSend} onSelect={() => onSend('first')}>
          插队：排到别的待处理之前
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canSend} onSelect={() => onSend('after')}>
          等这一轮结束再发
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onForceStop}>强制停止这一轮</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
