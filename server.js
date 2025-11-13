import express from "express";
import fetch from "node-fetch";
import Parser from "rss-parser";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const parser = new Parser();

let cachedNews = [];
let lastFetched = 0;

// 50 hidden RSS feeds across categories
const feeds = {
  world: [
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://www.theguardian.com/world/rss",
    "https://www.cbsnews.com/latest/rss/world",
  ],
  politics: [
    "https://feeds.bbci.co.uk/news/politics/rss.xml",
    "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
    "https://www.politico.com/rss/politics08.xml",
    "https://www.theguardian.com/politics/rss",
    "https://www.cnn.com/rss/cnn_allpolitics.rss",
  ],
  technology: [
    "https://feeds.arstechnica.com/arstechnica/index/",
    "https://www.theverge.com/rss/index.xml",
    "https://techcrunch.com/feed/",
    "https://www.wired.com/feed/rss",
    "https://www.engadget.com/rss.xml",
  ],
  sports: [
    "https://www.espn.com/espn/rss/news",
    "https://feeds.bbci.co.uk/sport/rss.xml",
    "https://www.si.com/rss/si_topstories.rss",
    "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml",
    "https://www.skysports.com/rss/12040",
  ],
  business: [
    "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
    "https://feeds.bbci.co.uk/news/business/rss.xml",
    "https://www.cnbc.com/id/10001147/device/rss/rss.html",
    "https://www.reuters.com/business/rss",
    "https://www.bloomberg.com/feed/podcast/etf-report.xml",
  ],
  science: [
    "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
    "https://www.sciencedaily.com/rss/top/science.xml",
    "https://www.nasa.gov/rss/dyn/breaking_news.rss",
    "https://www.nationalgeographic.com/content/natgeo/en_us/news.rss",
    "https://feeds.feedburner.com/LiveScience",
  ],
  culture: [
    "https://www.theguardian.com/culture/rss",
    "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",
    "https://www.newyorker.com/feed/culture",
    "https://www.latimes.com/entertainment-arts/rss2.0.xml",
    "https://www.rollingstone.com/music/music-news/feed/",
  ],
  lifestyle: [
    "https://www.nytimes.com/svc/collections/v1/publish/https://www.nytimes.com/section/style/rss.xml",
    "https://www.harpersbazaar.com/rss/all.xml",
    "https://www.vogue.com/feed/rss",
    "https://www.cosmopolitan.com/rss/all.xml",
    "https://www.elle.com/rss/all.xml",
  ],
  health: [
    "https://www.medicalnewstoday.com/rss",
    "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
    "https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml",
    "https://www.health.com/feed",
    "https://feeds.bbci.co.uk/news/health/rss.xml",
  ],
  travel: [
    "https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml",
    "https://www.cntraveler.com/feed/rss",
    "https://www.lonelyplanet.com/news.rss",
    "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml",
    "https://www.travelandleisure.com/rss",
  ],
};

const allFeeds = Object.values(feeds).flat();

async function fetchAllFeeds() {
  const now = Date.now();
  if (now - lastFetched < 60 * 1000 && cachedNews.length > 0) {
    console.log("Serving from cache...");
    return cachedNews;
  }

  console.log("Fetching fresh feeds...");
  let articles = [];

  for (const url of allFeeds) {
    try {
      const feed = await parser.parseURL(url);
      const items = feed.items.slice(0, 3).map(item => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        category: feed.title || "General",
      }));
      articles.push(...items);
    } catch (err) {
      console.error("Error fetching", url, err.message);
    }
  }

  cachedNews = articles.sort(() => Math.random() - 0.5);
  lastFetched = now;
  return cachedNews;
}

app.get("/api/fetchSummaries", async (req, res) => {
  try {
    const articles = await fetchAllFeeds();
    res.json(articles);
  } catch {
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

app.get("/health", (req, res) => res.send("THE INK server running."));

app.listen(PORT, () => console.log(`✅ THE INK running on port ${PORT}`));
