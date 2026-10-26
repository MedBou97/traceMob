# Deploy TraceMob API and MobilityDB on an Oracle Cloud VPS

This deploys Caddy, the Fastify API, a GPS worker, Mosquitto, and the MobilityDB/PostgreSQL database with Docker Compose. The API publishes OwnTracks locations to Mosquitto; the worker consumes them and writes them to the database. The broker and database are private to the Compose network and persisted in named volumes. The React client is not included.

## Before deploying

The API currently accepts location uploads without authentication. Keep it behind Caddy with HTTPS and add authentication before sending real location data. The API, MQTT broker, and database are not published directly; only Caddy's HTTP/HTTPS ports are exposed. Mosquitto allows anonymous clients on the private Compose network, so do not publish port 1883 or attach untrusted containers to that network.

The database initializer creates the `raw_locations` table used by the GPS worker. Docker runs it only when the database volume is initialized for the first time. Mosquitto persists queued messages in its named volume; the worker uses QoS 1 and idempotent inserts.

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

Edit `.env` and replace `POSTGRES_PASSWORD` with a unique secret. A URI-safe random password can be generated with:

```sh
openssl rand -hex 32
```

The value of `POSTGRES_DB` should remain `tracemob` unless you also update `database/init.sql`. Protect `.env` and do not commit it.

## 3. Start the services

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api gps-worker mqtt db
```

OwnTracks should continue posting to `https://tracemob.duckdns.org/api/location`. Caddy proxies requests to the API. Only ports 80 and 443 need inbound firewall rules; the API, MQTT broker, and database do not need public ports.

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

After DNS points to the VPS and Caddy has obtained its TLS certificate, send a test location through the HTTPS endpoint:

```sh
curl -i -X POST https://tracemob.duckdns.org/api/location \
  -H 'Content-Type: application/json' \
  -d '{"_type":"location","lat":41.0254,"lon":28.8893,"tst":1791814780,"acc":11,"tid":"FZ"}'
```

A successful request returns HTTP 200 with an empty JSON array once the broker accepts the message. The GPS worker inserts it asynchronously. Use test coordinates until you have secured the endpoint.

## 5. Updating and backing up

Pull changes and rebuild/restart the services:

```sh
git pull
docker compose up -d --build
docker compose logs --tail=100 api gps-worker mqtt
```

Back up the database before destructive changes. To create a logical backup:

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > tracemob-backup.sql
```

The named volume survives container replacement. `docker compose down -v` deletes that volume and its database data; do not run it unless you intend to erase the database.
