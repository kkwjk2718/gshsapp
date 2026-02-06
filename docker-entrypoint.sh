#!/bin/sh
set -e

# Initialize the database (push schema to SQLite)
# This creates the database file if it doesn't exist and applies the schema.
# Warning: In production with existing data, 'db push' can be risky if schema changes cause data loss.
# However, without 'migrations' folder, this is the standard way.
echo "Initializing database with 'prisma db push'..."
npx prisma db push --skip-generate

# Optional: Run seed if needed (uncomment if you have a seeding strategy that works here)
# echo "Seeding database..."
# npx prisma db seed

# Start the Next.js application
echo "Starting Next.js application..."
exec node server.js
