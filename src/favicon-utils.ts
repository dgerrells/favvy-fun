import sharp from "sharp";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAndProcessFavicon(
  baseDomain: string
): Promise<Uint8Array | null> {
  const apiUrl = `https://www.google.com/s2/favicons?domain=${baseDomain}&sz=128`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(apiUrl);

      if (response.ok) {
        const imageBuffer = await response.arrayBuffer();

        const processedImageBuffer = await sharp(Buffer.from(imageBuffer))
          .resize(128, 128, {
            fit: sharp.fit.contain,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png({ compressionLevel: 9, quality: 90 })
          .toBuffer();

        return processedImageBuffer;
      } else {
        if (response.status === 404) {
          console.log(`Favicon 404 for ${baseDomain}.`);
          return null;
        }

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
        }
      }
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      } else {
        console.error(`Network failure for ${baseDomain}:`, error);
        return null;
      }
    }
  }

  return null;
}
