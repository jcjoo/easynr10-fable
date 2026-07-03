import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { signIn } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import fullLogo from '@/assets/fullLogo.png';
import fullLogoDark from '@/assets/fullLogoDark.png';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await signIn.email({ email, password });
    setLoading(false);
    if (signInError) {
      setError('E-mail ou senha incorretos — confira e tente de novo.');
      return;
    }
    navigate({ to: '/' });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm overflow-hidden">
        <div aria-hidden className="tape h-2.5" />
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-8">
          <div>
            <div className="font-mono text-xs uppercase tracking-[.14em] text-muted">
              PSO Engenharia
            </div>
            <h1 className="mt-2">
              <img src={fullLogo} alt="EasyNR10" className="h-7 dark:hidden" />
              <img src={fullLogoDark} alt="EasyNR10" className="hidden h-7 dark:block" />
            </h1>
            <p className="mt-1.5 text-sm text-muted">Gestão de conformidade NR-10</p>
          </div>
          <Field
            label="E-mail"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Senha"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="justify-center">
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
