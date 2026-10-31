-- Search indexed the whole JSON payload, so metric names, URLs and evidence fields
-- ("applicants", "pdf", "https") matched nearly every report. Index what a person
-- searches instead: school, year, report label, source text and form answers
-- (Section C and additional pages), and admissions factor labels.
DROP TRIGGER IF EXISTS reports_search_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reports_search_update;
--> statement-breakpoint
CREATE TRIGGER reports_search_insert AFTER INSERT ON reports BEGIN
  INSERT INTO report_search(id,content) VALUES(new.id,
    new.school || ' ' || new.year || ' ' || coalesce(json_extract(new.payload,'$.report_label'),'') || ' ' ||
    coalesce((SELECT group_concat(value,' ') FROM json_tree(new.payload,'$.sections') WHERE key IN ('text','value') AND type='text'),'') || ' ' ||
    coalesce((SELECT group_concat(value,' ') FROM json_tree(new.payload,'$.additional_sections') WHERE key IN ('text','value') AND type='text'),'') || ' ' ||
    coalesce((SELECT group_concat(value,' ') FROM json_tree(new.payload,'$.factors') WHERE key='label' AND type='text'),''));
END;
--> statement-breakpoint
CREATE TRIGGER reports_search_update AFTER UPDATE OF payload ON reports BEGIN
  DELETE FROM report_search WHERE id=old.id;
  INSERT INTO report_search(id,content) VALUES(new.id,
    new.school || ' ' || new.year || ' ' || coalesce(json_extract(new.payload,'$.report_label'),'') || ' ' ||
    coalesce((SELECT group_concat(value,' ') FROM json_tree(new.payload,'$.sections') WHERE key IN ('text','value') AND type='text'),'') || ' ' ||
    coalesce((SELECT group_concat(value,' ') FROM json_tree(new.payload,'$.additional_sections') WHERE key IN ('text','value') AND type='text'),'') || ' ' ||
    coalesce((SELECT group_concat(value,' ') FROM json_tree(new.payload,'$.factors') WHERE key='label' AND type='text'),''));
END;
--> statement-breakpoint
DELETE FROM report_search;
--> statement-breakpoint
INSERT INTO report_search(id,content) SELECT id,
    reports.school || ' ' || reports.year || ' ' || coalesce(json_extract(reports.payload,'$.report_label'),'') || ' ' ||
    coalesce((SELECT group_concat(value,' ') FROM json_tree(reports.payload,'$.sections') WHERE key IN ('text','value') AND type='text'),'') || ' ' ||
    coalesce((SELECT group_concat(value,' ') FROM json_tree(reports.payload,'$.additional_sections') WHERE key IN ('text','value') AND type='text'),'') || ' ' ||
    coalesce((SELECT group_concat(value,' ') FROM json_tree(reports.payload,'$.factors') WHERE key='label' AND type='text'),'')
  FROM reports;
