import { diagnosticStatusLabels, type DiagnosticStatus } from '@easynr10/shared';
import {
  adherenceBorders,
  adherenceDots,
  adherenceText,
} from '@/components/ui/status-pill';

// A ficha de NC que a avaliação oferece (vinda de adequacy.ncs, já filtrada
// pelo requisito).
export interface NcOption {
  id: string;
  code: string;
  description: string;
  recommendedAction: string;
  adherence: DiagnosticStatus;
}

// Escolha da NC do requisito como radio-cards (redesign do diagnóstico): uma
// opção "Conforme" + a ficha de cada NC, com a descrição inteira legível e a
// ação recomendada expandida dentro da ficha marcada. Marcar a ficha já
// marcada desmarca (volta a Conforme).

// Classes literais por nota (o JIT do Tailwind precisa vê-las inteiras).
const softTint: Record<DiagnosticStatus, string> = {
  inexistente: 'bg-bad-soft/60',
  inadequada: 'bg-alert-soft/60',
  parcial: 'bg-warn-soft/60',
  suficiente: 'bg-suf-soft/60',
  plena: 'bg-ok-soft/60',
};
const hoverBorder: Record<DiagnosticStatus, string> = {
  inexistente: 'hover:border-bad',
  inadequada: 'hover:border-alert',
  parcial: 'hover:border-warn',
  suficiente: 'hover:border-suf',
  plena: 'hover:border-ok',
};

export function NcCodeChip({ code }: { code: string }) {
  return (
    <span className="shrink-0 rounded-ctl bg-idle-soft px-1.5 py-0.5 font-mono text-micro font-semibold tracking-wide text-ink-soft">
      {code}
    </span>
  );
}

export function NotaChip({ nota }: { nota: DiagnosticStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 font-ui text-label font-semibold ${adherenceText[nota]}`}>
      <span aria-hidden className={`size-2 rounded-full ${adherenceDots[nota]}`} />
      {diagnosticStatusLabels[nota]}
    </span>
  );
}

function ChoiceOption({
  nota,
  checked,
  disabled,
  disabledReason,
  onSelect,
  children,
}: {
  nota: DiagnosticStatus;
  checked: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={onSelect}
      className={`relative flex w-full items-start gap-2.5 overflow-hidden rounded-ctl border p-2.5 pl-4 text-left ${
        disabled
          ? checked
            ? `cursor-not-allowed ${adherenceBorders[nota]} ${softTint[nota]}`
            : 'cursor-not-allowed border-line bg-surface opacity-45'
          : checked
            ? `cursor-pointer ${adherenceBorders[nota]} ${softTint[nota]}`
            : `cursor-pointer border-line-strong bg-surface ${hoverBorder[nota]}`
      }`}
    >
      {/* Lombada: a nota que a opção implica, legível antes do texto. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${adherenceDots[nota]} ${checked ? '' : 'opacity-40'}`}
      />
      <span
        aria-hidden
        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] bg-surface ${
          checked ? adherenceBorders[nota] : 'border-line-strong'
        }`}
      >
        {checked && <span className={`size-2 rounded-full ${adherenceDots[nota]}`} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

export function NcChoice({
  options,
  value,
  onChange,
  ariaLabel,
  documentLinked,
  autoNc,
}: {
  options: NcOption[];
  /** NC marcada (null = Conforme/Pleno). */
  value: string | null;
  onChange: (ncId: string | null) => void;
  ariaLabel: string;
  /** Requisito de documento: sem documento vinculado, só NCs de nota
   *  Inexistente; COM documento, Inexistente não se aplica — a direção
   *  contrária fica desabilitada. */
  documentLinked?: boolean;
  /** NC automática (documento vencido): entra como ficha já selecionada e
   *  travada — soma-se à marcada, vale a menor nota. */
  autoNc?: NcOption | null;
}) {
  const missingDoc = documentLinked === false;
  const hasDoc = documentLinked === true;
  // Setas navegam entre as opções do grupo (padrão de radiogroup).
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const radios = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
    const current = radios.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
    radios[(next + radios.length) % radios.length]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} className="grid gap-2">
      <ChoiceOption
        nota={missingDoc ? 'inexistente' : 'plena'}
        checked={value === null}
        disabled={missingDoc}
        disabledReason="Sem documento vinculado, o requisito não pode estar Conforme"
        onSelect={() => onChange(null)}
      >
        <span className="block font-ui text-caption font-semibold">
          {missingDoc ? 'Documento faltante' : 'Conforme'}
        </span>
        <span className="mt-0.5 block text-label text-ink-soft">
          {missingDoc
            ? 'Sem documento vinculado o requisito conta como Inexistente — vincule o documento ou marque a NC de ausência.'
            : 'Nenhuma não conformidade — o requisito está Pleno.'}
        </span>
      </ChoiceOption>
      {options.map((nc) => {
        const checked = value === nc.id;
        const blockedMissing = missingDoc && nc.adherence !== 'inexistente';
        const blockedLinked = hasDoc && nc.adherence === 'inexistente';
        return (
          <ChoiceOption
            key={nc.id}
            nota={nc.adherence}
            checked={checked}
            disabled={blockedMissing || blockedLinked}
            disabledReason={
              blockedMissing
                ? 'Sem documento vinculado, só NCs de nota Inexistente'
                : 'Com documento vinculado, a ausência (Inexistente) não se aplica'
            }
            // Marcar de novo desmarca — volta a Conforme.
            onSelect={() => onChange(checked ? null : nc.id)}
          >
            <span className="flex flex-wrap items-center gap-2">
              <NcCodeChip code={nc.code} />
              <NotaChip nota={nc.adherence} />
            </span>
            <span className="mt-1 block text-caption leading-relaxed text-ink">
              {nc.description}
            </span>
            {checked && nc.recommendedAction && (
              <span className="mt-1.5 block text-label text-muted">
                <b className="font-semibold text-ink-soft">Ação:</b> {nc.recommendedAction}
              </span>
            )}
          </ChoiceOption>
        );
      })}
      {autoNc && <AutoNcCard nc={autoNc} />}
      {missingDoc && (
        <p className="text-label text-muted">
          Sem documento vinculado, o requisito está ausente — Conforme e NCs de outras notas ficam
          bloqueados. Vincule o documento para liberá-los.
        </p>
      )}
    </div>
  );
}

// Ficha da NC automática (documento vencido): mesmo padrão das outras, mas já
// selecionada e travada — o diagnóstico a gera junto da marcada (vale a menor
// nota do requisito).
export function AutoNcCard({ nc }: { nc: NcOption }) {
  return (
    <div
      className={`relative flex w-full items-start gap-2.5 overflow-hidden rounded-ctl border p-2.5 pl-4 ${adherenceBorders[nc.adherence]} ${softTint[nc.adherence]}`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${adherenceDots[nc.adherence]}`} />
      <span
        aria-hidden
        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] bg-surface ${adherenceBorders[nc.adherence]}`}
      >
        <span className={`size-2 rounded-full ${adherenceDots[nc.adherence]}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <NcCodeChip code={nc.code} />
          <NotaChip nota={nc.adherence} />
          <span className="rounded-full bg-idle-soft px-2 py-0.5 font-ui text-micro font-semibold text-muted">
            automática
          </span>
        </span>
        <span className="mt-1 block text-caption leading-relaxed text-ink">{nc.description}</span>
        <span className="mt-1.5 block text-label text-muted">
          <b className="font-semibold text-ink-soft">Ação:</b> {nc.recommendedAction} Entra no
          diagnóstico junto da NC marcada — vale a menor nota.
        </span>
      </span>
    </div>
  );
}
