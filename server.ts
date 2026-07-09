import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const PORT = 3000;
const ALLOWED_DOMAINS = [
  "api.binance.com",
  "fapi.binance.com",
  "api.bybit.com",
  "api.exchange.coinbase.com",
  "api.alternative.me",
  "api.coingecko.com"
];

async function startServer() {
  const app = express();

  // Secure API Proxy to bypass CORS restrictions
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      res.status(400).json({ error: "Missing 'url' query parameter" });
      return;
    }

    try {
      const parsedUrl = new URL(targetUrl);
      if (!ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
        res.status(403).json({ error: `Domain ${parsedUrl.hostname} is not allowed for proxying.` });
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      // Forward request with basic headers
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
          "User-Agent": "CryptoPulseDashboard/1.0"
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        res.status(response.status).json({ error: `Upstream returned status ${response.status}` });
        return;
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        res.json(data);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        res.status(504).json({ error: "Gateway Timeout (upstream took too long)" });
      } else {
        res.status(500).json({ error: error.message || "Failed to fetch from upstream" });
      }
    }
  });

  // Serve Frontend
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
