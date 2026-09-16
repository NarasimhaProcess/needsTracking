#!/bin/bash
set -e

# ==========================================
# ⚠️ CONFIGURATION - INPUT YOUR PASSWORDS BELOW
# ==========================================

# Source Project (cikxysaxvbixrcwlgzds) - Region: ap-south-1
SRC_HOST="://supabase.com"
SRC_PORT="5432"
SRC_USER="postgres.cikxysaxvbixrcwlgzds"
SRC_PASS=""  # <-- Type your real source password here (keep the quotes)

# Target Project (hxmkwsjdgsvzparpfiao) - Region: ap-northeast-1
TGT_HOST="://supabase.com"
TGT_PORT="5432"
TGT_USER="postgres.hxmkwsjdgsvzparpfiao"
TGT_PASS=""  # <-- Type your real target password here (keep the quotes)

BACKUP_FILE="public_db.sql"

echo "=========================================================="
echo " Starting GitHub Codespaces Direct Arguments Migration     "
echo "=========================================================="

# Step 1: Dump using pg_dump with explicit arguments
echo ""
echo "[Step 1/3] Extracting schema and rows from source..."
PGPASSWORD="$SRC_PASS" pg_dump -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" -d "postgres" --clean --no-owner --no-privileges --schema=public -f "$BACKUP_FILE"
echo "✅ Source successfully dumped to $BACKUP_FILE"

# Step 2: Wipe Target Schema
echo ""
echo "[Step 2/3] Wiping out the existing public schema on Target..."
PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" -d "postgres" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public; GRANT ALL ON SCHEMA public TO anon; GRANT ALL ON SCHEMA public TO authenticated; GRANT ALL ON SCHEMA public TO service_role;"
echo "✅ Target 'public' schema wiped clean!"

# Step 3: Rebuild Target from Backup File
echo ""
echo "[Step 3/3] Restoring structure and data into Target..."
PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" -d "postgres" -f "$BACKUP_FILE"

echo ""
echo "=========================================================="
echo "🎉 SUCCESS: Codespace Migration Completed Successfully!"
echo "=========================================================="
