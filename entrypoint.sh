#!/bin/sh
set -e
# NOTE: this is to ensure the db is live and available before the worker container attempts to push db tables

echo "⏳ Waiting for Postgres (postgres:5432)..."
# This loop blocks the app from starting until the DB is actually listening
while ! nc -z postgres 5432; do
  sleep 1
done

echo "✅ Postgres is up!"

# Now that the DB is ready, we sync the schema.
# This happens INSIDE the worker container, talking to the postgres container.
echo "🚀 Syncing database schema..."
npx prisma db push

echo "🎬 Handing off to application..."
# This runs whatever 'command' is in your docker-compose (e.g., tsx src/worker-entry.ts)
exec "$@"