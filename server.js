// server.js
import express from "express";
import cors from "cors";

const app = express();

// Ko-fi sometimes posts as x-www-form-urlencoded with a JSON "data" field.
// Support both JSON and urlencoded bodies.
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

/** Connected SSE clients (your StreamElements overlay) */
const clients = new Set();

/** Verification token from Ko-fi (set in Render env vars) */
const TOKEN = process.env.KOFI_VERIFY_TOKEN || "";

/** Sammi/LioranBoard webhook to forward to (so Sammi still gets tips) */
const SAMMI_WEBHOOK =
  "https://lioranboard-websocket-7we7k.ondigitalocean.app/kofihook";

/** Health check */
app.get("/", (_req, res) => res.send("✅ Ko-fi relay is running"));

/** SSE endpoint consumed by your StreamElements widget */
app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Say hello immediately so client knows we’re live.
  res.write("event: hello\n");
  res.write('data: {"ok":true}\n\n');

  clients.add(res);

  // Keep-alive ping to prevent idle disconnects on some hosts.
  const keepAlive = setInterval(() => {
    try {
      res.write("event: ping\n");
      res.write("data: {}\n\n");
    } catch (_e) {
      // socket closed
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
});

/** Ko-fi webhook receiver */
app.post("/kofihook", async (req, res) => {
  // Ko-fi may send urlencoded with a JSON string in "data"
  const raw = req.body || {};
  const token =
    raw.verification_token || raw.verificationToken || raw.token || "";

  if (TOKEN && token !== TOKEN) {
    return res.status(403).json({ ok: false, error: "invalid verification token" });
  }

  // Normalize payload
  let data = raw.data ?? raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (_e) {
      // leave as-is if not JSON
    }
  }

  const tip = {
    amount: Number(data.amount),
    from_name: data.from_name || data.from || "Ko-fi Supporter",
    message: data.message || data.note || ""
  };

  if (!Number.isFinite(tip.amount)) {
    return res.status(400).json({ ok: false, error: "invalid amount" });
  }

  // 1) Fan out to StreamElements overlays via SSE
  const packet = `event: kofi_tip\ndata: ${JSON.stringify(tip)}\n\n`;
  for
