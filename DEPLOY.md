# Deploy TraceMob API and MobilityDB on an Oracle Cloud VPS

This deploys the Fastify API and the MobilityDB/PostgreSQL database with Docker Compose. The database is private to the Compose network and persisted in a named volume. The React client is not included.

## Before deploying

The API currently accepts location uploads without authentication, and the direct-IP setup below uses plain HTTP. Do not expose it to the public internet or send real location data until you add authentication and HTTPS. For a temporary test, leave the API bound to loopback and use an SSH tunnel or Cloudflare Tunnel. The database port is never published.

The database initializer creates the `raw_locations` table used by the API. Docker runs it only when the database volume is initialized for the first time.

## 1. Prepare the Oracle Cloud instance

Use an Ubuntu VPS, allow SSH (TCP 22) in the instance's Network Security Group or subnet security list, and connect:

```sh
ssh ubuntu@YOUR_PUBLIC_IP
```

Install Docker Engine and its Compose plugin using Docker's official Ubuntu installation instructions. Confirm they work:

```sh
docker --version
docker compose version
```

For Oracle Linux, use the corresponding Docker Engine installation instructions for Oracle Linux instead.

## 2. Get the project and configure it

Clone your repository on the VPS, then enter its root directory:

```sh
git clone YOUR_REPOSITORY_URL traceMob
cd traceMob
cp .env.example .env
```

Edit `.env`, replace `POSTGRES_PASSWORD` with a unique secret, and keep the default `API_BIND_ADDRESS=127.0.0.1` for the initial deployment. A URI-safe random password can be generated with:

```sh
openssl rand -hex 32
```

The value of `POSTGRES_DB` should remain `tracemob` unless you also update `database/init.sql`. Protect `.env` and do not commit it.

## 3. Start the services

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api db
```

The API listens on port 3000 inside the container. By default, Compose publishes it only on the VPS loopback interface, so the API port does not need an Oracle ingress rule and the database is not publicly reachable.

## 4. Move existing location rows (optional)

If the existing `tracemob-db` container on your old machine contains the data you want to keep, export the API's `raw_locations` table there:

```sh
docker exec -t tracemob-db pg_dump -U tracemob --data-only --table=raw_locations tracemob \
  > raw_locations-data.sql
scp raw_locations-data.sql ubuntu@YOUR_PUBLIC_IP:~/traceMob/
```

After the VPS Compose services are running, import the rows into the initialized database:

```sh
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U tracemob -d tracemob \
  < raw_locations-data.sql
rm raw_locations-data.sql
```

This imports the `raw_locations` table data into the matching schema created by `database/init.sql`; it does not migrate any other tables.

To test from your computer without exposing port 3000, open an SSH tunnel:

```sh
ssh -L 3000:127.0.0.1:3000 ubuntu@YOUR_PUBLIC_IP
```

In another terminal, send a test location through the tunnel:

```sh
curl -i -X POST http://localhost:3000/api/location \
  -H 'Content-Type: application/json' \
  -d '{"_type":"location","lat":41.0254,"lon":28.8893,"tst":1791814780,"acc":11,"tid":"FZ"}'
```

A successful request returns HTTP 200 with an empty JSON array. Use test coordinates until you have secured the endpoint.

## 5. Public-IP access (not secure for real location data)

To make the API directly reachable as `http://YOUR_PUBLIC_IP:3000`, change `API_BIND_ADDRESS` in `.env` to `0.0.0.0`, then recreate the API:

```sh
docker compose up -d --force-recreate api
```

Allow inbound TCP 3000 in both the Oracle Cloud Network Security Group/security list and (if enabled) the VPS firewall, then check `http://YOUR_PUBLIC_IP:3000`. Do not expose this unauthenticated HTTP endpoint for real use: request data and credentials are not encrypted, and anyone who can reach it can submit location records.

For a temporary encrypted public URL without opening port 3000, keep loopback binding and run Cloudflare Tunnel on the VPS:

```sh
cloudflared tunnel --url http://localhost:3000
```

For a durable production deployment, use a domain with HTTPS and add authentication before making location ingestion public.

## 6. Updating and backing up

Pull changes and rebuild/restart the API:

```sh
git pull
docker compose up -d --build
docker compose logs --tail=100 api
```

Back up the database before destructive changes. To create a logical backup:

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > tracemob-backup.sql
```

The named volume survives container replacement. `docker compose down -v` deletes that volume and its database data; do not run it unless you intend to erase the database.
