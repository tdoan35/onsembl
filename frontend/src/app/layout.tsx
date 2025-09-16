import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Onsembl.ai - Agent Control Center',
  description: 'Web-based Agent Control Center for orchestrating multiple AI coding agents',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-background font-sans antialiased">
          <div className="relative flex min-h-screen flex-col">
            <header className="border-b">
              <div className="container flex h-16 items-center space-x-4 sm:justify-between sm:space-x-0">
                <div className="flex gap-6 md:gap-10">
                  <a className="flex items-center space-x-2" href="/">
                    <span className="inline-block font-bold">Onsembl.ai</span>
                  </a>
                  <nav className="flex gap-6">
                    <a
                      className="flex items-center text-sm font-medium text-muted-foreground"
                      href="/agents"
                    >
                      Agents
                    </a>
                    <a
                      className="flex items-center text-sm font-medium text-muted-foreground"
                      href="/commands"
                    >
                      Commands
                    </a>
                    <a
                      className="flex items-center text-sm font-medium text-muted-foreground"
                      href="/traces"
                    >
                      Traces
                    </a>
                  </nav>
                </div>
              </div>
            </header>
            <main className="flex-1">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}