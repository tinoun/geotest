export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Distance = facteur principal (4500 pts max, courbe quadratique)
// Temps = bonus secondaire (500 pts max)
export function calculateScore(distanceKm: number, timeLeft: number): number {
  if (distanceKm >= 1000) return 0
  const distanceScore = Math.round(4500 * Math.pow(1 - distanceKm / 1000, 2))
  const timeBonus = distanceScore > 0 ? Math.round(500 * Math.max(0, timeLeft) / 15) : 0
  return distanceScore + timeBonus
}

export function scoreBreakdown(distanceKm: number, timeLeft: number): { distancePts: number; timePts: number; total: number } {
  if (distanceKm >= 1000) return { distancePts: 0, timePts: 0, total: 0 }
  const distancePts = Math.round(4500 * Math.pow(1 - distanceKm / 1000, 2))
  const timePts = distancePts > 0 ? Math.round(500 * Math.max(0, timeLeft) / 15) : 0
  return { distancePts, timePts, total: distancePts + timePts }
}
