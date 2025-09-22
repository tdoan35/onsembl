'use client';

import { ChevronDown } from 'lucide-react';

const FAQSection = () => {
  const faqs = [
    {
      question: "What types of AI agents does Onsembl support?",
      answer: "Onsembl supports multiple AI coding agents including Claude, Gemini, and Codex. You can orchestrate and manage all of them through our unified dashboard with real-time monitoring and control."
    },
    {
      question: "How does the real-time terminal streaming work?",
      answer: "Our platform provides sub-200ms terminal streaming using WebSocket connections. You can watch your agents execute commands in real-time, see their output, and maintain full visibility into their operations."
    },
    {
      question: "Can I interrupt or stop agent commands?",
      answer: "Yes, Onsembl includes emergency stop functionality and command interruption capabilities. You can halt any running command or stop all agents instantly through the dashboard or API."
    },
    {
      question: "What kind of monitoring and analytics are available?",
      answer: "We provide comprehensive LLM trace visualization, execution analytics, audit logs with 30-day retention, and performance metrics. Track your agents' efficiency, command success rates, and resource usage."
    },
    {
      question: "Is there an API for programmatic control?",
      answer: "Yes, Onsembl offers a full REST API and WebSocket protocol for programmatic agent control. You can integrate with your existing workflows, CI/CD pipelines, and development tools."
    },
    {
      question: "How secure is agent execution?",
      answer: "We implement execution constraints, audit logging, and secure command queueing. All agent communications are encrypted, and you maintain full control over what commands can be executed."
    }
  ];

  return (
    <section className="relative bg-black py-24" id="faq">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-light tracking-tighter text-white mb-4" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
            Frequently asked questions
          </h2>
          <p className="text-lg text-zinc-300">
            Everything you need to know about the platform
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="rounded-2xl bg-zinc-900/50 border border-white/10 backdrop-blur-sm">
              <button
                className="w-full text-left px-8 py-6 flex items-center justify-between focus:outline-none group"
                onClick={(e) => {
                  const content = e.currentTarget.nextElementSibling as HTMLElement;
                  const icon = e.currentTarget.querySelector('.chevron-icon') as HTMLElement;

                  if (content.style.display === 'block') {
                    content.style.display = 'none';
                    icon.style.transform = 'rotate(0deg)';
                  } else {
                    content.style.display = 'block';
                    icon.style.transform = 'rotate(180deg)';
                  }
                }}
              >
                <span className="text-lg font-medium text-white pr-8">
                  {faq.question}
                </span>
                <ChevronDown className="chevron-icon h-5 w-5 text-zinc-400 transition-transform duration-200 flex-shrink-0" />
              </button>
              <div style={{ display: 'none' }} className="px-8 pb-6">
                <p className="text-zinc-300 leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQSection;