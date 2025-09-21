/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
	],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        // Midnight Terminal theme colors
        terminal: {
          // Dark mode colors
          "bg-dark": "#0B0F17",
          "surface-dark": "#1E2533",
          "primary-dark": "#4CC9F0",
          "secondary-dark": "#FFB703",
          "success-dark": "#8BE38A",
          "error-dark": "#EF476F",
          "text-primary-dark": "#EDEDED",
          "text-muted-dark": "#9CA3AF",
          // Light mode colors
          "bg-light": "#F8FAFC",
          "surface-light": "#E2E8F0",
          "primary-light": "#0077B6",
          "secondary-light": "#F59E0B",
          "success-light": "#22C55E",
          "error-light": "#DC2626",
          "text-primary-light": "#111827",
          "text-muted-light": "#4B5563",
          // Gradients
          gradient: {
            primary: "linear-gradient(135deg, #4CC9F0, #0077B6)",
            secondary: "linear-gradient(135deg, #FFB703, #F59E0B)",
            success: "linear-gradient(135deg, #8BE38A, #22C55E)",
            error: "linear-gradient(135deg, #EF476F, #DC2626)",
          }
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}