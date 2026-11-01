import { useEffect, useState } from 'react'
import { api, identity, type Player, type Room } from './api'
import { ProofTable, ResultCards, RoomView, useSplit } from './Room'
import { Check, HUES, Logo, go, money, useHash } from './ui'

export default function App() {
  const hash = useHash()
  const keyed = hash.match(/^#\/r\/([A-Za-z0-9]{6})\/k\/([0-9a-f-]{36})\.([0-9a-f-]{36})$/i)
  if (keyed) { // private "open on another device" link: store the seat, then drop the key from the address bar
    identity.save({ code: keyed[1].toUpperCase(), player_id: keyed[2], secret: keyed[3] })
    history.replaceState(null, '', `#/r/${keyed[1].toUpperCase()}`)
  }
  const code = (keyed?.[1] ?? hash.match(/^#\/r\/([A-Za-z0-9]{6})$/)?.[1])?.toUpperCase()
  const route = code ? 'room' : hash.startsWith('#/new') ? 'new' : hash.startsWith('#/join') ? 'join' : 'home'
  useEffect(() => { document.title = route === 'home' ? 'Quarters: fair rent, decided together' : `Quarters · ${route === 'room' ? code : route === 'new' ? 'New split' : 'Join'}` }, [route, code])
  return (
    <>
      <Nav app={route !== 'home'} />
      <main id="main">
        {route === 'room' && <RoomView key={code} code={code!} />}
        {route === 'new' && <NewSplit />}
        {route === 'join' && <Join />}
        {route === 'home' && <Landing />}
      </main>
      <Footer />
    </>
  )
}

function Nav({ app }: { app: boolean }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => { const f = () => setScrolled(scrollY > 8); f(); addEventListener('scroll', f, { passive: true }); return () => removeEventListener('scroll', f) }, [])
  return (
    <header className={'nav' + (scrolled ? ' scrolled' : '')}>
      <div className="nav-inner">
        <a href="#/" className="brand" onClick={() => scrollTo(0, 0)}><Logo /> Quarters</a>
        {!app && (
          <nav className="nav-links" aria-label="Sections">
            <a href="#how" onClick={e => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }) }}>How it works</a>
            <a href="#fair" onClick={e => { e.preventDefault(); document.getElementById('fair')?.scrollIntoView({ behavior: 'smooth' }) }}>Why it's fair</a>
            <a href="#faq" onClick={e => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }) }}>FAQ</a>
          </nav>
        )}
        <div className="nav-actions">
          <a className="btn btn-plain" href="#/join">Join with code</a>
          <a className="btn btn-primary btn-small" href="#/new">Start a split</a>
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <a href="#/" className="brand"><Logo size={22} /> Quarters</a>
          <p className="secondary footnote">Fair rent for shared homes. No accounts, no ads, no tracking.</p>
        </div>
        <div className="footer-cols">
          <div><h4>Product</h4><a href="#/new">Start a split</a><a href="#/join">Join with code</a></div>
          <div><h4>Method</h4><a href="https://www.ijcai.org/proceedings/2017/678" target="_blank" rel="noreferrer">Research paper ↗</a><a href="#/" onClick={() => setTimeout(() => document.getElementById('fair')?.scrollIntoView(), 50)}>Why it's fair</a></div>
        </div>
      </div>
      <p className="footer-legal footnote secondary">© 2026 Quarters · Built for TRMI × LovHack 2026 “Multiplayer Everything”</p>
    </footer>
  )
}

/* ---------------- Landing ---------------- */

// Example used only for the landing-page preview; the numbers are computed live by the real algorithm.
const EX_ROOM: Room = { code: 'DEMO00', title: 'Maple St. flat', rent: 3000, currency: '$', rooms: ['Big bedroom', 'Small bedroom', 'Balcony room'], status: 'agreed', round: 1 }
const EX_PLAYERS: Player[] = [
  { id: 'a', name: 'Adeel', seat: 0, locked: true, vote: 'accept', bids: [1500, 700, 800] },
  { id: 's', name: 'Sara', seat: 1, locked: true, vote: 'accept', bids: [1200, 600, 1200] },
  { id: 'b', name: 'Bilal', seat: 2, locked: true, vote: 'accept', bids: [1000, 1100, 900] },
]

function Landing() {
  const split = useSplit(EX_ROOM, EX_PLAYERS)!
  return (
    <>
      <section className="hero">
        <span className="eyebrow-pill"><span className="live-dot" /> Live · Multiplayer · Provably fair</span>
        <h1 className="display">Fair rent,<br />decided together.</h1>
        <p className="hero-sub">Quarters settles who gets which room and who pays what. Everyone bids privately at the same time, and you get a split nobody would want to swap.</p>
        <div className="hero-ctas">
          <a className="btn btn-primary btn-large" href="#/new">Start a split</a>
          <a className="btn btn-gray btn-large" href="#/join">Join with a code</a>
        </div>
        <ul className="trust">
          <li><Check /> No sign-up</li><li><Check /> Sealed bids</li><li><Check /> Works on any phone</li>
        </ul>
        <div className="device">
          <div className="device-bar"><span /><span /><span /><em>quarters · {EX_ROOM.title}</em></div>
          <div className="device-body">
            <div className="device-head">
              <div><span className="status-pill agreed">Agreed</span><h3 className="title-2">{EX_ROOM.title}</h3><p className="secondary">$3,000 per month · 3 rooms</p></div>
              <span className="example-tag">Example</span>
            </div>
            <ResultCards room={EX_ROOM} players={EX_PLAYERS} split={split} />
          </div>
        </div>
      </section>

      <section id="how" className="section">
        <p className="kicker">How it works</p>
        <h2 className="title-1">Three steps. One shared room.</h2>
        <div className="steps">
          {[
            ['Create a split', 'Enter the total rent and name the rooms. You get a 6-character invite code to share in your group chat.'],
            ['Everyone bids, privately', 'Each housemate splits the rent across the rooms by what each one is worth to them. Bids stay sealed until the last person locks in.'],
            ['Reveal and agree', 'Everyone sees the result at the same moment. The house votes, and anyone can call a fresh round.'],
          ].map(([t, d], i) => (
            <article className="step" key={t}><span className="step-num">{i + 1}</span><h3 className="headline">{t}</h3><p className="secondary">{d}</p></article>
          ))}
        </div>
      </section>

      <section id="fair" className="section split-section">
        <div className="fair-copy">
          <p className="kicker">Why it's fair</p>
          <h2 className="title-1">Nobody would rather swap.</h2>
          <p className="secondary body-lg">Quarters uses the <em>maximin envy-free</em> rule from fair-division research (Gal, Mash, Procaccia &amp; Zick):</p>
          <ul className="bullets">
            <li><b>Rooms</b> go to the people who value them most in total.</li>
            <li><b>Prices</b> are set so no one prefers another person's room at its price.</li>
            <li>Among all such prices, it picks the ones that make the <b>worst-off housemate</b> as well off as possible.</li>
          </ul>
          <p className="secondary">Every housemate gets the table on the right, so you can check the result instead of just trusting it.</p>
        </div>
        <div className="group proof">
          <div className="group-head"><h3 className="headline">The swap test <span className="example-tag">Example</span></h3><p className="secondary">Each housemate's own room is the best in their row.</p></div>
          <ProofTable room={EX_ROOM} players={EX_PLAYERS} split={split} />
        </div>
      </section>

      <section className="section">
        <p className="kicker">Built for real households</p>
        <h2 className="title-1">Designed for the awkward conversation.</h2>
        <div className="features">
          {[
            ['Sealed bids', 'Bids are stored server-side and hidden until everyone is in. Nobody can anchor on the loudest voice.', HUES[0]],
            ['Live together', 'See who\'s online, who\'s still deciding and who has locked in, as it happens.', HUES[1]],
            ['Consent built in', 'A split is only final when everyone agrees. One tap starts a fresh round.', HUES[2]],
            ['Any device', 'Made for phones first. Open the link in any browser, no app to install.', HUES[3]],
            ['No accounts', 'Pick a name and you\'re in. Your seat is remembered on your device.', HUES[4]],
            ['Show the math', 'A clear table proves the split is envy-free, down to the cent.', HUES[5]],
          ].map(([t, d, c]) => (
            <article className="feature" key={t}><span className="feature-icon" style={{ background: c }} /><h3 className="headline">{t}</h3><p className="secondary">{d}</p></article>
          ))}
        </div>
      </section>

      <section id="faq" className="section narrow">
        <p className="kicker">FAQ</p>
        <h2 className="title-1">Questions housemates ask.</h2>
        <div className="group faq">
          {[
            ['What should I bid?', 'Split the total rent the way you honestly value the rooms. If you\'d pay $1,500 for the big room and $700 for the small one, say so. Honest bids give you the best guaranteed outcome.'],
            ['Can someone see my bids before I lock in?', 'No. Bids are stored in the database and never sent to anyone\'s browser until every housemate has locked in.'],
            ['What if we don\'t like the result?', 'Anyone can tap Re-bid. Everyone\'s bids unlock and a new private round starts. The split is only final when all of you agree.'],
            ['Do we need accounts?', 'No. Share the link, pick a name, done. Your seat is remembered on the device you joined from.'],
            ['How many rooms?', 'From 2 to 8 rooms, one person per room.'],
          ].map(([q, a]) => <details key={q}><summary>{q}</summary><p className="secondary">{a}</p></details>)}
        </div>
      </section>

      <section className="cta-band">
        <h2 className="title-1">Move in without the argument.</h2>
        <p className="secondary body-lg">It takes about two minutes, and everyone can do it from their phone.</p>
        <a className="btn btn-primary btn-large" href="#/new">Start a split</a>
      </section>
    </>
  )
}

/* ---------------- Create & join ---------------- */

const CURRENCIES = ['$', '€', '£', 'Rs ', '₹']

function NewSplit() {
  const [title, setTitle] = useState('')
  const [rent, setRent] = useState('')
  const [currency, setCurrency] = useState('$')
  const [rooms, setRooms] = useState(['Big bedroom', 'Small bedroom', 'Room with balcony'])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const r = Number(rent)
    if (!(r > 0)) return setErr('Enter the total monthly rent.')
    if (rooms.some(x => !x.trim())) return setErr('Give every room a name.')
    setBusy(true)
    try {
      const me = await api.create(title.trim() || 'Our place', r, rooms.map(x => x.trim()), name.trim(), currency)
      identity.save(me); go(`#/r/${me.code}`)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <form className="page narrow form-page" onSubmit={create}>
      <a href="#/" className="back">‹ Home</a>
      <h1 className="large-title">New split</h1>
      <p className="secondary">Set up the home, then invite your housemates. One room per person.</p>

      <p className="group-label">Home</p>
      <div className="group">
        <label className="cell"><span>Name</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Our place" maxLength={80} /></label>
        <label className="cell"><span>Monthly rent</span><input inputMode="decimal" value={rent} onChange={e => setRent(e.target.value.replace(/[^\d.]/g, ''))} placeholder="3000" required /></label>
        <div className="cell"><span>Currency</span>
          <div className="segmented" role="radiogroup" aria-label="Currency">
            {CURRENCIES.map(c => <button type="button" role="radio" aria-checked={currency === c} key={c} className={currency === c ? 'on' : ''} onClick={() => setCurrency(c)}>{c.trim()}</button>)}
          </div>
        </div>
      </div>

      <p className="group-label">Rooms · {rooms.length} people</p>
      <div className="group">
        {rooms.map((r, i) => (
          <div className="cell" key={i}>
            <span className="swatch" style={{ background: HUES[i] }} />
            <input aria-label={`Room ${i + 1} name`} value={r} maxLength={40} onChange={e => setRooms(rooms.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" className="icon-btn" aria-label={`Remove room ${i + 1}`} disabled={rooms.length <= 2} onClick={() => setRooms(rooms.filter((_, j) => j !== i))}>−</button>
          </div>
        ))}
        {rooms.length < 8 && <button type="button" className="cell add-cell" onClick={() => setRooms([...rooms, `Room ${rooms.length + 1}`])}>＋ Add room</button>}
      </div>

      <p className="group-label">You</p>
      <div className="group">
        <label className="cell"><span>Your name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Adeel" maxLength={32} required /></label>
      </div>

      {err && <p className="error" role="alert">{err}</p>}
      <div className="action-bar">
        <span className="secondary footnote">{rent ? `${money(currency, Number(rent))} across ${rooms.length} rooms` : 'Nothing is shared until you invite people.'}</span>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create & get invite link'}</button>
      </div>
    </form>
  )
}

function Join() {
  const [code, setCode] = useState('')
  const valid = /^[a-z0-9]{6}$/i.test(code.trim())
  return (
    <form className="page narrow form-page center-page" onSubmit={e => { e.preventDefault(); if (valid) go(`#/r/${code.trim().toUpperCase()}`) }}>
      <Logo size={56} />
      <h1 className="large-title">Join a split</h1>
      <p className="secondary">Enter the 6-character code your housemate shared.</p>
      <input aria-label="Room code" value={code} onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, ''))} placeholder="K7Q2MX" maxLength={6} className="code-input" autoFocus autoCapitalize="characters" autoComplete="off" />
      <button className="btn btn-primary btn-large" disabled={!valid}>Join split</button>
      <a className="secondary footnote" href="#/new">No code? Start a new split</a>
    </form>
  )
}
