'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { auth, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Loader2, Terminal } from 'lucide-react';

function DeviceAuthContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [userCode, setUserCode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authState, setAuthState] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [user, setUser] = useState<any>(null);

  // Get user_code from URL query params
  useEffect(() => {
    const codeFromUrl = searchParams.get('user_code');
    if (codeFromUrl) {
      setUserCode(codeFromUrl.toUpperCase());
    }
  }, [searchParams]);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await auth.getUser();
        if (currentUser) {
          setIsAuthenticated(true);
          setUser(currentUser);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setIsAuthenticated(true);
          setUser(session.user);
        } else {
          setIsAuthenticated(false);
          setUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignIn = async (provider: 'google' | 'github') => {
    try {
      const redirectUrl = `${window.location.origin}/auth/callback?redirect_to=/auth/device${userCode ? `?user_code=${userCode}` : ''}`;

      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
        },
      });
    } catch (error) {
      console.error('Sign in failed:', error);
      setErrorMessage('Failed to sign in. Please try again.');
    }
  };

  const handleAuthorize = async () => {
    if (!userCode || userCode.length !== 6) {
      setErrorMessage('Please enter a valid 6-character code');
      return;
    }

    setIsAuthorizing(true);
    setErrorMessage('');

    try {
      // Get the current session to get the access token
      const session = await auth.getSession();
      if (!session) {
        setErrorMessage('Not authenticated. Please sign in first.');
        setIsAuthorizing(false);
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/auth/device/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_code: userCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authorization failed');
      }

      setAuthState('success');
    } catch (error: any) {
      console.error('Authorization failed:', error);
      setErrorMessage(error.message || 'Failed to authorize device');
      setAuthState('error');
    } finally {
      setIsAuthorizing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-zinc-800 rounded-full">
                <Terminal className="h-8 w-8 text-blue-500" />
              </div>
            </div>
            <CardTitle className="text-2xl text-zinc-100">
              Authorize CLI Device
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Authorize your Onsembl CLI to access your account
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {authState === 'success' ? (
              <Alert className="bg-green-950 border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertTitle className="text-green-100">Success!</AlertTitle>
                <AlertDescription className="text-green-200">
                  Your device has been authorized. You can now close this window and return to your terminal.
                </AlertDescription>
              </Alert>
            ) : authState === 'error' ? (
              <Alert className="bg-red-950 border-red-800">
                <XCircle className="h-4 w-4 text-red-500" />
                <AlertTitle className="text-red-100">Authorization Failed</AlertTitle>
                <AlertDescription className="text-red-200">
                  {errorMessage}
                </AlertDescription>
              </Alert>
            ) : null}

            {!isAuthenticated ? (
              <div className="space-y-4">
                <Alert className="bg-blue-950 border-blue-800">
                  <AlertDescription className="text-blue-200">
                    Please sign in to authorize your device
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <Button
                    onClick={() => handleSignIn('google')}
                    className="w-full bg-white hover:bg-zinc-100 text-zinc-900"
                    size="lg"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </Button>

                  <Button
                    onClick={() => handleSignIn('github')}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                    size="lg"
                  >
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path
                        fillRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Continue with GitHub
                  </Button>
                </div>
              </div>
            ) : authState !== 'success' ? (
              <div className="space-y-4">
                <Alert className="bg-zinc-800 border-zinc-700">
                  <AlertDescription className="text-zinc-300">
                    Signed in as <span className="font-semibold text-zinc-100">{user?.email}</span>
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="user-code" className="text-zinc-300">
                    Device Code
                  </Label>
                  <Input
                    id="user-code"
                    type="text"
                    placeholder="Enter 6-character code"
                    value={userCode}
                    onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 text-center text-2xl font-mono tracking-widest"
                    disabled={isAuthorizing}
                  />
                  <p className="text-xs text-zinc-500">
                    Enter the code shown in your terminal
                  </p>
                </div>

                {errorMessage && (
                  <Alert className="bg-red-950 border-red-800">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <AlertDescription className="text-red-200">
                      {errorMessage}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleAuthorize}
                  disabled={!userCode || userCode.length !== 6 || isAuthorizing}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  size="lg"
                >
                  {isAuthorizing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Authorizing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Authorize Device
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => auth.signOut()}
                  variant="ghost"
                  className="w-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  Sign out
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DeviceAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    }>
      <DeviceAuthContent />
    </Suspense>
  );
}
