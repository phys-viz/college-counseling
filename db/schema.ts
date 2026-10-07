import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(), schoolId: text('school_id').notNull(), school: text('school').notNull(),
  year: integer('year').notNull(), payload: text('payload').notNull(),
}, t => [uniqueIndex('reports_school_year').on(t.schoolId,t.year),index('reports_year').on(t.year)]);
