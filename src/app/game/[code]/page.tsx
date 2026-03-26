'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Ably from 'ably'
import type { Player, City, Guess, GamePhase, Category } from '@/types/game'
import { haversineDistance, calculateScore } from '@/lib/scoring'
import { getRandomCitiesByCategory, maxDistanceForCategory } from '@/lib/cities'
import Timer from '@/components/Timer'
import RoundResults from '@/components/RoundResults'

const FranceMap = dynamic(() => import('@/components/FranceMap'), { ssr: false })

const TOTAL_ROUNDS = 10
const ROUND_DURATION = 15
const GUESS_COLORS = ['#ef4444', '#f97316', '#a855f7', '#06b6d4', '#84cc16']

function distanceColor(km: number): string {
  if (km < 50) return '#22c55e'
  if (km < 150) return '#84cc16'
  if (km < 300) return '#facc15'
  if (km < 500) return '#f97316'
  return '#ef4444'
}

export default function GamePage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  const [phase, setPhase] = useState<GamePhase>('connecting')
  const [round, setRound] = useState(0)
  const [currentCity, setCurrentCity] = useState<City | null>(null)
  const [roundStartTime, setRoundStartTime] = useState(0)
  const [myGuess, setMyGuess] = useState<{ lat: number; lng: number; distance: number; score: number } | null>(null)
  const [allGuesses, setAllGuesses] = useState<Guess[]>([])
  const [totalScores, setTotalScores] = useState<Record<string, number>>({})
  const [players, setPlayers] = useState<Player[]>([])
  const [finalScores, setFinalScores] = useState<Array<{ id: string; pseudo: string; score: number }>>([])
  const [showSaucisse, setShowSaucisse] = useState(false)
  const [category, setCategory] = useState<Category>('french')
  const categoryRef = useRef<Category>('french')
  const [roundHistory, setRoundHistory] = useState<Array<{
    round: number
    cityName: string
    guesses: Guess[]
    roundScores: Record<string, number>
  }>>([])

  // Round results data
  const [roundResultsData, setRoundResultsData] = useState<{
    city: City;
    guesses: Guess[];
    roundScores: Record<string, number>;
    totalScores: Record<string, number>;
  } | null>(null)

  const channelRef = useRef<ReturnType<Ably.Realtime['channels']['get']> | null>(null)
  const playerInfoRef = useRef<{ pseudo: string; playerId: string; isHost: boolean } | null>(null)

  // Refs for stale closure avoidance
  const phaseRef = useRef<GamePhase>('connecting')
  const playersRef = useRef<Player[]>([])
  const allGuessesRef = useRef<Guess[]>([])
  const totalScoresRef = useRef<Record<string, number>>({})
  const currentCityRef = useRef<City | null>(null)
  const roundRef = useRef(0)
  const citiesRef = useRef<City[]>([])
  const hostTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-dismiss saucisse après 3s
  useEffect(() => {
    if (!showSaucisse) return
    const t = setTimeout(() => setShowSaucisse(false), 3000)
    return () => clearTimeout(t)
  }, [showSaucisse])

  // Sync refs with state
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { playersRef.current = players }, [players])
  useEffect(() => { allGuessesRef.current = allGuesses }, [allGuesses])
  useEffect(() => { totalScoresRef.current = totalScores }, [totalScores])
  useEffect(() => { currentCityRef.current = currentCity }, [currentCity])
  useEffect(() => { roundRef.current = round }, [round])

  const endRound = useCallback(() => {
    const channel = channelRef.current
    if (!channel) return

    const currentPlayers = playersRef.current
    const currentGuesses = allGuessesRef.current
    const city = currentCityRef.current
    const curRound = roundRef.current
    const prevTotalScores = totalScoresRef.current

    const roundScores: Record<string, number> = {}
    currentPlayers.forEach(p => {
      roundScores[p.id] = currentGuesses.find(g => g.playerId === p.id)?.score ?? 0
    })

    const newTotalScores = { ...prevTotalScores }
    Object.entries(roundScores).forEach(([id, s]) => {
      newTotalScores[id] = (newTotalScores[id] || 0) + s
    })

    channel.publish('round:end', {
      city,
      guesses: currentGuesses,
      roundScores,
      totalScores: newTotalScores,
    })

    setTimeout(() => {
      if (curRound < TOTAL_ROUNDS) {
        startRound(curRound + 1)
      } else {
        const fs = currentPlayers
          .map(p => ({ id: p.id, pseudo: p.pseudo, score: newTotalScores[p.id] || 0 }))
          .sort((a, b) => b.score - a.score)
        channel.publish('game:end', { finalScores: fs })
      }
    }, 6000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startRound = useCallback((roundNum: number) => {
    const channel = channelRef.current
    if (!channel) return

    const cities = citiesRef.current
    if (roundNum > cities.length) return

    const city = cities[roundNum - 1]
    channel.publish('round:new', {
      round: roundNum,
      total: TOTAL_ROUNDS,
      city,
      startTime: Date.now(),
    })
  }, [])

  const handleGuess = useCallback((lat: number, lng: number) => {
    if (phaseRef.current !== 'guessing') return
    if (!currentCityRef.current) return

    const channel = channelRef.current
    const info = playerInfoRef.current
    if (!channel || !info) return

    const distance = haversineDistance(lat, lng, currentCityRef.current.lat, currentCityRef.current.lng)
    const timeLeft = Math.max(0, ROUND_DURATION - (Date.now() - roundStartTime) / 1000)
    const score = calculateScore(distance, timeLeft, maxDistanceForCategory(categoryRef.current))

    const guessData = { lat, lng, distance, score }
    setMyGuess(guessData)

    channel.publish('player:guess', {
      playerId: info.playerId,
      pseudo: info.pseudo,
      lat,
      lng,
      timeLeft,
      distance,
      score,
    })
  }, [roundStartTime])

  useEffect(() => {
    const stored = sessionStorage.getItem(`geoguesser:${code}`)
    if (!stored) {
      router.push('/')
      return
    }

    const info = JSON.parse(stored) as { pseudo: string; playerId: string; isHost: boolean }
    playerInfoRef.current = info

    // Cities generated after history catchup (need to know category first)

    const client = new Ably.Realtime({
      authCallback: async (tokenParams, callback) => {
        try {
          const resp = await fetch('/api/ably/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: info.playerId })
          })
          const tokenRequest = await resp.json()
          callback(null, tokenRequest)
        } catch (e) {
          callback(String(e), null)
        }
      }
    })

    const channel = client.channels.get(`geoguesser:${code}`)
    channelRef.current = channel

    // Attach, replay history to catch up, then publish join
    channel.attach().then(async () => {
      // --- History catchup: handle late arrivals ---
      try {
        const historyPage = await channel.history({ limit: 50 })
        const items = [...historyPage.items].reverse() // oldest → newest

        let activeRound = false
        let histCity: City | null = null
        let histRound = 0
        let histStartTime = 0
        const histGuesses: Guess[] = []
        let histTotalScores: Record<string, number> = {}
        const histPlayers: Player[] = []

        let histCategory: Category = 'french'

        for (const msg of items) {
          if (msg.name === 'game:restart') {
            // Hard reset — nouvelle partie lancée après ce point
            histCity = null; histRound = 0; histStartTime = 0
            histGuesses.length = 0; histTotalScores = {}; histPlayers.length = 0
            activeRound = false; histCategory = 'french'
          }
          if (msg.name === 'game:start') {
            const d = msg.data as { totalRounds: number; category?: Category }
            if (d.category) histCategory = d.category
          }
          if (msg.name === 'player:join') {
            const d = msg.data as { playerId: string; pseudo: string; isHost: boolean }
            if (!histPlayers.find(p => p.id === d.playerId)) {
              histPlayers.push({ id: d.playerId, pseudo: d.pseudo, isHost: d.isHost })
            }
          }
          if (msg.name === 'player:list') {
            const d = msg.data as { players: Player[] }
            histPlayers.splice(0, histPlayers.length, ...d.players)
          }
          if (msg.name === 'round:new') {
            const d = msg.data as { round: number; total: number; city: City; startTime: number }
            histCity = d.city
            histRound = d.round
            histStartTime = d.startTime
            histGuesses.length = 0
            activeRound = true
            if (!info.isHost) citiesRef.current[d.round - 1] = d.city
          }
          if (msg.name === 'player:guess' && activeRound) {
            const d = msg.data as Guess
            if (!histGuesses.find(g => g.playerId === d.playerId)) histGuesses.push(d)
          }
          if (msg.name === 'round:end') {
            const d = msg.data as { totalScores: Record<string, number> }
            activeRound = false
            histTotalScores = d.totalScores
            histGuesses.length = 0
          }
          if (msg.name === 'game:end') {
            const d = msg.data as { finalScores: Array<{ id: string; pseudo: string; score: number }> }
            setPhase('game-over')
            phaseRef.current = 'game-over'
            setFinalScores(d.finalScores)
            channel.publish('player:join', { playerId: info.playerId, pseudo: info.pseudo, isHost: info.isHost })
            return
          }
        }

        if (histPlayers.length > 0) {
          setPlayers(histPlayers)
          playersRef.current = histPlayers
        }
        if (Object.keys(histTotalScores).length > 0) {
          setTotalScores(histTotalScores)
          totalScoresRef.current = histTotalScores
        }
        if (activeRound && histCity) {
          const elapsed = (Date.now() - histStartTime) / 1000
          if (elapsed < ROUND_DURATION) {
            setPhase('guessing')
            phaseRef.current = 'guessing'
            setCurrentCity(histCity)
            currentCityRef.current = histCity
            setRound(histRound)
            roundRef.current = histRound
            setRoundStartTime(histStartTime)
            setAllGuesses([...histGuesses])
            allGuessesRef.current = [...histGuesses]
            const mine = histGuesses.find(g => g.playerId === info.playerId)
            if (mine) setMyGuess({ lat: mine.lat, lng: mine.lng, distance: mine.distance, score: mine.score })
          }
        }
        // Apply category and generate host cities
        categoryRef.current = histCategory
        setCategory(histCategory)
        if (info.isHost) {
          citiesRef.current = getRandomCitiesByCategory(histCategory, TOTAL_ROUNDS)
        }
      } catch (err) {
        console.error('History catchup error:', err)
        // Fallback: generate cities for host with default category
        if (info.isHost) citiesRef.current = getRandomCitiesByCategory('french', TOTAL_ROUNDS)
      }

      channel.publish('player:join', {
        playerId: info.playerId,
        pseudo: info.pseudo,
        isHost: info.isHost,
      })

      // Update phaseRef synchronously so the check below works immediately
      if (phaseRef.current === 'connecting') {
        phaseRef.current = 'waiting'
        setPhase('waiting')
      }

      // Host starts round 1 only if not already in a round from history
      if (info.isHost && phaseRef.current === 'waiting') {
        setTimeout(() => {
          if (phaseRef.current === 'waiting') startRound(1)
        }, 3000)
      }
    }).catch((err) => {
      console.error('Failed to attach channel:', err)
    })

    // Message handlers
    channel.subscribe('player:join', (message) => {
      const data = message.data as { playerId: string; pseudo: string; isHost: boolean }
      setPlayers(prev => {
        if (prev.find(p => p.id === data.playerId)) return prev
        const updated = [...prev, { id: data.playerId, pseudo: data.pseudo, isHost: data.isHost }]
        playersRef.current = updated
        return updated
      })
    })

    channel.subscribe('player:list', (message) => {
      const data = message.data as { players: Array<{ id: string; pseudo: string; isHost: boolean }> }
      const updated = data.players.map(p => ({ id: p.id, pseudo: p.pseudo, isHost: p.isHost }))
      setPlayers(updated)
      playersRef.current = updated
    })

    channel.subscribe('round:new', (message) => {
      const data = message.data as { round: number; total: number; city: City; startTime: number }
      setPhase('guessing')
      phaseRef.current = 'guessing'
      setCurrentCity(data.city)
      currentCityRef.current = data.city
      setRoundStartTime(data.startTime)
      setRound(data.round)
      roundRef.current = data.round
      setMyGuess(null)
      setAllGuesses([])
      allGuessesRef.current = []
      setRoundResultsData(null)

      // Non-host: if cities not seeded, store city for display purposes only
      if (!playerInfoRef.current?.isHost) {
        citiesRef.current[data.round - 1] = data.city
      }
    })

    channel.subscribe('player:guess', (message) => {
      const guess = message.data as Guess
      setAllGuesses(prev => {
        if (prev.find(g => g.playerId === guess.playerId)) return prev
        const updated = [...prev, guess]
        allGuessesRef.current = updated

        // Host: check if all players have guessed
        if (playerInfoRef.current?.isHost && phaseRef.current === 'guessing') {
          if (updated.length >= playersRef.current.length) {
            if (hostTimerRef.current) {
              clearTimeout(hostTimerRef.current)
              hostTimerRef.current = null
            }
            endRound()
          }
        }

        return updated
      })
    })

    channel.subscribe('round:end', (message) => {
      const data = message.data as {
        city: City;
        guesses: Guess[];
        roundScores: Record<string, number>;
        totalScores: Record<string, number>;
      }
      const capturedRound = roundRef.current
      setPhase('round-results')
      phaseRef.current = 'round-results'
      setAllGuesses(data.guesses)
      allGuessesRef.current = data.guesses
      setTotalScores(data.totalScores)
      totalScoresRef.current = data.totalScores
      setRoundResultsData(data)
      setRoundHistory(prev => [...prev, {
        round: capturedRound,
        cityName: data.city.name,
        guesses: data.guesses,
        roundScores: data.roundScores,
      }])
    })

    channel.subscribe('game:end', (message) => {
      const data = message.data as { finalScores: Array<{ id: string; pseudo: string; score: number }> }
      setPhase('game-over')
      phaseRef.current = 'game-over'
      setFinalScores(data.finalScores)
      setShowSaucisse(true)
    })

    channel.subscribe('game:restart', () => {
      router.push(`/room/${code}`)
    })

    return () => {
      channel.unsubscribe()
      client.close()
    }
  }, [code, router, startRound, endRound])

  // Host timer: end round after 15.5s
  useEffect(() => {
    if (phase !== 'guessing') return
    const info = playerInfoRef.current
    if (!info?.isHost) return

    if (hostTimerRef.current) clearTimeout(hostTimerRef.current)

    hostTimerRef.current = setTimeout(() => {
      if (phaseRef.current === 'guessing') {
        endRound()
      }
    }, (ROUND_DURATION * 1000) + 500)

    return () => {
      if (hostTimerRef.current) {
        clearTimeout(hostTimerRef.current)
        hostTimerRef.current = null
      }
    }
  }, [phase, endRound])

  const info = playerInfoRef.current
  const myScore = info ? (totalScores[info.playerId] || 0) : 0

  // Build other guesses for map (exclude my own)
  const mapOtherGuesses = allGuesses
    .filter(g => g.playerId !== info?.playerId)
    .map((g, i) => ({
      pseudo: g.pseudo,
      lat: g.lat,
      lng: g.lng,
      color: GUESS_COLORS[i % GUESS_COLORS.length],
      distance: g.distance,
    }))

  const showResults = phase === 'round-results' && roundResultsData

  if (phase === 'game-over') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <div className="fixed top-0 left-0 right-0 flex h-2">
          <div className="flex-1" style={{ backgroundColor: '#002395' }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ backgroundColor: '#ED2939' }} />
        </div>

        {/* OPHIS LA SAUCISSE */}
        {showSaucisse && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer select-none"
            style={{ background: 'rgba(0,0,0,0.97)' }}
            onClick={() => setShowSaucisse(false)}
          >
            <p className="font-black uppercase text-center leading-none"
              style={{ fontSize: 'clamp(2.5rem, 12vw, 8rem)', color: '#facc15', textShadow: '0 0 60px rgba(250,204,21,0.5)' }}>
              {finalScores[finalScores.length - 1]?.pseudo ?? 'OPHIS'}
            </p>
            <p className="font-black uppercase text-center leading-none mt-2"
              style={{ fontSize: 'clamp(2rem, 10vw, 6rem)', color: '#ED2939', textShadow: '0 0 60px rgba(237,41,57,0.5)' }}>
              LA SAUCISSE
            </p>
            <p className="text-slate-600 text-sm mt-12 animate-pulse">cliquez pour continuer</p>
          </div>
        )}

        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🏆</div>
            <h1 className="text-4xl font-bold">Classement Final</h1>
            <p className="text-slate-400 mt-2">Partie terminée !</p>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 mb-6">
            <div className="space-y-3">
              {finalScores.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`flex items-center gap-4 p-4 rounded-xl ${
                    entry.id === info?.playerId
                      ? 'border border-slate-500'
                      : ''
                  } ${index === 0 ? 'bg-yellow-900/30' : 'bg-slate-700'}`}
                >
                  <span className="text-3xl w-10 text-center">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                  </span>
                  <div className="flex-1">
                    <span className="font-bold text-lg">{entry.pseudo}</span>
                    {entry.id === info?.playerId && (
                      <span className="text-slate-400 text-sm ml-2">(vous)</span>
                    )}
                  </div>
                  <span className="text-2xl font-bold" style={{ color: '#facc15' }}>
                    {entry.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-round detail */}
          {roundHistory.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span>📊</span> Détail par manche
              </h2>
              <div className="space-y-3">
                {roundHistory.map(entry => {
                  const sorted = [...entry.guesses].sort((a, b) => (entry.roundScores[b.playerId] ?? 0) - (entry.roundScores[a.playerId] ?? 0))
                  // add players who didn't guess
                  const allIds = finalScores.map(f => f.id)
                  const guessedIds = entry.guesses.map(g => g.playerId)
                  const noGuess = allIds.filter(id => !guessedIds.includes(id))
                  return (
                    <div key={entry.round} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">
                        Manche {entry.round} · <span className="text-yellow-400 font-bold normal-case text-sm">{entry.cityName}</span>
                      </p>
                      <div className="space-y-1.5">
                        {sorted.map((g, i) => (
                          <div key={g.playerId} className={`flex items-center gap-3 text-sm ${g.playerId === info?.playerId ? 'text-white' : 'text-slate-300'}`}>
                            <span className="w-5 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}</span>
                            <span className="flex-1 font-medium truncate">{g.pseudo}</span>
                            <span className="font-bold" style={{ color: distanceColor(g.distance) }}>
                              {Math.round(g.distance)} km
                            </span>
                            <span className="text-slate-400 w-16 text-right">+{entry.roundScores[g.playerId] ?? 0} pts</span>
                          </div>
                        ))}
                        {noGuess.map(id => {
                          const player = finalScores.find(f => f.id === id)
                          return player ? (
                            <div key={id} className="flex items-center gap-3 text-sm text-slate-500">
                              <span className="w-5 text-center">—</span>
                              <span className="flex-1">{player.pseudo}</span>
                              <span className="text-slate-600">pas de réponse</span>
                              <span className="text-slate-600 w-16 text-right">+0 pts</span>
                            </div>
                          ) : null
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                channelRef.current?.publish('game:restart', {})
                router.push(`/room/${code}`)
              }}
              className="flex-1 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: '#22c55e' }}
            >
              Nouvelle partie
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: '#002395' }}
            >
              Accueil
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen flex flex-col bg-slate-900 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center px-4 py-2 bg-slate-800 border-b border-slate-700 gap-4 shrink-0"
        style={{ minHeight: '64px' }}>

        {/* Round indicator */}
        <div className="text-sm text-slate-400">
          <span className="font-bold text-white text-lg">
            Manche {round || '?'}/{TOTAL_ROUNDS}
          </span>
        </div>

        {/* City name */}
        <div className="flex-1 text-center">
          {phase === 'guessing' && currentCity ? (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Trouvez</p>
              <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#facc15' }}>
                {currentCity.name}
              </h2>
            </div>
          ) : phase === 'waiting' ? (
            <p className="text-slate-400 animate-pulse">Démarrage en cours...</p>
          ) : phase === 'round-results' ? (
            <p className="text-slate-400">Résultats de la manche</p>
          ) : (
            <p className="text-slate-400">Connexion...</p>
          )}
        </div>

        {/* Timer + score */}
        <div className="flex items-center gap-4">
          {phase === 'guessing' && roundStartTime > 0 && (
            <Timer
              startTime={roundStartTime}
              duration={ROUND_DURATION}
            />
          )}
          <div className="text-right">
            <p className="text-xs text-slate-400">Score</p>
            <p className="text-xl font-bold text-white">{myScore}</p>
          </div>
        </div>
      </div>

      {/* Map container */}
      <div className="flex-1 relative overflow-hidden">
        {(phase === 'connecting' || phase === 'waiting') ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-4 animate-bounce">🗺️</div>
              <p className="text-slate-400 text-lg animate-pulse">
                {phase === 'connecting' ? 'Connexion...' : 'Démarrage de la partie...'}
              </p>
            </div>
          </div>
        ) : (
          <FranceMap
            onGuess={phase === 'guessing' ? handleGuess : undefined}
            disabled={phase !== 'guessing' || !!myGuess}
            myGuess={myGuess}
            otherGuesses={phase === 'round-results' ? mapOtherGuesses : []}
            correctAnswer={phase === 'round-results' && roundResultsData?.city
              ? { lat: roundResultsData.city.lat, lng: roundResultsData.city.lng, name: roundResultsData.city.name }
              : null}
            showLines={phase === 'round-results'}
            europeanMode={category !== 'french'}
          />
        )}

        {/* My guess feedback */}
        {phase === 'guessing' && myGuess && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-10">
            <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-600 rounded-2xl px-8 py-5 text-center shadow-2xl">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Distance</p>
              <p className="text-6xl font-black leading-none" style={{ color: distanceColor(myGuess.distance) }}>
                {Math.round(myGuess.distance)} <span className="text-3xl font-bold">km</span>
              </p>
              <p className="text-2xl font-bold mt-2" style={{ color: '#22c55e' }}>+{myGuess.score} pts</p>
              <p className="text-xs text-slate-500 mt-3 animate-pulse">En attente des autres joueurs...</p>
            </div>
          </div>
        )}

        {/* Round results overlay */}
        {showResults && (
          <RoundResults
            cityName={roundResultsData.city.name}
            guesses={roundResultsData.guesses}
            roundScores={roundResultsData.roundScores}
            totalScores={roundResultsData.totalScores}
            players={players}
            myPlayerId={info?.playerId || ''}
            maxDistance={maxDistanceForCategory(category)}
          />
        )}
      </div>

      {/* Player guesses bar */}
      {phase === 'guessing' && players.length > 0 && (
        <div className="shrink-0 bg-slate-800 border-t border-slate-700 px-4 py-2">
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="text-xs text-slate-400 shrink-0">
              Réponses: {allGuesses.length}/{players.length}
            </span>
            {players.map(player => {
              const hasGuessed = allGuesses.some(g => g.playerId === player.id)
              return (
                <div key={player.id} className="flex items-center gap-1.5 shrink-0">
                  <div className={`w-2 h-2 rounded-full ${hasGuessed ? 'bg-green-500' : 'bg-slate-600'}`} />
                  <span className={`text-xs ${hasGuessed ? 'text-green-400' : 'text-slate-400'}`}>
                    {player.pseudo}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </main>
  )
}
