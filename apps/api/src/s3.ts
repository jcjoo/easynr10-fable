import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

// Assina com o endpoint público: quem faz PUT/GET é o browser (RNF05 —
// a API nunca trafega o binário).
const signer = new S3Client({
  endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

// Operações da própria API (list/delete) usam o endpoint interno da rede.
const internal = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

// Remove TODOS os objetos da unidade no bucket, incluindo versões e delete
// markers (o bucket tem versionamento). Usado na exclusão em cascata de
// unidade/empresa — exclusão de documento individual continua soft delete.
export async function purgeUnitObjects(unitId: string) {
  const prefix = `units/${unitId}/`;
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  let removed = 0;
  do {
    const page = await internal.send(
      new ListObjectVersionsCommand({
        Bucket: env.S3_BUCKET,
        Prefix: prefix,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    );
    const targets = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
      .filter((entry) => entry.Key)
      .map((entry) => ({ Key: entry.Key!, VersionId: entry.VersionId }));
    if (targets.length > 0) {
      await internal.send(
        new DeleteObjectsCommand({
          Bucket: env.S3_BUCKET,
          Delete: { Objects: targets, Quiet: true },
        }),
      );
      removed += targets.length;
    }
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker || versionIdMarker);
  return removed;
}

// Remove DEFINITIVAMENTE objetos específicos, incluindo as versões e delete
// markers do bucket versionado — hard deletes de admin (documento/versão/
// autorização com PDF). O Prefix pega tudo da key; o filtro exato evita levar
// keys vizinhas que por acaso comecem igual.
export async function purgeObjects(keys: string[]) {
  let removed = 0;
  for (const key of keys) {
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      const page = await internal.send(
        new ListObjectVersionsCommand({
          Bucket: env.S3_BUCKET,
          Prefix: key,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );
      const targets = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
        .filter((entry) => entry.Key === key)
        .map((entry) => ({ Key: entry.Key!, VersionId: entry.VersionId }));
      if (targets.length > 0) {
        await internal.send(
          new DeleteObjectsCommand({
            Bucket: env.S3_BUCKET,
            Delete: { Objects: targets, Quiet: true },
          }),
        );
        removed += targets.length;
      }
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker || versionIdMarker);
  }
  return removed;
}

// Upload feito pela PRÓPRIA API (endpoint interno): PDFs gerados no servidor
// (autorizações assinadas) — a exceção da regra "o browser trafega o binário".
export async function putObject(storageKey: string, body: Uint8Array, contentType: string) {
  await internal.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      Body: body,
      ContentType: contentType,
    }),
  );
}

const UPLOAD_URL_TTL_S = 10 * 60;
const DOWNLOAD_URL_TTL_S = 5 * 60;

export function buildStorageKey(unitId: string, fileName: string) {
  const safeName = fileName.replace(/[^\w.-]+/g, '_').slice(0, 120);
  return `units/${unitId}/${crypto.randomUUID()}/${safeName}`;
}

// Logos: só raster (SVG inline pode executar script no preview).
export const imageMimes = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageMime = (typeof imageMimes)[number];
const imageExtension: Record<ImageMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function buildLogoKey(prefix: string, mimeType: ImageMime) {
  return `${prefix}/${crypto.randomUUID()}/logo.${imageExtension[mimeType]}`;
}

// Content-type do preview derivado da extensão da key (o upload é validado
// contra imageMimes, então a extensão é confiável).
export function imageMimeFromKey(storageKey: string) {
  const match = Object.entries(imageExtension).find(([, ext]) => storageKey.endsWith(`.${ext}`));
  return match?.[0] ?? 'image/png';
}

export function presignUpload(storageKey: string, mimeType: string) {
  return getSignedUrl(
    signer,
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      ContentType: mimeType,
    }),
    { expiresIn: UPLOAD_URL_TTL_S },
  );
}

export function presignDownload(storageKey: string, downloadName: string) {
  return getSignedUrl(
    signer,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(downloadName)}"`,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_S },
  );
}

// Preview no navegador: disposition inline + content-type forçado (o objeto
// pode ter sido enviado sem type correto) — PDF/imagem renderizam direto.
export function presignPreview(storageKey: string, name: string, mimeType: string) {
  return getSignedUrl(
    signer,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(name)}"`,
      ResponseContentType: mimeType,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_S },
  );
}
