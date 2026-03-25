'use client'

import type { Guess, Player } from '@/types/game'
import { scoreBreakdown } from '@/lib/scoring'

interface Props {
  cityName: string
  guesses: Guess[]
  roundScores: Record<string, number>
  totalScores: Record<string, number>
  players: Player[]
  myPlayerId: string
}

const MEDALS = ['🥇', '🥈', '🥉']

function formatDistance(km: number): string {
  if (km < 1) return '< 1 km'
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

export default function RoundResults({ cityName, guesses, roundScores, totalScores, players, myPlayerId }: Props) {
  const results = players.map(player => {
    const guess = guesses.find(g => g.playerId === player.id)
    const breakdown = guess ? scoreBreakdown(guess.distance, guess.timeLeft) : null
    return {
      playerId: player.id,
      pseudo: player.pseudo,
      distance: guess?.distance ?? null,
      timeLeft: guess?.timeLeft ?? null,
      breakdown,
      roundScore: roundScores[player.id] ?? 0,
      totalScore: totalScores[player.id] ?? 0,
    }
  }).sort((a, b) => b.roundScore - a.roundScore)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.88)' }}>
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-lg border border-slate-700 shadow-2xl">
        <h2 className="text-xl font-bold text-center mb-1">Résultats de la manche</h2>
        <p className="text-center text-slate-400 text-sm mb-5">
          La ville était : <span className="text-yellow-400 font-bold">{cityName}</span>
        </p>

        <div className="space-y-2">
          {results.map((result, index) => (
            <div
              key={result.playerId}
              className={`rounded-xl p-3 ${
                result.playerId === myPlayerId
                  ? 'bg-slate-600 border border-blue-500/50'
                  : 'bg-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl w-7 text-center shrink-0">
                  {index < 3 ? MEDALS[index] : `${index + 1}.`}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{result.pseudo}</span>
                    {result.playerId === myPlayerId && (
                      <span className="text-xs text-slate-400">(vous)</span>
                    )}
                  </div>

                  {result.distance !== null ? (
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-2xl font-bold" style={{ color: distanceColor(result.distance) }}>
                        {formatDistance(result.distance)}
                      </span>
                      {result.timeLeft !== null && (
                        <span className="text-xs text-slate-400">
                          {(15 - result.timeLeft).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500 text-sm">Pas de réponse</span>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className="font-bold text-lg" style={{ color: result.roundScore > 0 ? '#22c55e' : '#94a3b8' }}>
                    +{result.roundScore}
                  </div>
                  {result.breakdown && result.breakdown.total > 0 && (
                    <div className="text-xs text-slate-400">
                      {result.breakdown.distancePts}d + {result.breakdown.timePts}t
                    </div>
                  )}
                  <div className="text-xs text-slate-400">
                    Total : {result.totalScore}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-slate-500 text-xs mt-4 animate-pulse">
          Prochaine manche dans quelques secondes...
        </p>
      </div>
    </div>
  )
}

function distanceColor(km: number): string {
  if (km < 50) return '#22c55e'   // vert
  if (km < 150) return '#84cc16'  // vert clair
  if (km < 300) return '#facc15'  // jaune
  if (km < 500) return '#f97316'  // orange
  return '#ef4444'                // rouge
}
