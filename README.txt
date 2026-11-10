GistKnit AI - Step 4 (insaan jaisa chat, typing dots, streaming, coding, photo, internet research)
Created by Founder Ved Prakash

GITHUB PAR UPLOAD (repo ke root me, purani files replace karo):
  index.html, style.css, app.js, config.js
  backend/main.py, backend/rag.py, backend/web.py, backend/requirements.txt

RENDER: kuch naya variable zaroori nahi. Manual Deploy > Deploy latest commit.
  (optional) LLM_VISION_MODEL = qwen2.5vl:7b   (photo wale model ka naam, default yehi hai)

COLAB (photo + behtar jawab ke liye):
  Cell 5 (running...) ko Stop karo, naya GistKnit_Model_Server.ipynb ka Cell 2 chalao
  (ye context 8192 karta hai aur photo model download karta hai), phir Cell 5 dobara chalao.
  ngrok ka address same rehta hai agar Cell 3 dobara na chalao.

Firebase rules: is step me zarurat nahi.
