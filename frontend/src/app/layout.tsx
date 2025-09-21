import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { WebSocketProvider } from '@/components/providers/websocket-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Onsembl.ai - Agent Control Center',
  description:
    'Orchestrate multiple AI coding agents through a unified dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.30/dist/unicornStudio.umd.js"></script>
      </head>
      <body className={inter.className}>
        <WebSocketProvider>{children}</WebSocketProvider>
      </body>
    </html>
  );
}
