'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Ably from 'ably'
import type { Player } from '@/types/game'

export default function RoomPage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  const [players, setPlayers] = useState<Player[]>([])
  const [copied, setCopied] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  const channelRef = useRef<ReturnType<Ably.Realtime['channels']['get']> | null>(null)
  const ablyRef = useRef<Ably.Realtime | null>(null)
  const playerInfoRef = useRef<{ pseudo: string; playerId: string; isHost: boolean } | null>(null)
  const playersRef = useRef<Player[]>([])

  // Keep playersRef in sync with players state
  useEffect(() => {
    playersRef.current = players
  }, [players])

  const handlePlayerJoin = useCallback((message: Ably.Message) => {
    const data = message.data as { playerId: string; pseudo: string; isHost: boolean }
    const newPlayer: Player = { id: data.playerId, pseudo: data.pseudo, isHost: data.isHost }

    setPlayers(prev => {
      const exists = prev.find(p => p.id === newPlayer.id)
      if (exists) return prev
      const updated = [...prev, newPlayer]
      playersRef.current = updated

      // If I'm the host, broadcast the full player list
      const info = playerInfoRef.current
      if (info?.isHost && channelRef.current) {
        channelRef.current.publish('player:list', { players: updated.map(p => ({ id: p.id, pseudo: p.pseudo, isHost: p.isHost })) })
      }

      return updated
    })
  }, [])

  const handlePlayerList = useCallback((message: Ably.Message) => {
    const data = message.data as { players: { id: string; pseudo: string; isHost: boolean }[] }
    const updated = data.players.map(p => ({ id: p.id, pseudo: p.pseudo, isHost: p.isHost }))
    setPlayers(updated)
    playersRef.current = updated
  }, [])

  const handleGameStart = useCallback(() => {
    router.push(`/game/${code}`)
  }, [router, code])

  useEffect(() => {
    const stored = sessionStorage.getItem(`geoguesser:${code}`)
    if (!stored) {
      router.push('/')
      return
    }

    const info = JSON.parse(stored) as { pseudo: string; playerId: string; isHost: boolean }
    playerInfoRef.current = info

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

    ablyRef.current = client

    client.connection.on('connected', () => {
      setConnected(true)
    })

    client.connection.on('failed', () => {
      setError('Connexion Ably échouée')
    })

    const channel = client.channels.get(`geoguesser:${code}`)
    channelRef.current = channel

    channel.subscribe('player:join', handlePlayerJoin)
    channel.subscribe('player:list', handlePlayerList)
    channel.subscribe('game:start', handleGameStart)

    // Publish our own join
    channel.attach().then(() => {
      channel.publish('player:join', {
        playerId: info.playerId,
        pseudo: info.pseudo,
        isHost: info.isHost,
      })
    }).catch((err) => {
      console.error('Failed to attach channel:', err)
    })

    return () => {
      channel.unsubscribe()
      client.close()
    }
  }, [code, router, handlePlayerJoin, handlePlayerList, handleGameStart])

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function startGame() {
    if (!channelRef.current) return
    // Don't navigate here — handleGameStart fires for all players including host (Ably echo)
    channelRef.current.publish('game:start', { totalRounds: 10 })
  }

  const info = playerInfoRef.current
  const canStart = players.length >= 2

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>

      {/* French flag stripe */}
      <div className="fixed top-0 left-0 right-0 flex h-2">
        <div className="flex-1" style={{ backgroundColor: '#002395' }} />
        <div className="flex-1 bg-white" />
        <div className="flex-1" style={{ backgroundColor: '#ED2939' }} />
      </div>

      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-bold text-center mb-8">
          Salle d&apos;attente
        </h1>

        {/* Room code card */}
        <div className="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700">
          <p className="text-slate-400 text-sm mb-2 text-center">Code de la room</p>
          <div className="flex items-center justify-center gap-4">
            <span className="text-5xl font-mono font-bold tracking-widest text-white">
              {code}
            </span>
            <button
              onClick={copyCode}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-slate-300 hover:text-white"
              title="Copier le code"
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>
          {!connected && (
            <p className="text-slate-500 text-sm text-center mt-3 animate-pulse">
              Connexion en cours...
            </p>
          )}
          {error && (
            <p className="text-red-400 text-sm text-center mt-3">{error}</p>
          )}
        </div>

        {/* Players list */}
        <div className="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>👥</span>
            <span>Joueurs ({players.length})</span>
            {players.length < 2 && (
              <span className="text-slate-500 text-sm font-normal ml-auto">
                Min. 2 joueurs
              </span>
            )}
          </h2>

          {players.length === 0 ? (
            <p className="text-slate-500 text-center py-4 animate-pulse">
              En attente des joueurs...
            </p>
          ) : (
            <ul className="space-y-2">
              {players.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-700"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: player.isHost ? '#002395' : '#374151' }}>
                    {player.pseudo[0].toUpperCase()}
                  </div>
                  <span className="font-medium">{player.pseudo}</span>
                  {player.isHost && (
                    <span className="ml-auto text-lg" title="Hôte">👑</span>
                  )}
                  {player.id === info?.playerId && (
                    <span className="text-slate-400 text-xs ml-auto">(vous)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Action button */}
        <div className="text-center">
          {info?.isHost ? (
            <button
              onClick={startGame}
              disabled={!canStart}
              className="w-full py-4 px-8 rounded-xl font-bold text-xl text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: canStart ? '#002395' : '#374151',
                transform: canStart ? 'scale(1)' : 'scale(0.98)',
              }}
              onMouseEnter={(e) => { if (canStart) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
            >
              {canStart ? '🚀 Démarrer la partie' : `Attente de joueurs (${players.length}/2 min)`}
            </button>
          ) : (
            <div className="py-4 px-8 rounded-xl border border-slate-700 text-slate-400">
              ⏳ En attente que l&apos;hôte démarre la partie...
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
