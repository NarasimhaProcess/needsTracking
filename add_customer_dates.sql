-- Add start_date and end_date columns to customers table
-- Run this SQL script in your Supabase SQL editor

ALTER TABLE customers 
ADD COLUMN start_date DATE,
ADD COLUMN end_date DATE;

-- Add comments for documentation
COMMENT ON COLUMN customers.start_date IS 'Start date of the repayment plan';
COMMENT ON COLUMN customers.end_date IS 'End date of the repayment plan (auto-calculated based on start_date and duration)';

-- Optional: Add index for better query performance on date ranges
CREATE INDEX idx_customers_start_date ON customers(start_date);
CREATE INDEX idx_customers_end_date ON customers(end_date);
