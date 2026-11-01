import { useEffect, useState } from 'react'

export const HUES = ['#ff9500', '#0a84ff', '#30d158', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#5e5ce6']
export const money = (cur: string, x: number) => `${cur}${x.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
export const go = (path: string) => { location.hash = path; scrollTo(0, 0) }

export function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => { const f = () => setHash(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return hash
}

export const Logo = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="9" fill="var(--ink)" />
    <rect x="7" y="7" width="8" height="8" rx="2.2" fill="#ff9500" />
    <rect x="17" y="7" width="8" height="8" rx="2.2" fill="var(--bg-elev)" />
    <rect x="7" y="17" width="8" height="8" rx="2.2" fill="var(--bg-elev)" />
    <rect x="17" y="17" width="8" height="8" rx="2.2" fill="#0a84ff" />
  </svg>
)

export const Avatar = ({ name, seat, on, size }: { name: string; seat: number; on?: boolean; size?: 'lg' }) => (
  <span className={'avatar' + (on ? ' on' : '') + (size ? ' ' + size : '')} style={{ background: HUES[seat % 8] }} title={`${name}${on ? ' · online' : ''}`}>
    {name.slice(0, 1).toUpperCase()}
  </span>
)

export const Check = () => <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
