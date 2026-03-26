import type { Metadata } from 'next'
import './globals.css'

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
    <html lang="en" style={{ height: '100%' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garant:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Karla:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ height: '100%' }}>{children}</body>
    </html>
  )
}
