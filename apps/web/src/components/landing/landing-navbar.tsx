'use client';

import { Button } from '@vuldetected/ui';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { landingContent } from '@/content/landing.es';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? 'bg-bg/80 backdrop-blur-lg border-b border-border' : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-sm font-bold text-text-on-brand">
              V
            </span>
            <span className="text-lg font-semibold">{landingContent.navbar.logo}</span>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {landingContent.navbar.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
                onMouseEnter={() => setHovered(link.href)}
                onMouseLeave={() => setHovered(null)}
              >
                {hovered === link.href && !prefersReducedMotion && (
                  <motion.span
                    layoutId="nav-hover"
                    className="absolute inset-0 rounded-md bg-surface-raised"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative z-10">{link.label}</span>
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">{landingContent.navbar.login}</Link>
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link href="/register">{landingContent.navbar.cta}</Link>
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menú"
          >
            ☰
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 top-16 bg-bg lg:hidden">
          <div className="flex flex-col gap-4 p-4">
            {landingContent.navbar.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-base text-text"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 pt-4 border-t border-border">
              <Button asChild variant="ghost" onClick={() => setMobileOpen(false)}>
                <Link href="/login">{landingContent.navbar.login}</Link>
              </Button>
              <Button asChild variant="primary" onClick={() => setMobileOpen(false)}>
                <Link href="/register">{landingContent.navbar.cta}</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
