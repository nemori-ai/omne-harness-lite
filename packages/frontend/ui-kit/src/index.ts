export { Button, buttonVariants } from './controls/button.tsx'
export { Checkbox } from './controls/checkbox.tsx'
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './controls/dropdown-menu.tsx'
export { Field, Section } from './controls/field.tsx'
export { Input } from './controls/input.tsx'
export { Label } from './controls/label.tsx'
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from './controls/popover.tsx'
export { RadioGroup, RadioGroupItem } from './controls/radio-group.tsx'
export { Segmented, type SegmentedOption } from './controls/segmented.tsx'
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './controls/select.tsx'
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './controls/sheet.tsx'
export { Switch } from './controls/switch.tsx'
export { Table, TableBody, TableCell, TableRow } from './controls/table.tsx'
export { Textarea } from './controls/textarea.tsx'
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './controls/tooltip.tsx'

export { Ago } from './patterns/ago.tsx'
export { type DataAttributes } from './patterns/ai/data-attributes.ts'
export { EntityChip, type EntityKind, EntityKindIcon } from './patterns/ai/entity-chip.tsx'
export { GlideMenu } from './patterns/ai/glide-menu.tsx'
export { ReceiptPill, type ReceiptTone } from './patterns/ai/receipt-pill.tsx'
export { STATE_FACT, STATE_LABELS, type StateLabel } from './patterns/ai/state-labels.ts'
export { StateWord } from './patterns/ai/state-word.tsx'
export { type MarkPhase, StatusMark } from './patterns/ai/status-mark.tsx'
export { StatusPill } from './patterns/ai/status-pill.tsx'
export { FACT_INK, FACT_TONE, type Fact, type Tone } from './patterns/ai/tone.ts'
export {
  TraceHeader,
  TraceRow,
  TraceRows,
  type TraceState,
  type TraceStatus,
} from './patterns/ai/trace.tsx'
export { ValuePill } from './patterns/ai/value-pill.tsx'
export { ChoiceList, ChoiceRow } from './patterns/choice-list.tsx'
export { CodeSurface } from './patterns/code-surface.tsx'
export { CountPill } from './patterns/count-pill.tsx'
export { ImpactPanel } from './patterns/confirm/impact-panel.tsx'
export { type ConfirmTone, InlineConfirm } from './patterns/confirm/inline-confirm.tsx'
export { Disclosure, DisclosureContent, DisclosureTrigger } from './patterns/disclosure.tsx'
export { type DotMark, DotPager, type PagerDot } from './patterns/dot-pager.tsx'
export { EmptyState } from './patterns/empty-state.tsx'
export { FactList, FactRow } from './patterns/fact-list.tsx'
export { ActionTooltip, AppTooltipProvider, IconButton } from './patterns/icon-button.tsx'
export {
  InlineNotice,
  type InlineNoticeProps,
  type NoticeAction,
} from './patterns/inline-notice.tsx'
export { LoadingIndicator, LoadingState, useLoopPause } from './patterns/loading-state.tsx'
export {
  DirectorySearch,
  ListReadingDirectory,
  ListReadingMain,
  ListReadingPage,
  ListReadingRow,
  ListReadingWorkspace,
  ReadingDocument,
  ReadingState,
  ReadingToolbar,
} from './patterns/list-reading.tsx'
export { PageColumn } from './patterns/page-column.tsx'
export { PageHeader } from './patterns/page-header.tsx'
export { SaveReceipt } from './patterns/save-receipt.tsx'
export { SettingRow } from './patterns/setting-row.tsx'
export {
  AGE_TICK_MS,
  formatInstant,
  formatRelative,
  RELATIVE_WORDS,
  type RelativeWords,
  useAgeClock,
} from './patterns/time.ts'

export { Prose, type ProseProps } from './prose/prose.tsx'
export { PROSE_TRANSLATIONS } from './prose/translations.ts'

export * from './icons/index.ts'
export { iconNames } from './icons/glyph.ts'
export {
  PIECES,
  RedrawProvider,
  type Piece,
  type Redraw,
  type RedrawKind,
} from './redraw/redraw.ts'

export {
  blockingOverlay,
  currentRegion,
  focusSurface,
  moveRegion,
  navigateWithin,
  ownsTyping,
  rememberFocus,
} from './lib/focus.ts'
export { cn, joinFacts } from './lib/utils.ts'

export {
  Arrive,
  markSurfaceArrival,
  useArrival,
  useMotionCue,
  usePresenceInert,
  useReducedMotion,
  useSettleCue,
} from './motion/motion.ts'
export {
  objectPart,
  objectView,
  type ObjectPart,
  useObjectTransition,
} from './motion/use-object-transition.ts'

export {
  colorSchemeQuery,
  type ColorSchemeQuery,
  createThemeController,
  resolveTheme,
  type ResolvedTheme,
  type ThemeChoice,
  type ThemeController,
  type ThemeControllerInput,
  type ThemeRoot,
} from './theme/controller.ts'
export {
  createSizeController,
  SIZE_TIERS,
  type SizeController,
  type SizeControllerInput,
  type SizeKey,
  type SizeKeyPlatform,
  type SizeRoot,
  type SizeStep,
  type SizeTier,
  sizeStepForKey,
  stepSize,
} from './size/controller.ts'
export { useSizeFactor } from './size/use-size-factor.ts'
export {
  CHART_COPY,
  type ChartCopy,
  type ChartFormat,
  type ChartRow,
  type ChartSeries,
} from './charts/frame.tsx'
export { formatAmount, formatNumber, formatPercent, UNKNOWN_TEXT } from './charts/format.ts'
export { AreaChart, LineChart, StackedBarChart, type SeriesChartProps } from './charts/series.tsx'
export { ShareBar, Sparkline, StatBlock, type SharePart } from './charts/simple.tsx'
export { type Doing, type FigureMoment } from './ink/body.ts'
export { InkBubble } from './ink/ink-bubble.tsx'
export { InkMotes, type InkMotesDoing } from './ink/motes-ink.tsx'
export { type BubbleInk } from './ink/note-ink.ts'
export { FigureSeat } from './ink/seat.tsx'
export { FigureStage } from './ink/figure-stage.tsx'
export { FIGURE_SIZE } from './ink/store.ts'
export { ToldNote, type Told } from './ink/told-note.tsx'
export { type Box } from './ink/travel.ts'
export {
  PAPER_NAME_LINE,
  type PaperBox,
  type PaperPoint,
  type PaperSheet,
  type PaperView,
  type SizeLimits,
  type ZoomLimits,
} from './paper/geometry.ts'
export { type PaperGesture, type PlaceBox } from './paper/carry.ts'
export { PaperPage, PaperQuiet } from './paper/paper-page.tsx'
export { PaperPile, type PileLeaf } from './paper/paper-pile.tsx'
export { FlipLayer, useFaceFlip } from './paper/flip-layer.tsx'
export {
  type FaceFlip,
  type FlipPhase,
  type FlipPlan,
  type FlipState,
  type FlipToward,
} from './paper/flip.ts'
export { PaperSpot } from './paper/paper-spot.tsx'
export { PaperSurface, usePaperAt } from './paper/paper-surface.tsx'
