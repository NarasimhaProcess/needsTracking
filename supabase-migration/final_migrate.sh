#!/bin/bash
set -e

# ==========================================
# ⚠️ INPUT YOUR PASSWORDS BELOW
# ==========================================
SRC_PASS='needstracker@12345'  
TGT_PASS='needstracker@12345'  

# Strict hardcoded endpoints from your URL strings
SRC_HOST="aws-0-ap-south-1.pooler.supabase.com"
SRC_PORT="5432"
SRC_USER="postgres.cikxysaxvbixrcwlgzds"

# New Target Project Details (zwiydbarddeehcbqnufq)
TGT_HOST="aws-0-ap-south-1.pooler.supabase.com"
TGT_PORT="5432"
TGT_USER="postgres.zwiydbarddeehcbqnufq"

BACKUP_FILE="public_db.sql"

echo "=========================================================="
echo " Starting Full Table Structure & Data Migration           "
echo "=========================================================="

echo ""
echo "[Step 1/4] Extracting table creations, schemas and rows..."
PGPASSWORD="$SRC_PASS" pg_dump -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" -d "postgres" \
  --schema=public \
  --no-owner \
  --no-privileges \
  -f "$BACKUP_FILE"

echo "✅ Source successfully dumped with complete layout schemas to $BACKUP_FILE"

echo ""
echo "[Step 2/4] Wiping out the existing public schema on New Target..."
PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" -d "postgres" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public; GRANT ALL ON SCHEMA public TO anon; GRANT ALL ON SCHEMA public TO authenticated; GRANT ALL ON SCHEMA public TO service_role;"
echo "✅ Target 'public' schema wiped clean!"

echo ""
echo "[Step 3/4] Restoring structure and data into New Target..."
PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" -d "postgres" -f "$BACKUP_FILE"
echo "✅ Structure and relation tables restored successfully."

echo ""
echo "[Step 4/4] Disabling Row Level Security (RLS) on all target tables..."
PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" -d "postgres" -c "
DO \$\$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', r.tablename);
    END LOOP;
END \$\$;"

echo ""
echo "=========================================================="
echo "🎉 SUCCESS: All tables built cleanly without RLS!        "
echo "=========================================================="
