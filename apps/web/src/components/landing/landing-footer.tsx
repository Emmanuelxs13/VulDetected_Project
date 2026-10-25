import { landingContent } from '@/content/landing.es';
import Link from 'next/link';

export function LandingFooter() {
  return (
    <footer className="border-t border-border py-12">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-sm font-bold text-text-on-brand">
                V
              </span>
              <span className="text-lg font-semibold">{landingContent.navbar.logo}</span>
            </div>
            <p className="text-sm text-text-muted">Auditoría de seguridad web automatizada</p>
          </div>
          <div>
            <h4 className="mb-4 font-semibold">Producto</h4>
            <ul className="space-y-2 text-sm text-text-muted">
              <li><Link href="#como-funciona" className="hover:text-text">Cómo funciona</Link></li>
              <li><Link href="#funcionalidades" className="hover:text-text">Funcionalidades</Link></li>
              <li><Link href="#planes" className="hover:text-text">Planes</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-semibold">Legal</h4>
            <ul className="space-y-2 text-sm text-text-muted">
              <li><Link href="/terms" className="hover:text-text">Términos</Link></li>
              <li><Link href="/privacy" className="hover:text-text">Privacidad</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-semibold">Contacto</h4>
            <ul className="space-y-2 text-sm text-text-muted">
              <li><a href="https://github.com" className="hover:text-text">Repositorio</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-8 text-center text-sm text-text-muted">
          {landingContent.footer.copyright}
        </div>
      </div>
    </footer>
  );
}
