// Broad QA sweep: pages, layout overflow, accessibility (axe), validation, edge flows, identity, 8-room scale.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const req = createRequire(import.meta.url)
const { chromium } = req(process.env.PW ?? 'playwright')
const { createClient } = req('@supabase/supabase-js')
const BASE = process.env.BASE ?? 'http://localhost:4173/'
const env = Object.fromEntries(readFileSync('.env', 'utf8').trim().split('\n').map(l => l.split('=')))
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY)
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8')
const br = await chromium.launch()
const out = []; const bad = (k, v) => out.push(['FAIL', k, v]); const ok = (k, v = '') => out.push(['ok', k, v])
const errs = []
const page = async (w = 1280, h = 860, extra = {}) => { const c = await br.newContext({ viewport: { width: w, height: h }, ...extra }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); return p }
const W = ms => new Promise(r => setTimeout(r, ms))
async function audit(p, name) {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  over > 1 ? bad(name + ' overflow-x', over + 'px') : ok(name + ' no overflow')
  await W(1500) // let entrance animations finish so contrast is measured on the settled page
  await p.addScriptTag({ content: AXE })
  const v = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.filter(x => ['serious', 'critical'].includes(x.impact)).map(x => `${x.id}(${x.nodes.length}): ${x.nodes[0].target}`))
  v.length ? bad(name + ' a11y', v.join(' | ')) : ok(name + ' a11y')
}
// S1 pages at two widths
for (const [w, h] of [[1280, 860], [390, 844]]) {
  const p = await page(w, h)
  for (const [r, n] of [['', 'home'], ['#/new', 'new'], ['#/join', 'join'], ['#/r/ZZZZZ9', 'notfound']]) { await p.goto(BASE + r); await W(1200); await audit(p, `${n}@${w}`) }
  if (!(await p.getByText('Split not found').isVisible())) bad('notfound message', 'missing')
}
// S2 validation
{ const p = await page()
  await p.goto(BASE + '#/new'); await p.getByPlaceholder('Adeel').fill('X'); await p.getByPlaceholder('3000').fill('0'); await p.getByRole('button', { name: /Create/ }).click(); await W(500)
  ;(await p.getByText('Enter the total monthly rent').isVisible()) ? ok('rent zero rejected') : bad('rent zero', 'no error')
  await p.getByPlaceholder('3000').fill('2000'); await p.getByLabel('Room 2 name').fill('Big bedroom'); await p.getByRole('button', { name: /Create/ }).click(); await W(1500)
  ;(await p.getByText('Each room needs a different name').isVisible()) ? ok('duplicate room names rejected') : bad('dup rooms', 'no error')
  await p.getByLabel('Room 2 name').fill('Small'); await p.getByPlaceholder('Adeel').fill('   '); await p.getByRole('button', { name: /Create/ }).click(); await W(1500)
  ;(await p.getByText('Please enter your name').isVisible()) ? ok('blank name rejected') : bad('blank name', await p.locator('.error').allInnerTexts())
  await p.goto(BASE + '#/join'); (await p.getByRole('button', { name: 'Join split' }).isDisabled()) ? ok('join disabled for empty code') : bad('join', 'enabled')
}
// S3 two-room flow with duplicate name, full room, identity persistence, private device link, unlock/edit
{ const A = await page(), B = await page(390, 844), C = await page()
  await A.goto(BASE + '#/new'); await A.getByPlaceholder('3000').fill('1999.99'); await A.getByRole('button', { name: 'Remove room 3' }).click(); await A.getByPlaceholder('Adeel').fill('Ana')
  await A.getByRole('button', { name: /Create/ }).click(); await A.waitForURL(/#\/r\//); const url = A.url()
  await B.goto(url); await B.getByPlaceholder('Your name').fill('ana'); await B.getByRole('button', { name: 'Take a seat' }).click(); await W(1200)
  ;(await B.getByText('already uses that name').isVisible()) ? ok('duplicate player name rejected') : bad('dup player', 'accepted')
  await B.getByPlaceholder('Your name').fill('Ben'); await B.getByRole('button', { name: 'Take a seat' }).click(); await B.getByText('What is each room worth').waitFor()
  await C.goto(url); await W(1500); (await C.getByText('All 2 seats are taken').isVisible()) ? ok('full room shows viewer note') : bad('full room', 'no note')
  // uneven rent default split must add up exactly
  ;(await A.getByText('Adds up to').isVisible()) ? ok('default bids add up for 1999.99') : bad('default sum', await A.locator('.action-bar').innerText())
  await A.getByRole('button', { name: 'Lock in privately' }).click(); await A.getByText('Your bids are in').waitFor()
  await A.reload(); await A.getByText('Your bids are in').waitFor({ timeout: 8000 }).then(() => ok('seat survives reload'), () => bad('reload', 'lost seat'))
  await A.getByRole('button', { name: 'Change my bids' }).click(); await A.getByText('What is each room worth').waitFor().then(() => ok('unlock works'), () => bad('unlock', 'failed'))
  await A.getByLabel(/^Value of /).nth(0).fill('1200'); await A.getByLabel(/^Value of /).nth(1).fill('799.99'); await A.getByRole('button', { name: 'Lock in privately' }).click()
  // private device link
  const key = await A.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('accord:')); const v = JSON.parse(localStorage.getItem(k)); return `#/r/${v.code}/k/${v.player_id}.${v.secret}` })
  const D = await page(); await D.goto(BASE + key); await W(1500)
  ;(await D.getByText('Your bids are in').isVisible()) ? ok('private device link restores seat') : bad('device link', 'no seat')
  ;(D.url().includes('/k/')) ? bad('device link', 'key left in URL') : ok('key removed from URL')
  // bids hidden from API before reveal
  const g = (await sb.rpc('accord_get', { p_code: url.split('/').pop() })).data
  g.players.every(p => p.bids === null) ? ok('bids sealed in API') : bad('sealed', 'bids visible')
  await B.getByRole('button', { name: 'Lock in privately' }).click()
  await A.getByText('Why nobody should want to swap').waitFor({ timeout: 15000 }).then(() => ok('2-room reveal'), () => bad('2-room', 'no reveal'))
  const prices = (await A.locator('.price').allInnerTexts()).map(t => Number(t.replace(/[^\d.]/g, '')))
  Math.abs(prices.reduce((a, b) => a + b, 0) - 1999.99) < 0.011 ? ok('prices sum to 1999.99') : bad('sum', prices)
  const late = await page(); await late.goto(url); await W(1500); (await late.getByText('All 2 seats are taken').isVisible()) ? ok('late viewer after reveal') : bad('late viewer', 'no note')
  await audit(A, 'reveal@1280'); await audit(B, 'reveal@390')
  await A.getByRole('button', { name: 'I agree' }).click(); await B.getByRole('button', { name: 'I agree' }).click()
  await A.getByText('Everyone agreed').waitFor({ timeout: 15000 }).then(() => ok('agreed'), () => bad('agree', 'fail')); await audit(A, 'agreed@1280')
}
// S4 8-room split via API, reveal render timing
{ const n = 8, rent = 8000, rooms = Array.from({ length: n }, (_, i) => `Room ${i + 1}`)
  const host = (await sb.rpc('accord_create', { p_title: 'Big house', p_rent: rent, p_rooms: rooms, p_name: 'P0', p_currency: '$' })).data
  const ids = [host]; for (let i = 1; i < n; i++) ids.push((await sb.rpc('accord_join', { p_code: host.code, p_name: 'P' + i })).data)
  for (const me of ids) { const w = Array.from({ length: n }, () => Math.random()), s = w.reduce((a, b) => a + b); let b = w.map(x => Math.floor(x / s * rent * 100) / 100); b[0] = Math.round((rent - b.slice(1).reduce((a, c) => a + c, 0)) * 100) / 100
    const r = await sb.rpc('accord_submit', { p_player: me.player_id, p_secret: me.secret, p_bids: b }); if (r.error) bad('8-room submit', r.error.message) }
  const p = await page(); const t0 = Date.now(); await p.goto(BASE + '#/r/' + host.code); await p.getByText('Why nobody should want to swap').waitFor({ timeout: 20000 })
  ok('8-room reveal render', (Date.now() - t0) + 'ms'); (await p.getByText('Envy-free: everyone got').isVisible()) ? ok('8-room envy-free') : bad('8-room', await p.locator('.proof p').last().innerText())
  await audit(p, '8room@1280')
}
// S5 keyboard: first tab stops on home
{ const p = await page(); await p.goto(BASE); const seq = []; for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); seq.push(await p.evaluate(() => document.activeElement?.innerText?.trim() || document.activeElement?.getAttribute('aria-label'))) } ok('tab order', seq.join(' → ')) }
await br.close()
const uniq = [...new Set(errs)].filter(e => !e.includes('status of 400')); uniq.length ? bad('console/page errors', uniq.slice(0, 5).join(' | ')) : ok('no console errors')
for (const r of out) console.log(r.join(' | '))
console.log(`\n${out.filter(r => r[0] === 'FAIL').length} failures / ${out.length} checks`)
