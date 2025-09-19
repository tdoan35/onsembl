'use client';

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Wifi,
  WifiOff,
  Moon,
  Sun,
  Menu
} from 'lucide-react'
import './globals.css'

import { Button } from '@/components/ui/button'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'
import { WebSocketProvider } from '@/components/providers/websocket-provider'

const inter = Inter({ subsets: ['latin'] })


export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { theme, sidebarState, webSocketState, setTheme, toggleSidebar } = useUIStore()
  const [mounted, setMounted] = useState(false)

  // Handle hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle theme changes
  useEffect(() => {
    if (!mounted) return

    const root = window.document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme, mounted])


  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  if (!mounted) {
    return null // Avoid hydration mismatch
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <WebSocketProvider>
          <div className="min-h-screen bg-background font-sans antialiased">
          <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            {sidebarState !== 'hidden' && <AppSidebar />}

            {/* Main content */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Header */}
              <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex h-16 items-center px-4 space-x-4">
                  {sidebarState === 'hidden' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleSidebar}
                      className="h-8 w-8"
                    >
                      <Menu className="h-4 w-4" />
                    </Button>
                  )}
                  <div className="flex-1">
                    <h1 className="text-lg font-semibold">
                      {pathname === '/' ? 'Dashboard' : pathname.slice(1).charAt(0).toUpperCase() + pathname.slice(2)}
                    </h1>
                  </div>
                  <div className="flex items-center space-x-4">
                    {/* Theme toggle */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleTheme}
                      className="h-8 w-8"
                    >
                      {theme === 'light' ? (
                        <Moon className="h-4 w-4" />
                      ) : (
                        <Sun className="h-4 w-4" />
                      )}
                    </Button>

                    {/* WebSocket status indicator */}
                    <div className="flex items-center space-x-2">
                      {webSocketState === 'connected' ? (
                        <>
                          <Wifi className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-muted-foreground">Connected</span>
                        </>
                      ) : webSocketState === 'connecting' ? (
                        <>
                          <Wifi className="h-4 w-4 text-yellow-500 animate-pulse" />
                          <span className="text-sm text-muted-foreground">Connecting...</span>
                        </>
                      ) : webSocketState === 'error' ? (
                        <>
                          <WifiOff className="h-4 w-4 text-red-500" />
                          <span className="text-sm text-muted-foreground">Error</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-4 w-4 text-gray-500" />
                          <span className="text-sm text-muted-foreground">Disconnected</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </header>

              {/* Main content area */}
              <main className="flex-1 overflow-auto p-4">
                {children}
              </main>
            </div>
          </div>
        </div>
        </WebSocketProvider>
      </body>
    </html>
  )
}