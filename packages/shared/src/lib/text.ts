// Normalização para comparação/busca frouxa: sem caixa e sem acento.
// É a base do auto-match por nome (importação de planilha, auto-vínculo de
// documentos, sugestão pelo nome do arquivo no upload) e dos filtros textuais.
export function normalizeText(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Chave de auto-match: além de caixa/acento, ignora pontuação e espaços —
// "ASO - João" e "aso joao" casam (de-para de planilha, sugestão do upload).
export function squashText(value: string | null | undefined) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

// Ordenação natural de códigos de norma: 10.2.4a < 10.2.4b < 10.11.7
// (ordenar como texto colocaria 10.11 antes de 10.2). Usada na API e nas
// tabelas ordenáveis do web.
export function compareNormCodes(a: string, b: string) {
  const segmentsA = a.split('.');
  const segmentsB = b.split('.');
  const length = Math.max(segmentsA.length, segmentsB.length);
  for (let index = 0; index < length; index += 1) {
    const rawA = segmentsA[index] ?? '';
    const rawB = segmentsB[index] ?? '';
    const numberA = parseInt(rawA, 10) || 0;
    const numberB = parseInt(rawB, 10) || 0;
    if (numberA !== numberB) return numberA - numberB;
    const suffixA = rawA.replace(/^\d+/, '');
    const suffixB = rawB.replace(/^\d+/, '');
    if (suffixA !== suffixB) return suffixA.localeCompare(suffixB);
  }
  return 0;
}
