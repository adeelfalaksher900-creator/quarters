// Envy-free, maximin rent division (Gal, Mash, Procaccia & Zick, "Which is the Fairest (Rent Division) of Them All?", EC 2016).
// 1) Give rooms to maximise total stated value (any welfare-maximising assignment admits envy-free prices).
// 2) Among envy-free prices summing to the rent, pick the ones that maximise the minimum utility.
import solver from 'javascript-lp-solver'

export type Split = {
  assignment: number[] // assignment[player] = room index
  prices: number[] // prices[room]
  utility: number[] // utility[player] = value of own room - its price
  surplus: number[][] // surplus[player][room] = value - price (what they'd get in that room)
}

function bestAssignment(v: number[][]): number[] {
  const n = v.length
  let best: number[] = [], bestW = -Infinity
  // shortcut: brute-force permutations (n <= 8 → 40,320), fine in the browser; Hungarian if rooms > 8.
  const perm = [...Array(n).keys()]
  const visit = (k: number) => {
    if (k === n) {
      const w = perm.reduce((s, room, i) => s + v[i][room], 0)
      if (w > bestW + 1e-9) { bestW = w; best = [...perm] }
      return
    }
    for (let i = k; i < n; i++) {
      ;[perm[k], perm[i]] = [perm[i], perm[k]]
      visit(k + 1)
      ;[perm[k], perm[i]] = [perm[i], perm[k]]
    }
  }
  visit(0)
  return best
}

export function divide(values: number[][], rent: number): Split {
  const n = values.length
  const a = bestAssignment(values)
  const S = 2 * rent + 1 // shift so every LP variable is non-negative: p = x - S, t = y - S
  const constraints: Record<string, { max?: number; equal?: number }> = { total: { equal: rent + n * S } }
  const variables: Record<string, Record<string, number>> = { y: { t: 1 } }
  for (let j = 0; j < n; j++) variables['x' + j] = { total: 1 }
  for (let i = 0; i < n; i++) {
    const own = a[i]
    constraints['m' + i] = { max: values[i][own] + 2 * S }
    variables['x' + own]['m' + i] = 1
    variables.y['m' + i] = 1
    for (let j = 0; j < n; j++) {
      if (j === own) continue
      const key = `e${i}_${j}`
      constraints[key] = { max: values[i][own] - values[i][j] }
      variables['x' + own][key] = (variables['x' + own][key] ?? 0) + 1
      variables['x' + j][key] = (variables['x' + j][key] ?? 0) - 1
    }
  }
  const res = solver.Solve({ optimize: 't', opType: 'max', constraints, variables }) as Record<string, number> & { feasible: boolean }
  if (!res.feasible) throw new Error('No envy-free prices found')
  const prices = roundToCents([...Array(n).keys()].map(j => (res['x' + j] ?? 0) - S), rent)
  const surplus = values.map(row => row.map((val, j) => round2(val - prices[j])))
  return { assignment: a, prices, utility: a.map((room, i) => surplus[i][room]), surplus }
}

const round2 = (x: number) => Math.round(x * 100) / 100

function roundToCents(p: number[], rent: number) {
  const r = p.map(round2)
  const drift = round2(rent - r.reduce((s, x) => s + x, 0))
  if (drift !== 0) { const k = r.indexOf(Math.max(...r)); r[k] = round2(r[k] + drift) }
  return r
}

/** Largest amount any player would gain by swapping into another room (≤ 0.01 means envy-free up to rounding). */
export function maxEnvy(s: Split) {
  return Math.max(0, ...s.surplus.map((row, i) => Math.max(...row) - s.utility[i]))
}
