'use client'

import { useEffect, useState } from 'react'

interface Props {
  startTime: number
  duration: number
  onExpire?: () => void
}

export default function Timer({ startTime, duration, onExpire }: Props) {
  const [timeLeft, setTimeLeft] = useState(duration)

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000
      const remaining = Math.max(0, duration - elapsed)
      setTimeLeft(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
        onExpire?.()
      }
    }, 100)

    return () => clearInterval(interval)
  }, [startTime, duration, onExpire])

  const pct = timeLeft / duration
  const seconds = Math.ceil(timeLeft)

  // Color: green -> yellow -> red
  let color: string
  if (pct > 0.5) {
    color = '#22c55e' // green
  } else if (pct > 0.25) {
    color = '#eab308' // yellow
  } else {
    color = '#ef4444' // red
  }

  // SVG circle progress
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - pct)

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
          {/* Background circle */}
          <circle
            cx="36"
            cy="36"
            r={radius}
            fill="none"
            stroke="#334155"
            strokeWidth="6"
          />
          {/* Progress circle */}
          <circle
            cx="36"
            cy="36"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center text-2xl font-bold"
          style={{ color }}
        >
          {seconds}
        </div>
      </div>
      <div className="text-xs text-slate-400 mt-1">sec</div>
    </div>
  )
}
