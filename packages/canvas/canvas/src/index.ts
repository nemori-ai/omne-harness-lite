export { createCanvas, type CanvasConfig, type CanvasPorts, type Clock } from './canvas.ts'
export { arrangementOf, awayOf, placingOf, type CanvasFacts } from './facts.ts'
export {
  arrangeBatch,
  lockItems,
  pileItems,
  placeReference,
  scatterPile,
  takeItems,
} from './scripts.ts'
export type {
  Arrangement,
  ArrangeCommand,
  CanvasStore,
  ChangeResult,
  LockCommand,
  PileCommand,
  PlaceCommand,
  PlaceResult,
  Placing,
  Rules,
  ScatterCommand,
  StoreAnswer,
  StoreRead,
  TakeCommand,
} from './store.ts'
