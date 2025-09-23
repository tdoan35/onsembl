'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Github,
  Chrome,
  Loader2,
  X,
  ArrowLeft,
  User
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useUIStore } from '@/stores/ui-store';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  username: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  passwordConfirm: z.string(),
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Passwords don't match",
  path: ["passwordConfirm"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSignupMode, setIsSignupMode] = useState(false);
  const router = useRouter();
  const { addNotification } = useUIStore();

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: '',
      username: '',
      password: '',
      passwordConfirm: '',
    },
  });

  const handleLoginSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      addNotification({
        title: 'Welcome back!',
        description: 'Successfully logged in',
        type: 'success',
      });

      onClose();
      router.push('/dashboard');
    } catch (error) {
      addNotification({
        title: 'Login Failed',
        description: 'Please check your credentials and try again',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      addNotification({
        title: 'Account created!',
        description: 'Welcome to Onsembl.ai',
        type: 'success',
      });

      onClose();
      router.push('/dashboard');
    } catch (error) {
      addNotification({
        title: 'Signup Failed',
        description: 'Please try again or use a different email',
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
        title: 'Redirecting...',
        description: `Authenticating with ${provider === 'github' ? 'GitHub' : 'Google'}`,
        type: 'info',
      });

      // In real implementation, redirect to OAuth provider
      setTimeout(() => {
        onClose();
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

  const resetModal = () => {
    setShowEmailForm(false);
    setIsSignupMode(false);
    loginForm.reset();
    signupForm.reset();
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const toggleAuthMode = () => {
    setIsSignupMode(!isSignupMode);
    loginForm.reset();
    signupForm.reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden bg-gradient-to-b from-zinc-900/98 to-zinc-950/98 backdrop-blur-xl border border-white/10 [&>button]:text-zinc-400 [&>button]:hover:text-zinc-100 [&>button]:hover:bg-white/10 [&>button>svg]:h-5 [&>button>svg]:w-5">

        <div className="p-8">
          <DialogHeader className="mb-8 text-center">
            {showEmailForm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-8 top-8 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 h-8 w-8"
                onClick={() => setShowEmailForm(false)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}

            <div className="flex justify-center mb-6">
              <div className="flex items-center gap-2">
                <span className="text-4xl">🪄</span>
                <span className="text-3xl font-light text-zinc-100">Onsembl</span>
              </div>
            </div>

            {!showEmailForm && (
              <p className="text-sm text-zinc-400 mt-2">
                To use Onsembl you must log into an existing account or
                create one using one of the options below
              </p>
            )}
          </DialogHeader>

          {!showEmailForm ? (
            <div className="space-y-3">
              <Button
                variant="primary"
                onClick={() => handleSocialLogin('google')}
                disabled={isLoading}
                className="w-full h-12 bg-white/5 border-white/10 text-zinc-100 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all flex items-center justify-center"
              >
                <Chrome className="mr-2 h-5 w-5 flex-shrink-0" />
                <span className="font-medium">Sign in with Google</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => handleSocialLogin('github')}
                disabled={isLoading}
                className="w-full h-12 bg-white/5 border-white/10 text-zinc-100 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all flex items-center justify-center"
              >
                <Github className="mr-2 h-5 w-5 flex-shrink-0" />
                <span className="font-medium">Sign in with GitHub</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setShowEmailForm(true);
                  setIsSignupMode(false);
                }}
                disabled={isLoading}
                className="w-full h-12 bg-white/5 border-white/10 text-zinc-100 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all"
              >
                Log in with email and password
              </Button>

              <div className="pt-4 text-center">
                <p className="text-xs text-zinc-500">
                  By signing in, you accept the{' '}
                  <a href="/terms" className="text-zinc-400 hover:text-zinc-300 underline">
                    Terms of Service
                  </a>
                  {' '}and<br />
                  acknowledge our{' '}
                  <a href="/privacy" className="text-zinc-400 hover:text-zinc-300 underline">
                    Privacy Policy
                  </a>
                </p>
              </div>
            </div>
          ) : !isSignupMode ? (
            // Login Form
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLoginSubmit)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-200">Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                          <Input
                            type="email"
                            placeholder="Enter your email"
                            className="pl-10 h-10 bg-white/5 border-white/10 text-zinc-100 placeholder:text-zinc-500 focus:border-white/20 focus:bg-white/10"
                            disabled={isLoading}
                            autoFocus
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-200">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            className="pl-10 pr-10 h-10 bg-white/5 border-white/10 text-zinc-100 placeholder:text-zinc-500 focus:border-white/20 focus:bg-white/10"
                            disabled={isLoading}
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-zinc-400 hover:text-zinc-100"
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
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full h-12"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Continue'
                    )}
                  </Button>
                </div>

                <div className="text-center pt-2 space-y-2">
                  <a href="/forgot-password" className="block text-sm text-zinc-400 hover:text-zinc-300">
                    Forgot your password?
                  </a>
                  <p className="text-sm text-zinc-400">
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={toggleAuthMode}
                      className="text-zinc-300 hover:text-white underline"
                    >
                      Sign up
                    </button>
                  </p>
                </div>
              </form>
            </Form>
          ) : (
            // Signup Form
            <Form {...signupForm}>
              <form onSubmit={signupForm.handleSubmit(handleSignupSubmit)} className="space-y-4">
                <FormField
                  control={signupForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-200">Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                          <Input
                            type="email"
                            placeholder="Enter your email"
                            className="pl-10 h-10 bg-white/5 border-white/10 text-zinc-100 placeholder:text-zinc-500 focus:border-white/20 focus:bg-white/10"
                            disabled={isLoading}
                            autoFocus
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-200">
                        Username <span className="text-zinc-500">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                          <Input
                            type="text"
                            placeholder="Choose a username"
                            className="pl-10 h-10 bg-white/5 border-white/10 text-zinc-100 placeholder:text-zinc-500 focus:border-white/20 focus:bg-white/10"
                            disabled={isLoading}
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-200">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Create a password"
                            className="pl-10 pr-10 h-10 bg-white/5 border-white/10 text-zinc-100 placeholder:text-zinc-500 focus:border-white/20 focus:bg-white/10"
                            disabled={isLoading}
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-zinc-400 hover:text-zinc-100"
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
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="passwordConfirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-200">Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Confirm your password"
                            className="pl-10 h-10 bg-white/5 border-white/10 text-zinc-100 placeholder:text-zinc-500 focus:border-white/20 focus:bg-white/10"
                            disabled={isLoading}
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full h-12"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Sign up'
                    )}
                  </Button>
                </div>

                <div className="text-center pt-2">
                  <p className="text-sm text-zinc-400">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={toggleAuthMode}
                      className="text-zinc-300 hover:text-white underline"
                    >
                      Log in
                    </button>
                  </p>
                </div>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}