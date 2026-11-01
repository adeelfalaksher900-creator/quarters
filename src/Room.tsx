import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, identity, sb, type Identity, type Player, type Room, type State } from './api'
import { divide, maxEnvy, type Split } from './fair'
import { Avatar, Check, HUES, money } from './ui'

export function RoomView({ code }: { code: string }) {
  const [state, setState] = useState<State | null>(null)
  const [me, setMe] = useState<Identity | null>(() => identity.load(code))
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [err, setErr] = useState('')
  const chan = useRef<ReturnType<typeof sb.channel> | null>(null)

  const refresh = useCallback(() => api.get(code).then(setState).catch(e => setErr(e.message)), [code])

  useEffect(() => {
    refresh()
    const c = sb.channel('accord-' + code, { config: { presence: { key: me?.player_id ?? 'viewer-' + Math.random() } } })
    c.on('broadcast', { event: 'sync' }, refresh)
      .on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(c.presenceState()))))
      .subscribe(s => { if (s === 'SUBSCRIBED') c.track({ at: Date.now() }) })
    chan.current = c
    const poll = setInterval(refresh, 6000) // fallback if a broadcast is missed
    return () => { clearInterval(poll); sb.removeChannel(c) }
  }, [code, me?.player_id, refresh])

  const act = useCallback(async (fn: () => Promise<unknown>) => {
    setErr('')
    try { await fn(); await refresh(); chan.current?.send({ type: 'broadcast', event: 'sync', payload: {} }) }
    catch (e) { setErr((e as Error).message) }
  }, [refresh])

  if (!state) return <div className="page narrow center-page"><div className="spinner" aria-label="Loading" /></div>
  if (!state.room) return (
    <div className="page narrow center-page">
      <h1 className="title-2">Split not found</h1>
      <p className="secondary">Check the code with whoever invited you.</p>
      <a className="btn btn-primary" href="#/join">Try another code</a>
    </div>
  )

  const { room, players } = state
  const mine = players.find(p => p.id === me?.player_id)
  const n = room.rooms.length
  const canJoin = !mine && players.length < n && room.status === 'bidding'

  return (
    <div className="page room">
      <RoomHeader state={state} online={online} me={me} />
      {err && <p className="banner-error" role="alert">{err}</p>}
      {canJoin && <JoinCard code={code} onJoined={id => { identity.save(id); setMe(id); act(async () => {}) }} />}
      {!mine && !canJoin && <p className="note">You're viewing this split. All {n} seats are taken.</p>}

      {room.status === 'bidding' && (
        <div className="room-grid">
          {mine && me ? <BidPanel key={room.round} room={room} locked={mine.locked}
            onLock={b => act(() => api.submit(me, b))} onEdit={() => act(() => api.unlock(me))} /> : <div />}
          <Roster room={room} players={players} online={online} meId={me?.player_id} />
        </div>
      )}
      {room.status !== 'bidding' && <Result room={room} players={players} meId={me?.player_id} onVote={v => me && act(() => api.vote(me, v))} />}
    </div>
  )
}

function RoomHeader({ state, online, me }: { state: State; online: Set<string>; me: Identity | null }) {
  const room = state.room!
  const [copied, setCopied] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)
  // The seat key lives in the URL fragment, which browsers never send to any server.
  const deviceLink = me && `${location.origin}${location.pathname}#/r/${room.code}/k/${me.player_id}.${me.secret}`
  async function copyDevice() {
    try { await navigator.clipboard.writeText(deviceLink!); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2200) } catch { prompt('Your private link (do not share)', deviceLink!) }
  }
  const link = `${location.origin}${location.pathname}#/r/${room.code}`
  async function share() {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) return await navigator.share({ title: `Join ${room.title} on Quarters`, url: link })
      await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch { /* user dismissed the share sheet */ }
  }
  const label = { bidding: `Round ${room.round} · bidding`, revealed: 'Revealed · voting', agreed: 'Agreed' }[room.status]
  return (
    <section className="room-head">
      <div>
        <span className={'status-pill ' + room.status}>{label}</span>
        <h1 className="large-title">{room.title}</h1>
        <p className="secondary">{money(room.currency, room.rent)} per month · {room.rooms.length} rooms</p>
      </div>
      <div className="invite">
        <div className="faces" aria-label={`${state.players.filter(p => online.has(p.id)).length} online`}>
          {state.players.map(p => <Avatar key={p.id} name={p.name} seat={p.seat} on={online.has(p.id)} />)}
        </div>
        <button className="btn btn-tinted" onClick={share} aria-live="polite">
          {copied ? <><Check /> Link copied</> : <>Invite · <b className="mono">{room.code}</b></>}
        </button>
        {deviceLink && state.players.some(p => p.id === me!.player_id) && (
          <button className="btn btn-plain btn-small" onClick={copyDevice} title="Private link that lets you continue on your phone or laptop. Don't share it." aria-live="polite">
            {keyCopied ? <><Check /> Private link copied</> : 'Open on another device'}
          </button>
        )}
      </div>
    </section>
  )
}

function JoinCard({ code, onJoined }: { code: string; onJoined: (me: Identity) => void }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form className="group join-card" onSubmit={async e => { e.preventDefault(); setBusy(true); try { onJoined(await api.join(code, name.trim())) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
      <div className="group-head"><h2 className="headline">You're invited</h2><p className="secondary">Pick the name your housemates know you by.</p></div>
      <div className="row-inline">
        <input className="field" aria-label="Your name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={32} required autoFocus />
        <button className="btn btn-primary" disabled={busy}>Take a seat</button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
    </form>
  )
}

/* ---------------- Bidding ---------------- */

function BidPanel({ room, locked, onLock, onEdit }: { room: Room; locked: boolean; onLock: (b: number[]) => void; onEdit: () => void }) {
  const n = room.rooms.length, R = Number(room.rent)
  const [bids, setBids] = useState(() => {
    const even = Math.floor((R / n) * 100) / 100
    return room.rooms.map((_, i) => (i === n - 1 ? Math.round((R - even * (n - 1)) * 100) / 100 : even))
  })
  const left = Math.round((R - bids.reduce((a, b) => a + b, 0)) * 100) / 100

  // Moving one slider spreads the difference across the other rooms, so the total always stays at the rent.
  function slide(i: number, raw: number) {
    const v = Math.min(R, Math.max(0, Math.round(raw * 100) / 100))
    const others = bids.map((b, j) => (j === i ? 0 : b))
    const rest = R - v, otherSum = others.reduce((a, b) => a + b, 0)
    const next = others.map((b, j) => Math.round((j === i ? v : otherSum > 0 ? (b / otherSum) * rest : rest / (n - 1)) * 100) / 100)
    const drift = Math.round((R - next.reduce((a, b) => a + b, 0)) * 100) / 100
    const k = next.findIndex((x, j) => j !== i && x + drift >= 0)
    if (k >= 0) next[k] = Math.round((next[k] + drift) * 100) / 100
    setBids(next)
  }
  const type = (i: number, raw: string) => setBids(bids.map((b, j) => (j === i ? Math.min(R, Math.max(0, Math.round((Number(raw) || 0) * 100) / 100)) : b)))

  return (
    <section className="bids">
      <div className="section-head">
        <h2 className="title-3">{locked ? 'Your bids are in' : 'What is each room worth to you?'}</h2>
        <p className="secondary">{locked ? 'Sealed until the last housemate locks in. You can still change them.' : `Split ${money(room.currency, R)} across the rooms. Drag a slider and the others rebalance. Only you can see this.`}</p>
      </div>
      <div className="group">
        {room.rooms.map((name, i) => (
          <div className={'bid-row' + (locked ? ' frozen' : '')} key={i}>
            <div className="bid-top">
              <span className="room-label"><span className="swatch" style={{ background: HUES[i] }} />{name}</span>
              <label className="amount"><span className="secondary">{room.currency.trim()}</span>
                <input inputMode="decimal" aria-label={`Value of ${name}`} disabled={locked} value={bids[i]} onChange={e => type(i, e.target.value)} />
              </label>
            </div>
            <input type="range" min={0} max={R} step={Math.max(1, Math.round(R / 200))} value={bids[i]} disabled={locked}
              aria-label={`Slider for ${name}`} onChange={e => slide(i, Number(e.target.value))}
              style={{ '--fill': `${(bids[i] / R) * 100}%`, '--hue': HUES[i] } as React.CSSProperties} />
          </div>
        ))}
        <div className="stack-bar" aria-hidden>{bids.map((b, i) => <span key={i} style={{ flexGrow: b, background: HUES[i] }} />)}</div>
      </div>
      <div className="action-bar">
        <span className={left === 0 ? 'ok' : 'warn'}>{left === 0 ? <><Check /> Adds up to {money(room.currency, R)}</> : `${money(room.currency, Math.abs(left))} ${left > 0 ? 'left to assign' : 'over the rent'}`}</span>
        {locked ? <button className="btn btn-gray" onClick={onEdit}>Change my bids</button>
          : <button className="btn btn-primary" disabled={left !== 0} onClick={() => onLock(bids)}>Lock in privately</button>}
      </div>
    </section>
  )
}

function Roster({ room, players, online, meId }: { room: Room; players: Player[]; online: Set<string>; meId?: string }) {
  const n = room.rooms.length
  const ready = players.filter(p => p.locked).length
  return (
    <aside className="roster">
      <div className="section-head">
        <h2 className="title-3">Housemates</h2>
        <p className="secondary">{ready} of {n} locked in · the reveal is automatic</p>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={ready} aria-valuemax={n} aria-label="Housemates locked in"><span style={{ width: `${(ready / n) * 100}%` }} /></div>
      <ul className="group list">
        {players.map(p => (
          <li key={p.id}>
            <Avatar name={p.name} seat={p.seat} on={online.has(p.id)} />
            <span className="grow">{p.name}{p.id === meId && <span className="secondary"> (you)</span>}</span>
            <span className={'pill ' + (p.locked ? 'pill-ok' : '')}>{p.locked ? <><Check /> Locked in</> : online.has(p.id) ? 'Bidding…' : 'Away'}</span>
          </li>
        ))}
        {Array.from({ length: n - players.length }, (_, i) => (
          <li key={'e' + i}><span className="avatar ghost">+</span><span className="grow secondary">Waiting for someone to join</span></li>
        ))}
      </ul>
    </aside>
  )
}

/* ---------------- Result ---------------- */

export function useSplit(room: Room, players: Player[]) {
  // A solver failure must not blank the page; Result shows a recoverable message instead.
  return useMemo(() => { try { return divide(players.map(p => (p.bids ?? []).map(Number)), Number(room.rent)) } catch { return null } }, [players, room.rent])
}

export function ResultCards({ room, players, split, meIdx = -1 }: { room: Room; players: Player[]; split: Split; meIdx?: number }) {
  return (
    <div className="cards">
      {players.map((p, i) => {
        const r = split.assignment[i]
        return (
          <article key={p.id} className={'person' + (i === meIdx ? ' me' : '')} style={{ '--hue': HUES[r] } as React.CSSProperties}>
            <header><Avatar name={p.name} seat={p.seat} /><span className="grow">{p.name}{i === meIdx && ' (you)'}</span>{p.vote === 'accept' && <span className="pill pill-ok"><Check /> Agreed</span>}</header>
            <p className="room-name"><span className="swatch" style={{ background: HUES[r] }} />{room.rooms[r]}</p>
            <p className="price">{money(room.currency, split.prices[r])}<small>/mo</small></p>
            <p className="footnote secondary">Valued it at {money(room.currency, Number(p.bids![r]))} · {split.utility[i] >= 0 ? 'saves' : 'pays'} {money(room.currency, Math.abs(split.utility[i]))} {split.utility[i] >= 0 ? 'vs. their own estimate' : 'over it'}</p>
          </article>
        )
      })}
    </div>
  )
}

export function ProofTable({ room, players, split, meIdx = -1 }: { room: Room; players: Player[]; split: Split; meIdx?: number }) {
  const envy = maxEnvy(split), cur = room.currency
  return (
    <>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Swap test table">
        <table>
          <thead><tr><th scope="col">Person</th>{room.rooms.map((r, j) => <th scope="col" key={j}><span className="swatch" style={{ background: HUES[j] }} />{r}<br /><span className="secondary">{money(cur, split.prices[j])}</span></th>)}</tr></thead>
          <tbody>{players.map((p, i) => (
            <tr key={p.id} className={i === meIdx ? 'me' : ''}>
              <th scope="row">{p.name}</th>
              {split.surplus[i].map((s, j) => <td key={j} className={split.assignment[i] === j ? 'got' : ''}>{s >= 0 ? '+' : '−'}{money(cur, Math.abs(s))}</td>)}
            </tr>))}
          </tbody>
        </table>
      </div>
      <p className={envy <= 0.03 ? 'ok' : 'warn'}>{envy <= 0.03 ? <><Check /> Envy-free: everyone got their best option at these prices.</> : `Rounding leaves at most ${money(cur, envy)} of envy.`}</p>
    </>
  )
}

function Result({ room, players, meId, onVote }: { room: Room; players: Player[]; meId?: string; onVote: (v: 'accept' | 'dispute') => void }) {
  const split = useSplit(room, players)
  const accepted = players.filter(p => p.vote === 'accept').length
  const mine = players.findIndex(p => p.id === meId)
  const [copied, setCopied] = useState(false)
  if (!split) return (
    <div className="action-bar vote">
      <div><strong>We couldn't compute a split from these bids.</strong><p className="secondary">Start a new round and try again.</p></div>
      {mine >= 0 && room.status === 'revealed' && <button className="btn btn-primary" onClick={() => onVote('dispute')}>Re-bid</button>}
    </div>
  )
  const summary = () => `${room.title} — agreed split (Quarters)\n` + players.map((p, i) => `• ${p.name}: ${room.rooms[split.assignment[i]]} — ${money(room.currency, split.prices[split.assignment[i]])}/mo`).join('\n')

  return (
    <div className="result">
      {room.status === 'agreed' && (
        <div className="banner-ok">
          <span><Check /> Everyone agreed. This is your house's split.</span>
          <button className="btn btn-small btn-white" onClick={async () => { try { await navigator.clipboard.writeText(summary()); setCopied(true) } catch { prompt('Copy the summary', summary()) } }}>{copied ? 'Copied' : 'Copy summary'}</button>
        </div>
      )}
      {mine >= 0 && (
        <div className="you-got">
          <span className="secondary">You get</span>
          <strong>{room.rooms[split.assignment[mine]]}</strong>
          <span className="you-price">{money(room.currency, split.prices[split.assignment[mine]])}<small>/mo</small></span>
        </div>
      )}
      <ResultCards room={room} players={players} split={split} meIdx={mine} />
      {room.status === 'revealed' && (
        <div className="action-bar vote">
          <div><strong>Does the house agree?</strong><p className="secondary">{accepted} of {players.length} agreed. Re-bid starts a new private round.</p></div>
          {mine >= 0 && (players[mine].vote === 'accept'
            ? <span className="ok"><Check /> You agreed. Waiting for others…</span>
            : <div className="row-inline"><button className="btn btn-gray" onClick={() => onVote('dispute')}>Re-bid</button><button className="btn btn-primary" onClick={() => onVote('accept')}>I agree</button></div>)}
        </div>
      )}
      <section className="group proof">
        <div className="group-head">
          <h2 className="headline">Why nobody should want to swap</h2>
          <p className="secondary">Each cell shows how good a room would be for that person at its price (their value − price). The highlighted cell is the room they got, and it's the best in their row.</p>
        </div>
        <ProofTable room={room} players={players} split={split} meIdx={mine} />
      </section>
    </div>
  )
}
