'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getPasswordStrength,
  getPasswordStrengthLabel,
  getPasswordStrengthColor
} from '@/lib/auth-validation';

interface PasswordStrengthIndicatorProps {
  password: string;
  showLabel?: boolean;
  className?: string;
}

export function PasswordStrengthIndicator({
  password,
  showLabel = true,
  className
}: PasswordStrengthIndicatorProps) {
  const [strength, setStrength] = useState(0);

  useEffect(() => {
    if (password) {
      setStrength(getPasswordStrength(password));
    } else {
      setStrength(0);
    }
  }, [password]);

  if (!password) return null;

  const strengthLabel = getPasswordStrengthLabel(strength);
  const strengthColor = getPasswordStrengthColor(strength);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              index < strength
                ? {
                    'bg-red-500': strength === 1,
                    'bg-orange-500': strength === 2,
                    'bg-yellow-500': strength === 3,
                    'bg-green-500': strength === 4,
                  }[strength] || 'bg-gray-300'
                : 'bg-gray-200 dark:bg-gray-700'
            )}
          />
        ))}
      </div>
      {showLabel && (
        <p className={cn('text-xs', strengthColor)}>
          Password strength: {strengthLabel}
        </p>
      )}
    </div>
  );
}

// Requirements checklist component
interface PasswordRequirementsProps {
  password: string;
  className?: string;
}

export function PasswordRequirements({
  password,
  className
}: PasswordRequirementsProps) {
  const requirements = [
    {
      met: password.length >= 6,
      text: 'At least 6 characters'
    },
    {
      met: password.length <= 72,
      text: 'Maximum 72 characters'
    },
    {
      met: /[a-z]/.test(password) && /[A-Z]/.test(password),
      text: 'Contains uppercase and lowercase letters',
      optional: true
    },
    {
      met: /\d/.test(password),
      text: 'Contains at least one number',
      optional: true
    },
    {
      met: /[^a-zA-Z0-9]/.test(password),
      text: 'Contains special characters',
      optional: true
    }
  ];

  if (!password) return null;

  return (
    <div className={cn('space-y-1 text-xs', className)}>
      {requirements.map((req, index) => (
        <div
          key={index}
          className={cn(
            'flex items-center gap-2',
            req.met ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
          )}
        >
          <svg
            className="h-3 w-3 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {req.met ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            ) : (
              <circle cx="12" cy="12" r="10" strokeWidth={2} />
            )}
          </svg>
          <span>
            {req.text}
            {req.optional && (
              <span className="text-gray-400 ml-1">(recommended)</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}