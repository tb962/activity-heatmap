import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Writes a minimal Cursor state.vscdb. `conversations` are
 * [composerId, lastUpdatedAt, messageCount, linesAdded?, linesRemoved?].
 * Returns false when this runtime has no SQLite reader, so callers can skip.
 */
export async function writeCursorFixture(dbPath, conversations) {
  const statements = [
    "create table composerHeaders (composerId TEXT PRIMARY KEY, createdAt INTEGER, lastUpdatedAt INTEGER, value TEXT);",
    "create table cursorDiskKV (key TEXT PRIMARY KEY, value BLOB);",
  ];

  for (const [id, updatedAt, messages, added = 0, removed = 0] of conversations) {
    const value = JSON.stringify({ totalLinesAdded: added, totalLinesRemoved: removed });
    statements.push(
      "insert into composerHeaders values ('" + id + "'," + updatedAt + "," + updatedAt + ",'" + value + "');",
    );
    for (let index = 0; index < messages; index += 1) {
      statements.push("insert into cursorDiskKV values ('bubbleId:" + id + ":m" + index + "', '{}');");
    }
  }

  const sql = statements.join("\n");

  try {
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(dbPath);
    database.exec(sql);
    database.close();
    return true;
  } catch {
    // Node < 22.5: fall back to the CLI, which is also the collector's fallback.
  }

  try {
    await execFileAsync("sqlite3", [dbPath, sql]);
    return true;
  } catch {
    return false;
  }
}
