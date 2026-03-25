'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Ably from 'ably'
import type { Player, City, Guess, GamePhase } from '@/types/game'
import { haversineDistance, calculateScore } from '@/lib/scoring'
import { getRandomCities } from '@/lib/cities'
import Timer from '@/components/Timer'
import RoundResults from '@/components/RoundResults'

const FranceMap = dynamic(() => import('@/components/FranceMap'), { ssr: false })

const TOTAL_ROUNDS = 10
const ROUND_DURATION = 15
const GUESS_COLORS = ['#ef4444', '#f97316', '#a855f7', '#06b6d4', '#84cc16']

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
    const score = calculateScore(distance, timeLeft)

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

    // Generate cities for the host
    if (info.isHost) {
      citiesRef.current = getRandomCities(TOTAL_ROUNDS)
    }

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

    // Publish join
    channel.attach().then(() => {
      channel.publish('player:join', {
        playerId: info.playerId,
        pseudo: info.pseudo,
        isHost: info.isHost,
      })

      setPhase('waiting')

      // Host starts round 1 after 3 seconds
      if (info.isHost) {
        setTimeout(() => {
          startRound(1)
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
      setPhase('round-results')
      phaseRef.current = 'round-results'
      setAllGuesses(data.guesses)
      allGuessesRef.current = data.guesses
      setTotalScores(data.totalScores)
      totalScoresRef.current = data.totalScores
      setRoundResultsData(data)
    })

    channel.subscribe('game:end', (message) => {
      const data = message.data as { finalScores: Array<{ id: string; pseudo: string; score: number }> }
      setPhase('game-over')
      phaseRef.current = 'game-over'
      setFinalScores(data.finalScores)
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

          <button
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90"
            style={{ backgroundColor: '#002395' }}
          >
            Retour à l&apos;accueil
          </button>
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
          />
        )}

        {/* My guess feedback */}
        {phase === 'guessing' && myGuess && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
            <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-600 rounded-xl px-6 py-3 text-center shadow-lg">
              <p className="text-sm text-slate-400">Votre réponse</p>
              <p className="font-bold text-white">
                {Math.round(myGuess.distance)} km —{' '}
                <span style={{ color: '#22c55e' }}>+{myGuess.score} pts</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 animate-pulse">
                En attente des autres joueurs...
              </p>
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
