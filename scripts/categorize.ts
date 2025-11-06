import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import * as fs from "fs/promises";
import * as path from "path";

const MODEL_NAME = "gemini-2.5-flash";
const BATCH_SIZE = 50;
const CONCURRENT_REQUESTS = 50;
const MAX_RETRIES = 1;
const TIMEOUT_MS = 15_000;
const ai = new GoogleGenAI({
  httpOptions: {
    timeout: TIMEOUT_MS,
  },
});

const VALID_CATEGORIES = new Set([
  "Gaming",
  "Social",
  "Sports",
  "News",
  "Travel",
  "Shopping",
  "DevTools",
  "Streaming",
  "NSFW",
]);

let PROHIBITED_SKIPPED_ROWS: string[] = [];
let ERROR_SKIP_ROWS: string[] = [];
let ORIGINAL_INPUT_BASENAME: string = "";

function parseCsv(content: string): { header: string; dataRows: string[] } {
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    throw new Error("Input file is empty.");
  }
  const [header, ...dataRows] = lines;
  return { header, dataRows };
}

function buildPrompt(data: string[]): string {
  const dataSection = data.join("\n");
  const expectedLength = data.length;

  return `You are an expert domain categorizer. Categorize the following CSV data rows. Each row contains a domain and a rating (e.g., "google.com,5").

The available categories are: ${[...VALID_CATEGORIES].join()}.
- Any domain which looks explicitly sexual or inappropriate should be categorized as "NSFW".

***CRITICAL OUTPUT INSTRUCTION***:
1. Your response MUST ONLY CONTAIN the list of categories given. Do NOT MAKE UP categories. 
2. The list must be comma-separated, with no spaces between the categories, in the exact order of the input domains. Example format: Category1,Category2,Category3
3. There MUST BE EXACTLY ${expectedLength} categories returned corresponding to the number of rows given. Do NOT omit any rows categorization. 
4. DO NOT include any other text, introductory phrases, or numbering in your response.

Input CSV Data Rows (${expectedLength} rows):
${dataSection}`;
}

async function runBatchRequest(
  batch: string[],
  batchNum: number
): Promise<{ newRows: string[]; processedRows: number }> {
  const TOTAL_ATTEMPTS = 1 + MAX_RETRIES;
  const expectedLength = batch.length;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= TOTAL_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;

    if (isRetry) {
      console.log(
        `[Batch ${batchNum}] Retrying (Attempt ${attempt}/${TOTAL_ATTEMPTS}).`
      );
    }

    try {
      const prompt = buildPrompt(batch);
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ],
          temperature: 0.2,
          thinkingConfig: {
            thinkingBudget: 500,
            includeThoughts: false,
          },
        },
      });

      if (response.promptFeedback?.blockReason === "PROHIBITED_CONTENT") {
        console.warn(
          `[Batch ${batchNum}] Request blocked due to PROHIBITED_CONTENT. Skipping rows.`
        );
        PROHIBITED_SKIPPED_ROWS.push(...batch);
        attempt = TOTAL_ATTEMPTS;
        throw new Error(
          "Prompt Blocked: PROHIBITED_CONTENT. Rows added to skip list."
        );
      }

      const rawText = response?.text?.trim();

      const categories = rawText
        ?.split(",")
        ?.map((c) => c.trim())
        ?.filter((c) => c.length > 0);

      if (!categories || categories.length !== expectedLength) {
        const errorMsg = `Length mismatch. Expected ${expectedLength}, got ${categories?.length}.`;
        console.error(`[Batch ${batchNum}] response`, response);
        throw new Error(errorMsg);
      }

      for (const category of categories) {
        if (!VALID_CATEGORIES.has(category)) {
          console.error(`[Batch ${batchNum}] response`, batch, category);
          throw new Error(`Invalid category "${category}" returned in batch.`);
        }
      }

      const newRows: string[] = categories.map((category, index) => {
        const originalRow = batch[index];
        return `${originalRow},${category}`;
      });

      const duration = ((Date.now() - startTime) / 2000).toFixed(2);
      console.log(`[Batch ${batchNum}] Completed in ${duration}s.`);

      return { newRows, processedRows: newRows.length };
    } catch (error) {
      if (attempt === TOTAL_ATTEMPTS) {
        console.error(`[Batch ${batchNum}] Final Error:`, error);
        ERROR_SKIP_ROWS.push(...batch);
        return { newRows: [], processedRows: 0 };
      }

      console.log(
        `[Batch ${batchNum}] Error encountered: ${
          (error as Error).message
        }. Backing off...`
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  return { newRows: [], processedRows: 0 };
}

async function processCsv(
  inputPath: string,
  outputPath: string,
  batchSize: number,
  concurrentRequests: number
): Promise<void> {
  console.log(`\n--- Domain Categorization Script ---`);
  console.log(`Input File: ${inputPath}`);

  const content = await fs.readFile(inputPath, "utf-8");
  const { header, dataRows } = parseCsv(content);

  let enhancedData = [header + ",category"];
  const totalRows = dataRows.length;
  let successfulRows = 0;

  console.log(`Total domains: ${totalRows}`);
  console.log(`Batch Size: ${batchSize}`);
  console.log(`Concurrent Requests: ${concurrentRequests}`);
  console.log(`Max Retries per Batch: ${MAX_RETRIES}`);
  console.log("------------------------------------");

  for (let i = 0; i < totalRows; i += batchSize * concurrentRequests) {
    const batchSetRows = dataRows.slice(
      i,
      Math.min(i + batchSize * concurrentRequests, totalRows)
    );

    const concurrentPromises = [];
    let currentSetProcessedRows = 0;

    for (
      let j = 0;
      j < concurrentRequests && j * batchSize < batchSetRows.length;
      j++
    ) {
      const batchStartIndex = j * batchSize;
      const batch = batchSetRows.slice(
        batchStartIndex,
        Math.min(batchStartIndex + batchSize, batchSetRows.length)
      );
      const batchNum = Math.floor((i + batchStartIndex) / batchSize) + 1;

      console.log(`[Batch ${batchNum}] Starting run (${batch.length} rows).`);
      concurrentPromises.push(runBatchRequest(batch, batchNum));
    }

    const results = await Promise.all(concurrentPromises);

    for (const result of results) {
      enhancedData.push(...result.newRows);
      currentSetProcessedRows += result.processedRows;
    }

    successfulRows += currentSetProcessedRows;

    console.log(
      `\nSet complete. Processed rows in set: ${currentSetProcessedRows}`
    );
    console.log("------------------------------------");
  }

  await fs.writeFile(outputPath, enhancedData.join("\n"), "utf-8");

  console.log(`\nScript complete.`);
  console.log(
    `SUCCESS: Enhanced ${successfulRows} out of ${totalRows} initial rows.`
  );
}

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error(
      "Usage: ts-node categorize_text_output.ts <path/to/input.csv>"
    );
    process.exit(1);
  }

  const dirname = path.dirname(inputPath);
  ORIGINAL_INPUT_BASENAME = path.basename(inputPath, path.extname(inputPath));
  const extname = path.extname(inputPath);
  const outputPath = path.join(
    dirname,
    `${ORIGINAL_INPUT_BASENAME}_enhanced_text${extname}`
  );

  try {
    await processCsv(inputPath, outputPath, BATCH_SIZE, CONCURRENT_REQUESTS);

    if (PROHIBITED_SKIPPED_ROWS.length > 0) {
      const skippedPath = path.join(
        dirname,
        `${ORIGINAL_INPUT_BASENAME}_skipped${extname}`
      );
      const skippedContent = [
        ...PROHIBITED_SKIPPED_ROWS,
        ...ERROR_SKIP_ROWS,
      ].join("\n");
      await fs.writeFile(skippedPath, skippedContent, "utf-8");
      console.warn(`Skipped rows saved to: ${skippedPath}`);
    }
  } catch (error) {
    console.error("A critical error occurred in main execution:", error);
    process.exit(1);
  }
}

main();
