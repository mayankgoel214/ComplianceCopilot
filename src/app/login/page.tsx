"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import Link from "next/link";
import {
  Shield,
  CheckCircle,
  Star,
  Globe,
  Briefcase,
  Users,
  TrendingUp,
  Lock,
  Award,
  Mail,
  Phone,
  ChevronDown
} from "lucide-react";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const user = await signIn();
      if (user) {
        toast.success("Welcome back to Complai!");
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Failed to sign in. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "SOC 2 Type II certified with end-to-end encryption"
    },
    {
      icon: TrendingUp,
      title: "Real-time Compliance",
      description: "Monitor compliance across all frameworks in real-time"
    },
    {
      icon: Users,
      title: "Team Collaboration",
      description: "Seamless workflow management for compliance teams"
    }
  ];

  const testimonials = [
    {
      company: "Fortune 500 Technology Corp",
      quote: "Complai reduced our audit preparation time by 75% and improved our overall compliance posture significantly.",
      author: "Sarah Chen",
      role: "Chief Compliance Officer",
      rating: 5
    },
    {
      company: "Global Financial Services",
      quote: "The enterprise-grade security and intuitive interface make this the perfect solution for regulated industries.",
      author: "Michael Rodriguez",
      role: "Risk Management Director",
      rating: 5
    }
  ];

  const securityBadges = [
    { name: "SOC 2 Type II", icon: Award },
    { name: "ISO 27001", icon: Shield },
    { name: "GDPR Compliant", icon: Lock },
    { name: "99.9% Uptime", icon: TrendingUp }
  ];

  const languages = [
    { code: "en", name: "English", flag: "🇺🇸" },
    { code: "es", name: "Español", flag: "🇪🇸" },
    { code: "fr", name: "Français", flag: "🇫🇷" },
    { code: "de", name: "Deutsch", flag: "🇩🇪" }
  ];

  return (
    <div className="min-h-screen bg-enterprise-background flex">
      {/* Left Side - Branding (60%) */}
      <div className="hidden lg:flex lg:w-3/5 flex-col justify-between p-12 enterprise-glass">
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center space-x-3 mb-16">
            <div className="w-12 h-12 bg-enterprise-primary rounded-xl flex items-center justify-center">
              <Shield className="h-7 w-7 text-enterprise-text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-enterprise-text-primary">
                Complai
              </h1>
              <p className="text-enterprise-text-tertiary">
                Enterprise Edition
              </p>
            </div>
          </div>

          {/* Main Content */}
          <div className="space-y-16">
            {/* Hero Section */}
            <div className="space-y-6">
              <h2 className="text-5xl font-bold text-enterprise-text-primary leading-tight">
                Enterprise-Grade
                <br />
                <span className="text-enterprise-primary">Compliance</span>
                <br />
                Management
              </h2>
              <p className="text-xl text-enterprise-text-secondary max-w-lg">
                Trusted by Fortune 500 companies to streamline compliance workflows,
                reduce audit time, and maintain regulatory excellence.
              </p>
            </div>

            {/* Features */}
            <div className="space-y-8">
              <h3 className="text-2xl font-semibold text-enterprise-text-primary">
                Why industry leaders choose us
              </h3>
              <div className="space-y-6">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-start space-x-4 enterprise-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                    <div className="w-12 h-12 bg-enterprise-surface-elevated rounded-lg flex items-center justify-center flex-shrink-0">
                      <feature.icon className="h-6 w-6 text-enterprise-primary" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-enterprise-text-primary">
                        {feature.title}
                      </h4>
                      <p className="text-enterprise-text-secondary">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Testimonials */}
            <div className="space-y-8">
              <h3 className="text-2xl font-semibold text-enterprise-text-primary">
                What our clients say
              </h3>
              <div className="space-y-6">
                {testimonials.map((testimonial, index) => (
                  <div key={index} className="enterprise-glass p-6 rounded-lg border border-enterprise-border-primary enterprise-fade-in" style={{ animationDelay: `${(index + 3) * 0.1}s` }}>
                    <div className="flex items-center space-x-1 mb-3">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-enterprise-warning text-enterprise-warning" />
                      ))}
                    </div>
                    <blockquote className="text-enterprise-text-secondary mb-4">
                      "{testimonial.quote}"
                    </blockquote>
                    <div>
                      <p className="text-enterprise-text-primary font-semibold">
                        {testimonial.author}
                      </p>
                      <p className="text-enterprise-text-tertiary text-sm">
                        {testimonial.role}, {testimonial.company}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Security Badges */}
        <div className="space-y-4">
          <p className="text-enterprise-text-tertiary text-sm">
            Trusted & Certified
          </p>
          <div className="flex flex-wrap gap-4">
            {securityBadges.map((badge, index) => (
              <div key={index} className="flex items-center space-x-2 px-3 py-2 bg-enterprise-surface-elevated rounded-lg border border-enterprise-border-primary">
                <badge.icon className="h-4 w-4 text-enterprise-primary" />
                <span className="text-sm text-enterprise-text-secondary">
                  {badge.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side - Authentication Form (40%) */}
      <div className="w-full lg:w-2/5 flex flex-col justify-center p-8 lg:p-12">
        <div className="w-full max-w-md mx-auto space-y-8">
          {/* Mobile Header */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-enterprise-primary rounded-xl flex items-center justify-center">
                <Shield className="h-6 w-6 text-enterprise-text-primary" />
              </div>
              <h1 className="text-xl font-bold text-enterprise-text-primary">
                Complai
              </h1>
            </div>
          </div>

          {/* Language Selector */}
          <div className="flex justify-end">
            <div className="relative">
              <button className="flex items-center space-x-2 px-3 py-2 text-enterprise-text-tertiary hover:text-enterprise-text-primary transition-colors enterprise-focus rounded-lg border border-enterprise-border-primary">
                <Globe className="h-4 w-4" />
                <span className="text-sm">
                  {languages.find(l => l.code === selectedLanguage)?.flag} {languages.find(l => l.code === selectedLanguage)?.name}
                </span>
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Form Header */}
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-enterprise-text-primary">
              Welcome back
            </h2>
            <p className="text-enterprise-text-secondary">
              Sign in to your enterprise account
            </p>
          </div>

          {/* SSO Options */}
          <div className="space-y-4">
            <Button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full h-12 bg-enterprise-surface-elevated hover:bg-enterprise-surface border border-enterprise-border-primary text-enterprise-text-primary font-medium transition-all duration-200 enterprise-focus"
            >
              {isLoading ? (
                <div className="enterprise-shimmer w-6 h-6 rounded mr-3" />
              ) : (
                <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continue with Google
            </Button>

            <Button
              disabled={isLoading}
              className="w-full h-12 bg-enterprise-surface-elevated hover:bg-enterprise-surface border border-enterprise-border-primary text-enterprise-text-primary font-medium transition-all duration-200 enterprise-focus"
            >
              <svg className="mr-3 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd"/>
              </svg>
              Continue with Azure AD
            </Button>

            <Button
              disabled={isLoading}
              className="w-full h-12 bg-enterprise-surface-elevated hover:bg-enterprise-surface border border-enterprise-border-primary text-enterprise-text-primary font-medium transition-all duration-200 enterprise-focus"
            >
              <Briefcase className="mr-3 h-5 w-5" />
              Continue with SAML SSO
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full bg-enterprise-border-primary" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-enterprise-background text-enterprise-text-tertiary">
                Or continue with email
              </span>
            </div>
          </div>

          {/* Email Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-enterprise-text-secondary font-medium">
                Work Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your.name@company.com"
                className="h-12 bg-enterprise-surface-elevated border-enterprise-border-primary text-enterprise-text-primary placeholder-enterprise-text-tertiary enterprise-focus"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-enterprise-text-secondary font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                className="h-12 bg-enterprise-surface-elevated border-enterprise-border-primary text-enterprise-text-primary placeholder-enterprise-text-tertiary enterprise-focus"
                disabled={isLoading}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" className="rounded border-enterprise-border-primary text-enterprise-primary enterprise-focus" />
                <span className="text-sm text-enterprise-text-secondary">Remember me</span>
              </label>
              <Link href="/forgot-password" className="text-sm text-enterprise-primary hover:text-enterprise-primary-hover transition-colors enterprise-focus rounded px-1 py-0.5">
                Forgot password?
              </Link>
            </div>
            <Button
              type="submit"
              className="w-full h-12 enterprise-button-primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="enterprise-shimmer w-5 h-5 rounded" />
                  <span>Signing in...</span>
                </div>
              ) : (
                "Sign in to your account"
              )}
            </Button>
          </div>

          {/* Footer */}
          <div className="space-y-6">
            <div className="text-center text-sm text-enterprise-text-tertiary">
              Need an enterprise account?{" "}
              <Link href="/contact-sales" className="text-enterprise-primary hover:text-enterprise-primary-hover transition-colors enterprise-focus rounded px-1 py-0.5">
                Contact sales
              </Link>
            </div>

            {/* Admin Contact */}
            <div className="enterprise-glass p-4 rounded-lg border border-enterprise-border-primary">
              <h4 className="text-sm font-semibold text-enterprise-text-primary mb-2">
                Need help?
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center space-x-2 text-enterprise-text-secondary">
                  <Mail className="h-4 w-4" />
                  <span>support@compliancepro.com</span>
                </div>
                <div className="flex items-center space-x-2 text-enterprise-text-secondary">
                  <Phone className="h-4 w-4" />
                  <span>1-800-COMPLIANCE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}