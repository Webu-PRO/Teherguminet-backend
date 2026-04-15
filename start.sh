#!/bin/sh
set -e

NODE_ENV=${NODE_ENV:-development}
RUN_MIGRATIONS=${RUN_MIGRATIONS:-true}
RUN_SEED=${RUN_SEED:-false}
RUN_PRICING_ENSURE_NET=${RUN_PRICING_ENSURE_NET:-true}
RUN_VARIANTS_BACKFILL_DEFAULT_DIMENSIONS=${RUN_VARIANTS_BACKFILL_DEFAULT_DIMENSIONS:-false}
RUN_VARIANTS_BACKFILL_FAIL_ON_ERROR=${RUN_VARIANTS_BACKFILL_FAIL_ON_ERROR:-false}
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-9000}
CI=${CI:-1}
MEDUSA_DISABLE_TELEMETRY=${MEDUSA_DISABLE_TELEMETRY:-1}
export NODE_ENV RUN_MIGRATIONS RUN_SEED RUN_PRICING_ENSURE_NET RUN_VARIANTS_BACKFILL_DEFAULT_DIMENSIONS RUN_VARIANTS_BACKFILL_FAIL_ON_ERROR HOST PORT CI MEDUSA_DISABLE_TELEMETRY

echo "Working directory: $(pwd)"

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  yarn medusa db:migrate
else
  echo "Skipping database migrations (RUN_MIGRATIONS=$RUN_MIGRATIONS)."
fi

if [ "$RUN_SEED" = "true" ]; then
  echo "Seeding database..."
  yarn seed || echo "Seeding failed, continuing..."
else
  echo "Skipping database seed (RUN_SEED=$RUN_SEED)."
fi

if [ "$RUN_PRICING_ENSURE_NET" = "true" ]; then
  echo "Ensuring tax-exclusive pricing preferences for HU/SK..."
  yarn pricing:ensure-net || echo "pricing:ensure-net failed, continuing startup..."
else
  echo "Skipping net-pricing preference enforcement (RUN_PRICING_ENSURE_NET=$RUN_PRICING_ENSURE_NET)."
fi

if [ "$RUN_VARIANTS_BACKFILL_DEFAULT_DIMENSIONS" = "true" ]; then
  echo "Backfilling missing default-variant dimensions (weight/width/height) from inventory items..."
  if [ "$RUN_VARIANTS_BACKFILL_FAIL_ON_ERROR" = "true" ]; then
    yarn variants:backfill-default-dimensions -- --apply
  else
    yarn variants:backfill-default-dimensions -- --apply || echo "default-variant dimension backfill failed, continuing startup..."
  fi
else
  echo "Skipping default-variant dimension backfill (RUN_VARIANTS_BACKFILL_DEFAULT_DIMENSIONS=$RUN_VARIANTS_BACKFILL_DEFAULT_DIMENSIONS)."
fi

if [ "$NODE_ENV" = "production" ]; then
  if [ ! -d ".medusa/server" ]; then
    echo "Build artifacts missing. Building Medusa project..."
    yarn build

    if [ -d ".medusa/server/public" ]; then
      echo "Syncing admin build to public directory..."
      mkdir -p public
      cp -R .medusa/server/public/* public/
    fi
  else
    echo "Using prebuilt Medusa artifacts."
  fi

  echo "Starting Medusa production server..."
  yarn start
else
  echo "Starting Medusa development server..."
  yarn dev
fi
