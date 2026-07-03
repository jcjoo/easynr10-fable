import type { ReactNode, SVGProps } from 'react';

// Ícones de arquivo/pasta portados dos assets do EasyNR10 antigo
// (Tabler: icon-tabler-file / icon-tabler-folders), stroke em currentColor.

function TablerIcon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function FileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <TablerIcon {...props}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
    </TablerIcon>
  );
}

export function FolderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <TablerIcon {...props}>
      <path d="M9 3h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
      <path d="M17 16v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h2" />
    </TablerIcon>
  );
}

// — Ícones por tipo de arquivo (PIE) —
// Porte do getMimeTypeIcon do legado (documents/components/icons.tsx): decide
// pelo MIME type com fallback pela extensão do nome. Glifos Tabler
// (file-type-*), cores nos tokens semânticos para funcionar no dark mode.

type FileKind =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'csv'
  | 'ppt'
  | 'image'
  | 'video'
  | 'audio'
  | 'zip'
  | 'txt'
  | 'code'
  | 'cad'
  | 'file';

const kindByMime: Record<string, FileKind> = {
  'application/pdf': 'pdf',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'ppt',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/csv': 'csv',
  'application/json': 'code',
  'application/acad': 'cad',
  'application/x-acad': 'cad',
  'application/autocad_dwg': 'cad',
  'image/vnd.dwg': 'cad',
  'application/dwg': 'cad',
  'application/x-dwg': 'cad',
  'drawing/dwg': 'cad',
};

const kindByExtension: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  xls: 'excel',
  xlsx: 'excel',
  ppt: 'ppt',
  pptx: 'ppt',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  mp4: 'video',
  avi: 'video',
  mov: 'video',
  wmv: 'video',
  webm: 'video',
  mkv: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  aac: 'audio',
  ogg: 'audio',
  zip: 'zip',
  rar: 'zip',
  '7z': 'zip',
  tar: 'zip',
  gz: 'zip',
  txt: 'txt',
  md: 'txt',
  rtf: 'txt',
  csv: 'csv',
  json: 'code',
  xml: 'code',
  html: 'code',
  dwg: 'cad',
  dxf: 'cad',
};

export function fileKind(mimeType?: string | null, name?: string | null): FileKind {
  if (mimeType) {
    const exact = kindByMime[mimeType];
    if (exact) return exact;
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
  }
  const extension = name?.split('.').pop()?.toLowerCase() ?? '';
  return kindByExtension[extension] ?? 'file';
}

const fileKindColor: Record<FileKind, string> = {
  pdf: 'text-bad',
  word: 'text-suf',
  excel: 'text-ok',
  csv: 'text-ok',
  ppt: 'text-warn',
  zip: 'text-warn',
  image: 'text-action',
  video: 'text-ink-soft',
  audio: 'text-ink-soft',
  cad: 'text-ink-soft',
  txt: 'text-muted',
  code: 'text-muted',
  file: 'text-muted',
};

const fileKindPaths: Record<FileKind, ReactNode> = {
  pdf: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
      <path d="M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6" />
      <path d="M17 18h2" />
      <path d="M20 15h-3v6" />
      <path d="M11 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1" />
    </>
  ),
  word: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
      <path d="M5 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1" />
      <path d="M20 16.5a1.5 1.5 0 0 0 -3 0v3a1.5 1.5 0 0 0 3 0" />
      <path d="M12.5 15a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1 -3 0v-3a1.5 1.5 0 0 1 1.5 -1.5" />
    </>
  ),
  excel: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
      <path d="M4 15l4 6" />
      <path d="M4 21l4 -6" />
      <path d="M17 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75" />
      <path d="M11 15v6h3" />
    </>
  ),
  csv: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
      <path d="M7 16.5a1.5 1.5 0 0 0 -3 0v3a1.5 1.5 0 0 0 3 0" />
      <path d="M10 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75" />
      <path d="M16 15l2 6l2 -6" />
    </>
  ),
  ppt: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
      <path d="M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6" />
      <path d="M11 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6" />
      <path d="M16.5 15h3" />
      <path d="M18 15v6" />
    </>
  ),
  image: (
    <>
      <path d="M15 8h.01" />
      <path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" />
      <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" />
      <path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />
    </>
  ),
  video: (
    <>
      <path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" />
      <path d="M8 4l0 16" />
      <path d="M16 4l0 16" />
      <path d="M4 8l4 0" />
      <path d="M4 16l4 0" />
      <path d="M4 12l16 0" />
      <path d="M16 8l4 0" />
      <path d="M16 16l4 0" />
    </>
  ),
  audio: (
    <>
      <path d="M3 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M13 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M9 17v-13h10v13" />
      <path d="M9 8h10" />
    </>
  ),
  zip: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
      <path d="M16 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6" />
      <path d="M12 15v6" />
      <path d="M5 15h3l-3 6h3" />
    </>
  ),
  txt: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
      <path d="M16.5 15h3" />
      <path d="M4.5 15h3" />
      <path d="M6 15v6" />
      <path d="M18 15v6" />
      <path d="M10 15l4 6" />
      <path d="M10 21l4 -6" />
    </>
  ),
  code: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
      <path d="M10 13l-1 2l1 2" />
      <path d="M14 13l1 2l-1 2" />
    </>
  ),
  cad: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M8 16.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0" />
      <path d="M13 12.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
      <path d="M9.5 15a2.5 2.5 0 0 1 2.5 -2.5h1" />
    </>
  ),
  file: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
    </>
  ),
};

export function FileTypeIcon({
  mimeType,
  name,
  className = '',
  ...props
}: SVGProps<SVGSVGElement> & { mimeType?: string | null; name?: string | null }) {
  const kind = fileKind(mimeType, name);
  return (
    <TablerIcon {...props} className={`${fileKindColor[kind]} ${className}`}>
      {fileKindPaths[kind]}
    </TablerIcon>
  );
}
