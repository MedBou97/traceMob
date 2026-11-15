# TraceMob client

The client is a React/TypeScript MapLibre dashboard styled with Tailwind CSS. It provides login, latest positions, per-user trips, date-range playback, co-presence, and candidate dwell points.

## Local development

Start the API from `server/` with `JWT_SECRET` and `AUTH_USERS_JSON` configured, then run:

```sh
npm ci
npm run dev
```

Vite proxies `/api` requests to `http://localhost:3000`. To create account password hashes, see [`../DEPLOY.md`](../DEPLOY.md).

## Production

The client is built and served by its own Caddy container, defined in the repository's Compose file. The outer Caddy proxies `/api/*` to the API and all other requests to the client. The map uses OpenStreetMap tiles with attribution; follow its tile usage policy.
