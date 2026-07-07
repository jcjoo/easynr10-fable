import { useRef, useState, type FormEvent } from 'react';
import { UserRound } from 'lucide-react';
import { authClient, useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { SectionHeader } from './index';

// Configurações → Usuário: nome, e-mail, senha e foto do próprio usuário.
// Tudo via better-auth (updateUser/changeEmail/changePassword); a foto vira
// data-URL pequena (redimensionada no cliente) gravada em user.image.

function useFeedback() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return {
    message,
    ok: (text: string) => setMessage({ ok: true, text }),
    fail: (text: string) => setMessage({ ok: false, text }),
  };
}

function Feedback({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-ok' : 'text-bad'}`}>
      {message.text}
    </p>
  );
}

// Redimensiona a imagem no cliente (máx. 256px) e devolve data-URL JPEG —
// pequena o bastante para viver na coluna user.image.
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function PerfilPage() {
  const { data: session, refetch } = useSession();
  const user = session?.user;

  const [name, setName] = useState<string | null>(null);
  const nameValue = name ?? user?.name ?? '';
  const nameFeedback = useFeedback();
  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await authClient.updateUser({ name: nameValue.trim() });
    if (error) nameFeedback.fail(error.message ?? 'Falha ao salvar');
    else {
      nameFeedback.ok('Nome atualizado.');
      refetch();
    }
  };

  const [email, setEmail] = useState<string | null>(null);
  const emailValue = email ?? user?.email ?? '';
  const emailFeedback = useFeedback();
  const saveEmail = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await authClient.changeEmail({ newEmail: emailValue.trim() });
    if (error) emailFeedback.fail(error.message ?? 'Falha ao trocar o e-mail');
    else {
      emailFeedback.ok('E-mail atualizado — use o novo no próximo login.');
      refetch();
    }
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const passwordFeedback = useFeedback();
  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (error) passwordFeedback.fail(error.message ?? 'Falha ao trocar a senha');
    else {
      passwordFeedback.ok('Senha trocada — as outras sessões foram encerradas.');
      setCurrentPassword('');
      setNewPassword('');
    }
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const avatarFeedback = useFeedback();
  const changeAvatar = async (file: File) => {
    try {
      const image = await toAvatarDataUrl(file);
      const { error } = await authClient.updateUser({ image });
      if (error) avatarFeedback.fail(error.message ?? 'Falha ao enviar a foto');
      else {
        avatarFeedback.ok('Foto atualizada.');
        refetch();
      }
    } catch {
      avatarFeedback.fail('Arquivo não é uma imagem válida.');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Usuário" description="Seu perfil neste sistema." />

      <div className="grid items-start gap-4 lg:grid-cols-2">
      {/* Foto */}
      <section className="flex items-center gap-4 rounded-card border border-line p-4 lg:col-span-2">
        {user?.image ? (
          <img
            src={user.image}
            alt="Sua foto"
            className="size-16 shrink-0 rounded-full border border-line object-cover"
          />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-idle-soft text-idle">
            <UserRound aria-hidden className="size-7" />
          </span>
        )}
        <div className="flex flex-col gap-1.5">
          <p className="font-ui text-sm font-semibold">Foto</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              Trocar foto
            </Button>
            {user?.image && (
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  await authClient.updateUser({ image: null });
                  refetch();
                }}
              >
                Remover
              </Button>
            )}
          </div>
          <Feedback message={avatarFeedback.message} />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) changeAvatar(file);
            e.target.value = '';
          }}
        />
      </section>

      {/* Nome */}
      <form onSubmit={saveName} className="flex flex-col gap-3 rounded-card border border-line p-4">
        <Field label="Nome" value={nameValue} onChange={(e) => setName(e.target.value)} />
        <Feedback message={nameFeedback.message} />
        <div className="flex justify-end">
          <Button type="submit" disabled={nameValue.trim().length < 2}>
            Salvar nome
          </Button>
        </div>
      </form>

      {/* E-mail */}
      <form onSubmit={saveEmail} className="flex flex-col gap-3 rounded-card border border-line p-4">
        <Field
          label="E-mail"
          type="email"
          value={emailValue}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Feedback message={emailFeedback.message} />
        <div className="flex justify-end">
          <Button type="submit" disabled={!emailValue.includes('@')}>
            Salvar e-mail
          </Button>
        </div>
      </form>

      {/* Senha */}
      <form
        onSubmit={savePassword}
        className="flex flex-col gap-3 rounded-card border border-line p-4"
      >
        <Field
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Field
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          hint="Mínimo de 8 caracteres. Trocar a senha encerra as outras sessões."
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Feedback message={passwordFeedback.message} />
        <div className="flex justify-end">
          <Button type="submit" disabled={currentPassword.length === 0 || newPassword.length < 8}>
            Trocar senha
          </Button>
        </div>
      </form>
      </div>
    </div>
  );
}
