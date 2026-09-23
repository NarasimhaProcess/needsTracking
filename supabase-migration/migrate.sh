#!/bin/bash
set -e

SOURCE_REF="cikxysaxvbixrcwlgzds"
TARGET_REF="hxmkwsjdgsvzparpfiao"
BACKUP_FILE="public_db.sql"

echo "=========================================================="
echo " Starting Supabase Free Tier Migration & Fresh Rebuild "
echo "=========================================================="
echo "Source Project Ref: $SOURCE_REF"
echo "Target Project Ref: $TARGET_REF"
echo "Backup File Name:   $BACKUP_FILE"
echo "=========================================================="

# Step 1: Dump from Source
echo ""
echo "[Step 1/3] Dumping clean schema and data from Source..."
echo "--> Please enter your SOURCE project database password when prompted."
npx supabase db dump --project-ref "$SOURCE_REF" -f "$BACKUP_FILE"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file $BACKUP_FILE was not created!"
    exit 1
fi
echo "✅ Source successfully dumped to $BACKUP_FILE"

# Step 2: Wipe Target Schema
echo ""
echo "[Step 2/3] Wiping the existing public schema on Target..."
echo "--> This will drop and recreate an empty 'public' schema to avoid conflicts."
echo "--> Please enter your TARGET project database password when prompted."
npx supabase pg-meta query "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public; GRANT ALL ON SCHEMA public TO anon; GRANT ALL ON SCHEMA public TO authenticated; GRANT ALL ON SCHEMA public TO service_role;" --project-ref "$TARGET_REF"
echo "✅ Target 'public' schema wiped clean!"

# Step 3: Rebuild Target from Backup
echo ""
echo "[Step 3/3] Rebuilding target using backup file..."
echo "--> Please enter your TARGET project database password when prompted again."
npx supabase db execute --project-ref "$TARGET_REF" -f "$BACKUP_FILE"

echo ""
echo "=========================================================="
echo "🎉 SUCCESS: Migration Completed Successfully!"
echo "Your target project is updated. Please check your Supabase"
echo "web dashboard under Table Editor to verify your data."
echo "=========================================================="
