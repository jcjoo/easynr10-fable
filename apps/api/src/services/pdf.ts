import { env } from '../env';

// Geração de PDF e escape de HTML compartilhados pelos dois pontos que montam
// documentos no servidor: a exportação de relatórios (report-export.ts) e o
// PDF da autorização assinada (services/authorizations.ts).

// HTML → PDF via Gotenberg (Chromium: /forms/chromium/convert/html). Devolve
// Buffer (Uint8Array com ArrayBuffer concreto) — serve tanto para o putObject
// do S3 quanto para o c.body do Hono na resposta do download.
export async function htmlToPdf(html: string) {
  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
  const response = await fetch(`${env.GOTENBERG_URL}/forms/chromium/convert/html`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Gotenberg respondeu ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

// Escapa texto para interpolação segura em HTML (conteúdo e atributos).
export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
