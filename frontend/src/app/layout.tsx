'use client';

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Activity,
  Command,
  FileText,
  GitBranch,
  Home,
  Menu,
  Moon,
  Settings,
  Sun,
  Terminal,
  User,
  X
} from 'lucide-react'
import './globals.css'

import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarNav,
  SidebarNavItem
} from '@/components/ui/sidebar'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

const inter = Inter({ subsets: ['latin'] })

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Agents', href: '/agents', icon: Activity },
  { name: 'Commands', href: '/commands', icon: Command },
  { name: 'Terminal', href: '/terminal', icon: Terminal },
  { name: 'Traces', href: '/traces', icon: GitBranch },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Audit', href: '/audit', icon: Settings },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { theme, sidebarState, setTheme, toggleSidebar, setSidebarState } = useUIStore()
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

  // Handle responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarState('collapsed')
      } else if (window.innerWidth >= 1024) {
        setSidebarState('expanded')
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setSidebarState])

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  if (!mounted) {
    return null // Avoid hydration mismatch
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="min-h-screen bg-background font-sans antialiased">
          <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <div
              className={cn(
                "relative flex-shrink-0 transition-all duration-300",
                sidebarState === 'expanded' && "w-64",
                sidebarState === 'collapsed' && "w-16",
                sidebarState === 'hidden' && "w-0"
              )}
            >
              <div className={cn(
                "absolute inset-y-0 left-0 flex flex-col border-r bg-background",
                sidebarState === 'expanded' && "w-64",
                sidebarState === 'collapsed' && "w-16",
                sidebarState === 'hidden' && "w-0 overflow-hidden"
              )}>
                <Sidebar>
                  <SidebarHeader className="px-3">
                    <div className="flex items-center justify-between">
                      {sidebarState === 'expanded' && (
                        <Link href="/" className="flex items-center space-x-2">
                          <Activity className="h-6 w-6 text-primary" />
                          <span className="text-lg font-bold">Onsembl.ai</span>
                        </Link>
                      )}
                      {sidebarState === 'collapsed' && (
                        <Activity className="h-6 w-6 text-primary mx-auto" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSidebar}
                        className="h-8 w-8"
                      >
                        {sidebarState === 'expanded' ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <Menu className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </SidebarHeader>

                  <SidebarContent>
                    <SidebarNav className="px-2">
                      {navigation.map((item) => (
                        <SidebarNavItem
                          key={item.name}
                          href={item.href}
                          active={pathname === item.href}
                          className="group"
                        >
                          <item.icon className="h-4 w-4" />
                          {sidebarState === 'expanded' && (
                            <span>{item.name}</span>
                          )}
                          {sidebarState === 'collapsed' && (
                            <span className="sr-only">{item.name}</span>
                          )}
                        </SidebarNavItem>
                      ))}
                    </SidebarNav>
                  </SidebarContent>

                  <SidebarFooter className="px-3">
                    <div className="flex items-center justify-between">
                      {sidebarState === 'expanded' ? (
                        <>
                          <div className="flex items-center space-x-2">
                            <User className="h-4 w-4" />
                            <span className="text-sm">Agent Control</span>
                          </div>
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
                        </>
                      ) : (
                        <div className="flex flex-col space-y-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleTheme}
                            className="h-8 w-8 mx-auto"
                          >
                            {theme === 'light' ? (
                              <Moon className="h-4 w-4" />
                            ) : (
                              <Sun className="h-4 w-4" />
                            )}
                          </Button>
                          <User className="h-4 w-4 mx-auto text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </SidebarFooter>
                </Sidebar>
              </div>
            </div>

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
                      {navigation.find(item => item.href === pathname)?.name || 'Dashboard'}
                    </h1>
                  </div>
                  <div className="flex items-center space-x-2">
                    {/* Status indicator */}
                    <div className="flex items-center space-x-2">
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      <span className="text-sm text-muted-foreground">Connected</span>
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
      </body>
    </html>
  )
}