-- Step 1: Wipe All Custom Data (Public Schema)

DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    -- Disables triggers to prevent foreign key errors during execution
    SET CONSTRAINTS ALL DEFERRED;
    
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE;';
    END LOOP;
END $$;

-- Step 2: Wipe All Users (Auth Schema)
-- This removes every user profile and automatically cascades to delete their sessions/identities
TRUNCATE auth.users CASCADE;

-- Alternative: Wipe Storage Buckets (Optional)

TRUNCATE storage.objects CASCADE;



