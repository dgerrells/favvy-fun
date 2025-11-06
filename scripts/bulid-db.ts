import { Database } from "bun:sqlite";

const TABLE_NAME = "domains";
const DB_FILE_ARG_INDEX = 2;
const CSV_FILE_ARG_INDEX = 3;
const SOURCE_DB_ARG_INDEX = 4;

function parseCsv(content: string) {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const dataLines = lines.slice(1);

  return dataLines.map((line) => {
    const [domain, rank, category] = line.split(",");
    return { domain, rank, category };
  });
}

async function main() {
  const args = process.argv;

  if (args.length < 4 || args.length > 5) {
    console.error(
      "Usage: bun run <script_name> <output_db_file> <input_csv_file> [source_db_file]"
    );
    process.exit(1);
  }

  const outputDbFile = args[DB_FILE_ARG_INDEX];
  const csvFile = args[CSV_FILE_ARG_INDEX];
  const sourceDbFile = args.length === 5 ? args[SOURCE_DB_ARG_INDEX] : null;

  const inputFile = Bun.file(csvFile);
  if (!(await inputFile.exists())) {
    console.error(`Error: CSV file not found at ${csvFile}`);
    return;
  }
  const fileContent = await inputFile.text();
  const records = parseCsv(fileContent);

  const db = new Database(outputDbFile, { create: true });

  try {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        base_domain TEXT PRIMARY KEY,
        image_blob BLOB,
        rank INTEGER,
        category TEXT
      );
    `;
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_rank_category 
      ON ${TABLE_NAME} (rank, category);
    `;

    db.exec(createTableSql);
    db.exec(createIndexSql);

    let sourceDbBlobs = new Map();
    if (sourceDbFile) {
      let sourceDb;
      try {
        console.info("reading source db blob files", sourceDbFile);
        sourceDb = new Database(sourceDbFile, { readonly: true });

        const rows = sourceDb
          .query(
            `SELECT base_domain, image_blob FROM ${TABLE_NAME} WHERE image_blob IS NOT NULL`
          )
          .all();
        rows.forEach((row) =>
          sourceDbBlobs.set(row.base_domain, row.image_blob)
        );
        console.info([...sourceDbBlobs.values()]);
      } catch (error) {
        console.warn(
          `Warning: Could not read from source DB: ${error.message}. Skipping blob transfer.`
        );
        sourceDbBlobs = new Map();
      } finally {
        if (sourceDb) sourceDb.close();
      }
    }

    const insertSql = `
      INSERT INTO ${TABLE_NAME} (base_domain, image_blob, rank, category) 
      VALUES ($domain, $blob, $rank, $category)
      ON CONFLICT(base_domain) DO UPDATE SET
        image_blob = excluded.image_blob,
        rank = excluded.rank,
        category = excluded.category;
    `;

    const statement = db.prepare(insertSql);

    db.run("BEGIN TRANSACTION;");

    let insertedCount = 0;
    for (const record of records) {
      const base_domain = record.domain;
      const rank = parseInt(record.rank, 10);
      const category = record.category;
      const image_blob = sourceDbBlobs.get(base_domain) || null;

      try {
        statement.run({
          $domain: base_domain,
          $blob: image_blob,
          $rank: rank,
          $category: category,
        });
        insertedCount++;
      } catch (err) {
        console.error(
          `Error inserting record for ${base_domain}: ${err.message}`
        );
      }
    }

    db.exec("COMMIT;");

    console.log(
      `Successfully processed ${insertedCount} records into ${outputDbFile}.`
    );
  } catch (error) {
    console.error(`Fatal Database Operation Error: ${error.message}`);
    try {
      db.exec("ROLLBACK;");
    } catch (_) {}
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(`Fatal Error: ${error.message}`);
  process.exit(1);
});
