#!/bin/bash

# Exit immediately if any command fails
set -e

# ==========================================
# CONFIGURATION (Edit these cleanly - do not add extra spaces)
# ==========================================
SUPABASE_ACCESS_TOKEN="your_sbp_token_here"
SOURCE_PROJECT_REF="your_source_ref_here"
SOURCE_DB_PASSWORD="your_source_password_with_@_here"

TARGET_PROJECT_REF="your_target_ref_here"
TARGET_DB_PASSWORD="your_target_password_here"

# ==========================================
# EXECUTION PIPELINE
# ==========================================

# 1. Export authentication tokens to environment memory
export SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN"

echo "=========================================="
echo " Starting Safe Escape-Proof Schema Sync"
echo "=========================================="

# 2. Reset workspace cache layout to clear old sessions
rm -rf .supabase/

# 3. Pull structural layout from User A (Source)
echo "Step 1: Authenticating and linking to Source Project..."
# By injecting the source password to the environment variable, the CLI safely parses the @ symbol
export SUPABASE_DB_PASSWORD="$SOURCE_DB_PASSWORD"
supabase link --project-ref "$SOURCE_PROJECT_REF"

echo "Step 2: Pulling Schema structure into memory layout..."
supabase db dump -f clean_schema.sql

# Unset the source password so it doesn't leak into the next steps
unset SUPABASE_DB_PASSWORD
rm -rf .supabase/

# 4. Apply structure to User B (Target) via network pipe
echo "Step 3: Streaming Schema structure cleanly to Target Project..."
export PGPASSWORD="$TARGET_DB_PASSWORD"

psql -h "db.${TARGET_PROJECT_REF}.supabase.co" -p 5432 -d postgres -U postgres -f clean_schema.sql

# Clean up local sensitive files instantly
rm -f clean_schema.sql

# 5. Host and deploy local Edge Functions to User B's project
echo "Step 4: Deploying all local Edge Functions..."
for dir in supabase/functions/*/; do
  if [ -d "$dir" ]; then
    func_name=$(basename "$dir")
    echo " -> Uploading function: $func_name"
    supabase functions deploy "$func_name" --project-ref "$TARGET_PROJECT_REF"
  fi
done

echo "=========================================="
echo " 🎉 Shell Script Migration Finished Successfully!"
echo "=========================================="
