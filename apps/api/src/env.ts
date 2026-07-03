import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  S3_ENDPOINT: z.string().min(1),
  // Endpoint visível pelo browser (presigned URLs). Em dev/compose difere do interno.
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((value) => value === 'true'),
});

export const env = envSchema.parse(process.env);
