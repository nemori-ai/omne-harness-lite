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

/** A call of a session: the session and the call reference Session listed it by. */
export type SessionCallSubject = Readonly<{ session: string; call: string }>

const sessionCallSubject: PointCodec<SessionCallSubject> = {
  encode: value => JSON.stringify([value.session, value.call]),
  decode: text => {
    const [session, call] = JSON.parse(text) as [string, string]
    return { session, call }
  },
}

export const SESSION_CALL_DETAIL = 'session.call-detail'

// Under each call in the background; the session module does not know what goes here.
export const sessionCallDetail: Point<SessionCallSubject> = definePoint({
  name: SESSION_CALL_DETAIL,
  subject: sessionCallSubject,
})
