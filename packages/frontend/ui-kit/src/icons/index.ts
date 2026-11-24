import { defineIcon, type Icon } from './glyph.ts'
import { GLYPHS } from './glyphs.ts'
import { DisclosureIcon } from './kit-only.ts'

export { type Icon } from './glyph.ts'
export { MOTIONS } from './glyphs.ts'

export const MaterialIcon = defineIcon('material', GLYPHS.material)
export const MatterIcon = defineIcon('matter', GLYPHS.matter)
export const AppointmentIcon = defineIcon('appointment', GLYPHS.appointment)
export const ContactIcon = defineIcon('contact', GLYPHS.contact)
export const ResourceIcon = defineIcon('resource', GLYPHS.resource)
export const AwaitingIcon = defineIcon('awaiting', GLYPHS.awaiting)
export const TopicsIcon = defineIcon('topics', GLYPHS.topics)
export const SettingsIcon = defineIcon('settings', GLYPHS.settings)
export const SearchIcon = defineIcon('search', GLYPHS.search)
export const CommandsIcon = defineIcon('commands', GLYPHS.commands)
export const FoldIcon = defineIcon('fold', GLYPHS.fold)
export const BackIcon = defineIcon('back', GLYPHS.back)
export const MenuIcon = defineIcon('menu', GLYPHS.menu)
export const DebugIcon = defineIcon('debug', GLYPHS.debug)
export const OverviewIcon = defineIcon('overview', GLYPHS.overview)
export const AboutIcon = defineIcon('about', GLYPHS.about)

export const CloseIcon = defineIcon('close', GLYPHS.close)
export const AddIcon = defineIcon('add', GLYPHS.add)
export const MoreIcon = defineIcon('more', GLYPHS.more)
export const RetryIcon = defineIcon('retry', GLYPHS.retry)
export const SendIcon = defineIcon('send', GLYPHS.send)
export const OpenIcon = defineIcon('open', GLYPHS.open)
export const StopIcon = defineIcon('stop', GLYPHS.stop)
export const PauseIcon = defineIcon('pause', GLYPHS.pause)
export const PlayIcon = defineIcon('play', GLYPHS.play)
export const EditIcon = defineIcon('edit', GLYPHS.edit)
export const DeleteIcon = defineIcon('delete', GLYPHS.delete)
export const DownloadIcon = defineIcon('download', GLYPHS.download)
export const UploadIcon = defineIcon('upload', GLYPHS.upload)
export const CopyIcon = defineIcon('copy', GLYPHS.copy)
export const QuoteIcon = defineIcon('quote', GLYPHS.quote)
export const AttachIcon = defineIcon('attach', GLYPHS.attach)
export const MentionIcon = defineIcon('mention', GLYPHS.mention)
export const UndoIcon = defineIcon('undo', GLYPHS.undo)

export const DoneIcon = defineIcon('done', GLYPHS.done)
export const FailedIcon = defineIcon('failed', GLYPHS.failed)
export const CancelledIcon = defineIcon('cancelled', GLYPHS.cancelled)
export const WarningIcon = defineIcon('warning', GLYPHS.warning)
export const UnknownIcon = defineIcon('unknown', GLYPHS.unknown)
export const ProgressIcon = defineIcon('progress', GLYPHS.progress)
export const TimeIcon = defineIcon('time', GLYPHS.time)

export const ConversationIcon = defineIcon('conversation', GLYPHS.conversation)
export const QuestionIcon = defineIcon('question', GLYPHS.question)
export const FileIcon = defineIcon('file', GLYPHS.file)
export const ImageIcon = defineIcon('image', GLYPHS.image)
export const AudioIcon = defineIcon('audio', GLYPHS.audio)
export const VideoIcon = defineIcon('video', GLYPHS.video)
export const FolderIcon = defineIcon('folder', GLYPHS.folder)
export const LinkIcon = defineIcon('link', GLYPHS.link)
export const MailIcon = defineIcon('mail', GLYPHS.mail)
export const DeviceIcon = defineIcon('device', GLYPHS.device)
export const ViewIcon = defineIcon('view', GLYPHS.view)
export const ProcessIcon = defineIcon('process', GLYPHS.process)
export const CompareIcon = defineIcon('compare', GLYPHS.compare)
export const PermissionIcon = defineIcon('permission', GLYPHS.permission)
export const ConnectionIcon = defineIcon('connection', GLYPHS.connection)
export const AssistantIcon = defineIcon('assistant', GLYPHS.assistant)
export const TurnIcon = defineIcon('turn', GLYPHS.turn)
export const LockIcon = defineIcon('lock', GLYPHS.lock)

export const ICONS: Readonly<Record<string, Icon>> = {
  material: MaterialIcon,
  matter: MatterIcon,
  appointment: AppointmentIcon,
  contact: ContactIcon,
  resource: ResourceIcon,
  awaiting: AwaitingIcon,
  topics: TopicsIcon,
  settings: SettingsIcon,
  search: SearchIcon,
  commands: CommandsIcon,
  fold: FoldIcon,
  back: BackIcon,
  menu: MenuIcon,
  debug: DebugIcon,
  overview: OverviewIcon,
  about: AboutIcon,
  close: CloseIcon,
  add: AddIcon,
  more: MoreIcon,
  disclosure: DisclosureIcon,
  retry: RetryIcon,
  send: SendIcon,
  open: OpenIcon,
  stop: StopIcon,
  pause: PauseIcon,
  play: PlayIcon,
  edit: EditIcon,
  delete: DeleteIcon,
  download: DownloadIcon,
  upload: UploadIcon,
  copy: CopyIcon,
  quote: QuoteIcon,
  attach: AttachIcon,
  mention: MentionIcon,
  undo: UndoIcon,
  done: DoneIcon,
  failed: FailedIcon,
  cancelled: CancelledIcon,
  warning: WarningIcon,
  unknown: UnknownIcon,
  progress: ProgressIcon,
  time: TimeIcon,
  conversation: ConversationIcon,
  question: QuestionIcon,
  file: FileIcon,
  image: ImageIcon,
  audio: AudioIcon,
  video: VideoIcon,
  folder: FolderIcon,
  link: LinkIcon,
  mail: MailIcon,
  device: DeviceIcon,
  view: ViewIcon,
  process: ProcessIcon,
  compare: CompareIcon,
  permission: PermissionIcon,
  connection: ConnectionIcon,
  assistant: AssistantIcon,
  turn: TurnIcon,
  lock: LockIcon,
}
