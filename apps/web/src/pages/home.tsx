import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/use-auth.js';
import { Button } from '../components/ui/button.js';

const PRINCIPLES = [
  {
    kanji: '静',
    label: 'ZEN',
    text: 'One inbox for all your accounts. The noise stays outside.',
  },
  {
    kanji: '集',
    label: 'FOCUS',
    text: 'AI triage surfaces only the mail that needs your action.',
  },
  {
    kanji: '明',
    label: 'CLARITY',
    text: 'Every email becomes a decision, a todo, or lets you move on.',
  },
] as const;

export function HomePage(): JSX.Element {
  const { user } = useAuth();

  return (
    <div className="flex-1 flex flex-col">
      {/* Hero — asymmetric, ma (negative space) on the right */}
      <section className="relative overflow-hidden">
        <span
          aria-hidden="true"
          className="hidden md:block absolute right-8 lg:right-24 top-8 font-kanji text-[11rem] leading-none text-ink/[0.06] select-none"
          style={{ writingMode: 'vertical-rl' }}
        >
          柳生
        </span>
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-20 sm:py-28 lg:py-36">
          <p className="font-mono text-xs font-medium tracking-[0.25em] text-ink-muted mb-6">
            TRIAGE • TODOS • ZEN
          </p>
          <h1 className="font-display font-semibold text-ink tracking-tight text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] max-w-xl">
            Cut through the noise.
          </h1>
          <p className="text-lg text-ink-muted mt-6 max-w-xl leading-relaxed">
            yagyu connects your email accounts, triages incoming mail with AI, and turns what
            matters into a clear, actionable todo list.
          </p>
          <div className="flex items-center gap-3 mt-10">
            {!user && (
              <>
                <Button asChild size="lg">
                  <Link to="/login">Get started</Link>
                </Button>
                <Button asChild variant="ghost" size="lg">
                  <Link to="/login">Sign in</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="bg-surface-alt border-y border-border">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-16 sm:py-20 grid gap-10 sm:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <div key={p.label}>
              <div className="flex items-baseline gap-3 mb-3">
                <span aria-hidden="true" className="font-kanji text-3xl text-primary">
                  {p.kanji}
                </span>
                <span className="font-mono text-xs font-medium tracking-[0.25em] text-ink-muted">
                  {p.label}
                </span>
              </div>
              <p className="text-ink leading-relaxed">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ink band — single dark accent section */}
      <section className="bg-ink-section flex-1 flex flex-col justify-center">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-20 sm:py-24 text-center">
          <h2 className="font-display font-semibold text-surface tracking-tight text-3xl sm:text-4xl">
            The way of the inbox samurai.
          </h2>
          {!user && (
            <div className="mt-8">
              <Button asChild size="lg">
                <Link to="/login">Get started</Link>
              </Button>
            </div>
          )}
          <p className="font-mono text-xs tracking-[0.25em] text-surface/50 mt-14">
            YAGYU © 2026
          </p>
        </div>
      </section>
    </div>
  );
}
