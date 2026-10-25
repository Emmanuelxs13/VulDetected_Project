'use client';

import { landingContent } from '@/content/landing.es';

export function TeamSection() {
  return (
    <section id="equipo" className="py-20">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 sm:text-4xl">{landingContent.team.title}</h2>
          <p className="text-text-muted">{landingContent.team.subtitle}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          {landingContent.team.members.map((member, i) => (
            <div
              key={i}
              className="rounded-xl p-6 ring-1 ring-border transition-all hover:shadow-lg hover:ring-brand/50"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-xl font-bold text-text-on-brand">
                {member.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <h3 className="mb-1 text-lg font-semibold">{member.name}</h3>
              <p className="mb-4 text-sm text-text-muted">{member.role}</p>
              <div className="flex gap-3 text-sm">
                <a href={member.github} className="text-brand hover:underline">GitHub</a>
                <a href={member.linkedin} className="text-brand hover:underline">LinkedIn</a>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-text-muted">{landingContent.team.group}</p>
      </div>
    </section>
  );
}
