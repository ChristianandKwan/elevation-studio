import type { Metadata } from 'next'
import { Cormorant_Garamond, Karla } from 'next/font/google'
import './globals.css'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})

const karla = Karla({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-karla',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Elevation Studio — Christian & Kwan',
  description: 'Art placement studio for Christian & Kwan consultancy',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${cormorant.variable} ${karla.variable}`} style={{ height: '100%' }}>
      <body style={{ height: '100%' }}>{children}</body>
    </html>
  )
}
