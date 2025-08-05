-- Check location_history table structure and data
-- Run this in your Supabase SQL editor

-- 1. Check table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'location_history'
ORDER BY ordinal_position;

-- 2. Check if table has any data
SELECT COUNT(*) as total_records FROM location_history;

-- 3. Check recent location records
SELECT 
    id,
    user_id,
    user_email,
    latitude,
    longitude,
    accuracy,
    timestamp,
    device_name,
    location_status,
    created_at
FROM location_history 
ORDER BY timestamp DESC 
LIMIT 10;

-- 4. Check location records by user (replace with your user ID)
-- SELECT 
--     id,
--     user_id,
--     user_email,
--     latitude,
--     longitude,
--     accuracy,
--     timestamp,
--     device_name,
--     location_status
-- FROM location_history 
-- WHERE user_id = 'your-user-id-here'
-- ORDER BY timestamp DESC 
-- LIMIT 10;

-- 5. Check if RLS policies are working
-- This should show your user's location records
SELECT COUNT(*) as user_records 
FROM location_history 
WHERE user_id = auth.uid(); 