'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'

function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export default function HomePage() {
  const router = useRouter()
  const [pseudo, setPseudo] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [mode, setMode] = useState<'create' | 'join' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleCreate() {
    if (!pseudo.trim()) {
      setError('Veuillez entrer un pseudo')
      return
    }
    setLoading(true)
    const code = generateRoomCode()
    const playerId = uuidv4()
    sessionStorage.setItem(`geoguesser:${code}`, JSON.stringify({
      pseudo: pseudo.trim(),
      playerId,
      isHost: true,
    }))
    router.push(`/room/${code}`)
  }

  function handleJoin() {
    if (!pseudo.trim()) {
      setError('Veuillez entrer un pseudo')
      return
    }
    if (!roomCode.trim() || roomCode.trim().length !== 6) {
      setError('Veuillez entrer un code de room valide (6 lettres)')
      return
    }
    setLoading(true)
    const code = roomCode.trim().toUpperCase()
    const playerId = uuidv4()
    sessionStorage.setItem(`geoguesser:${code}`, JSON.stringify({
      pseudo: pseudo.trim(),
      playerId,
      isHost: false,
    }))
    router.push(`/room/${code}`)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>

      {/* French flag stripe decoration */}
      <div className="fixed top-0 left-0 right-0 flex h-2">
        <div className="flex-1" style={{ backgroundColor: '#002395' }} />
        <div className="flex-1 bg-white" />
        <div className="flex-1" style={{ backgroundColor: '#ED2939' }} />
      </div>

      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-4">🗺️</div>
          <h1 className="text-4xl font-bold mb-2 tracking-tight">
            France
            <span className="ml-2" style={{ color: '#ED2939' }}>GeoGuesser</span>
          </h1>
          <p className="text-slate-400 text-lg">
            Testez vos connaissances géographiques
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700">
          {/* Pseudo input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Votre pseudo
            </label>
            <input
              type="text"
              value={pseudo}
              onChange={(e) => { setPseudo(e.target.value); setError('') }}
              placeholder="Entrez votre pseudo..."
              maxLength={20}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition"
              style={{ '--tw-ring-color': '#002395' } as React.CSSProperties}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mode === null) setMode('create')
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm text-red-300 border border-red-800"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
              {error}
            </div>
          )}

          {/* Mode selection or join form */}
          {mode === null && (
            <div className="flex flex-col gap-3">
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full py-3 px-6 rounded-xl font-semibold text-white text-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#002395' }}
              >
                🎮 Créer une partie
              </button>
              <button
                onClick={() => setMode('join')}
                disabled={loading}
                className="w-full py-3 px-6 rounded-xl font-semibold text-white text-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600 hover:border-slate-400"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                🔗 Rejoindre une partie
              </button>
            </div>
          )}

          {mode === 'join' && (
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Code de la room
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError('') }}
                  placeholder="Ex: ABCDEF"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition text-center text-2xl font-mono tracking-widest uppercase"
                  style={{ '--tw-ring-color': '#002395' } as React.CSSProperties}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setMode(null); setRoomCode(''); setError('') }}
                  className="flex-1 py-3 px-6 rounded-xl font-semibold text-slate-300 border border-slate-600 hover:border-slate-400 transition-all"
                >
                  Retour
                </button>
                <button
                  onClick={handleJoin}
                  disabled={loading}
                  className="flex-1 py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
                  style={{ backgroundColor: '#002395' }}
                >
                  {loading ? 'Connexion...' : 'Rejoindre'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-slate-500 text-sm">
          <p>5+ joueurs • 10 manches • 15 secondes par manche</p>
        </div>
      </div>
    </main>
  )
}
