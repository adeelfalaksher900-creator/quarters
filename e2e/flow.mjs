// Multiplayer end-to-end: 3 browsers create, join, bid, reveal, dispute, re-bid and agree.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.PW ?? 'playwright')
const BASE = process.env.BASE ?? 'http://localhost:4173/'
const OUT = process.env.OUT ?? 'shots'
const browser = await chromium.launch()
const errors = []
const mk = async (w = 1280, h = 860) => { const c = await browser.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text())); return p }
const host = await mk()
await host.goto(BASE)
await host.screenshot({ path: `${OUT}/01-home.png`, fullPage: true })
await host.getByRole('link', { name: 'Start a split' }).first().click()
await host.getByText('New split').first().waitFor()
await host.getByPlaceholder('Our place').fill('Maple St. flat')
await host.getByPlaceholder('3000').fill('3000')
await host.getByPlaceholder('Adeel').fill('Adeel')
await host.getByRole('button', { name: /Create/ }).click()
await host.waitForURL(/#\/r\//)
const url = host.url()
const a = await mk(), b = await mk(390, 844)
for (const [p, n] of [[a, 'Sara'], [b, 'Bilal']]) { await p.goto(url); await p.getByPlaceholder('Your name').fill(n); await p.getByRole('button', { name: 'Take a seat' }).click(); await p.getByText('What is each room worth').waitFor() }
await host.getByText('Bilal').first().waitFor()
await host.screenshot({ path: `${OUT}/02-lobby.png`, fullPage: true })
const bid = async (p, vals) => { for (let i = 0; i < vals.length; i++) { const f = p.getByLabel(/^Value of /).nth(i); await f.fill(String(vals[i])); } }
await bid(host, [1500, 700, 800]); await host.screenshot({ path: `${OUT}/03-bidding.png`, fullPage: true })
await host.getByRole('button', { name: 'Lock in privately' }).click()
await bid(a, [1200, 600, 1200]); await a.getByRole('button', { name: 'Lock in privately' }).click()
await a.getByText('Your bids are in').waitFor()
await host.screenshot({ path: `${OUT}/04-waiting.png`, fullPage: true })
await bid(b, [1000, 1100, 900]); await b.screenshot({ path: `${OUT}/05-mobile-bid.png`, fullPage: true }); await b.getByRole('button', { name: 'Lock in privately' }).click()
for (const p of [host, a, b]) await p.getByText('Why nobody should want to swap').waitFor({ timeout: 15000 })
await host.screenshot({ path: `${OUT}/06-reveal.png`, fullPage: true }); await b.screenshot({ path: `${OUT}/07-mobile-reveal.png`, fullPage: true })
const envyOk = await host.getByText('Envy-free: everyone got').isVisible()
await b.getByRole('button', { name: 'Re-bid' }).click()
await host.getByText('Round 2').waitFor({ timeout: 15000 })
for (const [p, v] of [[host, [1500, 700, 800]], [a, [1200, 600, 1200]], [b, [1000, 1100, 900]]]) { await bid(p, v); await p.getByRole('button', { name: 'Lock in privately' }).click() }
for (const p of [host, a, b]) { await p.getByRole('button', { name: 'I agree' }).waitFor({ timeout: 15000 }); await p.getByRole('button', { name: 'I agree' }).click() }
await host.getByText('Everyone agreed').waitFor({ timeout: 15000 })
await host.screenshot({ path: `${OUT}/08-agreed.png`, fullPage: true })
const prices = await host.locator('.price').allInnerTexts()
console.log(JSON.stringify({ url, envyOk, prices, errors }))
await browser.close()
