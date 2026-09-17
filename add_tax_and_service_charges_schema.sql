-- Migration: Add CGST, SGST, and Service Charge support to profiles and orders tables

-- 1. Add tax & service charge configuration columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS enable_tax BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5, 2) DEFAULT 2.5;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5, 2) DEFAULT 2.5;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS enable_service_cost BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS service_cost_rate NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS print_tax_breakdown BOOLEAN DEFAULT true;

-- 2. Add tax & service charge amount and rate columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_cost NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5, 2) DEFAULT 2.5;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5, 2) DEFAULT 2.5;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_cost_rate NUMERIC(5, 2) DEFAULT 0;

-- 3. Notify PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
