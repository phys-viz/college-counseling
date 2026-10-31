import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(), schoolId: text('school_id').notNull(), school: text('school').notNull(),
  year: integer('year').notNull(), payload: text('payload').notNull(),
}, t => [uniqueIndex('reports_school_year').on(t.schoolId,t.year),index('reports_year').on(t.year)]);
// The prior payload of every replaced report, so a replacement can be undone from a backup.
export const reportVersions = sqliteTable('report_versions', {
  versionId: integer('version_id').primaryKey({autoIncrement:true}), reportId: text('report_id').notNull(),
  replacedAt: text('replaced_at').notNull(), payload: text('payload').notNull(),
}, t => [index('report_versions_report').on(t.reportId)]);
