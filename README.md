# NCAABase Backend

Live college baseball score API. StatBroadcast scraping (5-10s delay) + ESPN fallback (30s delay).

## Quick Start
```bash
npm install
npm start
```

## API
- `GET /api/scores` — Today's games
- `GET /api/scores/live` — Live games only
- `GET /api/scores/:date` — Specific date (YYYY-MM-DD)
- `GET /api/teams` — All tracked teams
- `GET /api/status` — Health check

## Deploy to Railway
1. Push to GitHub
2. railway.app → New Project → Deploy from GitHub
3. Done
