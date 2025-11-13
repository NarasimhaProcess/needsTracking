-- 1. Add a new column to the orders table to store the custom order number
ALTER TABLE public.orders
ADD COLUMN order_number TEXT;

-- 2. Create a table to manage daily order sequences
CREATE TABLE public.order_number_sequences (
    sequence_date DATE PRIMARY KEY,
    last_value INT NOT NULL
);

-- 3. Create a function to generate the next order number
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT AS $$
DECLARE
    new_value INT;
    current_sequence_date DATE;
    order_prefix TEXT;
    order_suffix TEXT;
BEGIN
    current_sequence_date := NOW()::DATE;
    order_prefix := to_char(current_sequence_date, 'YYYYMMDD');

    -- Lock the table to prevent race conditions
    LOCK TABLE public.order_number_sequences IN EXCLUSIVE MODE;

    -- Upsert the sequence value for the current date
    INSERT INTO public.order_number_sequences (sequence_date, last_value)
    VALUES (current_sequence_date, 1)
    ON CONFLICT (sequence_date)
    DO UPDATE SET last_value = order_number_sequences.last_value + 1
    RETURNING last_value INTO new_value;

    -- Format the suffix with leading zeros
    order_suffix := lpad(new_value::TEXT, 4, '0');

    RETURN order_prefix || '-' || order_suffix;
END;
$$ LANGUAGE plpgsql;

-- 4. Create a trigger function to set the order number before insert
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number := public.generate_order_number();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create a trigger on the orders table
CREATE TRIGGER set_order_number_trigger
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_number();

-- 6. Add a unique constraint to the order_number column
-- This is done as a separate step to ensure existing orders (if any) don't cause issues
-- If there are existing orders, you will need to backfill them with unique order numbers
-- before running this command.
-- For now, I will comment it out.
-- ALTER TABLE public.orders
-- ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
