-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.area_master (
  id bigint NOT NULL DEFAULT nextval('area_master_id_seq'::regclass),
  area_name character varying NOT NULL,
  area_type character varying DEFAULT 'city'::character varying,
  pin_code character varying UNIQUE,
  state character varying,
  country character varying DEFAULT 'India'::character varying,
  latitude double precision,
  longitude double precision,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  description text,
  CONSTRAINT area_master_pkey PRIMARY KEY (id)
);
CREATE TABLE public.conversation_participants (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  conversation_id bigint NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conversation_participants_pkey PRIMARY KEY (id),
  CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id),
  CONSTRAINT conversation_participants_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.conversations (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  title text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conversations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.customer_documents (
  id bigint NOT NULL DEFAULT nextval('customer_documents_id_seq'::regclass),
  customer_id bigint,
  file_name character varying,
  file_data text,
  uploaded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_documents_pkey PRIMARY KEY (id),
  CONSTRAINT customer_documents_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.customers (
  id bigint NOT NULL DEFAULT nextval('customers_id_seq'::regclass),
  name character varying NOT NULL,
  mobile character varying,
  email character varying,
  book_no character varying,
  latitude double precision,
  longitude double precision,
  area_id bigint,
  user_id uuid,
  customer_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  repayment_frequency character varying,
  repayment_amount numeric,
  photo_data text,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.area_master(id),
  CONSTRAINT customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.group_areas (
  group_id bigint NOT NULL,
  area_id bigint NOT NULL,
  CONSTRAINT group_areas_pkey PRIMARY KEY (group_id, area_id),
  CONSTRAINT group_areas_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id),
  CONSTRAINT group_areas_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.area_master(id)
);
CREATE TABLE public.groups (
  id bigint NOT NULL DEFAULT nextval('groups_id_seq'::regclass),
  name character varying NOT NULL,
  area_id bigint,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT groups_pkey PRIMARY KEY (id),
  CONSTRAINT groups_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.area_master(id)
);
CREATE TABLE public.location_history (
  id bigint NOT NULL DEFAULT nextval('location_history_id_seq'::regclass),
  user_id uuid,
  user_email text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  device_name text,
  accuracy double precision,
  timestamp timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT location_history_pkey PRIMARY KEY (id),
  CONSTRAINT location_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.message_summaries (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  conversation_id bigint NOT NULL UNIQUE,
  summary text NOT NULL,
  message_count integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT message_summaries_pkey PRIMARY KEY (id),
  CONSTRAINT message_summaries_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.messages (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  conversation_id bigint NOT NULL,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username text NOT NULL UNIQUE,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.transactions (
  id bigint NOT NULL DEFAULT nextval('transactions_id_seq'::regclass),
  customer_id bigint,
  user_id uuid,
  amount numeric NOT NULL,
  transaction_type character varying,
  remarks text,
  transaction_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  payment_mode character varying,
  upi_image text,
  latitude double precision,
  longitude double precision,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.user_groups (
  user_id uuid NOT NULL,
  group_id bigint NOT NULL,
  assigned_by uuid,
  assigned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_groups_pkey PRIMARY KEY (user_id, group_id),
  CONSTRAINT user_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT user_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id),
  CONSTRAINT user_groups_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  mobile text,
  profile_photo_data text,
  latitude double precision,
  longitude double precision,
  device_name text,
  updated_at timestamp with time zone,
  location_status integer DEFAULT 0,
  user_type text DEFAULT 'user'::text,
  location_update_interval integer DEFAULT 30,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- Repayment Plans Master Table
CREATE TABLE IF NOT EXISTS repayment_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, -- e.g., '12 Weeks', '100 Days', etc.
    frequency VARCHAR(20) NOT NULL, -- 'daily', 'weekly', etc.
    periods INTEGER NOT NULL, -- Number of periods (days/weeks)
    base_amount NUMERIC(12,2) NOT NULL, -- The base amount for scaling
    repayment_per_period NUMERIC(12,2) NOT NULL, -- Repayment per period for the base amount
    advance_amount NUMERIC(12,2) DEFAULT 0, -- Advance amount for the base amount
    late_fee_per_period NUMERIC(12,2) DEFAULT 0, -- Late fee per period (not scaled)
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optional: Add a trigger to update updated_at on row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_updated_at_on_repayment_plans ON repayment_plans;
CREATE TRIGGER set_updated_at_on_repayment_plans
BEFORE UPDATE ON repayment_plans
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();