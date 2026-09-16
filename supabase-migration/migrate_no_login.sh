cat << 'EOF' > codespace_migrate.sh
#!/bin/bash
set -e

# ⚠️ PLACE YOUR CONNECTION STRINGS HERE (make sure passwords use %40 for @)
SOURCE_DB_URL="postgresql://postgres.cikxysaxvbixrcwlgzds:%4://supabase.com"
TARGET_DB_URL="postgresql://postgres.hxmkwsjdgsvzparpfiao:@@://supabase.com"

BACKUP_FILE="public_db.sql"

echo "=========================================================="
echo " Starting GitHub Codespaces Native Postgres Migration      "
echo "=========================================================="

# Step 1: Dump using pg_dump
echo ""
echo "[Step 1/3] Extracting schema and rows from source..."
pg_dump --clean --no-owner --no-privileges --schema=public -d "$SOURCE_DB_URL" -f "$BACKUP_FILE"
echo "✅ Source successfully dumped to $BACKUP_FILE"

# Step 2: Wipe Target Schema
echo ""
echo "[Step 2/3] Wiping out the existing public schema on Target..."
psql -d "$TARGET_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public; GRANT ALL ON SCHEMA public TO anon; GRANT ALL ON SCHEMA public TO authenticated; GRANT ALL ON SCHEMA public TO service_role;"
echo "✅ Target 'public' schema wiped clean!"

# Step 3: Rebuild Target from Backup File
echo ""
echo "[Step 3/3] Restoring structure and data into Target..."
psql -d "$TARGET_DB_URL" -f "$BACKUP_FILE"

echo ""
echo "=========================================================="
echo "🎉 SUCCESS: Codespace Migration Completed Successfully!"
echo "=========================================================="
EOF
