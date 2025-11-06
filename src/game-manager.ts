import { Database } from "bun:sqlite";
import { fetchAndProcessFavicon } from "./favicon-utils";

const DB_PATH = "./favy.db";
const TABLE_NAME = "domains";
const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA synchronous = NORMAL;");
db.run("PRAGMA cache_size = 10000;");

const updateFaviconStmt = db.prepare(
  `UPDATE ${TABLE_NAME} SET image_blob = $imageBlob WHERE base_domain = $baseDomain`
);
const deleteFaviconStmt = db.prepare(
  `DELETE FROM ${TABLE_NAME} WHERE base_domain = $baseDomain`
);

const rankMaxMap: Record<string, number> = {
  top100: 100,
  top500: 500,
  top1000: 1000,
  top5000: 5000,
  top10000: 10_000,
  top20000: 20_000,
  top50000: 50_000,
  top100000: 100_000,
  all: Infinity,
};

function buildBaseQuery(rankFilter: string, categories: string[]) {
  const params: { [key: string]: string | number } = {};
  const conditions: string[] = [];
  const limitCount = rankMaxMap[rankFilter] ?? 100;
  const hasNsfw = categories.find((c) => c.includes("NSFW"));

  if (categories && categories.length > 0) {
    const categoryPlaceholders = categories
      .map((_, i) => `$cat${i}`)
      .join(", ");
    conditions.push(`category IN (${categoryPlaceholders})`);
    categories.forEach((cat, i) => {
      params[`$cat${i}`] = cat;
    });
  }

  let whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  if (conditions.length > 0 && !hasNsfw) {
    whereClause += ' AND category != "NSFW"';
  }

  const noNsfw = whereClause.length === 0 ? "where category != 'NSFW'" : "";
  const limitClause = limitCount === Infinity ? "" : `limit ${limitCount}`;

  const baseQuery = `SELECT base_domain, image_blob, rank, category FROM ${TABLE_NAME} ${whereClause} ${noNsfw} ORDER BY rank ${limitClause}`;

  return { baseQuery, params };
}

type DomainRecord = {
  base_domain: string;
  image_blob: Uint8Array | null;
  rank: number;
};

const getRandomRowsStmt = (baseQuery: string) =>
  db.prepare(`
    SELECT base_domain, image_blob, rank, category
    FROM (${baseQuery})
    ORDER BY random()
    LIMIT 4
  `);

export async function getNewGameData(
  rankFilter: string = "all",
  categories: string[] = []
) {
  const { baseQuery, params } = buildBaseQuery(rankFilter, categories);
  const selectRandomRows = getRandomRowsStmt(baseQuery);
  const MAX_ATTEMPTS = 5;

  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    attempt++;

    const randomRecords: DomainRecord[] = selectRandomRows.all(
      params
    ) as DomainRecord[];

    if (randomRecords.length < 4) {
      const countQuery = db.query(
        `SELECT count(*) AS count FROM (${baseQuery})`
      );
      const result = countQuery.get(params) as { count: number };
      const totalRows = result.count;

      console.warn(
        `Not enough rows (${totalRows}) for filters: rank=${rankFilter}, cats=${categories.join()}`
      );
      return null;
    }

    let mainRecord = randomRecords[0];
    let { base_domain, image_blob, rank } = mainRecord;

    if (!image_blob) {
      image_blob = await fetchAndProcessFavicon(base_domain);

      if (!image_blob) {
        console.warn(
          `404/Failure fetching favicon for ${base_domain}. Deleting record and retrying.`
        );
        deleteFaviconStmt.run({ $baseDomain: base_domain });
        continue;
      }

      db.run("BEGIN");
      try {
        updateFaviconStmt.run({
          $baseDomain: base_domain,
          $imageBlob: image_blob,
        });
        db.run("COMMIT");
      } catch (e) {
        db.run("ROLLBACK");
        console.error(`Error updating DB for ${base_domain}:`, e);
        return null;
      }
    }

    const faviconBase64 = Buffer.from(image_blob).toString("base64");
    const imageData = `data:image/png;base64,${faviconBase64}`;

    const otherDomains: string[] = randomRecords
      .slice(1, 4)
      .map((record) => record.base_domain);

    return {
      domain: base_domain,
      rank: rank,
      base64Favicon: imageData,
      otherDomains: otherDomains,
    };
  }

  console.error("Failed to get game data after all retries.");
  return null;
}
