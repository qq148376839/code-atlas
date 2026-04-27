#!/bin/sh
set -e

# Start nginx in background
nginx

# Start backend
cd /app
exec node packages/backend/dist/server.js
