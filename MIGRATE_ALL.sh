#!/bin/bash

# =========================================================
# MASTER SUPABASE MIGRATION SCRIPT (Schema + Functions + Data)
# Source Project: wtcxhhbigmqrmqdyhzcz
# =========================================================

if [ -z "$1" ]; then
    echo "Usage: ./MIGRATE_ALL.sh <NEW_PROJECT_REFERENCE_ID>"
    exit 1
fi

NEW_PROJECT_REF=$1
OLD_PROJECT_REF="wtcxhhbigmqrmqdyhzcz"

echo "🌟 Starting Total Migration to $NEW_PROJECT_REF..."

# 1. DEPLOY SCHEMA
echo "📊 Step 1: Deploying Database Schema..."
# Note: You can also run the FULL_DATABASE_BACKUP.sql manually in the SQL Editor
npx supabase login
npx supabase db push --project-ref "$NEW_PROJECT_REF"

# 2. DEPLOY FUNCTIONS
echo "⚡ Step 2: Deploying Edge Functions..."
./deploy_functions.sh "$NEW_PROJECT_REF"

# 3. MIGRATE DATA
echo "💾 Step 3: Migrating Data (This will ask for your OLD project database password)..."
npx supabase db dump --project-ref "$OLD_PROJECT_REF" --data-only -f project_data.sql

echo "📤 Step 4: Uploading Data to New Project (This will ask for your NEW project database password)..."
# We use the SQL Editor for the safest data import, but you can try:
# npx supabase db push --project-ref "$NEW_PROJECT_REF" -f project_data.sql

echo "--------------------------------------------------------"
echo "✅ MIGRATION COMPLETE (PROPOSED)"
echo "--------------------------------------------------------"
echo "Next Steps:"
echo "1. Open the New Project SQL Editor and run FULL_DATABASE_BACKUP.sql"
echo "2. Run project_data.sql in the SQL Editor to restore your records."
echo "3. Manually create buckets: productsmedia, qr_codes, customer_documents"
echo "4. Update your mobile app's .env with the new URL and Anon Key."
