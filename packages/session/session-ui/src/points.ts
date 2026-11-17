import { definePoint, type Point, type PointCodec } from '@omne-harness/shell-contract'

export type SessionSubject = Readonly<{ session: string }>

const sessionSubject: PointCodec<SessionSubject> = {
  encode: value => value.session,
  decode: text => ({ session: text }),
}

export const SESSION_DOCK = 'session.dock'
export const SESSION_SIDE = 'session.side'

export const sessionDock: Point<SessionSubject> = definePoint({
  name: SESSION_DOCK,
  subject: sessionSubject,
})

export const sessionSide: Point<SessionSubject> = definePoint({
  name: SESSION_SIDE,
  subject: sessionSubject,
})
