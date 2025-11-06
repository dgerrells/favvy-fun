import { serve } from "bun";
import path from "path";
import { getNewGameData } from "./src/game-manager";

const PUBLIC_DIR = path.join(import.meta.dir, "public");
const PORT = 8088;

function getGameFilters(url: URL) {
  const rank = url.searchParams.get("rank") || "all";
  const categoryParam = url.searchParams.get("categories");
  const categories = categoryParam
    ? categoryParam
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
    : [];

  const validRanks = ["top100", "top1000", "top10000", "all"];
  const rankFilter = validRanks.includes(rank.toLowerCase())
    ? rank.toLowerCase()
    : "all";

  return { rankFilter, categories };
}

serve({
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === "/api/next-game") {
      const { rankFilter, categories } = getGameFilters(url);

      console.log(
        `Request for next game: rank=${rankFilter}, categories=[${categories.join(
          ", "
        )}]`
      );

      const data = await getNewGameData(rankFilter, categories);

      if (data) {
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          error: "Could not retrieve favicon data.",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const filename = pathname === "/" ? "index.html" : pathname;
    const filePath = path.join(PUBLIC_DIR, filename);

    try {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
    } catch (e) {
      console.error(`Error serving file ${filePath}:`, e);
    }

    return new Response("Not Found", { status: 404 });
  },
  port: PORT,
});

console.log(`Server running at http://localhost:${PORT}`);
console.log(`Serving static files from: ${PUBLIC_DIR}`);
