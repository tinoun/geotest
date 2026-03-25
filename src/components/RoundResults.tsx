'use client'

import type { Guess, Player } from '@/types/game'

interface Props {
  cityName: string
  guesses: Guess[]
  roundScores: Record<string, number>
  totalScores: Record<string, number>
  players: Player[]
  myPlayerId: string
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function RoundResults({ cityName, guesses, roundScores, totalScores, players, myPlayerId }: Props) {
  // Build sorted results
  const results = players.map(player => {
    const guess = guesses.find(g => g.playerId === player.id)
    return {
      playerId: player.id,
      pseudo: player.pseudo,
      distance: guess?.distance ?? null,
      roundScore: roundScores[player.id] ?? 0,
      totalScore: totalScores[player.id] ?? 0,
    }
  }).sort((a, b) => b.roundScore - a.roundScore)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-lg border border-slate-700 shadow-2xl">
        <h2 className="text-2xl font-bold text-center mb-2">
          Résultats de la manche
        </h2>
        <p className="text-center text-slate-400 mb-6">
          La ville était : <span className="text-white font-semibold">{cityName}</span>
        </p>

        <div className="space-y-3">
          {results.map((result, index) => (
            <div
              key={result.playerId}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                result.playerId === myPlayerId
                  ? 'bg-slate-600 border border-slate-500'
                  : 'bg-slate-700'
              }`}
            >
              <span className="text-2xl w-8 text-center">
                {index < 3 ? MEDALS[index] : `${index + 1}.`}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{result.pseudo}</span>
                  {result.playerId === myPlayerId && (
                    <span className="text-xs text-slate-400">(vous)</span>
                  )}
                </div>
                <div className="text-sm text-slate-400">
                  {result.distance !== null
                    ? `${Math.round(result.distance)} km`
                    : 'Pas de réponse'}
                </div>
              </div>

              <div className="text-right">
                <div
                  className="text-lg font-bold"
                  style={{ color: result.roundScore > 0 ? '#22c55e' : '#94a3b8' }}
                >
                  +{result.roundScore}
                </div>
                <div className="text-sm text-slate-400">
                  Total: {result.totalScore}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-slate-500 text-sm mt-4 animate-pulse">
          Prochaine manche dans 5 secondes...
        </p>
      </div>
    </div>
  )
}
