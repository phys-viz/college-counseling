CREATE VIRTUAL TABLE report_search USING fts5(id UNINDEXED, content, tokenize='unicode61');
--> statement-breakpoint
CREATE TRIGGER reports_search_insert AFTER INSERT ON reports BEGIN
  INSERT INTO report_search(id,content) VALUES(new.id,new.payload);
END;
--> statement-breakpoint
CREATE TRIGGER reports_search_update AFTER UPDATE OF payload ON reports BEGIN
  DELETE FROM report_search WHERE id=old.id;
  INSERT INTO report_search(id,content) VALUES(new.id,new.payload);
END;
--> statement-breakpoint
CREATE TRIGGER reports_search_delete AFTER DELETE ON reports BEGIN
  DELETE FROM report_search WHERE id=old.id;
END;
