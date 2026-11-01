import { createClient } from '@supabase/supabase-js'

export const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY)

export type Room = { code: string; title: string; rent: number; currency: string; rooms: string[]; status: 'bidding' | 'revealed' | 'agreed'; round: number }
export type Player = { id: string; name: string; seat: number; locked: boolean; vote: 'accept' | 'dispute' | null; bids: number[] | null }
export type State = { room: Room | null; players: Player[] }
export type Identity = { player_id: string; secret: string; code: string }

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const api = {
  get: (code: string) => call<State>('accord_get', { p_code: code }),
  create: (title: string, rent: number, rooms: string[], name: string, currency: string) =>
    call<Identity>('accord_create', { p_title: title, p_rent: rent, p_rooms: rooms, p_name: name, p_currency: currency }),
  join: (code: string, name: string) => call<Identity>('accord_join', { p_code: code, p_name: name }),
  submit: (me: Identity, bids: number[]) => call<void>('accord_submit', { p_player: me.player_id, p_secret: me.secret, p_bids: bids }),
  unlock: (me: Identity) => call<void>('accord_unlock', { p_player: me.player_id, p_secret: me.secret }),
  vote: (me: Identity, vote: 'accept' | 'dispute') => call<void>('accord_vote', { p_player: me.player_id, p_secret: me.secret, p_vote: vote }),
}

// Identity lives only in this browser; losing it just means re-joining.
export const identity = {
  load(code: string): Identity | null {
    try { return JSON.parse(localStorage.getItem('accord:' + code) ?? 'null') } catch { return null }
  },
  save(me: Identity) {
    try { localStorage.setItem('accord:' + me.code, JSON.stringify(me)) } catch { /* private mode: session-only */ }
  },
}
