import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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

const UPLOAD_URL_TTL_S = 10 * 60;
const DOWNLOAD_URL_TTL_S = 5 * 60;

export function buildStorageKey(unitId: string, fileName: string) {
  const safeName = fileName.replace(/[^\w.\-]+/g, '_').slice(0, 120);
  return `units/${unitId}/${crypto.randomUUID()}/${safeName}`;
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
