import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface OtherGuess {
  pseudo: string
  lat: number
  lng: number
  color: string
}

interface Props {
  onGuess?: (lat: number, lng: number) => void
  disabled?: boolean
  myGuess?: { lat: number; lng: number } | null
  otherGuesses?: OtherGuess[]
  correctAnswer?: { lat: number; lng: number; name: string } | null
  showLines?: boolean
}

const GUESS_COLORS = ['#ef4444', '#f97316', '#a855f7', '#06b6d4', '#84cc16']

function createDivIcon(color: string, label?: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background-color: ${color};
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    "></div>${label ? `<div style="
      position: absolute;
      top: 22px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.7);
      color: white;
      font-size: 11px;
      padding: 2px 5px;
      border-radius: 3px;
      white-space: nowrap;
    ">${label}</div>` : ''}`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

function createStarIcon(name: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="
      font-size: 28px;
      line-height: 1;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
    ">⭐</div>
    <div style="
      position: absolute;
      top: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: #facc15;
      font-size: 12px;
      font-weight: bold;
      padding: 3px 7px;
      border-radius: 4px;
      white-space: nowrap;
      border: 1px solid rgba(250,204,21,0.5);
    ">${name}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export default function FranceMap({
  onGuess,
  disabled,
  myGuess,
  otherGuesses = [],
  correctAnswer,
  showLines,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const myMarkerRef = useRef<L.Marker | null>(null)
  const otherMarkersRef = useRef<L.Marker[]>([])
  const correctMarkerRef = useRef<L.Marker | null>(null)
  const linesRef = useRef<L.Polyline[]>([])

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [46.603354, 1.888334],
      zoom: 5,
      minZoom: 4,
      maxZoom: 10,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Click handler
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function handleClick(e: L.LeafletMouseEvent) {
      if (!disabled && onGuess) {
        onGuess(e.latlng.lat, e.latlng.lng)
      }
    }

    map.on('click', handleClick)
    return () => { map.off('click', handleClick) }
  }, [disabled, onGuess])

  // Update cursor style
  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.style.cursor = disabled ? 'default' : 'crosshair'
  }, [disabled])

  // My guess marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (myMarkerRef.current) {
      myMarkerRef.current.remove()
      myMarkerRef.current = null
    }

    if (myGuess) {
      const marker = L.marker([myGuess.lat, myGuess.lng], {
        icon: createDivIcon('#3b82f6', 'Vous'),
      }).addTo(map)
      myMarkerRef.current = marker
    }
  }, [myGuess])

  // Other guess markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    otherMarkersRef.current.forEach(m => m.remove())
    otherMarkersRef.current = []

    otherGuesses.forEach((guess, i) => {
      const color = guess.color || GUESS_COLORS[i % GUESS_COLORS.length]
      const marker = L.marker([guess.lat, guess.lng], {
        icon: createDivIcon(color, guess.pseudo),
      }).addTo(map)
      otherMarkersRef.current.push(marker)
    })
  }, [otherGuesses])

  // Correct answer marker + lines
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (correctMarkerRef.current) {
      correctMarkerRef.current.remove()
      correctMarkerRef.current = null
    }

    linesRef.current.forEach(l => l.remove())
    linesRef.current = []

    if (correctAnswer) {
      const marker = L.marker([correctAnswer.lat, correctAnswer.lng], {
        icon: createStarIcon(correctAnswer.name),
      }).addTo(map)
      correctMarkerRef.current = marker

      if (showLines) {
        const correctLatLng: L.LatLngExpression = [correctAnswer.lat, correctAnswer.lng]

        // Draw line for my guess
        if (myGuess) {
          const line = L.polyline([[myGuess.lat, myGuess.lng], correctLatLng], {
            color: '#3b82f6',
            weight: 2,
            dashArray: '6, 4',
            opacity: 0.7,
          }).addTo(map)
          linesRef.current.push(line)
        }

        // Draw lines for other guesses
        otherGuesses.forEach((guess, i) => {
          const color = guess.color || GUESS_COLORS[i % GUESS_COLORS.length]
          const line = L.polyline([[guess.lat, guess.lng], correctLatLng], {
            color,
            weight: 2,
            dashArray: '6, 4',
            opacity: 0.6,
          }).addTo(map)
          linesRef.current.push(line)
        })
      }
    }
  }, [correctAnswer, showLines, myGuess, otherGuesses])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: '400px' }}
    />
  )
}
