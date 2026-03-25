export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function calculateScore(distanceKm: number, timeLeft: number): number {
  const MAX_DISTANCE = 1000
  const MAX_SCORE = 5000
  if (distanceKm >= MAX_DISTANCE) return 0
  const distanceScore = MAX_SCORE * (1 - distanceKm / MAX_DISTANCE)
  return Math.round(distanceScore * Math.max(0, timeLeft) / 15)
}
