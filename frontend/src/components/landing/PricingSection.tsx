'use client';

import { motion } from 'framer-motion';
import { Check, X, Sparkles, Zap, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useState } from 'react';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for trying out Onsembl',
    icon: Sparkles,
    color: 'from-gray-500 to-gray-600',
    features: [
      { name: '1 Agent connection', included: true },
      { name: '100 commands/month', included: true },
      { name: 'Basic terminal streaming', included: true },
      { name: 'Community support', included: true },
      { name: '7-day audit logs', included: true },
      { name: 'Priority queue', included: false },
      { name: 'Custom agents', included: false },
      { name: 'Advanced analytics', included: false },
    ],
    cta: 'Start Free',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: 'per month',
    description: 'For professional developers',
    icon: Zap,
    color: 'from-purple-500 to-cyan-500',
    features: [
      { name: '5 Agent connections', included: true },
      { name: 'Unlimited commands', included: true },
      { name: 'Real-time streaming', included: true },
      { name: 'Priority support', included: true },
      { name: '30-day audit logs', included: true },
      { name: 'Priority queue', included: true },
      { name: 'Custom agents', included: true },
      { name: 'Advanced analytics', included: false },
    ],
    cta: 'Start Pro Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'contact sales',
    description: 'For teams and organizations',
    icon: Crown,
    color: 'from-orange-500 to-red-500',
    features: [
      { name: 'Unlimited agents', included: true },
      { name: 'Unlimited commands', included: true },
      { name: 'Real-time streaming', included: true },
      { name: 'Dedicated support', included: true },
      { name: 'Unlimited audit logs', included: true },
      { name: 'Priority queue', included: true },
      { name: 'Custom agents', included: true },
      { name: 'Advanced analytics', included: true },
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

const PricingCard = ({ plan, index }: { plan: typeof plans[0], index: number }) => {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = plan.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative"
    >
      {/* Popular badge */}
      {plan.popular && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-4 left-1/2 -translate-x-1/2 z-10"
        >
          <div className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white text-sm px-4 py-1 rounded-full font-semibold">
            Most Popular
          </div>
        </motion.div>
      )}

      <motion.div
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
        className={`relative h-full ${
          plan.popular ? 'bg-gradient-to-br from-purple-600/20 to-cyan-600/20' : 'bg-onsembl-bg-overlay'
        } backdrop-blur-sm rounded-2xl border ${
          plan.popular ? 'border-purple-500/40' : 'border-purple-500/20'
        } p-8 overflow-hidden`}
      >
        {/* Animated background gradient */}
        <motion.div
          animate={{
            opacity: isHovered ? 0.1 : 0,
          }}
          className={`absolute inset-0 bg-gradient-to-br ${plan.color}`}
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Icon and name */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-lg bg-gradient-to-br ${plan.color}`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
          </div>

          {/* Price */}
          <div className="mb-2">
            <span className="text-4xl font-bold text-white">{plan.price}</span>
            <span className="text-gray-400 ml-2">/{plan.period}</span>
          </div>

          {/* Description */}
          <p className="text-gray-400 mb-6">{plan.description}</p>

          {/* Features */}
          <div className="space-y-3 mb-8">
            {plan.features.map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 + idx * 0.02 }}
                className="flex items-center gap-3"
              >
                {feature.included ? (
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                ) : (
                  <X className="w-5 h-5 text-gray-600 flex-shrink-0" />
                )}
                <span className={feature.included ? 'text-gray-300' : 'text-gray-600'}>
                  {feature.name}
                </span>
              </motion.div>
            ))}
          </div>

          {/* CTA Button */}
          <Link href="/login">
            <Button
              className={`w-full py-6 text-lg font-semibold rounded-xl transition-all duration-300 ${
                plan.popular
                  ? 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white'
                  : 'bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300'
              }`}
            >
              {plan.cta}
            </Button>
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
};

const PricingSection = () => {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <section className="py-20 px-4 relative" id="pricing">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
            Choose the perfect plan for your needs. Always flexible to scale.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-4 bg-onsembl-bg-overlay backdrop-blur-sm rounded-full p-1 border border-purple-500/20">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-6 py-2 rounded-full transition-all duration-300 ${
                billingPeriod === 'monthly'
                  ? 'bg-purple-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`px-6 py-2 rounded-full transition-all duration-300 ${
                billingPeriod === 'yearly'
                  ? 'bg-purple-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Yearly
              <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                Save 20%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <PricingCard key={index} plan={plan} index={index} />
          ))}
        </div>

        {/* FAQ or additional info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-16 text-center"
        >
          <p className="text-gray-400">
            All plans include SSL encryption, 99.9% uptime SLA, and regular updates.
          </p>
          <p className="text-gray-400 mt-2">
            Questions?{' '}
            <Link href="/contact" className="text-purple-400 hover:text-purple-300 underline">
              Contact our sales team
            </Link>
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default PricingSection;