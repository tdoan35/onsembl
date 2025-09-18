'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Github,
  Chrome,
  Loader2,
  Terminal,
  ArrowRight,
  Zap
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useUIStore } from '@/stores/ui-store';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const magicLinkSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type LoginFormData = z.infer<typeof loginSchema>;
type MagicLinkFormData = z.infer<typeof magicLinkSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const router = useRouter();

  const { addNotification, theme } = useUIStore();

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const magicLinkForm = useForm<MagicLinkFormData>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: {
      email: '',
    },
  });

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mock successful login
      addNotification({
        title: 'Login Successful',
        description: 'Welcome to Onsembl.ai Agent Control Center',
        type: 'success',
      });

      router.push('/dashboard');
    } catch (error) {
      addNotification({
        title: 'Login Failed',
        description: 'Invalid email or password',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async (data: MagicLinkFormData) => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setMagicLinkSent(true);
      addNotification({
        title: 'Magic Link Sent',
        description: `Check your email at ${data.email} for the login link`,
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Failed to Send Magic Link',
        description: 'Please try again later',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'github' | 'google') => {
    setIsLoading(true);
    try {
      // Simulate OAuth flow
      await new Promise(resolve => setTimeout(resolve, 1000));

      addNotification({
        title: 'Authentication Started',
        description: `Redirecting to ${provider} for authentication...`,
        type: 'info',
      });

      // In real implementation, redirect to OAuth provider
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (error) {
      addNotification({
        title: 'Authentication Failed',
        description: `Failed to authenticate with ${provider}`,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/10 via-primary/5 to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />
        <div className="relative z-10 flex flex-col justify-center px-12">
          <div className="mb-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="relative">
                <Terminal className="h-10 w-10 text-primary" />
                <div className="absolute -top-1 -right-1 h-4 w-4 bg-green-500 rounded-full flex items-center justify-center">
                  <Zap className="h-2 w-2 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold">Onsembl.ai</h1>
                <p className="text-sm text-muted-foreground">Agent Control Center</p>
              </div>
            </div>

            <h2 className="text-4xl font-bold mb-4">
              Orchestrate Your
              <br />
              <span className="text-primary">AI Coding Agents</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Manage Claude, Gemini, and Codex agents through a unified dashboard
              with real-time terminal streaming and advanced orchestration.
            </p>

            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <Terminal className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Real-time Terminal Streaming</p>
                  <p className="text-sm text-muted-foreground">
                    &lt;200ms latency WebSocket connections
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Multi-Agent Orchestration</p>
                  <p className="text-sm text-muted-foreground">
                    Command queueing with priority support
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                  <ArrowRight className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium">LLM Trace Visualization</p>
                  <p className="text-sm text-muted-foreground">
                    Complete execution tree analysis
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-md">
          {/* Mobile Header */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex justify-center items-center space-x-2 mb-4">
              <Terminal className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">Onsembl.ai</span>
            </div>
            <Badge variant="outline">Agent Control Center</Badge>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold">Welcome back</h2>
            <p className="text-muted-foreground mt-2">
              Sign in to your agent control center
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>
                Choose your preferred authentication method
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="email" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="email">Email & Password</TabsTrigger>
                  <TabsTrigger value="magic">Magic Link</TabsTrigger>
                </TabsList>

                {/* Email & Password Tab */}
                <TabsContent value="email" className="space-y-4">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  type="email"
                                  placeholder="Enter your email"
                                  className="pl-10"
                                  disabled={isLoading}
                                  {...field}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  type={showPassword ? "text" : "password"}
                                  placeholder="Enter your password"
                                  className="pl-10 pr-10"
                                  disabled={isLoading}
                                  {...field}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                  onClick={() => setShowPassword(!showPassword)}
                                  disabled={isLoading}
                                >
                                  {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex items-center justify-between">
                        <Link
                          href="/forgot-password"
                          className="text-sm text-muted-foreground hover:text-primary"
                        >
                          Forgot password?
                        </Link>
                      </div>

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          <>
                            Sign in
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                {/* Magic Link Tab */}
                <TabsContent value="magic" className="space-y-4">
                  {!magicLinkSent ? (
                    <Form {...magicLinkForm}>
                      <form onSubmit={magicLinkForm.handleSubmit(handleMagicLink)} className="space-y-4">
                        <FormField
                          control={magicLinkForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input
                                    type="email"
                                    placeholder="Enter your email"
                                    className="pl-10"
                                    disabled={isLoading}
                                    {...field}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <p className="text-sm text-muted-foreground">
                          We'll send you a secure login link via email.
                        </p>

                        <Button
                          type="submit"
                          className="w-full"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Mail className="mr-2 h-4 w-4" />
                              Send Magic Link
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="h-16 w-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
                        <Mail className="h-8 w-8 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-medium">Check your email</h3>
                        <p className="text-sm text-muted-foreground mt-2">
                          We've sent a secure login link to your email address.
                          Click the link to sign in automatically.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setMagicLinkSent(false)}
                        className="w-full"
                      >
                        Try Again
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Social Login */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant="outline"
                  onClick={() => handleSocialLogin('github')}
                  disabled={isLoading}
                  className="w-full"
                >
                  <Github className="mr-2 h-4 w-4" />
                  GitHub
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleSocialLogin('google')}
                  disabled={isLoading}
                  className="w-full"
                >
                  <Chrome className="mr-2 h-4 w-4" />
                  Google
                </Button>
              </div>

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{' '}
                  <Link href="/signup" className="text-primary hover:underline">
                    Sign up
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="text-center mt-8">
            <p className="text-xs text-muted-foreground">
              By signing in, you agree to our{' '}
              <Link href="/terms" className="hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="hover:underline">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}