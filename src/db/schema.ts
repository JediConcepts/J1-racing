import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const leaderboard = pgTable('leaderboard', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  driverName: text('driver_name').notNull(),
  track: text('track').notNull(), // 'silverstone', 'monaco', etc.
  lapTimeMs: integer('lap_time_ms').notNull(), // Lap time in milliseconds
  carModel: text('car_model').notNull(), // e.g. 'mcl64', 'monaco_spec'
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  leaderboardEntries: many(leaderboard),
}));

export const leaderboardRelations = relations(leaderboard, ({ one }) => ({
  user: one(users, {
    fields: [leaderboard.userId],
    references: [users.id],
  }),
}));
