
# Ko‑fi → StreamElements Relay (SSE)

Small Node/Express service that:
- receives Ko‑fi webhook POSTs at **/kofihook**
- broadcasts them as Server‑Sent Events at **/stream** for your StreamElements widget

## Deploy on Render.com
1. Create a new **Web Service**.
2. Connect this GitHub repo.
3. **Build command:** *(leave empty)*
4. **Start command:** `node server.js`
5. Add env var: `KOFI_VERIFY_TOKEN` → set to your Ko‑fi "Verification Token".
6. Deploy.

### Hook up
- **Ko‑fi Webhook URL:** `https://YOUR-RENDER.onrender.com/kofihook`
- **StreamElements Widget JS:**

```js
const KOFI_STREAM = "https://YOUR-RENDER.onrender.com/stream";
```

### Test
Open your overlay so it connects, then in Ko‑fi → Webhooks → **Send Test**.
You should see your alert fire.
