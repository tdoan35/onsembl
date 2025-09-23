'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/auth-context';
import {
  loginSchema,
  signupSchema,
  type LoginFormData,
  type SignupFormData
} from '@/lib/auth-validation';
import {
  Github,
  Chrome,
  ArrowLeft,
  CheckCircle,
  Mail as MailIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from '@/components/ui/dialog';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [showConfirmationMessage, setShowConfirmationMessage] = useState(false);
  const { signIn, signUp, signInWithGoogle, signInWithGithub } = useAuth();

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
      await signIn(data.email.toLowerCase().trim(), data.password);
      onClose();
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    try {
      const username = data.username?.trim() ? data.username.trim() : undefined;
      await signUp(data.email.toLowerCase().trim(), data.password, username);
      // Show confirmation message instead of closing immediately
      setShowConfirmationMessage(true);
      setIsSignupMode(false);
    } catch (error) {
      console.error('Signup error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'github' | 'google') => {
    setIsLoading(true);
    try {
      if (provider === 'github') {
        await signInWithGithub();
      } else {
        await signInWithGoogle();
      }
    } catch (error) {
      console.error('OAuth error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetModal = () => {
    setShowEmailForm(false);
    setIsSignupMode(false);
    setShowConfirmationMessage(false);
    loginForm.reset({
      email: '',
      password: '',
    });
    signupForm.reset({
      email: '',
      username: '',
      password: '',
      passwordConfirm: '',
    });
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const toggleAuthMode = () => {
    setIsSignupMode(!isSignupMode);
    loginForm.reset({
      email: '',
      password: '',
    });
    signupForm.reset({
      email: '',
      username: '',
      password: '',
      passwordConfirm: '',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden bg-gradient-to-b from-zinc-900/70 to-zinc-950/80 backdrop-blur-lg border border-white/10 [&>button]:text-zinc-400 [&>button]:hover:text-zinc-100 [&>button]:hover:bg-white/10 [&>button>svg]:h-5 [&>button>svg]:w-5">

        <div className="p-8">
          <DialogHeader className="mb-8 text-center">
            {showEmailForm && !showConfirmationMessage && (
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

            {!showEmailForm && !showConfirmationMessage && (
              <p className="text-sm text-zinc-400 mt-2">
                To use Onsembl you must log into an existing account or
                create one using one of the options below
              </p>
            )}
          </DialogHeader>

          {showConfirmationMessage ? (
            // Email confirmation message
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
                    <MailIcon className="h-8 w-8 text-green-500" />
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-500 absolute -bottom-1 -right-1" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-zinc-100">Check your email!</h3>
                <p className="text-sm text-zinc-400 max-w-sm mx-auto">
                  We've sent you a confirmation link. Please check your inbox and click the link to complete your registration.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-zinc-500">
                  Didn't receive the email? Check your spam folder or
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowConfirmationMessage(false);
                    setShowEmailForm(true);
                    setIsSignupMode(true);
                  }}
                  className="w-full h-10 bg-white/5 border-white/10 text-zinc-100 hover:bg-white/10 hover:text-white hover:border-white/20"
                >
                  Try signing up again
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleClose}
                  className="w-full h-10 text-zinc-400 hover:text-zinc-100"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : !showEmailForm ? (
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
            <LoginForm
              form={loginForm}
              onSubmit={handleLoginSubmit}
              isLoading={isLoading}
              onToggleMode={toggleAuthMode}
            />
          ) : (
            <SignupForm
              form={signupForm}
              onSubmit={handleSignupSubmit}
              isLoading={isLoading}
              onToggleMode={toggleAuthMode}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}