import { index, pgTable, primaryKey, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { audit, id } from './helpers';
import { unit } from './org';
import { user } from './auth';

export const notification = pgTable('notification', {
  id: id(),
  unitId: uuid('unit_id').references(() => unit.id),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  ...audit,
});

export const userNotification = pgTable(
  'user_notification',
  {
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notification.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...audit,
  },
  (t) => [
    primaryKey({ columns: [t.notificationId, t.userId] }),
    // "Notificações do usuário" filtra por user_id (a PK cobre por notificação).
    index('idx_user_notification_user').on(t.userId),
  ],
);
