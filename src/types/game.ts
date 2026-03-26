export interface Player {
  id: string
  pseudo: string
  isHost: boolean
}

export interface City {
  name: string
  lat: number
  lng: number
  region: string
}

export interface Guess {
  playerId: string
  pseudo: string
  lat: number
  lng: number
  timeLeft: number
  distance: number
  score: number
}

export type GamePhase = 'connecting' | 'waiting' | 'guessing' | 'round-results' | 'game-over'

export type Category = 'french' | 'european-countries' | 'european-cities'
