// server.js
import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);

// Body + CORS
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// ======== SSE (for StreamElements) ========
const sseClients = new Set();
app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.write("event: hello\n");
  res.write('data: {"ok":true}\n\n');

  sseClients.add(res);
  const keepAlive = setInterval(() => {
    try { res.write("event: ping\n"); res.write("data: {}\n\n"); } catch {}
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// ======== WS (for Sammi Bridge) ========
const wsClients = new Set();
// Sammi will connect here: wss://<your-app>.onrender.com/ws
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  wsClients.add(socket);
  try { socket.send(JSON.stringify({ type: "hello", ok: true })); } catch {}
  const ping = setInterval(() => {
    try { socket.ping(); } catch {}
  }, 25000);
  socket.on("close", () => { clearInterval(ping); wsClients.delete(socket); });
});

// ======== Config ========
const TOKEN = process.env.KOFI_VERIFY_TOKEN || "";
const SAMMI_WEBHOOK = "https://lioranboard-websocket-7we7k.ondigitalocean.app/kofihook"; // optional fallback

// Health
app.get("/", (_req, res) => res.send("✅ Ko-fi relay is running (SSE + WS)"));

// ======== Ko-fi webhook ========
app.post("/kofihook", async (req, res) => {
  const raw = req.body || {};
  const token = raw.verification_token || raw.verificationToken || raw.token || "";
  if (TOKEN && token !== TOKEN) return res.status(403).json({ ok: false, error: "invalid verification token" });

  // Ko-fi can send x-www-form-urlencoded where "data" is a JSON string
  let data = raw.data ?? raw;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch {} }

  // Normalize a simple tip object for StreamElements overlays
  const tip = {
    amount: Number(data.amount),
    from_name: data.from_name || data.from || "Ko-fi Supporter",
    message: data.message || data.note || ""
  };
  if (!Number.isFinite(tip.amount)) return res.status(400).json({ ok: false, error: "invalid amount" });

  // 1) Broadcast to SSE (StreamElements)
  const ssePacket = `event: kofi_tip\ndata: ${JSON.stringify(tip)}\n\n`;
  for (const client of sseClients) { try { client.write(ssePacket); } catch {} }

  // 2) Broadcast to WS (Sammi Bridge)
  // Send BOTH the raw Ko-fi body and a simplified tip, to maximize compatibility.
  const wsRaw = JSON.stringify({ type: "kofi_raw", body: raw });
  const wsTip = JSON.stringify({ type: "kofi_tip", tip });
  for (const ws of wsClients) {
    try { ws.send(wsRaw); ws.send(wsTip); } catch {}
  }

  // 3) Optional: also forward the original payload to the legacy DO server
  try {
    await fetch(SAMMI_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(raw)
    });
    console.log("✅ Forwarded to legacy Sammi webhook");
  } catch (err) {
    console.warn("⚠️ Legacy forward failed:", err?.message || err);
  }

  return res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Ko-fi relay listening on ${PORT} (HTTP + WS)`));
