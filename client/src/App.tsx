import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Feature, FeatureCollection, Geometry } from 'geojson'

const MapView = lazy(() =>
  import('./MapView').then((module) => ({ default: module.MapView })),
)

type UserSummary = {
  user_id: string
  total_points: number
  first_seen: string
  last_seen: string
}

type LatestPosition = {
  user_id: string
  latitude: number
  longitude: number
  recorded_at: string
  accuracy: number
}

type Trip = {
  trip_day: string
  start_time: string
  end_time: string
  ping_count: number
  distance_km: number
  avg_speed_kmh: number
  max_speed_kmh: number
  geojson: Geometry
}

type PlaybackPoint = {
  timestamp: string
  current_speed_kmh: number | null
  point_geojson: Geometry
}

type CoPresence = {
  user_a: string
  pos_a: Geometry
  user_b: string | null
  pos_b: Geometry | null
  distance_meters: number | null
}

type DwellPoint = {
  cluster_id: number
  arrived_at: string
  departed_at: string
  duration_minutes: number
  point_count: number
  geojson: Geometry
}

type Session = {
  username: string
}

type View = 'latest' | 'trips' | 'playback' | 'presence' | 'dwell'
type Properties = Record<string, string | number | null>
type MapFeature = Feature<Geometry, Properties>
type MapData = FeatureCollection<Geometry, Properties>

class ApiError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.status = status
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (response.status === 204) return undefined as T
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? payload.error
        : `Request failed (${response.status})`
    throw new ApiError(message ?? `Request failed (${response.status})`, response.status)
  }
  return payload as T
}

function localDateTime(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function feature(geometry: Geometry, properties: Properties = {}): MapFeature {
  return { type: 'Feature', geometry, properties }
}

const emptyMapData: MapData = { type: 'FeatureCollection', features: [] }

const labelClass = 'flex flex-col gap-2 text-xs font-bold text-slate-700'
const fieldClass =
  'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
const primaryButtonClass =
  'min-h-10 rounded-lg border border-blue-700 bg-blue-600 px-4 text-[13px] font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60'
const secondaryButtonClass =
  'min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-bold text-slate-700 hover:bg-slate-50'
const resultCardClass =
  'flex w-full flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-700'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [users, setUsers] = useState<UserSummary[]>([])
  const [latest, setLatest] = useState<LatestPosition[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [view, setView] = useState<View>('latest')
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [playback, setPlayback] = useState<PlaybackPoint[]>([])
  const [playbackIndex, setPlaybackIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackStart, setPlaybackStart] = useState(() =>
    localDateTime(new Date(Date.now() - 3_600_000)),
  )
  const [playbackEnd, setPlaybackEnd] = useState(() => localDateTime(new Date()))
  const [presenceTime, setPresenceTime] = useState(() => localDateTime(new Date()))
  const [presenceRadius, setPresenceRadius] = useState('100')
  const [presence, setPresence] = useState<CoPresence[]>([])
  const [dwells, setDwells] = useState<DwellPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fitKey, setFitKey] = useState(0)

  useEffect(() => {
    api<Session>('/auth/me')
      .then(setSession)
      .catch((reason: unknown) => {
        if (!(reason instanceof ApiError) || reason.status !== 401) {
          setError(reason instanceof Error ? reason.message : 'Session check failed')
        }
      })
      .finally(() => setCheckingSession(false))
  }, [])

  useEffect(() => {
    if (!session) return
    let active = true
    Promise.all([
      api<UserSummary[]>('/users'),
      api<LatestPosition[]>('/users/latest'),
    ])
      .then(([nextUsers, nextLatest]) => {
        if (!active) return
        setUsers(nextUsers)
        setLatest(nextLatest)
        setFitKey((current) => current + 1)
      })
      .catch((reason: unknown) => showError(reason))
    return () => {
      active = false
    }
  }, [session])

  useEffect(() => {
    if (!isPlaying || playback.length < 2) return
    const timer = window.setInterval(() => {
      setPlaybackIndex((current) => {
        if (current >= playback.length - 1) {
          setIsPlaying(false)
          return current
        }
        return current + 1
      })
    }, 700)
    return () => window.clearInterval(timer)
  }, [isPlaying, playback.length])

  function showError(reason: unknown) {
    if (reason instanceof ApiError && reason.status === 401) {
      setSession(null)
      setError('Your session expired. Please sign in again.')
      return
    }
    setError(reason instanceof Error ? reason.message : 'Something went wrong')
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const signedIn = await api<Session>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      setSession(signedIn)
      setPassword('')
    } catch (reason) {
      showError(reason)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    try {
      await api<void>('/auth/logout', { method: 'POST' })
    } catch (reason) {
      showError(reason)
    } finally {
      setSession(null)
      setUsers([])
      setLatest([])
      setTrips([])
      setPlayback([])
      setPresence([])
      setDwells([])
    }
  }

  async function loadTrips() {
    if (!selectedUser || selectedUser === 'all') return
    setLoading(true)
    setError('')
    try {
      const result = await api<Trip[]>(
        `/users/${encodeURIComponent(selectedUser)}/trips`,
      )
      setTrips(result)
      setSelectedTrip(result[0] ?? null)
      setFitKey((current) => current + 1)
    } catch (reason) {
      showError(reason)
    } finally {
      setLoading(false)
    }
  }

  async function loadPlayback() {
    if (!selectedUser || selectedUser === 'all') return
    const start = new Date(playbackStart)
    const end = new Date(playbackEnd)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
      setError('Choose a valid playback range with the start before the end.')
      return
    }

    setLoading(true)
    setError('')
    setIsPlaying(false)
    try {
      const query = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        step: '60',
      })
      const result = await api<PlaybackPoint[]>(
        `/users/${encodeURIComponent(selectedUser)}/playback?${query}`,
      )
      setPlayback(result)
      setPlaybackIndex(0)
      setFitKey((current) => current + 1)
    } catch (reason) {
      showError(reason)
    } finally {
      setLoading(false)
    }
  }

  async function loadPresence() {
    const timestamp = new Date(presenceTime)
    const radius = Number(presenceRadius)
    if (!Number.isFinite(timestamp.getTime()) || !Number.isFinite(radius) || radius <= 0) {
      setError('Choose a valid time and a positive radius.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({
        timestamp: timestamp.toISOString(),
        radius: String(radius),
      })
      const result = await api<CoPresence[]>(`/co-presence?${query}`)
      setPresence(result)
      setFitKey((current) => current + 1)
    } catch (reason) {
      showError(reason)
    } finally {
      setLoading(false)
    }
  }

  async function loadDwells() {
    if (!selectedUser || selectedUser === 'all') return
    setLoading(true)
    setError('')
    try {
      const result = await api<DwellPoint[]>(
        `/users/${encodeURIComponent(selectedUser)}/dwell-points`,
      )
      setDwells(result)
      setFitKey((current) => current + 1)
    } catch (reason) {
      showError(reason)
    } finally {
      setLoading(false)
    }
  }

  const currentPlayback = playback[playbackIndex]
  const mapData = useMemo<MapData>(() => {
    if (view === 'latest') {
      const filtered = latest.filter(
        (position) =>
          !selectedUser || selectedUser === 'all' || position.user_id === selectedUser,
      )
      return {
        type: 'FeatureCollection',
        features: filtered.map((position) =>
          feature(
            {
              type: 'Point',
              coordinates: [position.longitude, position.latitude],
            },
            { kind: 'position', user: position.user_id, time: position.recorded_at },
          ),
        ),
      }
    }
    if (view === 'trips' && selectedTrip) {
      return {
        type: 'FeatureCollection',
        features: [
          feature(selectedTrip.geojson, {
            kind: 'trip',
            date: selectedTrip.trip_day,
            distance: selectedTrip.distance_km,
          }),
        ],
      }
    }
    if (view === 'playback' && currentPlayback) {
      const points = playback
        .map((point) => point.point_geojson)
        .filter((point) => point.type === 'Point')
      const line =
        points.length > 1
          ? feature(
              {
                type: 'LineString',
                coordinates: points.map((point) => point.coordinates),
              },
              { kind: 'playback' },
            )
          : null
      return {
        type: 'FeatureCollection',
        features: [
          ...(line ? [line] : []),
          feature(currentPlayback.point_geojson, { kind: 'current' }),
        ],
      }
    }
    if (view === 'presence') {
      const features: MapFeature[] = []
      for (const pair of presence) {
        features.push(feature(pair.pos_a, { kind: 'position', user: pair.user_a }))
        if (pair.pos_b && pair.user_b) {
          features.push(feature(pair.pos_b, { kind: 'position', user: pair.user_b }))
        }
      }
      return { type: 'FeatureCollection', features }
    }
    if (view === 'dwell') {
      return {
        type: 'FeatureCollection',
        features: dwells.map((dwell) =>
          feature(dwell.geojson, {
            kind: 'dwell',
            duration: dwell.duration_minutes,
            arrived: dwell.arrived_at,
          }),
        ),
      }
    }
    return emptyMapData
  }, [currentPlayback, dwells, latest, playback, presence, selectedTrip, selectedUser, view])

  if (checkingSession) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-600">
        Loading TraceMob…
      </main>
    )
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-5">
        <form
          className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-xl"
          onSubmit={signIn}
        >
          <div className="grid size-[34px] place-items-center rounded-xl bg-blue-600 font-extrabold text-white" aria-hidden="true">T</div>
          <p className="text-[10px] font-extrabold tracking-[1.3px] text-slate-500">PERSONAL LOCATION DASHBOARD</p>
          <h1 className="m-0 text-2xl font-bold tracking-tight text-slate-800">TraceMob</h1>
          <p className="-mt-2 text-[13px] text-slate-500">Sign in to view your location history.</p>
          <label className={labelClass}>
            Username
            <input
              className={fieldClass}
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label className={labelClass}>
            Password
            <input
              className={fieldClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="m-0 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-800" role="alert">{error}</p>}
          <button className={primaryButtonClass} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-[26px] max-[760px]:h-[58px] max-[760px]:px-4">
        <a className="flex items-center gap-2.5 text-lg font-bold text-slate-800 no-underline" href="/" aria-label="TraceMob home">
          <span className="grid size-[34px] place-items-center rounded-[11px] bg-blue-600 font-extrabold text-white">T</span>
          <span>TraceMob</span>
        </a>
        <div className="flex items-center gap-[18px] text-sm text-slate-600">
          <span className="max-[760px]:hidden">{session.username}</span>
          <button
            className="min-h-[34px] rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-600 hover:bg-slate-50"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[350px_minmax(0,1fr)] max-[760px]:flex max-[760px]:flex-col">
        <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white max-[760px]:shrink-0 max-[760px]:border-r-0 max-[760px]:border-b">
          <div className="px-6 pb-5 pt-[25px] max-[760px]:px-[18px] max-[760px]:pb-[14px] max-[760px]:pt-[18px]">
            <p className="mb-2 text-[10px] font-extrabold tracking-[1.3px] text-slate-500">LOCATION EXPLORER</p>
            <h1 className="mb-1.5 text-[25px] font-bold tracking-tight text-slate-800">Your map</h1>
            <p className="text-sm text-slate-500">Explore recent and historical movement.</p>
          </div>

          <nav
            className="grid grid-cols-3 gap-1.5 border-b border-slate-100 px-[18px] pb-[18px] max-[760px]:grid-cols-5 max-[760px]:gap-[3px] max-[760px]:px-3 max-[760px]:pb-3"
            aria-label="Map views"
          >
            {([
              ['latest', 'Latest'],
              ['trips', 'Trips'],
              ['playback', 'Playback'],
              ['presence', 'Together'],
              ['dwell', 'Dwell'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                className={`min-h-[35px] rounded-md px-1 text-xs font-semibold transition-colors max-[760px]:text-[11px] ${
                  view === id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
                onClick={() => {
                  setView(id)
                  setError('')
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex flex-1 flex-col gap-[17px] overflow-auto px-[22px] py-5 max-[760px]:max-h-[42vh] max-[760px]:gap-3 max-[760px]:px-[18px] max-[760px]:py-[14px]">
            {(view !== 'presence' || users.length > 0) && (
              <label className={labelClass}>
                {view === 'latest' ? 'Show location for' : 'Person'}
                <select
                  className={fieldClass}
                  value={view === 'latest' ? selectedUser || 'all' : selectedUser}
                  onChange={(event) => setSelectedUser(event.target.value)}
                >
                  {view === 'latest' && <option value="all">Everyone</option>}
                  {view !== 'latest' && <option value="">Select a person</option>}
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>{user.user_id}</option>
                  ))}
                </select>
              </label>
            )}

            {view === 'latest' && (
              <div className="flex gap-3 rounded-lg border border-slate-200 bg-blue-50/50 p-3.5 text-xs text-slate-700">
                <span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-500" />
                <div>
                  <strong className="mb-1 block">{latest.length} people on the map</strong>
                  <p className="text-slate-500">Most recent received location per person.</p>
                </div>
              </div>
            )}

            {view === 'trips' && (
              <>
                <button className={primaryButtonClass} disabled={loading || !selectedUser || selectedUser === 'all'} onClick={() => void loadTrips()}>
                  {loading ? 'Loading trips…' : 'Load trips'}
                </button>
                <div className="flex flex-col gap-2">
                  {trips.map((trip) => (
                    <button
                      className={`${resultCardClass} cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50 ${
                        selectedTrip === trip ? 'border-blue-300 bg-blue-50' : ''
                      }`}
                      key={`${trip.trip_day}-${trip.start_time}`}
                      onClick={() => {
                        setSelectedTrip(trip)
                        setFitKey((current) => current + 1)
                      }}
                    >
                      <strong>{new Date(trip.trip_day).toLocaleDateString()}</strong>
                      <span className="text-slate-500">{trip.distance_km} km · {trip.ping_count} points</span>
                    </button>
                  ))}
                  {trips.length === 0 && <p className="text-[11px] leading-relaxed text-slate-500">Load trips to browse daily routes.</p>}
                </div>
              </>
            )}

            {view === 'playback' && (
              <div className="flex flex-col gap-3">
                <label className={labelClass}>From<input className={fieldClass} type="datetime-local" value={playbackStart} onChange={(event) => setPlaybackStart(event.target.value)} /></label>
                <label className={labelClass}>To<input className={fieldClass} type="datetime-local" value={playbackEnd} onChange={(event) => setPlaybackEnd(event.target.value)} /></label>
                <button className={primaryButtonClass} disabled={loading || !selectedUser || selectedUser === 'all'} onClick={() => void loadPlayback()}>
                  {loading ? 'Loading playback…' : 'Load playback'}
                </button>
                {playback.length > 0 && (
                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                    <button className={secondaryButtonClass} onClick={() => setIsPlaying((current) => !current)}>
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <input
                      className="min-h-6 w-full accent-blue-600"
                      aria-label="Playback position"
                      type="range"
                      min="0"
                      max={playback.length - 1}
                      value={playbackIndex}
                      onChange={(event) => setPlaybackIndex(Number(event.target.value))}
                    />
                    <span className="col-span-2 text-[11px] leading-relaxed text-slate-500">{new Date(currentPlayback.timestamp).toLocaleString()}</span>
                    <span className="col-span-2 text-[11px] leading-relaxed text-slate-500">{currentPlayback.current_speed_kmh ?? '—'} km/h</span>
                  </div>
                )}
              </div>
            )}

            {view === 'presence' && (
              <div className="flex flex-col gap-3">
                <label className={labelClass}>At time<input className={fieldClass} type="datetime-local" value={presenceTime} onChange={(event) => setPresenceTime(event.target.value)} /></label>
                <label className={labelClass}>Nearby radius (meters)<input className={fieldClass} type="number" min="1" value={presenceRadius} onChange={(event) => setPresenceRadius(event.target.value)} /></label>
                <button className={primaryButtonClass} disabled={loading} onClick={() => void loadPresence()}>
                  {loading ? 'Checking…' : 'Check co-presence'}
                </button>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {presence.filter((pair) => pair.user_b).length} nearby pairs
                </p>
                <div className="flex flex-col gap-2">
                  {presence.map((pair) => (
                    <div className={resultCardClass} key={`${pair.user_a}-${pair.user_b ?? 'none'}`}>
                      <strong>{pair.user_a}{pair.user_b ? ` · ${pair.user_b}` : ' · no nearby match'}</strong>
                      {pair.distance_meters !== null && <span className="text-slate-500">{pair.distance_meters} m apart</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'dwell' && (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] leading-relaxed text-slate-500">Find candidate stops for the selected person.</p>
                <button className={primaryButtonClass} disabled={loading || !selectedUser || selectedUser === 'all'} onClick={() => void loadDwells()}>
                  {loading ? 'Finding stops…' : 'Find dwell points'}
                </button>
                <div className="flex flex-col gap-2">
                  {dwells.map((dwell) => (
                    <div className={resultCardClass} key={dwell.cluster_id}>
                      <strong>{dwell.duration_minutes} min stop</strong>
                      <span className="text-slate-500">{new Date(dwell.arrived_at).toLocaleString()}</span>
                    </div>
                  ))}
                  {dwells.length === 0 && <p className="text-[11px] leading-relaxed text-slate-500">No dwell points loaded.</p>}
                </div>
              </div>
            )}

            {error && <p className="m-0 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-800" role="alert">{error}</p>}
          </div>
          <footer className="border-t border-slate-100 px-5 py-3 text-[10px] text-slate-400 max-[760px]:hidden">
            <span>Map tiles © OpenStreetMap contributors</span>
          </footer>
        </aside>

        <section className="relative min-h-[400px] min-w-0 max-[760px]:min-h-[360px] max-[760px]:flex-[1_1_48vh]" aria-label="Location map">
          <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-[13px] text-slate-500">Loading map…</div>}>
            <MapView data={mapData} fitKey={fitKey} />
          </Suspense>
          <div className="absolute bottom-[18px] left-[18px] flex flex-col gap-1 rounded-lg border border-slate-200/90 bg-white/95 px-3.5 py-3 text-xs text-slate-800 shadow-lg">
            <strong>{view === 'latest' ? 'Latest positions' : view === 'presence' ? 'Co-presence' : view === 'dwell' ? 'Dwell points' : view === 'trips' ? 'Trip route' : 'Playback'}</strong>
            <span className="text-[11px] text-slate-500">{users.length} tracked {users.length === 1 ? 'person' : 'people'}</span>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
