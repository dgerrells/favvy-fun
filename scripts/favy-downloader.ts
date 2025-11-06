import sharp from "sharp";
import { Database } from "bun:sqlite";

const DB_NAME = "favy.db";
const TABLE_NAME = "favicons";
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 1000;

function getBaseDomainAndFilter(url: string): string | null {
  let domain = url.replace(/.*:\/\//, "").replace(/\/.*/, "");

  const parts = domain.split(".");
  const dots = parts.length - 1;

  const isTwoPart = dots === 1;
  const isWwwThreePart = dots === 2 && domain.startsWith("www.");

  if (isTwoPart || isWwwThreePart) {
    const sld = parts[parts.length - 2];
    const tld = parts[parts.length - 1];
    return `${sld}.${tld}`;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("Starting favicon processing script.");

  const inputFilePath = process.argv[2] || "domains.csv";
  const startDomain = process.argv[3];

  console.log(`Using input file: ${inputFilePath}`);
  if (startDomain) {
    console.log(`Starting processing at domain: **${startDomain}**`);
  }

  const db = new Database(DB_NAME);
  console.log(`Database opened: ${DB_NAME}`);

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      base_domain TEXT PRIMARY KEY,
      image_blob BLOB,
      rank INTEGER
    );
  `;
  db.run(createTableQuery);

  const checkStmt = db.prepare(
    `SELECT 1 FROM ${TABLE_NAME} WHERE base_domain = $baseDomain`
  );

  const insertStmt = db.prepare(
    `INSERT INTO ${TABLE_NAME} (base_domain, image_blob, rank) VALUES ($baseDomain, $imageBlob, $rank)`
  );

  const uniqueDomainsToProcess = new Map<
    string,
    { fullDomain: string; rank: number }
  >();

  const inputFile = Bun.file(inputFilePath);
  if (!(await inputFile.exists())) {
    console.error(`Error: Input file not found at ${inputFilePath}`);
    return;
  }

  const content = await inputFile.text();
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length <= 1) {
    console.log("Input file is empty or only contains a header. Exiting.");
    return;
  }

  let skipping = !!startDomain;
  if (skipping) {
    console.log(`\n-- Currently Skipping Lines Until ${startDomain} --\n`);
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(",");

    if (parts.length < 2) continue;

    const originalUrl = parts[0].trim();
    const rankString = parts[1].trim();
    const rank = parseInt(rankString, 10);

    if (isNaN(rank)) continue;

    const baseDomainKey = getBaseDomainAndFilter(originalUrl);

    if (skipping) {
      if (baseDomainKey === startDomain) {
        skipping = false;
        console.log(
          `\n-- Start Domain ${startDomain} Found. Processing Resumes --\n`
        );
      } else {
        continue;
      }
    }

    if (baseDomainKey) {
      if (uniqueDomainsToProcess.has(baseDomainKey)) continue;

      const dbCheck = checkStmt.get({ $baseDomain: baseDomainKey });
      if (dbCheck) continue;

      const fullDomain = originalUrl.replace(/.*:\/\//, "").replace(/\/.*/, "");
      uniqueDomainsToProcess.set(baseDomainKey, { fullDomain, rank });
    }
  }

  if (startDomain && skipping) {
    console.error(
      `\nError: The specified start domain **${startDomain}** was not found in the CSV. No domains were processed.`
    );
    return;
  }

  console.log(
    `\nProcessing ${uniqueDomainsToProcess.size} unique, new domains...`
  );

  for (const [baseDomain, data] of uniqueDomainsToProcess.entries()) {
    const { rank } = data;
    const apiUrl = `https://www.google.com/s2/favicons?domain=${baseDomain}&sz=128`;
    let response: Response | null = null;
    let success = false;
    let attempt = 1;

    console.log(`[${attempt}/${MAX_RETRIES}] Fetching ${baseDomain}...`);

    for (; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(apiUrl);

        if (response.ok) {
          success = true;
          break;
        } else {
          if (response.status === 404) {
            break;
          }

          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS);
            console.log(
              `[${attempt + 1}/${MAX_RETRIES}] Retrying ${baseDomain}...`
            );
          }
        }
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          console.log(
            `[${
              attempt + 1
            }/${MAX_RETRIES}] Retrying ${baseDomain} after network error...`
          );
        }
      }
    }

    if (success && response) {
      try {
        const imageBuffer = await response.arrayBuffer();

        const processedImageBuffer = await sharp(Buffer.from(imageBuffer))
          .resize(128, 128, {
            fit: sharp.fit.contain,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png({ compressionLevel: 9, quality: 90 })
          .toBuffer();

        insertStmt.run({
          $baseDomain: baseDomain,
          $imageBlob: processedImageBuffer,
          $rank: rank,
        });
        console.log(
          `[SUCCESS] Inserted favicon for ${baseDomain} (Rank: ${rank}).`
        );
      } catch (error) {
        console.error(
          `[FAIL] Image processing/DB insertion failed for ${baseDomain}.`
        );
      }
    } else {
      console.error(
        `[FAIL] Failed to fetch ${baseDomain} (HTTP ${
          response?.status ?? "Unknown"
        }). Skipping.`
      );
    }
  }

  db.close();
  console.log("\nScript finished. Database closed.");
}

run();
