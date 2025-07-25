import '@/styles/globals.css'
import '@rainbow-me/rainbowkit/styles.css'
import type { Metadata } from 'next'
import { Providers } from '../providers'

export const metadata: Metadata = {
  title: 'Hedwig - Crypto Payments & Invoices',
  description: 'Send crypto payments and invoices with ease',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
