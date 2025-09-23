'use client';

import { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { type SignupFormData } from '@/lib/auth-validation';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

interface SignupFormProps {
  form: UseFormReturn<SignupFormData>;
  onSubmit: (data: SignupFormData) => Promise<void>;
  isLoading: boolean;
  onToggleMode: () => void;
}

export function SignupForm({ form, onSubmit, isLoading, onToggleMode }: SignupFormProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
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
                    autoComplete="email"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage className="text-red-400" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
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
                    autoComplete="username"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage className="text-red-400" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
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
                    autoComplete="new-password"
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
          control={form.control}
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
                    autoComplete="new-password"
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
              onClick={onToggleMode}
              className="text-zinc-300 hover:text-white underline"
            >
              Log in
            </button>
          </p>
        </div>
      </form>
    </Form>
  );
}