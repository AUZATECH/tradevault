# 📈 TradeVault — Trading Journal

**Built by AuzaTech | Solomon Ifeanyi Ezechi**

A full-stack trading journal for Forex & Synthetic Indices traders using SMC methodology.
JWT-authenticated, multi-user, with win rate analytics, R:R tracking, and equity curve visualization.

---

## 🗂 Project Structure

```
tradevault/
├── tradevault-backend/
│   ├── server.js          ← Express API (all routes)
│   ├── schema.sql         ← MySQL database schema
│   ├── package.json
│   └── .env.example       ← Copy to .env and fill in
│
└── tradevault-frontend/
    └── index.html         ← Entire frontend (single file)
```

---

## ⚡ Local Setup (5 minutes)

### 1. MySQL Database
```bash
mysql -u root -p < tradevault-backend/schema.sql
```

### 2. Backend
```bash
cd tradevault-backend
npm install
cp .env.example .env
# Edit .env with your DB credentials
npm run dev
```

### 3. Frontend
Open `tradevault-frontend/index.html` in a browser.
Or use Live Server (VS Code extension) on port 5500.

> The frontend is pre-configured to call `http://localhost:3000/api`.
> To change the API URL, edit this line in `index.html`:
> ```js
> const API = window.API_BASE || 'http://localhost:3000/api';
> ```

---

## 🚀 Hosting on a VPS (Ubuntu)

### Step 1 — Install dependencies
```bash
sudo apt update && sudo apt install -y nodejs npm mysql-server nginx
sudo npm install -g pm2
```

### Step 2 — Clone & setup
```bash
git clone https://github.com/AUZATECH/tradevault.git
cd tradevault/tradevault-backend
npm install
cp .env.example .env
nano .env   # Fill in your real values
```

### Step 3 — MySQL setup
```bash
sudo mysql_secure_installation
sudo mysql -u root -p < schema.sql
```

### Step 4 — Run backend with PM2
```bash
pm2 start server.js --name tradevault-api
pm2 save
pm2 startup
```

### Step 5 — Nginx config
```nginx
# /etc/nginx/sites-available/tradevault
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend (static file)
    root /var/www/tradevault/frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API reverse proxy
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Chart uploads
    location /uploads/ {
        proxy_pass http://localhost:3000/uploads/;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tradevault /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 6 — Deploy frontend
```bash
sudo mkdir -p /var/www/tradevault/frontend
sudo cp tradevault-frontend/index.html /var/www/tradevault/frontend/
```

> Update the API URL in `index.html` before copying:
> ```js
> const API = window.API_BASE || 'https://yourdomain.com/api';
> ```

### Step 7 — SSL (HTTPS) with Certbot
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 🌐 Hosting on Render.com (Free tier)

### Backend
1. Push `tradevault-backend/` to a GitHub repo
2. Create a new **Web Service** on Render
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variables from `.env.example`
6. Use Render's free MySQL add-on (or PlanetScale)

### Frontend
1. Upload `index.html` to **Netlify Drop** (drag & drop)
2. Or push to GitHub and connect Netlify/Vercel
3. Update `const API = ...` to your Render backend URL

---

## 🔒 Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | API server port | `3000` |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASS` | MySQL password | — |
| `DB_NAME` | Database name | `tradevault` |
| `JWT_SECRET` | Secret for JWT signing | **Change this!** |
| `FRONTEND_URL` | CORS allowed origin | `*` |

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET  | `/api/auth/me` | Get current user |

### Trades (all require `Authorization: Bearer <token>`)
| Method | Endpoint | Description |
|---|---|---|
| GET    | `/api/trades` | List trades (filterable) |
| POST   | `/api/trades` | Create trade |
| PUT    | `/api/trades/:id` | Update trade |
| DELETE | `/api/trades/:id` | Delete trade |

**GET /api/trades query params:**
`pair`, `outcome`, `session`, `from` (date), `to` (date), `limit`, `offset`

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics` | Full stats, by pair/session/SMC tag, equity curve |

### Upload
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/upload/chart` | Upload chart screenshot (multipart/form-data) |

---

## 🏷 SMC Tags Supported
- Order Block (OB)
- Fair Value Gap (FVG)
- Break of Structure (BOS)
- Change of Character (CHoCH)
- Liquidity Sweep
- Inducement (IDM)
- Market Structure Shift (MSS)
- Premium Zone
- Discount Zone

---

## 📊 Features
- ✅ JWT Auth (register/login, multi-user)
- ✅ Log trades: Forex + Synthetic Indices (VIX75, Crash/Boom, Step Index, Jump)
- ✅ SMC concept tagging per trade
- ✅ Session tagging: London / New York / Asian
- ✅ Win rate, avg R:R, total P&L, best/worst trade
- ✅ Performance breakdown by pair, session, SMC concept
- ✅ Equity curve (cumulative P&L) — vanilla canvas, no chart library needed
- ✅ Filter journal by pair, outcome, session, date range
- ✅ Edit & delete trades
- ✅ Dark neon glassmorphism UI — AuzaTech signature aesthetic
- ✅ Toast notifications
- ✅ Fully responsive

---

## 🔧 Planned Upgrades
- [ ] Chart screenshot upload (UI ready, endpoint built)
- [ ] Weekly/monthly performance reports
- [ ] Trade replay / TradingView embed
- [ ] Telegram bot integration for logging trades on the go
- [ ] CSV export
- [ ] AI-powered trade feedback (Anthropic API)

---

*TradeVault v1.0 — AuzaTech 2026*
