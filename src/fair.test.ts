// Run: npx tsx src/fair.test.ts
import assert from 'node:assert/strict'
import { divide, maxEnvy } from './fair.ts'

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) <= 0.02, `${a} != ${b}`)

// 2 people: classic example, rooms go to whoever values them more; split the surplus evenly.
let s = divide([[600, 400], [450, 550]], 1000)
assert.deepEqual(s.assignment, [0, 1])
close(s.prices[0] + s.prices[1], 1000)
assert.ok(maxEnvy(s) <= 0.02)
close(s.utility[0], s.utility[1]) // maximin equalises here

// Identical valuations → everyone indifferent, utilities equal.
s = divide([[500, 300, 200], [500, 300, 200], [500, 300, 200]], 1000)
assert.ok(maxEnvy(s) <= 0.02)
close(s.utility[0], s.utility[2])

// Random stress: envy-free and prices sum to rent.
for (let t = 0; t < 200; t++) {
  const n = 2 + (t % 5), rent = 1000 + t * 37
  const v = Array.from({ length: n }, () => {
    const w = Array.from({ length: n }, () => Math.random())
    const sum = w.reduce((a, b) => a + b, 0)
    return w.map(x => Math.round((x / sum) * rent * 100) / 100)
  })
  const r = divide(v, rent)
  close(r.prices.reduce((a, b) => a + b, 0), rent)
  assert.ok(maxEnvy(r) <= 0.03, `envy ${maxEnvy(r)} in ${JSON.stringify(v)}`)
  assert.equal(new Set(r.assignment).size, n)
}
console.log('fair.test: all passed')
