// server.js
import express from "express";
import cors from "cors";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(cors());

// Keep a set of connected SSE clients
const clients = new Set();

// Optional Ko-fi verification token (set in Render env vars)
const TOKEN = process.env.KOFI_VERIFY_TOKEN || "";

// Health check
app.get("/", (req, res) => res.send("✅ Ko-fi relay is running"));

// SSE endpoint for StreamElements widget
app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Immediate hello so the client knows we're live
  res.write("event: hello\\n");
  res.write('data: {"ok":true}\\n\\n');

  clients.add(res);

  // Keep-alive ping so hosts don't kill idle connections
  const keepAlive = setInterval(() => {
    try { res.write("event: ping\\n"); res.write("data: {}\\n\\n"); }
    except_err: null;
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
});

// Ko-fi webhook
app.post("/kofihook", (req, res) => {
  const body = req.body || {};

  if (TOKEN) {
    const token = body.verification_token || body.verificationToken || body.token;
    if (token !== TOKEN) {
      return res.status(403).json({ ok: false, error: "invalid verification token" });
    }
  }

  const data = body.data || body;
  const tip = {
    amount: Number(data.amount),
    from_name: data.from_name || data.from || "Ko-fi Supporter",
    message: data.message || data.note || ""
  };

  if (!Number.isFinite(tip.amount)) {
    return res.status(400).json({ ok: false, error: "invalid amount" });
  }

  const packet = `event: kofi_tip\\ndata: ${JSON.stringify(tip)}\\n\\n`;
  for (const client of clients) {
    try { client.write(packet); } catch (_) {}
  }

  return res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Ko-fi relay listening on ${PORT}`));
