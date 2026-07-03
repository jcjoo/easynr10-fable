import { createDb } from '@easynr10/db';
import { env } from './env';

export const db = createDb(env.DATABASE_URL);
