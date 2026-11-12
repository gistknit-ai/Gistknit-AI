GistKnit AI — Premium UI update
================================

This package keeps your existing chat/backend integration and refreshes the frontend:
- Minimal dark interface with soft mint accents
- Responsive mobile layout and sticky composer
- Animated typing dots while the assistant is responding
- One-time startup animation per browser session
- Free plan indicator and an Upgrade page
- Existing chat, history, docs, image upload, and backend routes retained

DEPLOY
1. Replace the frontend files in your Cloudflare Pages/GitHub root with:
   index.html, style.css, app.js, config.js
2. Also upload the NEW files: premium.css, premium.js
3. Keep backend/ and its files unchanged.
4. Commit/push; Cloudflare Pages will redeploy.

BACKEND NOTE
config.js still points to https://gistknit-ai.onrender.com.
The screenshot's ERR_NGROK_3200 means the model endpoint behind your backend is offline.
The frontend redesign cannot restart that model tunnel. Check the Render service's
/health endpoint first; if it returns ai:false, your LLM_BASE_URL/model tunnel needs
to be started again and the Render environment variable updated to the current URL.

UPGRADE NOTE
The Free plan badge and Upgrade page are UI placeholders. No payments are taken,
and a real subscription/payment provider has not been connected.
