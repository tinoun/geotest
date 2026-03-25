import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'France GeoGuesser',
  description: 'Testez vos connaissances géographiques sur la France !',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-900 text-white">
        {children}
      </body>
    </html>
  )
}
