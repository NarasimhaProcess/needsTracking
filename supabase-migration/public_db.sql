--
-- PostgreSQL database dump
--

\restrict Dq9f6blaNjzA6vMXXkEDQLIp2Z8apNw0M9ZR9nlcIar5E51QpjrlUEME9dVb2Ze

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: inventory_change_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_change_type AS ENUM (
    'initial_stock',
    'sale',
    'return',
    'restock',
    'manual_adjustment'
);


--
-- Name: product_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_type_enum AS ENUM (
    'grocery',
    'electronics',
    'clothing',
    'other'
);


--
-- Name: admin_global_toggle_products(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_global_toggle_products(p_is_active boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  affected_rows INT;
BEGIN
  UPDATE public.products
  SET is_active = p_is_active
  WHERE id IS NOT NULL;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated_products', affected_rows, 'status', p_is_active);
END;
$$;


--
-- Name: admin_global_toggle_stores(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_global_toggle_stores(p_is_active boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  seller_row RECORD;
  current_media JSONB;
  filtered_media JSONB;
  new_settings JSONB;
  elem JSONB;
  updated_count INT := 0;
BEGIN
  FOR seller_row IN 
    SELECT id, media_urls FROM public.profiles
    WHERE LOWER(role) IN ('seller', 'admin', 'superadmin', 'appadmin', 'app_admin', 'merchant')
       OR id IN (SELECT DISTINCT user_id FROM public.products WHERE user_id IS NOT NULL)
  LOOP
    current_media := COALESCE(seller_row.media_urls, '[]'::jsonb);
    filtered_media := '[]'::jsonb;

    IF jsonb_typeof(current_media) = 'array' THEN
      FOR elem IN SELECT * FROM jsonb_array_elements(current_media)
      LOOP
        IF elem->>'type' IS DISTINCT FROM 'store_settings' THEN
          filtered_media := filtered_media || elem;
        END IF;
      END LOOP;
    END IF;

    new_settings := jsonb_build_object(
      'type', 'store_settings',
      'store_active', p_is_active,
      'map_active', p_is_active,
      'product_active', p_is_active,
      'updated_at', NOW()
    );

    filtered_media := filtered_media || new_settings;

    UPDATE public.profiles
    SET media_urls = filtered_media,
        updated_at = NOW()
    WHERE id = seller_row.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_sellers', updated_count, 'status', p_is_active);
END;
$$;


--
-- Name: admin_set_seller_products_active(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_seller_products_active(p_seller_id uuid, p_is_active boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  affected_rows INT;
BEGIN
  UPDATE public.products
  SET is_active = p_is_active
  WHERE user_id = p_seller_id OR customer_id = p_seller_id;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'seller_id', p_seller_id, 'updated_products', affected_rows);
END;
$$;


--
-- Name: admin_set_seller_store_settings(uuid, boolean, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_seller_store_settings(p_seller_id uuid, p_store_active boolean, p_map_active boolean, p_product_active boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  current_media JSONB;
  filtered_media JSONB := '[]'::jsonb;
  new_settings JSONB;
  elem JSONB;
BEGIN
  -- Get existing media_urls
  SELECT COALESCE(media_urls, '[]'::jsonb) INTO current_media
  FROM public.profiles
  WHERE id = p_seller_id;

  IF current_media IS NULL THEN
    current_media := '[]'::jsonb;
  END IF;

  -- Filter out existing store_settings
  IF jsonb_typeof(current_media) = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(current_media)
    LOOP
      IF elem->>'type' IS DISTINCT FROM 'store_settings' THEN
        filtered_media := filtered_media || elem;
      END IF;
    END LOOP;
  END IF;

  -- Build new settings object
  new_settings := jsonb_build_object(
    'type', 'store_settings',
    'store_active', p_store_active,
    'map_active', p_map_active,
    'product_active', p_product_active,
    'updated_at', NOW()
  );

  filtered_media := filtered_media || new_settings;

  -- Update profiles table
  UPDATE public.profiles
  SET media_urls = filtered_media,
      updated_at = NOW()
  WHERE id = p_seller_id;

  RETURN jsonb_build_object('success', true, 'seller_id', p_seller_id, 'settings', new_settings);
END;
$$;


--
-- Name: archive_customer_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_customer_data() RETURNS trigger
    LANGUAGE plpgsql
    AS $$DECLARE
    customer_id_to_archive uuid;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status AND (NEW.status = 'Closed' OR NEW.status = 'Paid') THEN
        customer_id_to_archive := NEW.id;
        PERFORM http_post('https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/archive-customer',
            json_build_object('customer_id', customer_id_to_archive)::text,
            ARRAY[
                ('Content-Type', 'application/json')::http_header,
                ('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0Y3hoaGJpZ21xcm1xZHloemN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjE2MTc4OCwiZXhwIjoyMDY3NzM3Nzg4fQ.5QQYPXs-ME1IH2RFmWCFPhcuYp2K6hE2NNfJeCxcVvw')::http_header
            ]
        );
    END IF;
    RETURN NEW;
END;$$;


--
-- Name: can_close_customer_account(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_close_customer_account(p_customer_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    total_repaid NUMERIC;
    amount_given NUMERIC;
BEGIN
    SELECT 
        COALESCE(SUM(CASE WHEN t.transaction_type = 'repayment' THEN t.amount ELSE 0 END), 0) AS total_repaid,
        COALESCE(c.amount_given, 0) AS amount_given
    INTO total_repaid, amount_given
    FROM customers c
    LEFT JOIN transactions t ON t.customer_id = c.id
    WHERE c.id = p_customer_id
    GROUP BY c.amount_given;

    RETURN amount_given <= total_repaid;
END;
$$;


--
-- Name: ensure_default_product_combination(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_default_product_combination() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM public.product_variant_combinations WHERE product_id = NEW.id) THEN
            INSERT INTO public.product_variant_combinations (product_id, combination_string, price, quantity, sku)
            VALUES (NEW.id, 'Default', COALESCE(NEW.amount, 0), 100, '');
        END IF;
        RETURN NEW;
    END;
    $$;


--
-- Name: find_nearest_manager(double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_nearest_manager(order_lat double precision, order_lon double precision) RETURNS TABLE(id uuid, name text, mobile text, location extensions.geography)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name AS name,
    p.mobile,
    dml.location
  FROM
    public.profiles p
  JOIN
    public.delivery_manager_locations dml ON p.id = dml.manager_id
  WHERE
    p.role = 'delivery_manager'
    -- Only consider managers active in the last hour
      AND dml.created_at > NOW() - INTERVAL '1 hour'
    -- And only consider managers who have 0 active orders
    
  ORDER BY
    ST_Distance(
      dml.location,
      ST_SetSRID(ST_MakePoint(order_lon, order_lat), 4326)::geography
    )
  LIMIT 1;
END;
$$;


--
-- Name: generate_order_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_order_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_active_products_with_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_products_with_details(p_user_id uuid) RETURNS TABLE(id uuid, product_name text, description text, amount numeric, product_type text, unit text, user_id uuid, latitude double precision, longitude double precision, product_media json, product_variants json, product_variant_combinations json)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.product_name::text,
        p.description,
        p.amount,
        p.product_type::text,
        p.unit,
        p.user_id,
        prof.latitude,
        prof.longitude,
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', pm.id,
                        'media_url', pm.media_url,
                        'media_type', pm.media_type
                    )
                )
                FROM product_media pm
                WHERE pm.product_id = p.id
            ),
            '[]'::json
        ),
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', pv.id,
                        'name', pv.name,
                        'product_id', pv.product_id,
                        'variant_options', COALESCE(
                            (
                                SELECT json_agg(
                                    json_build_object(
                                        'id', vo.id,
                                        'value', vo.value,
                                        'variant_id', vo.variant_id
                                    )
                                )
                                FROM variant_options vo
                                WHERE vo.variant_id = pv.id
                            ),
                            '[]'::json
                        )
                    )
                )
                FROM product_variants pv
                WHERE pv.product_id = p.id
            ),
            '[]'::json
        ),
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', pvc.id,
                        'combination_string', pvc.combination_string,
                        'price', pvc.price,
                        'quantity', pvc.quantity,
                        'sku', pvc.sku
                    )
                )
                FROM product_variant_combinations pvc
                WHERE pvc.product_id = p.id
            ),
            '[]'::json
        )
    FROM
        products p
    LEFT JOIN
        profiles prof ON p.user_id = prof.id
    WHERE
        p.user_id = p_user_id AND
        p.is_active = true AND
        (p.start_date IS NULL OR NOW()::date >= p.start_date) AND
        (p.end_date IS NULL OR NOW()::date <= p.end_date);
END;
$$;


--
-- Name: get_area_wise_summary(uuid, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_area_wise_summary(user_id_param uuid, latitude_param double precision, longitude_param double precision) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
    total_amount NUMERIC;
BEGIN
    SELECT SUM(amount)
    INTO total_amount
    FROM transactions
    WHERE
        user_id = user_id_param AND
        ST_DWithin(
            ST_MakePoint(longitude, latitude)::geography,
            ST_MakePoint(longitude_param, latitude_param)::geography,
            5000 -- Radius in meters
        );

    RETURN COALESCE(total_amount, 0);
END;
$$;


--
-- Name: get_customer_payment_status_for_csv(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customer_payment_status_for_csv(p_area_id bigint) RETURNS TABLE(customer_id bigint, area_name character varying, card_no text, payment_status text, "totalAmountReceived" numeric, customer_name text, mobile text, email text, start_date date, end_date date, days_to_complete integer, expected_repayment_amount numeric, repayment_frequency character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id::BIGINT,
        am.area_name::VARCHAR,
        c.book_no::TEXT,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM public.transactions t_today
                WHERE t_today.customer_id = c.id
                  AND t_today.transaction_type = 'repayment'
                  AND t_today.created_at::date = NOW()::date
            ) THEN 'Paid Today'::TEXT
            ELSE 'Not Paid Today'::TEXT
        END,
        COALESCE(t.total_amount, 0)::NUMERIC,
        c.name::TEXT,
        c.mobile::TEXT,
        c.email::TEXT,
        c.start_date::DATE,
        c.end_date::DATE,
        c.days_to_complete::INTEGER,
        c.repayment_amount::NUMERIC,
        c.repayment_frequency::VARCHAR
    FROM public.customers c
    LEFT JOIN public.area_master am ON c.area_id = am.id
    LEFT JOIN (
        SELECT
            t.customer_id,
            SUM(t.amount) as total_amount
        FROM public.transactions t
        WHERE t.transaction_type = 'repayment'
        GROUP BY t.customer_id
    ) t ON c.id = t.customer_id
    WHERE c.area_id = p_area_id;
END;
$$;


--
-- Name: get_customers_in_radius(double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customers_in_radius(user_lat double precision, user_lon double precision, radius_km double precision) RETURNS TABLE(id uuid, name text, latitude double precision, longitude double precision, distance_km double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.latitude,
    c.longitude,
    (earth_distance(ll_to_earth(user_lat, user_lon), ll_to_earth(c.latitude, c.longitude)) / 1000) AS distance
  FROM
    customers c
  WHERE
    earth_box(ll_to_earth(user_lat, user_lon), radius_km * 1000) @> ll_to_earth(c.latitude, c.longitude)
    AND (earth_distance(ll_to_earth(user_lat, user_lon), ll_to_earth(c.latitude, c.longitude)) / 1000) <= radius_km;
END;
$$;


--
-- Name: get_daily_payment_summary(bigint, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_payment_summary(p_area_id bigint, p_date date) RETURNS TABLE(payment_mode text, total_amount numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.payment_mode::text,
        SUM(t.amount) AS total_amount
    FROM
        public.transactions t
    JOIN
        public.customers c ON t.customer_id = c.id
    WHERE
        c.area_id = p_area_id
        AND t.transaction_date::date = p_date
    GROUP BY
        t.payment_mode;
END;
$$;


--
-- Name: get_order_live_tracking(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_live_tracking(p_order_id uuid) RETURNS TABLE(order_id uuid, order_status text, delivery_manager_id uuid, partner_name text, partner_mobile text, partner_lat double precision, partner_lon double precision, partner_heading double precision, partner_speed double precision, last_updated timestamp with time zone, shipping_address jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id AS order_id,
    o.status AS order_status,
    o.delivery_manager_id,
    p.full_name AS partner_name,
    p.mobile AS partner_mobile,
    dpl.latitude AS partner_lat,
    dpl.longitude AS partner_lon,
    dpl.heading AS partner_heading,
    dpl.speed AS partner_speed,
    dpl.updated_at AS last_updated,
    o.shipping_address::jsonb
  FROM public.orders o
  LEFT JOIN public.profiles p ON o.delivery_manager_id = p.id
  LEFT JOIN public.delivery_partner_locations dpl ON o.delivery_manager_id = dpl.partner_id
  WHERE o.id = p_order_id;
END;
$$;


--
-- Name: get_products_in_range(double precision, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_products_in_range(user_lat double precision, user_lon double precision, radius_meters integer) RETURNS TABLE(id uuid, product_name text, description text, amount numeric, user_id uuid, latitude double precision, longitude double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.product_name,
        p.description,
        p.amount,
        p.user_id,
        prof.latitude,
        prof.longitude
    FROM
        products p
    JOIN
        profiles prof ON p.user_id = prof.id
    WHERE
        ST_DWithin(
            ST_MakePoint(prof.longitude, prof.latitude)::geography,
            ST_MakePoint(user_lon, user_lat)::geography,
            radius_meters
        );
END;
$$;


--
-- Name: get_sellers_in_range(double precision, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sellers_in_range(user_lat double precision, user_lon double precision, radius_meters integer) RETURNS TABLE(id uuid, full_name text, latitude double precision, longitude double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.full_name,
        p.latitude,
        p.longitude
    FROM
        profiles p
    WHERE
        ST_DWithin(
            ST_MakePoint(p.longitude, p.latitude)::geography,
            ST_MakePoint(user_lon, user_lat)::geography,
            radius_meters
        );
END;
$$;


--
-- Name: handle_new_delivery_order_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_delivery_order_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    DECLARE
      dm_push_tokens JSONB;
      order_identifier TEXT;
      buyer_name TEXT;
    BEGIN
      IF COALESCE(NEW.order_type, 'delivery') <> 'shop-order' THEN
        order_identifier := COALESCE(NEW.order_number, SUBSTRING(NEW.id::text, 1, 8));
        SELECT full_name INTO buyer_name FROM public.profiles WHERE id = NEW.user_id;
    
        IF NEW.delivery_manager_id IS NOT NULL THEN
          SELECT jsonb_agg(token) INTO dm_push_tokens FROM public.push_tokens WHERE user_id = NEW.delivery_manager_id;
        ELSE
          SELECT jsonb_agg(pt.token) INTO dm_push_tokens FROM public.push_tokens pt JOIN public.profiles pr ON pt.user_id = pr.id WHERE pr.
  role = 'delivery_manager';
        END IF;
    
        IF dm_push_tokens IS NOT NULL AND jsonb_array_length(dm_push_tokens) > 0 THEN
          BEGIN
            PERFORM net.http_post(
              url := 'https://exp.host/--/api/v2/push/send',
              headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
              body := jsonb_build_object(
                'to', dm_push_tokens,
                'sound', 'default',
                'title', '🛵 New Delivery Order Received!',
                'body', 'Order #' || order_identifier || ' (₹' || NEW.total_amount || ') for ' || COALESCE(buyer_name, 'customer') || ' is
  ready for delivery.',
                'data', jsonb_build_object('orderId', NEW.id, 'type', 'delivery_assignment')
              )
            );
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Push notification notice: %', SQLERRM;
          END;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;


--
-- Name: handle_new_order_buyer_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_order_buyer_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  buyer_push_tokens JSONB;
  order_identifier TEXT;
BEGIN
  -- Get push tokens for the buyer
  SELECT jsonb_agg(token)
  INTO buyer_push_tokens
  FROM public.push_tokens
  WHERE user_id = NEW.user_id;

  order_identifier := COALESCE(NEW.order_number, SUBSTRING(NEW.id::text, 1, 8));

  IF buyer_push_tokens IS NOT NULL AND jsonb_array_length(buyer_push_tokens) > 0 THEN
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
      body := jsonb_build_object(
        'to', buyer_push_tokens,
        'sound', 'default',
        'title', '🛍️ Order Placed Successfully!',
        'body', 'Your order #' || order_identifier || ' for ₹' || NEW.total_amount || ' has been placed.',
        'data', jsonb_build_object('orderId', NEW.id, 'type', 'order_confirmation')
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: handle_new_order_item_inventory(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_order_item_inventory() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    DECLARE
        current_variant_quantity INT;
        new_quantity INT;
    BEGIN
        IF NEW.product_variant_combination_id IS NOT NULL THEN
            SELECT quantity INTO current_variant_quantity
            FROM public.product_variant_combinations
            WHERE id = NEW.product_variant_combination_id
            FOR UPDATE;
    
            IF current_variant_quantity IS NOT NULL THEN
                new_quantity := current_variant_quantity - NEW.quantity;
    
                UPDATE public.product_variant_combinations
                SET quantity = new_quantity
                WHERE id = NEW.product_variant_combination_id;
    
                INSERT INTO public.inventory_history (
                    product_variant_combination_id,
                    change_type,
                    quantity_change,
                    new_quantity,
                    order_id
                )
                VALUES (
                    NEW.product_variant_combination_id,
                    'sale',
                    -NEW.quantity,
                    new_quantity,
                    NEW.order_id
                );
            END IF;
        END IF;
    
        RETURN NEW;
    END;
    $$;


--
-- Name: handle_new_order_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_order_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  seller_user_id UUID;
  seller_push_tokens JSONB;
  product_name_var TEXT;
  buyer_name_var TEXT;
  order_id_var UUID;
BEGIN
  -- 1. Get the seller's user_id, product name and order_id
  SELECT
    prod.user_id,
    prod.product_name,
    NEW.order_id
  INTO
    seller_user_id,
    product_name_var,
    order_id_var
  FROM public.products prod
  JOIN public.product_variant_combinations pvc ON prod.id = pvc.product_id
  WHERE pvc.id = NEW.product_variant_combination_id;

  IF seller_user_id IS NOT NULL THEN
    -- 2. Select only Native Expo Push Tokens to prevent exp.host validation errors
    SELECT jsonb_agg(token)
    INTO seller_push_tokens
    FROM public.push_tokens
    WHERE user_id = seller_user_id
      AND (token LIKE 'ExponentPushToken%' OR token LIKE 'ExpoPushToken%');

    -- 3. Get buyer name
    SELECT p.full_name
    INTO buyer_name_var
    FROM public.orders o
    JOIN public.profiles p ON o.user_id = p.id
    WHERE o.id = order_id_var;

    -- 4. Send notification to Expo Gateway if tokens exist
    IF seller_push_tokens IS NOT NULL AND jsonb_array_length(seller_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', seller_push_tokens,
            'title', '🎉 New Order Received!',
            'body', 'Your product ' || COALESCE(product_name_var, '[Product]') || ' was ordered by ' || COALESCE(buyer_name_var, 'a customer') || '.',
            'data', jsonb_build_object('orderId', order_id_var)
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Expo push failed (non-fatal): %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: handle_new_order_notify_sellers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_order_notify_sellers() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_seller_ids UUID[];
  v_buyer_name TEXT;
BEGIN
  -- Exit early if the initial status isn't relevant for fulfillment routing
  IF NEW.status NOT IN ('pending', 'placed') THEN
    RETURN NEW;
  END IF;

  -- Fetch the distinct seller IDs across the entire order
  v_seller_ids := public.get_order_seller_ids(NEW.id);

  -- Fetch Buyer's name
  SELECT COALESCE(name, 'A buyer')
  INTO v_buyer_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Fire a single grouped notification to all participating merchants
  IF array_length(v_seller_ids, 1) > 0 THEN
    PERFORM public.send_expo_push_notification(
      p_user_ids := v_seller_ids,
      p_title    := 'New Order Received! 🛍️',
      p_body     := v_buyer_name || ' placed an order containing your products. Tap to prepare.',
      p_data     := jsonb_build_object(
        'order_id', NEW.id,
        'type', 'new_order_received'
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[handle_new_order_notify_sellers] Trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
    DECLARE
      extracted_name TEXT;
      extracted_mobile TEXT;
      user_role TEXT;
    BEGIN
      extracted_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'user_name'), ''),
        split_part(NEW.email, '@', 1),
        'User'
      );
    
      extracted_mobile := NULLIF(TRIM(NEW.raw_user_meta_data->>'mobile'), '');
    
      user_role := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'user_type'), ''),
        'customer'
      );
    
      BEGIN
        INSERT INTO public.profiles (
          id, full_name, email, mobile, role, avatar_url, created_at, updated_at
        )
        VALUES (
          NEW.id, extracted_name, NEW.email, extracted_mobile, user_role, NEW.raw_user_meta_data->>'avatar_url', NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE
        SET
          full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
          email = COALESCE(EXCLUDED.email, public.profiles.email),
          mobile = COALESCE(EXCLUDED.mobile, public.profiles.mobile),
          role = COALESCE(EXCLUDED.role, public.profiles.role),
          avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
          updated_at = NOW();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user failed on profiles insert: %', SQLERRM;
      END;

      RETURN NEW;
    END;
    $$;


--
-- Name: handle_order_assignment_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_order_assignment_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_seller_ids UUID[];
  v_is_assigned BOOLEAN := FALSE;
BEGIN
  -- Safe assessment checking whether an insert or update is injecting a courier assignment
  IF TG_OP = 'INSERT' AND NEW.delivery_manager_id IS NOT NULL THEN
    v_is_assigned := TRUE;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.delivery_manager_id IS NULL AND NEW.delivery_manager_id IS NOT NULL)
       OR (OLD.delivery_manager_id IS DISTINCT FROM NEW.delivery_manager_id) THEN
      v_is_assigned := TRUE;
    END IF;
  END IF;

  IF v_is_assigned THEN
    v_seller_ids := public.get_order_seller_ids(NEW.id);

    -- Notify the Buyer
    PERFORM public.send_expo_push_notification(
      p_user_ids := ARRAY[NEW.user_id],
      p_title    := 'Courier Assigned! 🚴‍♂️',
      p_body     := 'A delivery partner has accepted your order and will head over shortly.',
      p_data     := jsonb_build_object('order_id', NEW.id, 'type', 'courier_assigned')
    );

    -- Notify the Sellers
    PERFORM public.send_expo_push_notification(
      p_user_ids := v_seller_ids,
      p_title    := 'Courier En Route 🗺️',
      p_body     := 'A delivery partner has been assigned to collect order #' || split_part(NEW.id::text, '-', 1),
      p_data     := jsonb_build_object('order_id', NEW.id, 'type', 'courier_assigned')
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[handle_order_assignment_notification] Trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;


--
-- Name: handle_order_completed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_order_completed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Check if the status is updated to 'completed' and was not 'completed' before
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Call the new database function to update inventory
    PERFORM public.update_inventory_for_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_order_delivery_assignment_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_order_delivery_assignment_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  dm_push_tokens JSONB;
  order_identifier TEXT;
  buyer_name_var TEXT;
BEGIN
  -- Check if delivery_manager_id is set
  IF NEW.delivery_manager_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.delivery_manager_id IS DISTINCT FROM NEW.delivery_manager_id) THEN
    -- Get push tokens for the assigned delivery manager
    SELECT jsonb_agg(token)
    INTO dm_push_tokens
    FROM public.push_tokens
    WHERE user_id = NEW.delivery_manager_id;

    -- Get order identifier
    order_identifier := COALESCE(NEW.order_number, SUBSTRING(NEW.id::text, 1, 8));

    -- Get buyer name if available
    SELECT p.full_name
    INTO buyer_name_var
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    -- Send push notification if delivery manager has tokens registered
    IF dm_push_tokens IS NOT NULL AND jsonb_array_length(dm_push_tokens) > 0 THEN
      PERFORM net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
        body := jsonb_build_object(
          'to', dm_push_tokens,
          'sound', 'default',
          'title', '🛵 New Delivery Task Assigned!',
          'body', 'Order #' || order_identifier || ' (₹' || NEW.total_amount || ') is assigned to you for delivery to ' || COALESCE(buyer_name_var, 'customer') || '.',
          'data', jsonb_build_object('orderId', NEW.id, 'type', 'delivery_assignment')
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: handle_order_status_and_delivery_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_order_status_and_delivery_notifications() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  buyer_push_tokens JSONB;
  seller_push_tokens JSONB;
  dm_name TEXT;
  dm_phone TEXT;
  order_identifier TEXT;
  seller_user_id UUID;
  title_text TEXT;
  body_text TEXT;
  status_changed BOOLEAN;
  dm_assigned BOOLEAN;
BEGIN
  order_identifier := COALESCE(NEW.order_number, SUBSTRING(NEW.id::text, 1, 8));
  status_changed := (OLD.status IS DISTINCT FROM NEW.status);
  dm_assigned := (OLD.delivery_manager_id IS DISTINCT FROM NEW.delivery_manager_id AND NEW.delivery_manager_id IS NOT NULL);

  IF NOT status_changed AND NOT dm_assigned THEN
    RETURN NEW;
  END IF;

  -- 1. Get Delivery Manager info
  IF NEW.delivery_manager_id IS NOT NULL THEN
    SELECT full_name, mobile INTO dm_name, dm_phone
    FROM public.profiles
    WHERE id = NEW.delivery_manager_id;
  END IF;
  dm_name := COALESCE(dm_name, 'Delivery Partner');

  -- 2. Get Buyer Expo push tokens
  SELECT jsonb_agg(token) INTO buyer_push_tokens
  FROM public.push_tokens
  WHERE user_id = NEW.user_id
    AND (token LIKE 'ExponentPushToken%' OR token LIKE 'ExpoPushToken%');

  -- 3. Get Seller user_id & Expo push tokens
  SELECT p.user_id INTO seller_user_id
  FROM public.order_items oi
  JOIN public.product_variant_combinations pvc ON oi.product_variant_combination_id = pvc.id
  JOIN public.products p ON pvc.product_id = p.id
  WHERE oi.order_id = NEW.id
  LIMIT 1;

  IF seller_user_id IS NOT NULL THEN
    SELECT jsonb_agg(token) INTO seller_push_tokens
    FROM public.push_tokens
    WHERE user_id = seller_user_id
      AND (token LIKE 'ExponentPushToken%' OR token LIKE 'ExpoPushToken%');
  END IF;

  -- CASE 1: Delivery Manager accepts the order
  IF dm_assigned THEN
    IF buyer_push_tokens IS NOT NULL AND jsonb_array_length(buyer_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', buyer_push_tokens,
            'sound', 'default',
            'title', '🛵 Delivery Partner Assigned!',
            'body', dm_name || ' has accepted your order #' || order_identifier || ' and is on the way to pick it up.',
            'data', jsonb_build_object('orderId', NEW.id, 'type', 'delivery_accepted')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed for buyer: %', SQLERRM;
      END;
    END IF;

    IF seller_push_tokens IS NOT NULL AND jsonb_array_length(seller_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', seller_push_tokens,
            'sound', 'default',
            'title', '🛵 Delivery Partner Claimed Order',
            'body', dm_name || ' has accepted order #' || order_identifier || ' for delivery pickup.',
            'data', jsonb_build_object('orderId', NEW.id, 'type', 'delivery_accepted')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed for seller: %', SQLERRM;
      END;
    END IF;
  END IF;

  -- CASE 2: Order Status Changed
  IF status_changed THEN
    IF LOWER(NEW.status) IN ('out for delivery', 'out_for_delivery', 'shipped') THEN
      title_text := '🚚 Order Out for Delivery!';
      body_text := dm_name || ' is on the way with your order #' || order_identifier || '. Track live on the map!';
    ELSIF LOWER(NEW.status) IN ('completed', 'delivered') THEN
      title_text := '✅ Order Delivered!';
      body_text := 'Your order #' || order_identifier || ' has been successfully delivered by ' || dm_name || '.';
    ELSIF LOWER(NEW.status) IN ('cancelled', 'canceled') THEN
      title_text := '❌ Order Cancelled';
      body_text := 'Order #' || order_identifier || ' has been cancelled.';
    ELSIF LOWER(NEW.status) IN ('processing') AND NOT dm_assigned THEN
      title_text := '🍳 Order In Preparation';
      body_text := 'Your order #' || order_identifier || ' is now being prepared.';
    ELSE
      title_text := '📦 Order Status Updated';
      body_text := 'Order #' || order_identifier || ' status updated to ' || NEW.status || '.';
    END IF;

    IF buyer_push_tokens IS NOT NULL AND jsonb_array_length(buyer_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', buyer_push_tokens,
            'sound', 'default',
            'title', title_text,
            'body', body_text,
            'data', jsonb_build_object('orderId', NEW.id, 'status', NEW.status, 'type', 'status_update')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed for buyer: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: handle_order_status_change_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_order_status_change_notifications() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_seller_ids UUID[];
  v_delivery_partner_ids UUID[];
  v_buyer_payload JSONB;
  v_title TEXT;
  v_body TEXT;
BEGIN
  -- Safeguard: Skip logic entirely if updating fields other than status or during a non-transitional state
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_seller_ids := public.get_order_seller_ids(NEW.id);
  v_buyer_payload := jsonb_build_object(
    'order_id', NEW.id,
    'status', NEW.status,
    'type', 'order_status_update'
  );

  -- CASE A: Order status changes to placed (Broadcast to drivers)
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'placed' THEN
    SELECT COALESCE(array_agg(id), '{}')
    INTO v_delivery_partner_ids
    FROM public.profiles
    WHERE role = 'delivery_manager';

    PERFORM public.send_expo_push_notification(
      p_user_ids := v_delivery_partner_ids,
      p_title    := 'Delivery Available 🚚',
      p_body     := 'A new order is ready for pickup. Open your app to claim it!',
      p_data     := v_buyer_payload
    );

  -- CASE B: Preparation Updates (Processing, Preparing, Ready)
  ELSIF NEW.status IN ('processing', 'preparing', 'ready') THEN
    PERFORM public.send_expo_push_notification(
      p_user_ids := ARRAY[NEW.user_id],
      p_title    := 'Order Update 👩‍🍳',
      p_body     := 'Your order status has been updated to: ' || upper(NEW.status) || '. The seller is on it!',
      p_data     := v_buyer_payload
    );

    IF NEW.delivery_manager_id IS NOT NULL THEN
      PERFORM public.send_expo_push_notification(
        p_user_ids := ARRAY[NEW.delivery_manager_id],
        p_title    := 'Assigned Order Update 📍',
        p_body     := 'Order #' || split_part(NEW.id::text, '-', 1) || ' is now ' || upper(NEW.status) || '.',
        p_data     := v_buyer_payload
      );
    END IF;

  -- CASE C: Courier Fulfillment Lifecycle
  ELSIF NEW.status IN ('picked_up', 'out_for_delivery', 'completed', 'delivered') THEN
    IF NEW.status IN ('completed', 'delivered') THEN
      v_title := 'Order Delivered! 🎉';
      v_body := 'Enjoy your purchase! Your order has arrived safely.';
    ELSIF NEW.status = 'picked_up' THEN
      v_title := 'Order Picked Up 📦';
      v_body := 'The courier has picked up your items from the merchant.';
    ELSE
      v_title := 'Order on the Way! 🛵';
      v_body := 'Your order is out for delivery.';
    END IF;

    -- Notify Buyer
    PERFORM public.send_expo_push_notification(
      p_user_ids := ARRAY[NEW.user_id],
      p_title    := v_title,
      p_body     := v_body,
      p_data     := v_buyer_payload
    );

    -- Notify Sellers
    PERFORM public.send_expo_push_notification(
      p_user_ids := v_seller_ids,
      p_title    := 'Delivery Status Update 📈',
      p_body     := 'Order #' || split_part(NEW.id::text, '-', 1) || ' progress: ' || upper(NEW.status),
      p_data     := v_buyer_payload
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[handle_order_status_change_notifications] Trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;


--
-- Name: is_admin_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('admin', 'superadmin', 'appadmin', 'app_admin')
  );
$$;


--
-- Name: notify_bank_tx_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_bank_tx_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  perform http_post(
    'https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/send-notification',
    json_build_object('record', row_to_json(NEW), 'table', 'bank_transactions')::text,
    'application/json'
  );
  return new;
end;
$$;


--
-- Name: notify_customers_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_customers_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  perform http_post(
    'https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/send-notification',
    json_build_object('record', row_to_json(NEW), 'table', 'customers')::text,
    'application/json'
  );
  return new;
end;
$$;


--
-- Name: notify_edge_function(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_edge_function() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  perform net.http_post(
    url := 'https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/send-notification',  -- 🔁 replace with your deployed Edge Function URL
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'record', row_to_json(NEW),
      'table', TG_TABLE_NAME
    )
  );
  return new;
end;
$$;


--
-- Name: notify_order_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_order_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- IMPORTANT: Replace YOUR_SERVICE_ROLE_KEY with your actual Supabase service_role key.
  -- You can find your service_role key in your Supabase project settings under API.
  -- It is recommended to store this key in a secure way, for example, using Supabase secrets.
  PERFORM net.http_post(
    url:='https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/notify-order-update',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:=jsonb_build_object(
      'type', 'ORDER_STATUS_UPDATE',
      'record', row_to_json(NEW),
      'old_record', row_to_json(OLD)
    )
  );
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION notify_order_update(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_order_update() IS 'Calls the notify-order-update edge function when an order status changes.';


--
-- Name: set_order_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_order_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.order_number := public.generate_order_number();
    RETURN NEW;
END;
$$;


--
-- Name: sync_order_seller_id_from_item(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_order_seller_id_from_item() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_seller_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = NEW.order_id AND seller_id IS NULL) THEN
    SELECT COALESCE(p.user_id, c.user_id)
    INTO v_seller_id
    FROM public.product_variant_combinations pvc
    JOIN public.products p ON pvc.product_id = p.id
    LEFT JOIN public.customers c ON p.customer_id = c.id
    WHERE pvc.id = NEW.product_variant_combination_id
    LIMIT 1;

    IF v_seller_id IS NOT NULL THEN
      UPDATE public.orders
      SET seller_id = v_seller_id
      WHERE id = NEW.order_id AND seller_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_notify_new_product_function(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_notify_new_product_function() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Perform a POST request to the Edge Function URL.
  -- The Edge Function will handle fetching tokens and sending notifications.
  -- IMPORTANT: Replace <YOUR_PROJECT_REF> with your Supabase project reference.
  -- IMPORTANT: Use your 'service_role key' for the Authorization bearer token, NOT the anon key.
  PERFORM net.http_post(
    url := 'https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/notify-new-product',
    headers := '{
      "Content-Type": "application/json", 
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0Y3hoaGJpZ21xcm1xZHloemN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjE2MTc4OCwiZXhwIjoyMDY3NzM3Nzg4fQ.5QQYPXs-ME1IH2RFmWCFPhcuYp2K6hE2NNfJeCxcVvw"
    }'::jsonb,
    body := json_build_object('record', NEW)::jsonb
  );
  RETURN NEW;
END;
$$;


--
-- Name: trigger_welcome_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_welcome_notification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  begin
    -- Perform an HTTP request to the Edge Function
    perform net.http_post(
      url := 'https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/send-welcome-notification',
      body := jsonb_build_object('record', new),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception
    when others then
      raise warning 'Failed to call Edge Function for user %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;


--
-- Name: update_area_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_area_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE area_master
    SET current_balance = current_balance + NEW.amount
    WHERE id = NEW.area_id;
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    UPDATE area_master
    SET current_balance = current_balance - OLD.amount + NEW.amount
    WHERE id = NEW.area_id;
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE area_master
    SET current_balance = current_balance - OLD.amount
    WHERE id = OLD.area_id;
    RETURN OLD;
  END IF;
END;
$$;


--
-- Name: update_area_finance_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_area_finance_balances() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    -- Update current_balance
    IF NEW.transaction_type IN ('deposit_own_funds', 'borrow_from_bank', 'customer_loan_repayment') THEN
      UPDATE area_master SET current_balance = current_balance + NEW.amount WHERE id = NEW.area_id;
    ELSIF NEW.transaction_type IN ('withdrawal_own_funds', 'repay_to_bank', 'customer_loan_disbursement') THEN
      UPDATE area_master SET current_balance = current_balance - NEW.amount WHERE id = NEW.area_id;
    END IF;

    -- Update borrowed_funds
    IF NEW.transaction_type = 'borrow_from_bank' THEN
      UPDATE area_master SET borrowed_funds = borrowed_funds + NEW.amount WHERE id = NEW.area_id;
    ELSIF NEW.transaction_type = 'repay_to_bank' THEN
      UPDATE area_master SET borrowed_funds = borrowed_funds - NEW.amount WHERE id = NEW.area_id;
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Revert OLD impact
    IF OLD.transaction_type IN ('deposit_own_funds', 'borrow_from_bank', 'customer_loan_repayment') THEN
      UPDATE area_master SET current_balance = current_balance - OLD.amount WHERE id = OLD.area_id;
    ELSIF OLD.transaction_type IN ('withdrawal_own_funds', 'repay_to_bank', 'customer_loan_disbursement') THEN
      UPDATE area_master SET current_balance = current_balance + OLD.amount WHERE id = OLD.area_id;
    END IF;
    IF OLD.transaction_type = 'borrow_from_bank' THEN
      UPDATE area_master SET borrowed_funds = borrowed_funds - OLD.amount WHERE id = OLD.area_id;
    ELSIF OLD.transaction_type = 'repay_to_bank' THEN
      UPDATE area_master SET borrowed_funds = borrowed_funds + OLD.amount WHERE id = OLD.area_id;
    END IF;

    -- Apply NEW impact
    IF NEW.transaction_type IN ('deposit_own_funds', 'borrow_from_bank', 'customer_loan_repayment') THEN
      UPDATE area_master SET current_balance = current_balance + NEW.amount WHERE id = NEW.area_id;
    ELSIF NEW.transaction_type IN ('withdrawal_own_funds', 'repay_to_bank', 'customer_loan_disbursement') THEN
      UPDATE area_master SET current_balance = current_balance - NEW.amount WHERE id = NEW.area_id;
    END IF;
    IF NEW.transaction_type = 'borrow_from_bank' THEN
      UPDATE area_master SET borrowed_funds = borrowed_funds + NEW.amount WHERE id = NEW.area_id;
    ELSIF NEW.transaction_type = 'repay_to_bank' THEN
      UPDATE area_master SET borrowed_funds = borrowed_funds - NEW.amount WHERE id = NEW.area_id;
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    -- Reverse OLD impact
    IF OLD.transaction_type IN ('deposit_own_funds', 'borrow_from_bank', 'customer_loan_repayment') THEN
      UPDATE area_master SET current_balance = current_balance - OLD.amount WHERE id = OLD.area_id;
    ELSIF OLD.transaction_type IN ('withdrawal_own_funds', 'repay_to_bank', 'customer_loan_disbursement') THEN
      UPDATE area_master SET current_balance = current_balance + OLD.amount WHERE id = OLD.area_id;
    END IF;
    IF OLD.transaction_type = 'borrow_from_bank' THEN
      UPDATE area_master SET borrowed_funds = borrowed_funds - OLD.amount WHERE id = OLD.area_id;
    ELSIF OLD.transaction_type = 'repay_to_bank' THEN
      UPDATE area_master SET borrowed_funds = borrowed_funds + OLD.amount WHERE id = OLD.area_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$;


--
-- Name: update_inventory_for_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_inventory_for_order(p_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    item RECORD;
    current_variant_quantity INT;
    new_quantity INT;
BEGIN
    -- Loop through each item in the order
    FOR item IN
        SELECT product_variant_combination_id, quantity
        FROM public.order_items
        WHERE order_id = p_order_id
    LOOP
        -- Get the current quantity of the product variant
        SELECT quantity INTO current_variant_quantity
        FROM public.product_variant_combinations
        WHERE id = item.product_variant_combination_id;

        -- Calculate the new quantity after deducting the ordered amount
        new_quantity := current_variant_quantity - item.quantity;

        -- Update the product variant's quantity
        UPDATE public.product_variant_combinations
        SET quantity = new_quantity
        WHERE id = item.product_variant_combination_id;

        -- Insert a record into inventory_history for tracking
        INSERT INTO public.inventory_history (
            product_variant_combination_id,
            change_type,
            quantity_change,
            new_quantity,
            order_id
        )
        VALUES (
            item.product_variant_combination_id,
            'sale',
            -item.quantity,
            new_quantity,
            p_order_id
        );
    END LOOP;
END;
$$;


--
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: area_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.area_master (
    id bigint NOT NULL,
    area_name character varying(100) NOT NULL,
    area_type character varying(20) DEFAULT 'city'::character varying,
    pin_code character varying(10),
    state character varying(100),
    country character varying(100) DEFAULT 'India'::character varying,
    latitude double precision,
    longitude double precision,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    description text,
    borrowed_funds numeric DEFAULT 0,
    current_balance numeric DEFAULT 0,
    enable_day boolean DEFAULT false,
    day_of_week character varying(10),
    start_time_filter time without time zone,
    end_time_filter time without time zone
);


--
-- Name: area_master_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.area_master_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: area_master_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.area_master_id_seq OWNED BY public.area_master.id;


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    bank_name text NOT NULL,
    account_number text NOT NULL,
    account_holder_name text,
    branch_name text,
    ifsc_code text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bank_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_transactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    area_id bigint,
    bank_account_id uuid,
    transaction_type text NOT NULL,
    amount numeric NOT NULL,
    transaction_date timestamp with time zone DEFAULT now(),
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cart_id uuid,
    product_variant_combination_id uuid,
    quantity integer NOT NULL
);


--
-- Name: carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(100) NOT NULL,
    icon character varying(100) DEFAULT 'cube'::character varying,
    image_url text,
    description text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    profile_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.conversation_participants ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.conversation_participants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id bigint NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.conversations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: customer_cycles_completed; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_cycles_completed (
    id uuid NOT NULL,
    name text NOT NULL,
    mobile text,
    email text,
    book_no text,
    customer_type text,
    start_date date,
    amount_given numeric,
    repayment_amount numeric,
    end_date date,
    area_id uuid,
    repayment_plan_id uuid,
    days_to_complete integer,
    user_id uuid,
    repayment_frequency text,
    remarks text,
    status text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    latitude numeric,
    longitude numeric,
    archived_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_documents (
    id bigint NOT NULL,
    customer_id bigint,
    file_name character varying(255),
    file_data text,
    uploaded_at timestamp with time zone DEFAULT now(),
    file_type character varying(50),
    user_id uuid
);


--
-- Name: customer_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_documents_id_seq OWNED BY public.customer_documents.id;


--
-- Name: customer_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    status_name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    sequence_id integer
);


--
-- Name: customer_types_sequence_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_types_sequence_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_types_sequence_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_types_sequence_id_seq OWNED BY public.customer_types.sequence_id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id bigint NOT NULL,
    name character varying(100),
    mobile character varying(50),
    email character varying(100),
    book_no character varying(50),
    latitude double precision,
    longitude double precision,
    area_id bigint,
    user_id uuid,
    customer_type character varying(30),
    created_at timestamp with time zone DEFAULT now(),
    repayment_frequency character varying(10),
    repayment_amount numeric(12,2),
    photo_data text,
    advance_amount numeric(12,2),
    amount_given numeric(12,2),
    days_to_complete numeric(12,2),
    late_fee_per_day numeric(12,2),
    remarks text,
    repayment_plan_id bigint,
    start_date date,
    end_date date,
    updated_at timestamp with time zone DEFAULT now(),
    media_url text,
    status text DEFAULT 'Pending'::text NOT NULL,
    db_url text,
    anon_key text,
    service_role_key text,
    landmark text,
    address text,
    CONSTRAINT chk_customer_status CHECK ((status = ANY (ARRAY['Pending'::text, 'Active'::text, 'Inactive'::text, 'Closed'::text, 'Defaulted'::text, 'Suspended'::text])))
);


--
-- Name: COLUMN customers.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.status IS 'The current status of the customer: Pending, Active, Inactive, Closed, Defaulted';


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: damage_report_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.damage_report_files (
    id bigint NOT NULL,
    damage_report_id uuid NOT NULL,
    file_url text NOT NULL,
    file_type character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    file_name text
);


--
-- Name: damage_report_files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.damage_report_files ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.damage_report_files_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: damage_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.damage_reports (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    manager_id uuid NOT NULL,
    area_id bigint,
    customer_id integer,
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    description text,
    reported_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'reported'::text
);


--
-- Name: delivery_manager_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_manager_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    manager_id uuid,
    location extensions.geography(Point,4326),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: delivery_partner_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_partner_locations (
    partner_id uuid NOT NULL,
    order_id uuid,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    heading double precision DEFAULT 0,
    speed double precision DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id bigint NOT NULL,
    content text,
    embedding public.vector(1536)
);


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- Name: group_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_areas (
    group_id bigint NOT NULL,
    area_id bigint NOT NULL
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    area_id bigint,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.groups_id_seq OWNED BY public.groups.id;


--
-- Name: inventory_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_variant_combination_id uuid,
    change_type public.inventory_change_type NOT NULL,
    quantity_change integer NOT NULL,
    new_quantity integer NOT NULL,
    order_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: latest_delivery_manager_locations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.latest_delivery_manager_locations AS
 SELECT DISTINCT ON (manager_id) id,
    manager_id,
    location,
    created_at
   FROM public.delivery_manager_locations
  ORDER BY manager_id, created_at DESC;


--
-- Name: location_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_history (
    id bigint NOT NULL,
    user_id uuid,
    user_email text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    device_name text,
    accuracy double precision,
    "timestamp" timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: location_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.location_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: location_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.location_history_id_seq OWNED BY public.location_history.id;


--
-- Name: message_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_summaries (
    id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    summary text NOT NULL,
    message_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_summaries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.message_summaries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.message_summaries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    sender_id uuid,
    group_id integer,
    text text,
    image_url text,
    sender_email text,
    media_url text,
    media_type text,
    CONSTRAINT text_or_media_check CHECK (((text IS NOT NULL) OR (media_url IS NOT NULL)))
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    product_variant_combination_id uuid,
    quantity integer NOT NULL,
    price numeric(10,2) NOT NULL
);


--
-- Name: order_number_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_number_sequences (
    sequence_date date NOT NULL,
    last_value integer NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    shipping_address jsonb NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    payment_method text,
    delivery_manager_id uuid,
    order_number text,
    order_type text,
    table_no text,
    seller_id uuid
);


--
-- Name: places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.places (
    id bigint NOT NULL,
    name text NOT NULL,
    location extensions.geography(Point,4326) NOT NULL
);


--
-- Name: places_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.places ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.places_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: product_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    media_url text NOT NULL,
    media_type character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: product_variant_combinations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variant_combinations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    combination_string text NOT NULL,
    price numeric(10,2) NOT NULL,
    quantity integer NOT NULL,
    sku text
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    name text NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id bigint,
    product_name character varying(255) NOT NULL,
    amount numeric(10,2) NOT NULL,
    size character varying(50),
    start_date date,
    end_date date,
    is_active boolean DEFAULT true,
    display_order integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    product_type text DEFAULT 'other'::public.product_type_enum,
    unit text,
    user_id uuid,
    visible_from timestamp with time zone,
    visible_to timestamp with time zone,
    category_id uuid,
    subcategory_id uuid,
    subcategory text
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    address_line_1 text,
    address_line_2 text,
    city text,
    state text,
    zip_code text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role text DEFAULT 'buyer'::text NOT NULL,
    mobile text,
    full_name text,
    email text,
    avatar_url text,
    push_token text,
    media_urls jsonb DEFAULT '[]'::jsonb
);


--
-- Name: COLUMN profiles.full_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.full_name IS 'Stores the user''s full name, populated during signup.';


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE push_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.push_tokens IS 'Stores push notification tokens for user devices.';


--
-- Name: COLUMN push_tokens.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_tokens.user_id IS 'The user associated with the token.';


--
-- Name: COLUMN push_tokens.token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_tokens.token IS 'The push notification token from the device.';


--
-- Name: repayment_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repayment_plans (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    frequency character varying(20) NOT NULL,
    periods integer NOT NULL,
    base_amount numeric(12,2) NOT NULL,
    repayment_per_period numeric(12,2) NOT NULL,
    advance_amount numeric(12,2) DEFAULT 0,
    late_fee_per_period numeric(12,2) DEFAULT 0,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: repayment_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.repayment_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: repayment_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.repayment_plans_id_seq OWNED BY public.repayment_plans.id;


--
-- Name: subcategories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcategories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(100) NOT NULL,
    description text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenant_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_credentials (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    supabase_url text NOT NULL,
    supabase_service_role_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenantmasterusers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenantmasterusers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    tenant_id uuid,
    role text DEFAULT 'user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tenant_code text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: transaction_cycles_completed; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_cycles_completed (
    id uuid NOT NULL,
    customer_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric NOT NULL,
    transaction_type text NOT NULL,
    payment_mode text,
    remarks text,
    transaction_date date NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    archived_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id bigint NOT NULL,
    customer_id bigint,
    user_id uuid,
    amount numeric(12,2) NOT NULL,
    transaction_type character varying(20),
    remarks text,
    transaction_date timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    payment_mode character varying(10),
    upi_image text,
    latitude double precision,
    longitude double precision,
    area_id bigint
);


--
-- Name: COLUMN transactions.area_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.area_id IS 'area id while log the trasactions';


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: user_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tag text DEFAULT 'Home'::text,
    recipient_name text NOT NULL,
    mobile text NOT NULL,
    address_line_1 text NOT NULL,
    address_line_2 text,
    city text NOT NULL,
    state text,
    zip_code text,
    country text DEFAULT 'India'::text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_expenses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    amount numeric NOT NULL,
    expense_type text NOT NULL,
    remarks text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    area_id bigint
);


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_groups (
    user_id uuid NOT NULL,
    group_id bigint NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now(),
    is_group_admin boolean DEFAULT false NOT NULL
);


--
-- Name: user_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_push_tokens (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    push_token text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: user_qr_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_qr_codes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    qr_image_url text NOT NULL,
    name text,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
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
    expo_push_token text,
    previous_last_login_at timestamp with time zone,
    tenant_id uuid
);


--
-- Name: variant_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variant_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant_id uuid,
    value text NOT NULL
);


--
-- Name: area_master id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.area_master ALTER COLUMN id SET DEFAULT nextval('public.area_master_id_seq'::regclass);


--
-- Name: customer_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_documents ALTER COLUMN id SET DEFAULT nextval('public.customer_documents_id_seq'::regclass);


--
-- Name: customer_types sequence_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types ALTER COLUMN sequence_id SET DEFAULT nextval('public.customer_types_sequence_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


--
-- Name: groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups ALTER COLUMN id SET DEFAULT nextval('public.groups_id_seq'::regclass);


--
-- Name: location_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_history ALTER COLUMN id SET DEFAULT nextval('public.location_history_id_seq'::regclass);


--
-- Name: repayment_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repayment_plans ALTER COLUMN id SET DEFAULT nextval('public.repayment_plans_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Data for Name: area_master; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.area_master (id, area_name, area_type, pin_code, state, country, latitude, longitude, is_active, created_at, description, borrowed_funds, current_balance, enable_day, day_of_week, start_time_filter, end_time_filter) FROM stdin;
\.


--
-- Data for Name: bank_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_accounts (id, bank_name, account_number, account_holder_name, branch_name, ifsc_code, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: bank_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bank_transactions (id, area_id, bank_account_id, transaction_type, amount, transaction_date, description, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cart_items (id, cart_id, product_variant_combination_id, quantity) FROM stdin;
b6fc7d04-6178-4295-be39-e070a0a7a72e	6f02bfbd-0cd0-41c8-ab4c-8a745acc07fa	4ce07fd5-2a29-4d0c-931a-5ecb2e739a50	2
5d1ac860-f143-4f2c-86a1-779a8ca78883	644bf52b-32cd-48b2-8d8c-d6c773e79c59	fc4f90d8-0683-4b96-a56e-a3d1d308fb3c	1
237bd3c0-18d8-4b9a-b1a2-cb2595e1a070	644bf52b-32cd-48b2-8d8c-d6c773e79c59	73ce1da6-f539-44a3-a29d-cb34ef50a12a	2
321fa88b-a1bb-4a13-a4c9-1d6f936fe392	903df07e-5642-4f07-b997-f64249038575	83bfeb53-5dae-4426-8346-e678449de598	1
\.


--
-- Data for Name: carts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.carts (id, user_id, created_at) FROM stdin;
4e9225e6-9f42-471c-b6b8-3f2950346221	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-06 05:45:48.223295+00
bd8a725f-2f82-4ff1-ba98-e87e861b74d7	e125551d-8f87-42a2-9a42-75fde4d47549	2026-09-06 17:12:23.075773+00
34ed39cf-f051-425d-a457-a45092dff713	40744ecd-86dd-407d-9230-cdd3313ac885	2026-09-06 20:00:34.632483+00
ab452620-206c-4731-82bc-db740374c755	0f4611de-7b02-4212-a1ea-4ea9f3c22620	2026-09-07 08:21:12.180339+00
903df07e-5642-4f07-b997-f64249038575	4525e63d-c188-4cf8-963b-96e6e08b96b9	2026-09-08 12:15:30.878685+00
d9c95c75-877c-46b3-bceb-601baebe9d8b	a4306874-67b7-422c-a616-d2a4bcf31f2c	2026-09-09 01:47:24.951994+00
644bf52b-32cd-48b2-8d8c-d6c773e79c59	38c510c6-7543-4e22-a983-89dae86ced97	2026-09-10 18:30:15.977855+00
839263a9-ddb4-4cd0-8919-5a2389182606	a59dbff8-2dde-4ac3-a2df-e881be9b2a25	2026-09-10 18:42:44.155682+00
f49a339d-cf70-488f-a4b7-42760be60544	131f51a1-df0c-4571-85ab-b1d23817da07	2026-09-12 08:05:47.918506+00
076c2d63-fb02-415b-83b9-989c936716a4	54862933-5dd9-4f58-929b-3fe71d29c733	2026-09-13 05:34:24.888859+00
6f02bfbd-0cd0-41c8-ab4c-8a745acc07fa	bf05ba57-8b0a-4f35-9449-3aad3c81fc59	2026-09-13 06:33:51.195078+00
3f8bf624-b670-4c58-8f9d-3dbfe137da37	303c99b8-f76d-4c55-a23b-38c86c9bee99	2026-09-13 12:44:38.326891+00
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, code, icon, image_url, description, display_order, is_active, created_at, updated_at) FROM stdin;
905ed5f2-e171-4cfd-8e91-2b603d66b347	Grocery & Essentials	grocery	shopping-basket	\N	Grocery & Essentials	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:33.348853+00
e7c11baa-ccbe-4238-85f2-57d140855dfb	Fruits & Vegetables	fruits_vegetables	lemon-o	\N	Fruits & Vegetables	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:34.689456+00
651eadca-6210-4596-85f8-c9cf3e012e44	Dairy & Bakery	dairy_bakery	birthday-cake	\N	Dairy & Bakery	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:35.736254+00
49e1bd86-2793-4ff2-90b4-7dbcc1f6bfa1	Snacks & Beverages	snacks_beverages	coffee	\N	Snacks & Beverages	4	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:39.857077+00
3f301f9c-ead4-438a-b20d-4a5ffaf029e0	Clothing & Fashion	clothing	tag	\N	Clothing & Fashion	5	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:41.205061+00
8b3df926-46a4-4c43-bac0-3749b587d8bb	Electronics & Gadgets	electronics	laptop	\N	Electronics & Gadgets	6	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:42.000769+00
7ec6b457-1198-45bf-840b-db56de25702b	Beauty & Personal Care	beauty_personal_care	heart	\N	Beauty & Personal Care	7	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:44.008596+00
cee0e19d-92d0-4fb7-ae86-e3754d182469	Home & Kitchen	home_kitchen	home	\N	Home & Kitchen	8	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:44.95063+00
7a8a92f4-615a-44c8-b827-07c524600629	Pharmacy & Health	pharmacy	medkit	\N	Pharmacy & Health	9	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:45.742413+00
ac1cb2b5-ed03-43ad-865c-76d77bf48830	Other / General	other	cube	\N	Other / General	10	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:46.704812+00
26b78285-d0ba-4145-966c-11be3861debc	Gold ornamets	goldnarsing	gift	\N	Gold ornaments	1	t	2026-09-08 17:42:31.516626+00	2026-09-08 17:42:31.516626+00
\.


--
-- Data for Name: conversation_participants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversation_participants (id, conversation_id, profile_id, created_at) FROM stdin;
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversations (id, title, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: customer_cycles_completed; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_cycles_completed (id, name, mobile, email, book_no, customer_type, start_date, amount_given, repayment_amount, end_date, area_id, repayment_plan_id, days_to_complete, user_id, repayment_frequency, remarks, status, created_at, updated_at, latitude, longitude, archived_at) FROM stdin;
\.


--
-- Data for Name: customer_documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_documents (id, customer_id, file_name, file_data, uploaded_at, file_type, user_id) FROM stdin;
\.


--
-- Data for Name: customer_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_types (id, status_name, description, created_at, updated_at, sequence_id) FROM stdin;
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (id, name, mobile, email, book_no, latitude, longitude, area_id, user_id, customer_type, created_at, repayment_frequency, repayment_amount, photo_data, advance_amount, amount_given, days_to_complete, late_fee_per_day, remarks, repayment_plan_id, start_date, end_date, updated_at, media_url, status, db_url, anon_key, service_role_key, landmark, address) FROM stdin;
\.


--
-- Data for Name: damage_report_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.damage_report_files (id, damage_report_id, file_url, file_type, created_at, file_name) FROM stdin;
1	6f166359-695a-46e7-a453-05c1ac311e3a	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/damage_reports/eb102ef0-3893-4d27-a312-735f9b2967ef.jpg	image/jpeg	2026-09-06 20:41:23.817351+00	1000364844.jpg
2	d58a327d-22a3-4286-97a5-9be80005d876	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/damage_reports/2bc7a86d-2312-487f-bb68-a1a6f14f64b0.jpg	image/png	2026-09-08 12:34:48.210729+00	1000365469.png
\.


--
-- Data for Name: damage_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.damage_reports (id, manager_id, area_id, customer_id, latitude, longitude, description, reported_at, status) FROM stdin;
6f166359-695a-46e7-a453-05c1ac311e3a	40744ecd-86dd-407d-9230-cdd3313ac885	\N	\N	17.3947904	78.3754286	Sarries damaged	2026-09-06 20:41:21.92293+00	reported
d58a327d-22a3-4286-97a5-9be80005d876	0f4611de-7b02-4212-a1ea-4ea9f3c22620	\N	\N	17.5182607	78.3964075	Trf	2026-09-08 12:34:45.334675+00	reported
\.


--
-- Data for Name: delivery_manager_locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delivery_manager_locations (id, manager_id, location, created_at) FROM stdin;
0286bd11-4f12-4388-aedb-c0a818f5a1fa	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E610000067CF0AB11F985340BA7768B345653140	2026-09-06 10:12:08.531182+00
44c81e16-96eb-4de1-9270-6f2419fe605a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003374475A8597534032607FC811633140	2026-09-09 02:33:41.209847+00
5a367e12-3b8a-43ef-ac01-9c19c316c4d6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AA036A7B859753406E4A1EF411633140	2026-09-09 02:33:43.217389+00
6e200ed5-4ee3-4fdd-ae16-c9e5f7b668e0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009E9D674785975340C881B28410633140	2026-09-09 02:33:44.202462+00
e7ee57c8-440b-4e0d-9d92-cd55b8e7881f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B6C82C3185975340FE9AAC510F633140	2026-09-09 02:33:46.225629+00
4e49ab69-f680-4094-a549-6e5fd2bcc81d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000080289831859753400BD9D4D40D633140	2026-09-09 02:34:04.227965+00
4b8386f3-142d-4131-908d-c59a1ab1ad27	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000051D20D5E85975340CF02A3810E633140	2026-09-09 02:34:06.205022+00
a2d9da55-c87b-4f2e-a284-b49d50fc1eb2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000015A0B7C2859753402656A1DC11633140	2026-09-09 02:34:17.201436+00
d3da7e27-93b6-4041-a27f-617c1cc4063f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000015CEC9E68597534068FD778E12633140	2026-09-09 02:34:19.257621+00
c8e67dad-fd50-4ec9-a5e1-e0cb4661c2ea	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000968C7B285975340279E584C11633140	2026-09-09 02:34:21.236767+00
2b3d6414-31f8-4f13-ab5f-f7aaf2915039	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000093AB58E85975340DA345B1E10633140	2026-09-09 02:34:23.205046+00
d7f0b19b-d4d4-4ac2-89f2-d6f6efff312c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000092EFADA3859753402185FC7D10633140	2026-09-09 02:34:25.228666+00
56b7e593-f467-4e95-8c67-9fb38581842b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000015B7C0D485975340DFA9DB3411633140	2026-09-09 02:34:27.204794+00
c1a13905-2713-45ef-be4c-c0ae5d73d1a4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BBF8911186975340629C645012633140	2026-09-09 02:34:29.235985+00
a16512c0-4cb4-4432-971f-910165025f3e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002DCB7CAC85975340B0B5AD1C10633140	2026-09-09 02:34:30.206577+00
abcab2ef-69f5-4074-8e1d-c0f5f2b89fcb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004A2943B08597534069C1300510633140	2026-09-09 02:34:31.201406+00
ef0e9e8c-e69f-4298-80bf-48f42b310ab2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000066CF0AB11F985340B97768B345653140	2026-09-13 10:23:36.409136+00
a986b4cf-7393-482c-b9ea-77aa95c2be0a	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E610000067CF0AB11F985340BA7768B345653140	2026-09-06 10:12:08.411333+00
a97b85ad-ab6e-4589-9157-cecc305ec6a0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D46B0E6B859753407A54FCDF11633140	2026-09-09 02:33:42.211708+00
5d137536-9241-497f-9f15-f27536b5c97d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005C21078085975340C14879F711633140	2026-09-09 02:33:43.510513+00
d7ff2710-4423-455d-a4a0-2fd06486f9ef	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005DC5E2378597534028767E9B0F633140	2026-09-09 02:33:45.230363+00
3ed5a0bf-0e67-4faa-9ea7-c597a2567bba	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008C60884185975340880E266A0E633140	2026-09-09 02:34:03.219225+00
8522c8eb-4ec6-4f26-a03e-f6b3973976fc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000098816F3F85975340CF4A5AF10D633140	2026-09-09 02:34:05.232635+00
587ad173-5842-4140-9a9a-17d126fdfa94	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003FDA498E85975340938895760F633140	2026-09-09 02:34:07.20328+00
ab3ded31-77e0-497c-a489-fade8e5d17c0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003F366ED6859753404427953A12633140	2026-09-09 02:34:18.224077+00
3da4a3d7-e5ac-4c1d-a912-e07859acd8a6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000044696FF085975340C15CE6CF12633140	2026-09-09 02:34:20.233996+00
ef5770d6-9ef4-4416-8d2e-b4aa50ba63c7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F56AD9685975340E69A5D5210633140	2026-09-09 02:34:22.231812+00
8811827b-7fa3-4b4f-8170-bdf359f0ddae	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B0366B95859753409EA6E03A10633140	2026-09-09 02:34:24.209162+00
d573e142-5f64-4adc-86e2-32ae371c275f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000363D8BC8597534098593AD510633140	2026-09-09 02:34:26.211304+00
f750f530-3d82-4543-964f-0c50aecd0b90	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008025FCF78597534032607FC811633140	2026-09-09 02:34:28.219663+00
f527ed68-dddd-4c96-9725-fc76b8d5f7b9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009822AFBD85975340B616C15A10633140	2026-09-09 02:34:32.240308+00
2cfc8c63-8670-4af1-af3f-a653e3a0963c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000066CF0AB11F985340B97768B345653140	2026-09-13 10:50:53.576518+00
1ff885dd-5a60-418d-8e7c-dbd3e4441157	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E6100000CB4F1BC91D985340DA82510340653140	2026-09-06 10:14:22.053325+00
e7926f8f-485b-4140-9a7f-84a3e77dfdb0	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E610000068D9FB2E1E98534096A5563341653140	2026-09-06 10:14:52.078481+00
2d5b4cc8-1d91-4e5d-863c-680f1448c50f	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E610000013D8015518985340D381DE0433653140	2026-09-06 10:15:29.387291+00
0df5d1e0-3565-4123-903b-7a3c3d22ab3a	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E61000006B0A39C11C985340D8129B3034653140	2026-09-06 11:58:56.96357+00
fa6dad0c-b6e8-4583-af47-e4e3875bf038	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E6100000A02993D219985340A5DE62142E653140	2026-09-06 12:57:31.029595+00
6be201ee-fdec-4dda-ad2e-06902102fae6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BAD1AFAD169853409D18E9721F653140	2026-09-06 13:23:33.827328+00
b080b06d-9757-4b35-854f-15e53f3e9f6c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E2DC2A0B19985340833DD7F829653140	2026-09-06 13:24:09.486839+00
fbd5a4a8-7139-4eba-bebd-bd99949f10a4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E2DC2A0B19985340833DD7F829653140	2026-09-06 13:24:09.516876+00
e67956af-a545-4d32-9b14-2af629d476f5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FD4F8E331A98534012DC15CD2E653140	2026-09-06 13:24:41.213605+00
40405c56-67d3-47f7-8cd5-75892710c17e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FD4F8E331A98534012DC15CD2E653140	2026-09-06 13:24:41.213882+00
905c5c40-6b17-463c-9425-a2c7e8084e8e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FD4F8E331A98534012DC15CD2E653140	2026-09-06 13:25:25.244852+00
99188e27-3f1c-4b9c-9e46-765fe82bda77	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CD77F0130798534004B4082010653140	2026-09-06 19:30:17.851667+00
e9337638-10ed-44a0-a172-bc351ae98e9a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EBBEAD05079853406EDA8CD310653140	2026-09-06 19:30:26.898123+00
c7150013-c6c9-48c3-8275-c313ac0c14eb	84359302-3168-4193-95d9-3a8655e8339a	0101000020E61000008E88731E5F9953407FA4880CAB843140	2026-09-08 12:20:55.453049+00
46b4e40a-0ade-4f50-a49b-629fbb950d1f	84359302-3168-4193-95d9-3a8655e8339a	0101000020E61000003B45FDE45E995340798B2C3EAA843140	2026-09-08 12:21:04.522248+00
9a9f2d3c-a8af-4a19-9c07-6312764d9a13	84359302-3168-4193-95d9-3a8655e8339a	0101000020E6100000ACA11EEC5E995340786B4F7FAC843140	2026-09-08 12:23:39.215306+00
08e3d40b-84ca-4ec0-9b00-4565ccde6699	84359302-3168-4193-95d9-3a8655e8339a	0101000020E6100000588CBAD65E9953405405FE4BAD843140	2026-09-08 12:26:03.777108+00
f174f3fe-3bcc-477f-871f-f3fff16c93cf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CCFE8A4608985340D39FFD4811653140	2026-09-08 16:10:27.715673+00
6f8c2c26-9df8-4a15-a7d8-4bf5b1674458	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007976F9D607985340D630E82917653140	2026-09-09 01:56:10.995877+00
b1fe747c-02ea-4e65-9a90-f4811f50294f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007FF1B160079853400525164218653140	2026-09-09 01:56:13.277345+00
cbb8b465-c185-4cad-9f62-014613e7e45c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000085F6A05607985340F25190E91A653140	2026-09-09 01:56:13.523244+00
5e25401c-92e6-48f9-a27a-1fdf92cbe63f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EAECBF2907985340729FC14B15653140	2026-09-09 01:56:15.257233+00
4deddd37-a6a3-4318-8a43-84fe48d5f37a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004F9B278D0798534072B32E2416653140	2026-09-09 01:56:16.332362+00
f09b5e54-a58e-4737-8e31-5a89bbb4edc1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AFA3607C07985340EF78EE9815653140	2026-09-09 01:56:17.181598+00
72afe617-5337-4bbb-b28c-63d0e0df39fc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001A129C9F0798534084AE8E2D15653140	2026-09-09 01:56:18.171324+00
42798cb9-78a3-4300-982a-b745e2e437b2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B53286DE079853406090F46915653140	2026-09-09 01:56:19.216433+00
d34475da-6ab2-4005-8874-9b6bab169aec	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006D2700B5079853402A638DC415653140	2026-09-09 01:56:19.812386+00
4982e446-11e6-442f-a393-6ac897b8a807	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002C6684B70798534001E4DFC215653140	2026-09-09 01:56:20.167218+00
e1ead0c1-0d1c-483f-b92c-37ed779fdea0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F6C5EFB707985340ADE584BF15653140	2026-09-09 01:56:21.178465+00
1a0887ad-68d7-4f69-a74c-72d487764599	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C1255BB8079853405AE729BC15653140	2026-09-09 01:56:22.172687+00
1842bf68-a543-4dc9-9f57-943109bbc0f7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000020459DB90798534001E4DFC215653140	2026-09-09 01:56:23.203445+00
847100ef-1a02-4b63-9385-3e2dfc7e84de	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D2623ABE07985340D15F43CB15653140	2026-09-09 01:56:24.21695+00
bbcb8644-089f-4911-b948-cbf5292cf20c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000803CFBD07985340FBDEF0CC15653140	2026-09-09 01:56:25.24293+00
bd3fa2e8-4627-4750-8102-97c965c8e85e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007343F8BC07985340245E9ECE15653140	2026-09-09 01:56:26.211719+00
0d0cf113-922a-4733-a4dc-8b5d1459fb67	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A9E38CBC079853404EDD4BD015653140	2026-09-09 01:56:27.230547+00
2e962373-7bac-4591-a21f-2bdbf878d99d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DE8321BC079853404EDD4BD015653140	2026-09-09 01:56:28.205121+00
314c9fa1-ccfe-4aa1-9c3c-07ae261e05a5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DE8321BC079853404EDD4BD015653140	2026-09-09 01:56:29.211246+00
319a59ea-536a-44c8-a2c8-427b60708534	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001A29A5B107985340DDC545FF15653140	2026-09-09 01:56:30.251566+00
ad3e53c9-a29a-4d7d-94a5-cc17af187372	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000044A852B30798534030C4A00216653140	2026-09-09 01:56:31.255903+00
427c3aeb-6abe-47c3-86f7-6e151d762a9c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000044A852B307985340DDC545FF15653140	2026-09-09 01:56:32.221539+00
442f6ca9-1f7d-43fc-b286-ea60a2a7b0b5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000044A852B307985340DDC545FF15653140	2026-09-09 01:56:33.212233+00
ef96e027-4da1-4f5b-9bc4-4a436a00e5e7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000044A852B307985340B34698FD15653140	2026-09-09 01:56:34.21187+00
02eee995-1fb5-4703-84b0-c8f32988e08c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007948E7B2079853408AC7EAFB15653140	2026-09-09 01:56:35.218243+00
d36a8969-65bf-4093-b04e-51983d730236	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007948E7B20798534036C98FF815653140	2026-09-09 01:56:36.19156+00
93b97232-f83e-4794-9a23-50ffadee0ada	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AFE87BB20798534036C98FF815653140	2026-09-09 01:56:37.218649+00
9004e229-8602-44a4-a02e-51dd6a0e3351	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E48810B207985340E3CA34F515653140	2026-09-09 01:56:38.221466+00
96d32373-5499-4186-b291-9d2674aa33c9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000803CFBD079853406605758016653140	2026-09-09 01:56:39.203234+00
ac6a40a4-583f-43d4-8049-5963ea6db58f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003EA363BD07985340E9876C7B16653140	2026-09-09 01:56:40.247056+00
30890c15-f879-4fdb-98e6-dbf2fc6dda9e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A9E38CBC079853409589117816653140	2026-09-09 01:56:41.232513+00
3e613751-3d0b-45d2-8a3f-5081d2d6761e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DE8321BC07985340180C097316653140	2026-09-09 01:56:42.194673+00
b1ae3092-dc64-46cd-ae6a-f73d28cdfd91	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000049C44ABB07985340720F536C16653140	2026-09-09 01:56:43.33239+00
0aca68b4-ed43-4f5f-8490-a40951dbc270	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000049C44ABB07985340F5914A6716653140	2026-09-09 01:56:44.246637+00
0d8cb58d-37f6-4539-a7af-e9de1089499c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B50474BA079853402416E75E16653140	2026-09-09 01:56:45.234086+00
b977efdf-429f-4fef-8c93-57d1a5f66705	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EAA408BA079853402A1BD65416653140	2026-09-09 01:56:46.232901+00
2852595c-7a4e-4956-a4f2-1f3cf8be198c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000055E531B9079853405A9F724C16653140	2026-09-09 01:56:47.232794+00
01c083bb-e7d4-42d4-bad9-7c5d0d72a6c1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D8953BD80798534083328D2617653140	2026-09-09 01:56:47.591442+00
45b5ba3e-b37c-4c05-8734-686983ec3a34	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D8953BD807985340B9BB181417653140	2026-09-09 01:56:48.193846+00
b59cb94d-fbbd-4ac9-96ed-105d7eff551e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004FBD2484FD9753401B5135D5EE643140	2026-09-09 01:57:55.821897+00
adb5a84e-b95a-474c-849e-5ce1af6b136a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000D10165FFE97534028E08DBBF7643140	2026-09-09 01:57:57.260778+00
79a538b3-05fe-41ac-a918-e0d3710a36b2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CB06E3F1FE975340BB1D2B42FB643140	2026-09-09 01:57:58.270845+00
571c684f-4678-4b90-982b-666986dbd9ca	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000901C44C6FE975340ED3DA6FFF6643140	2026-09-09 01:57:59.232221+00
e6218d70-4df4-4b38-97df-d92f066eef45	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000072BE7DC2FE975340F94784EBF6643140	2026-09-09 01:58:00.255053+00
a650ed37-bb9f-4342-87eb-46324faaa9bf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000669D96C4FE975340524BCEE4F6643140	2026-09-09 01:58:01.284522+00
e4475776-51cc-4707-bb79-5073fa4e6957	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000669D96C4FE975340524BCEE4F6643140	2026-09-09 01:58:02.231242+00
d22190fa-3ec9-47d5-b739-26a0c9996f24	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000669D96C4FE975340524BCEE4F6643140	2026-09-09 01:58:03.240422+00
dc5392c8-0a18-4bd6-8466-9cac2cc6a590	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000077E54C3FE975340F94784EBF6643140	2026-09-09 01:58:04.177117+00
03dd436f-59f8-4470-a199-dfd86531c122	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000077E54C3FE9753405850BDDAF6643140	2026-09-09 01:58:05.190813+00
664cc711-4b93-4315-96af-e1eedcf34065	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000077E54C3FE9753405850BDDAF6643140	2026-09-09 01:58:05.525138+00
2e22f82e-013c-408e-a3be-17b81a5a9342	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B96DDFA3FE975340A691E057F6643140	2026-09-09 01:58:06.24229+00
aa641d9f-d383-4e5d-bdee-d93a823c6600	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004E2DB6A4FE975340CF108E59F6643140	2026-09-09 01:58:07.238372+00
f7b4998f-9667-4047-be6e-6028524fed71	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AD4CF8A5FE9753404C8E965EF6643140	2026-09-09 01:58:08.243387+00
6128619b-b600-48f1-8c7d-b98beab21018	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000420CCFA6FE975340A08CF161F6643140	2026-09-09 01:58:09.210588+00
301d9f1a-3c2a-4198-a657-559033b85ecf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A12B11A8FE975340F38A4C65F6643140	2026-09-09 01:58:10.25159+00
96ec38a7-fd1c-43e9-8847-547ca4063dfe	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000036EBE7A8FE9753404689A768F6643140	2026-09-09 01:58:11.24934+00
8f72e052-b5c4-4d25-901c-89cfc323689d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CBAABEA9FE9753407008556AF6643140	2026-09-09 01:58:12.24008+00
32cddc98-d5c3-4b9d-b0e6-8eabcd6922eb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000606A95AAFE975340C306B06DF6643140	2026-09-09 01:58:13.256338+00
9a0a2a3d-0d4e-40b8-beda-9c75b6eb5f5f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BF89D7ABFE9753404084B872F6643140	2026-09-09 01:58:14.225837+00
38f3f4f0-8da6-45bb-a7c2-da3b9477f159	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F5296CABFE9753404084B872F6643140	2026-09-09 01:58:14.97446+00
6af50a35-ce09-44bc-a267-566bf1387e6f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000072906B9EFE9753409A2BDE23F6643140	2026-09-09 01:58:15.18934+00
e433064d-17ee-440a-82f2-7849ea0f3514	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D1AFAD9FFE97534017A9E628F6643140	2026-09-09 01:58:16.29847+00
fd0f7da3-5757-4947-8dce-fca9d313f754	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000090EE31A2FE9753404128942AF6643140	2026-09-09 01:58:17.215624+00
e0bfadd0-279b-453f-89c9-98157b28ca12	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004E2DB6A4FE975340E7244A31F6643140	2026-09-09 01:58:18.21886+00
bb7470b1-040c-479d-9e3f-7bb555785f34	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000420CCFA6FE97534064A25236F6643140	2026-09-09 01:58:19.226223+00
f9230b8a-08a2-4f8f-ad63-f67ef2b4169a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006C8B7CA8FE9753400B9F083DF6643140	2026-09-09 01:58:20.23626+00
03205423-a4fa-473b-9006-f19058bcc757	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002ACA00ABFE975340B29BBE43F6643140	2026-09-09 01:58:21.230034+00
0e8f1529-cd68-4add-8b45-364aa93b998d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009B5434D6FE975340FF942A51F6643140	2026-09-09 01:58:35.206916+00
77be8850-56e0-40c1-846f-81b216cd3738	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005A93B8D8FE975340D5157D4FF6643140	2026-09-09 01:58:36.219237+00
cfb4f0bc-8afa-4676-af6f-cde2b450f56a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E331A8DBFE975340D5157D4FF6643140	2026-09-09 01:58:37.220655+00
f7360eca-e4ff-40bc-adf9-84c464c07910	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006CD097DEFE975340D5157D4FF6643140	2026-09-09 01:58:38.225663+00
e6a5e254-04d4-4643-9f55-3f5d0f4ab7b3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000363003DFFE975340AC96CF4DF6643140	2026-09-09 01:58:38.8543+00
7aa31963-88ab-46f2-b153-0597fe56a338	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008A2E5EE2FE975340FF942A51F6643140	2026-09-09 01:58:39.214207+00
87211c52-3aef-4bea-8e4c-221f5612fa08	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A78C24E6FE9753402914D852F6643140	2026-09-09 01:58:40.217083+00
091be678-d62f-462b-9452-3e45464ed2eb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C5EAEAE9FE97534052938554F6643140	2026-09-09 01:58:41.226238+00
142d9681-2614-43b1-acf3-4511f52d5579	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E348B1EDFE9753407C123356F6643140	2026-09-09 01:58:42.220144+00
802e67d8-c0ec-48ab-b242-155b546b50d1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000060819EBCFE975340EE71F096F5643140	2026-09-09 01:58:43.188245+00
ad7b0801-a2b7-4efe-95a0-44593c189c21	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EF3B86C7FE97534035666DAEF5643140	2026-09-09 01:58:44.210655+00
d6b5271c-15ad-40c7-a775-e79c18f647ff	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A75E12C2FE9753408FB16E17F5643140	2026-09-09 01:58:53.221906+00
97937a33-0492-4465-87a6-fbba9f5467bf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000084FB5CC8FE975340B22B2D23F5643140	2026-09-09 01:58:54.209247+00
96c71ce4-da68-498d-86f5-ae5f52f5ab06	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000017965CDFE97534083A7902BF5643140	2026-09-09 01:58:55.224471+00
a11c38b2-a3ac-4704-a3d3-45dae31b44fd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000012B644D3FE9753407DA2A135F5643140	2026-09-09 01:58:56.245824+00
7abff611-0572-4a59-a8ae-147f29b402cd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008F334DD8FE975340779DB23FF5643140	2026-09-09 01:58:57.205435+00
f8cc4aa6-fd51-41bc-8347-6163be7366cc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000078F17EDCFE97534047191648F5643140	2026-09-09 01:58:58.24043+00
17f765f1-7c04-42e1-8b53-91b65f24e402	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002A0F1CE1FE97534041142752F5643140	2026-09-09 01:58:59.216314+00
08e31eb4-044b-4337-95c4-845f7e3c639c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A78C24E6FE9753403B0F385CF5643140	2026-09-09 01:59:00.220331+00
d0688355-5636-42c5-9939-c34da8e9fdf9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005AAAC1EAFE9753400B8B9B64F5643140	2026-09-09 01:59:01.17891+00
9324b188-1447-4be7-8725-e9d22384c9b6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D1F4C8D5FE975340062A8826F5643140	2026-09-09 01:59:01.808627+00
506bdb6e-0786-4033-99fd-bc52783caf6d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004E72D1DAFE97534029A44632F5643140	2026-09-09 01:59:02.247269+00
1fbe2c10-28fc-4f7f-85cd-40f73658aa1c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000060AFB0E0FE9753404D1E053EF5643140	2026-09-09 01:59:03.217464+00
83c0b582-077d-448d-a5ae-66a6d2c75590	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D10BD2E7FE975340C4961E4DF5643140	2026-09-09 01:59:04.222582+00
d49237a2-ed66-4a3c-af32-8e0416bc6280	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004268F3EEFE9753403B0F385CF5643140	2026-09-09 01:59:05.214878+00
62bb66f5-b97e-46af-a4bc-9ea114b264c7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A7A32DF8FE9753405F89F667F5643140	2026-09-09 01:59:06.216099+00
55fb486b-da1a-466e-9c71-86e5fab1ffee	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000CDF6701FF97534059840772F5643140	2026-09-09 01:59:07.209454+00
59d47187-8bdd-4262-957b-26a4fbd72001	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A7BA360AFF975340FF80BD78F5643140	2026-09-09 01:59:08.209214+00
396a5bd6-0de5-4feb-aca1-9ce5336fe56a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000078369A12FF975340D0FC2081F5643140	2026-09-09 01:59:09.225672+00
eab9f727-5932-4ceb-8fde-0600c616554b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B3F2261AFF975340A0788489F5643140	2026-09-09 01:59:10.212772+00
08ab661f-44f9-4a27-b430-4a80f8bd70bf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000ADBF2500FF975340350A4966F5643140	2026-09-09 01:59:10.89061+00
d642322a-b176-4bff-89cc-ba1115ac805d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001E1C4707FF9753400586AC6EF5643140	2026-09-09 01:59:11.205035+00
47d5f5cb-a976-4ea1-b8a6-eeab446ae776	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003059260DFF975340AC826275F5643140	2026-09-09 01:59:12.21086+00
640f8a19-fd7e-47c4-a15a-17cb1751ee96	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000042960513FF975340537F187CF5643140	2026-09-09 01:59:13.215307+00
62dc2579-f93b-4bc3-8a44-0e52b3ddfa4e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E992BB19FF97534076F9D687F5643140	2026-09-09 01:59:14.214857+00
85962cd3-15e8-4943-a403-9428876df133	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006610C41EFF9753401DF68C8EF5643140	2026-09-09 01:59:15.236292+00
945882b0-9396-4c36-b201-36c051d4359a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000042AD0E25FF975340C4F24295F5643140	2026-09-09 01:59:16.22367+00
cdafd340-7c5c-4785-9164-8328cf4c1c61	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001E4A592BFF975340946EA69DF5643140	2026-09-09 01:59:17.219154+00
31202422-0910-49fd-9a03-b9b79e84c307	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000030873831FF9753403B6B5CA4F5643140	2026-09-09 01:59:18.214968+00
44a5211b-fe29-4bc1-9964-b9a80c31a31b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000018456A35FF9753400BE7BFACF5643140	2026-09-09 01:59:19.212207+00
61563390-e2b9-46e2-9442-afc2d043fbfb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007764AC36FF9753400BE7BFACF5643140	2026-09-09 01:59:20.147215+00
a3f1182e-5144-4360-ba20-5f56b5d403e8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000898A822AFF975340F376DF8CF5643140	2026-09-09 01:59:21.23559+00
16cee0a9-3622-4d27-a663-f7dedaa8213d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000006088B2FFF975340CAF7318BF5643140	2026-09-09 01:59:22.217746+00
99725f5d-6658-4a74-80e6-87e7e8c1846f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004EE5FE34FF97534023FB7B84F5643140	2026-09-09 01:59:23.210252+00
df83eb2b-f994-4732-b8d1-166d0f990d4b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000000039C39FF97534029006B7AF5643140	2026-09-09 01:59:24.190932+00
aa73fac9-ab57-41ba-9f1a-cd5a6c703f4b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BF41203CFF975340AC826275F5643140	2026-09-09 01:59:25.210368+00
ce55ed10-0ba7-4767-910d-1be7acdd180e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B320393EFF9753400586AC6EF5643140	2026-09-09 01:59:26.216699+00
9779258f-7914-4d01-a27d-3e693926eedb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DD9FE63FFF975340E20BEE62F5643140	2026-09-09 01:59:27.221872+00
74758615-59e9-40e8-a901-02d4a5adfb66	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D17EFF41FF9753408E0D935FF5643140	2026-09-09 01:59:28.220926+00
1a981f1c-99fa-41a5-8189-03229ee63edb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FAFDAC43FF975340E810DD58F5643140	2026-09-09 01:59:29.254679+00
44c8b706-3b66-4f50-b438-89fa97e0d86b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007231AB1CFF975340D0FC2081F5643140	2026-09-09 01:59:30.236225+00
1f4835f9-147d-4239-8750-b866034eba5a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003C91161DFF975340D0FC2081F5643140	2026-09-09 01:59:30.604082+00
5bdfbe63-a7e1-499b-925b-ba47c834d7b4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006610C41EFF97534059840772F5643140	2026-09-09 01:59:31.216422+00
0a5f5250-dae7-4cf6-a11d-79d955a26f4d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005AEFDC20FF9753403B0F385CF5643140	2026-09-09 01:59:32.209889+00
35fba9e2-3fa2-4bd2-83a2-f2433e06c716	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000244F4821FF975340E810DD58F5643140	2026-09-09 01:59:32.994149+00
18b1c20a-923c-437b-ba3f-759848e81eca	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000009C78734859753407513C6600F633140	2026-09-09 02:33:47.214081+00
084efc1f-f289-4bbc-80ef-aeec35d56dc0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000803FA1438597534004FCBF8F0F633140	2026-09-09 02:33:48.235377+00
610d5c8d-8fa3-493c-b072-d0acc8bf2c2b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CE661F7585975340DA907F6610633140	2026-09-09 02:33:50.23002+00
88b5d1f7-df6a-4a52-adc6-fc451d8e22fe	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000092EFADA3859753400F2E782C11633140	2026-09-09 02:33:52.232522+00
cb57423e-9869-4cd9-a0c0-fb31fedf71f0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BC404981859753406F7E688B10633140	2026-09-09 02:33:53.254304+00
8057090b-0d91-421e-ae98-f324ffe2f63b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000021657A78859753400F1A0B5410633140	2026-09-09 02:33:55.213843+00
cccd1f65-bde0-4b01-a999-d37b48dddb5e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086B7BD9385975340F1B8A81611633140	2026-09-09 02:33:57.258305+00
eb6089fe-9077-462c-9176-37db41161b26	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F125F9B6859753402656A1DC11633140	2026-09-09 02:33:59.208469+00
3f796da5-3e4c-478b-8c95-6cf8b4eb498c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EB4E1CE585975340CD66C4BB12633140	2026-09-09 02:34:01.232597+00
06c78571-54ca-4a43-b275-ab153a964f05	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F3FA484859753404BA8853710633140	2026-09-09 02:34:02.211948+00
e4d23022-717d-4a57-aa62-4f06d33b57c1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F125F9B6859753405D6F9BA910633140	2026-09-09 02:34:08.234166+00
8c9081e8-57c6-4dd2-b2f1-f9570aeea8a3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000015E5D2F885975340A9482AF812633140	2026-09-09 02:34:10.281171+00
69bb494f-e219-4099-aa46-cd9249dd9b2c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CE4F166385975340FE52F5E10F633140	2026-09-09 02:34:12.234498+00
4cd6891b-5b75-4b10-b741-e7c4f4284c92	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000338B506C859753407B2C222F10633140	2026-09-09 02:34:13.531506+00
c9c62e69-2f34-4263-b9d2-d69850328107	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000093AB58E859753402D4723FA10633140	2026-09-09 02:34:15.228136+00
4409cbef-bd4c-4f0c-8862-df8a29c3b085	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000021D8A7D285975340EB5795D810633140	2026-09-09 02:34:33.215805+00
369b7c81-e120-4212-b26b-2faac83602e7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B0C0A101869753409268B8B711633140	2026-09-09 02:34:35.202771+00
2dd8783d-ab81-4dcd-b4dd-b2f3911b556e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D36872318697534068FD778E12633140	2026-09-09 02:34:37.231695+00
22e1a735-27a0-447d-b6cd-8e2d7dbd182f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C75E944586975340AF4D19EE12633140	2026-09-09 02:34:38.505444+00
fab05afe-4ad9-49fd-b79e-00493de94fa3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B5DC9909869753402C6FFDAA12633140	2026-09-09 02:34:40.233643+00
46e0b7dc-0355-4b2e-831f-5497c707789e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E426B4F60898534090F7AA9509653140	2026-09-13 13:00:27.268984+00
654b68b9-93ed-4741-b64d-4b1986b44023	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D6581D940B98534041142752F5643140	2026-09-13 13:00:30.207659+00
ea6123e1-cd92-4a2b-8cfc-fd89722cbbff	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001EA919ADFE975340059A1947F6643140	2026-09-09 01:58:26.717964+00
1b4e5845-2d86-43dd-8629-b3c3703f6614	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005449AEACFE975340059A1947F6643140	2026-09-09 01:58:27.215577+00
01d8543c-adb6-4f54-a11c-8b2b57773669	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004828C7AEFE9753408217224CF6643140	2026-09-09 01:58:28.199469+00
d88cd3fa-36cf-41f1-88d2-d0e35976756c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007EC85BAEFE9753408217224CF6643140	2026-09-09 01:58:28.825501+00
4fb67c95-16c9-4458-8e62-70ff289bac9e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DDE79DAFFE975340AC96CF4DF6643140	2026-09-09 01:58:29.184451+00
9d5efccc-0671-4bbc-8648-1c6ed059d271	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DDE79DAFFE975340AC96CF4DF6643140	2026-09-09 01:58:29.542281+00
30274574-4ff7-495c-b590-e7d7a2f9355c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B37FF9BFFE9753407008556AF6643140	2026-09-09 01:58:30.194722+00
0bb226d0-2101-4e27-93db-028340740867	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E93697D1FE975340E7806E79F6643140	2026-09-09 01:58:31.1937+00
9395db9c-f7f2-4b6a-baa9-530eca9dd221	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002A0F1CE1FE975340B7FCD181F6643140	2026-09-09 01:58:32.195155+00
f34004be-1d04-4f05-a78c-35a855630e92	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000ADA81CEEFE975340B1F7E28BF6643140	2026-09-09 01:58:33.194346+00
8782816d-be2d-473f-a919-cc333343d21c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000CC85EEFFE975340B1F7E28BF6643140	2026-09-09 01:58:33.726995+00
33b4c030-6070-49f8-b621-82ad0ec1e4cd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000012B644D3FE975340FF942A51F6643140	2026-09-09 01:58:34.221451+00
85a225ed-cc39-4a4b-b047-83c0f7774fc9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003619FACCFE975340B2E375B3F5643140	2026-09-09 01:58:45.206293+00
e9b722c7-4e21-447e-a2c2-a286cfa9c7dd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B39602D2FE97534005E2D0B6F5643140	2026-09-09 01:58:46.189889+00
d35d0ce7-9ca2-4204-aaf8-18d4a76f7f00	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000030140BD7FE975340825FD9BBF5643140	2026-09-09 01:58:47.209807+00
8d38533d-5014-4572-8a08-7f94ea7a90cb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FB7376D7FE97534059E02BBAF5643140	2026-09-09 01:58:47.730326+00
00eb4870-a007-4159-ae33-23f19723656d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000841266DAFE975340825FD9BBF5643140	2026-09-09 01:58:48.201488+00
a1674996-9f6f-41f6-9b1b-fa27d414a463	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000363003DFFE975340D65D34BFF5643140	2026-09-09 01:58:49.184312+00
85994abb-42f5-468e-9c31-13ad4fd540b0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B3AD0BE4FE975340295C8FC2F5643140	2026-09-09 01:58:50.235565+00
b8eaa577-1664-4492-a20e-e70aead2cd10	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008F4A56EAFE975340D05845C9F5643140	2026-09-09 01:58:51.178826+00
f203f496-e5f4-42f3-89aa-fc7f648024c4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005AAAC1EAFE9753407C5AEAC5F5643140	2026-09-09 01:58:52.031419+00
6fef478d-e901-4bf6-91ad-92135990a3bf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A18735F0FE9753404DD64DCEF5643140	2026-09-09 01:58:52.471758+00
bb1346aa-5ade-4b4c-b91e-9e5bb45c3886	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C4680C29F59753409A9A5F28BB643140	2026-09-09 02:01:13.26831+00
a503fed8-2ba0-4913-bbf2-3b12457858c3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005C3233D8F99753408E345DF4BA643140	2026-09-09 02:01:13.719342+00
45722848-9b68-43ee-8102-e893a30a7dd7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001BA26538F99753409A0AF148BC643140	2026-09-09 02:01:14.211339+00
343772dd-e5f4-443c-9304-cf5a314d396a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003811FDDAFA975340C7A17E17B6643140	2026-09-09 02:01:15.232832+00
19e00c93-c289-43ec-a985-de1fdbb5b035	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000026EB26E7FA97534095B54DF1B8643140	2026-09-09 02:01:16.303036+00
5ef0ebf5-4f3f-4fd8-b444-8ff71aaf41dd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D3799E89FA975340425BCEA5B8643140	2026-09-09 02:01:17.221313+00
8beae942-df4c-45a3-b35a-744a656c872a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003E75AC52FA97534066D58CB1B8643140	2026-09-09 02:01:18.203449+00
c441fa89-46ce-4fed-89fb-d08288c66519	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003E75AC52FA97534066D58CB1B8643140	2026-09-09 02:01:19.22911+00
8bd2e094-859d-43e3-84de-c5096ccc5f63	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000062EF6A5EFA97534007CD53C2B8643140	2026-09-09 02:01:19.82268+00
7a7ece67-290e-4fdc-a0e3-805fea01bdf2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BBF2B457FA975340E35295B6B8643140	2026-09-09 02:01:20.221164+00
3ee3f422-236e-4267-b979-bb08922601f8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AAB5D551FA975340F5616298B8643140	2026-09-09 02:01:21.111124+00
c38807d1-ab00-4251-8a49-5fbd1226731d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DF556A51FA975340EF004F5AB8643140	2026-09-09 02:01:21.602346+00
c91d961b-e750-4632-8bb0-13c6cabae193	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000863B1746FA975340E39A4C26B8643140	2026-09-09 02:01:22.234137+00
10862827-7eab-41a2-93cb-15c3cfd7ce85	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000333DBC42FA975340C0C469D2B7643140	2026-09-09 02:01:22.863423+00
dfce5bd0-ec8b-45af-927d-e8941dd0ddbb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D9226937FA975340B45E679EB7643140	2026-09-09 02:01:23.217996+00
b8ba761e-920f-4293-abbf-4389df46d423	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F1643733FA9753406D6AEA86B7643140	2026-09-09 02:01:23.586183+00
bac27e11-0fab-42d1-b0d3-52b60c791acb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D90B6025FA975340C00C2142B7643140	2026-09-09 02:01:24.193436+00
5e430ced-ea2a-470b-9fb8-82e7cf9a8e99	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FD6E151FFA975340FC9A9B25B7643140	2026-09-09 02:01:24.633246+00
02f52876-da6a-465a-90de-a2276c6d9f03	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000039149914FA975340FC3E77DDB6643140	2026-09-09 02:01:25.221735+00
b417641c-26fc-4850-b200-b1e2020c213c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F73B1405FA975340A3DF089CB6643140	2026-09-09 02:01:26.023912+00
7da5cf65-17b9-42d1-93a0-98c97923ad83	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000451E7700FA9753402C0BCB44B6643140	2026-09-09 02:01:26.742043+00
e9c0d309-96d2-4ff7-80b9-8ff4ce7c8862	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009E21C1F9F997534085B2F0F5B5643140	2026-09-09 02:01:27.234687+00
c6a71aa7-1dc4-4ace-8752-94667ebd136f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F10813EBF997534032FC4C62B5643140	2026-09-09 02:01:28.227308+00
633b6c38-acd5-4a8b-8cfe-2084f7fbdfcf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000624E2BE0F9975340F1B09AF8B4643140	2026-09-09 02:01:29.032014+00
2bc16758-c79e-4313-8c5d-dfccafd5629e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D9AF3BDDF9975340E5EE737CB4643140	2026-09-09 02:01:29.743525+00
b3a4b7ab-4ac2-4c74-bbd4-ddef9f83b7b8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CE8E54DFF99753402726B90DB4643140	2026-09-09 02:01:30.228649+00
3670bef3-67ef-4e9d-8ddc-957464a913c8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DFB42AD3F99753400350D6B9B3643140	2026-09-09 02:01:30.982086+00
ea66cef3-cb3f-4aa5-a3f3-33988559ca34	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A40FA7DDF997534075AF93FAB2643140	2026-09-09 02:01:31.551611+00
c01789f8-f121-479b-a172-f2d2921c4303	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000318E0CCF99753403969D086B2643140	2026-09-09 02:01:32.222353+00
a32db1ac-67f8-4146-b34b-0142ff697789	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000683C11C4F997534069914836B2643140	2026-09-09 02:01:32.774132+00
2d11ed65-2ff1-4c6f-a2e5-5fb632fc56dc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006E4100BAF99753404CC054D8B1643140	2026-09-09 02:01:33.227271+00
6c557017-f699-41a0-97f9-11e95cb49de5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EBA7FFACF99753400470B378B1643140	2026-09-09 02:01:33.973988+00
e63aeb43-f25b-4700-9f45-efe3039bf60c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000003EACDA8F9975340520DFB3DB1643140	2026-09-09 02:01:34.218538+00
2421d662-a160-4dd5-b039-4b1b4a93526b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000928DACA1F9975340F3A89D06B1643140	2026-09-09 02:01:34.62822+00
8baa019a-91c3-4f74-bcc5-77c36b5266e8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008655BC91F9975340BDC3EDD0B0643140	2026-09-09 02:01:35.227707+00
7b804696-d019-4248-be3f-4e6fea4c12e9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000395C5084F9975340706E5D7BB0643140	2026-09-09 02:01:35.854694+00
faaa1c75-0a6b-4b24-ab11-4642cac2d4a9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D420167BF9975340B806B64AB0643140	2026-09-09 02:01:36.206899+00
e6fd5f4c-91e0-4175-8aa9-dd527a0c695c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008C43A275F9975340CA15832CB0643140	2026-09-09 02:01:36.431806+00
0c6077fa-fbae-4c04-a87d-045edc059855	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000009AAA168F9975340A03AB1E2AF643140	2026-09-09 02:01:37.03546+00
36c4d22f-1b2d-4057-ae35-ee197f8688ba	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000015B47F54F997534011F6926BAF643140	2026-09-09 02:01:37.943302+00
563c7f46-850a-422b-8449-c9b30ca54cd6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F855B950F9975340A6875748AF643140	2026-09-09 02:01:38.199391+00
01873633-6f95-4f96-b2bd-a71ba35da4a7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EC1DC940F99753405932C7F2AE643140	2026-09-09 02:01:38.897464+00
f62c641d-16f3-4593-aedc-1f4688d5d94b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000039002C3CF9975340CA49CDC3AE643140	2026-09-09 02:01:39.260938+00
3275d738-930c-4071-923c-d8e3141c727c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000033E43334F99753403C61D394AE643140	2026-09-09 02:01:39.567884+00
4f69580c-f95b-44e5-8c87-124ce00eb857	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DAC9E028F9975340420A9E42AE643140	2026-09-09 02:01:40.256601+00
bfbd9653-4c89-4830-a693-15ed2cfb70f6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007BAA9E27F9975340AD1CB51DAE643140	2026-09-09 02:01:40.51074+00
c5245914-a89d-4ac0-ab2d-b8af479bd257	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000094E7D20F997534066CC13BEAD643140	2026-09-09 02:01:40.696969+00
f061807a-9a75-405e-90d5-e0bec33adcc4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F536C16F9975340CB7D175BAD643140	2026-09-09 02:01:41.20127+00
2a6ca48b-fe23-4954-9448-42c98c5ba3fd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008CB96B09F99753403C39F9E3AC643140	2026-09-09 02:01:42.051115+00
e7c2e8b0-1731-47b8-9fce-9603f3075c9f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DA9BCE04F9975340C05FCC96AC643140	2026-09-09 02:01:42.531408+00
bb2e98c2-a4e6-4e6d-b54e-449efaa13aa8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000693FADFDF8975340C003A84EAC643140	2026-09-09 02:01:43.04875+00
f2198cba-a941-4322-b4fb-c4d347790e38	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006323B5F5F89753400740DCD5AB643140	2026-09-09 02:01:43.900759+00
9a1a967a-25f1-47ab-9af9-eb3b56d23ac3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CE63DEF4F8975340A2D68FA8AB643140	2026-09-09 02:01:44.187164+00
a7db7ece-0eae-4a98-8299-d8a0d3d1c550	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000276728EEF8975340CC9DF419AB643140	2026-09-09 02:01:45.185941+00
a0329477-54d3-4943-9c04-65750443ba33	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000057EBC4E5F8975340733E86D8AA643140	2026-09-09 02:01:45.768725+00
d91c2d8b-e3ea-428a-a437-75eabde75882	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000069119BD9F897534008D04AB5AA643140	2026-09-09 02:01:46.222389+00
aabec109-d723-438e-9b6d-23d9344858c1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000051A1BAB9F89753402CEEE478AA643140	2026-09-09 02:01:47.236827+00
288d3647-be2c-4883-a2a6-6577a88125af	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DA28A1AAF89753406D252A0AAA643140	2026-09-09 02:01:48.002577+00
1a88ae9b-0c67-4474-9745-798ff47102de	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B6DCF4C2F8975340C1C760C5A9643140	2026-09-09 02:01:48.664594+00
bb9cc1d2-e63c-4bba-a8af-c5351871b671	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D43ABBC6F8975340CD751A69A9643140	2026-09-09 02:01:49.234642+00
d8fc5ed0-008c-4ad1-9a12-2c8bf4d37018	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D43ABBC6F8975340C714072BA9643140	2026-09-09 02:01:49.602384+00
817c8f7b-fe14-46a6-9964-4a1d6fbb8773	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005DC2A1B7F897534086C954C1A8643140	2026-09-09 02:01:50.082312+00
e4d00d85-7184-45af-bc83-d5b48f9fe7a7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006FE877ABF8975340E5756968A8643140	2026-09-09 02:01:50.481654+00
cb84f677-251c-46ea-b9c4-5fa5d547a03d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E02D90A0F8975340E0B831E2A7643140	2026-09-09 02:01:51.245689+00
29d089ae-1040-44dc-a64e-c775290c185a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000099501C9BF897534098689082A7643140	2026-09-09 02:01:51.684109+00
cd49b238-1c4c-433b-b6c9-0dfac21c221c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001CD31396F8975340D49AE61DA7643140	2026-09-09 02:01:52.233598+00
ee05e007-caa4-4344-9a53-07f6b6e38e04	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EC376E8CF8975340F2576DA3A6643140	2026-09-09 02:01:52.900345+00
e886d7ee-79df-4570-b2cc-b106571b86f6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000028DDF181F8975340636F7374A6643140	2026-09-09 02:01:53.208876+00
8a3f9f49-89da-4d91-b990-ffe34ae2acf8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B669C768F8975340403D6CD8A5643140	2026-09-09 02:01:54.229792+00
c1f4da8b-48c6-45bf-830d-8c120d3e9f3f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003FF1AD59F89753406A04D149A5643140	2026-09-09 02:01:54.936239+00
5f1de6d2-ae73-46d5-8f53-6866b9f63e99	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006F754A51F897534023105432A5643140	2026-09-09 02:01:55.189327+00
f4e3e8e9-772a-4bb9-9b28-baa2a27f2100	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002898D64BF8975340E120C610A5643140	2026-09-09 02:01:55.449719+00
c2f3dba8-e66f-4efe-8eab-8db56d8f997b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000051007B3BF8975340705177AFA4643140	2026-09-09 02:01:56.241367+00
6c7c5045-0141-413a-a80c-c5bb217216cb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001644EE33F89753406AF06371A4643140	2026-09-09 02:01:56.668245+00
ffd91bf6-622c-4a42-bb9f-40ffa28f398b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009FCBD424F89753403B10A331A4643140	2026-09-09 02:01:57.265653+00
b9562b58-b984-4ce5-bb69-acd115ea7a9a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008772FD16F89753404DC34BCBA3643140	2026-09-09 02:01:57.902593+00
9f21625b-0a08-4423-b4eb-d21d79474943	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000063F83E0BF897534035536BABA3643140	2026-09-09 02:01:58.241594+00
c3d17740-a4e7-428b-b6d2-adb1a5607469	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002220BAFBF7975340248C5539A3643140	2026-09-09 02:01:58.974454+00
b523227c-142c-4c06-99a8-460211f2d303	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009953B8D4F7975340D692E92BA3643140	2026-09-09 02:01:59.1951+00
97c34395-8d8f-43f8-b34b-7fab771cd99c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EC3A0AC6F79753405FBEABD4A2643140	2026-09-09 02:01:59.788353+00
7e418de9-3cdb-4a55-9b94-57aa933a0ebb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F23FF9BBF79753405358A9A0A2643140	2026-09-09 02:02:00.212497+00
0b8faceb-752b-4236-b2a4-95b1e3e73b12	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E60709ACF79753407D1F0E12A2643140	2026-09-09 02:02:01.068929+00
fe634b10-aa5e-4b68-815c-9366c7db5078	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008DEDB5A0F79753407EC3E9C9A1643140	2026-09-09 02:02:01.624+00
0a7195d4-c45d-4fe7-9035-1a96ac8f4064	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AB347392F797534007EFAB72A1643140	2026-09-09 02:02:02.199015+00
931017aa-d594-4b47-a59f-4a03eb02bc71	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000819EBC7EF7975340DD13DA28A1643140	2026-09-09 02:02:02.733501+00
3b870fdd-679f-4704-8bd9-4033ce06ae6e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000040C6376FF7975340961F5D11A1643140	2026-09-09 02:02:03.225734+00
c7af6d70-49e1-43b2-8f3c-935277f4e176	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000004F3A155F797534031B610E4A0643140	2026-09-09 02:02:03.943348+00
fc770ad4-7dd2-40c7-9076-6db6d50ca8e3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002856574FF7975340BA3DF7D4A0643140	2026-09-09 02:02:04.207712+00
7098485f-fcc9-4b8d-bced-e0af4a862795	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000016197849F79753404FCFBBB1A0643140	2026-09-09 02:02:04.505295+00
3bcbdd0a-6c68-437c-9e28-4b6ba75bd535	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005EDFE23CF7975340D8FA7D5AA0643140	2026-09-09 02:02:05.217637+00
aae1ebe0-58a8-4c9c-ba28-fb76e8b737fd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CF24FB31F7975340E4A837FE9F643140	2026-09-09 02:02:05.864988+00
ef9f89e1-5dcd-4de5-93e9-50eef76fe15d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001C075E2DF79753405BC52CC59F643140	2026-09-09 02:02:06.25854+00
13043948-5ea9-435c-8efb-46ecc6074356	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000220C4D23F79753409DFC71569F643140	2026-09-09 02:02:06.876306+00
2cf3ed80-737c-4e11-9226-5c3926297607	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CF0DF21FF7975340EA99B91B9F643140	2026-09-09 02:02:07.262563+00
d7d8fc9d-3c21-456b-a541-ee4603843959	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007C0F971CF79753405BB1BFEC9E643140	2026-09-09 02:02:07.475146+00
d035885a-4b6f-4a75-bcd1-a8464bf92e6f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000022F54311F7975340C767B27F9E643140	2026-09-09 02:02:08.179086+00
d1835cb3-2e18-4c5e-a354-a0d35cc5a032	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000022DE3AFFF6975340A996BE219E643140	2026-09-09 02:02:08.74347+00
e4cec0e3-e80b-4c9a-8665-66cc2182f48d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009F443AF2F6975340FD38F5DC9D643140	2026-09-09 02:02:09.184091+00
16196dd2-28eb-4567-966a-8e363cd31f39	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000400EEFDEF69753403E703A6E9D643140	2026-09-09 02:02:09.952441+00
0ce472ad-29c0-4404-8b85-130c873ba29e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000022B028DBF697534003869B429D643140	2026-09-09 02:02:10.230082+00
03f449e1-e4a6-4715-92eb-e264d619e0ec	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BD74EED1F697534027A435069D643140	2026-09-09 02:02:10.675506+00
8c039e3f-ed6d-4504-9088-5dda3826a9db	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000707B82C4F6975340FDC863BC9C643140	2026-09-09 02:02:11.16332+00
059d1c85-42b6-487f-8eaf-ac6e89a7cc9b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006A5F8ABCF6975340E0F76F5E9C643140	2026-09-09 02:02:11.773957+00
39095385-8e9f-44cc-b429-d8139688dde4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000238216B7F69753408C9DF0129C643140	2026-09-09 02:02:12.257529+00
949ef2a2-830a-417f-8b76-48ea152ab82e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E1A991A7F6975340ECEDE0719B643140	2026-09-09 02:02:13.262903+00
b0ec8218-ae89-41d7-85e1-a8dcc9b0c774	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000642C89A2F69753403A8B28379B643140	2026-09-09 02:02:13.567877+00
3721d059-6366-4918-b99d-2ea9fa05a278	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006A317898F697534022BF23CF9A643140	2026-09-09 02:02:14.242341+00
208e682c-936f-439b-b5de-74518afaf37f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002F75EB90F6975340ABEAE5779A643140	2026-09-09 02:02:14.731868+00
62b3841b-c39d-4f7c-bf69-f8bb138e5fa6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C939B187F6975340810F142E9A643140	2026-09-09 02:02:15.209357+00
b7d24e33-dc94-476a-b37f-7b79e6a50103	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001D210379F69753409AC7ABBD99643140	2026-09-09 02:02:15.993367+00
16495256-5a2f-4b0f-a2ff-f9ff25ad5159	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D5438F73F6975340E15F048D99643140	2026-09-09 02:02:16.209351+00
cc8d2e9b-004c-4227-8bb8-b99cbbc22771	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009A87026CF69753405E81E84999643140	2026-09-09 02:02:16.633614+00
dfa21248-20ea-4c4f-94ad-7eab836733af	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FFAB3363F6975340E7ACAAF298643140	2026-09-09 02:02:17.225493+00
c3b5afe3-6fd8-4f28-9700-dd431c163451	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001DDCE742F6975340828B153598643140	2026-09-09 02:02:18.219078+00
749ee0f6-4fb9-449b-aa28-9e5357730b8e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C9C6832DF697534077C9EEB897643140	2026-09-09 02:02:19.047368+00
fc7ab9a0-29f5-4148-ad1c-28d1d8af438e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000472D8320F6975340776DCA7097643140	2026-09-09 02:02:19.611248+00
f7bddf90-9691-4e0f-b5f2-16db03e6f001	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000023B3C414F69753402A183A1B97643140	2026-09-09 02:02:20.187505+00
35c23b0a-1225-4c17-9318-8809e2fa3af0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009AFDCBFFF59753404EDAAF9696643140	2026-09-09 02:02:21.213339+00
2a346386-2d64-45b1-8620-923b309e62e4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BE6081F9F5975340E36B747396643140	2026-09-09 02:02:21.502757+00
d45f2ee6-cef6-4342-b578-fd15299de81c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E7C825E9F5975340BF95911F96643140	2026-09-09 02:02:22.217087+00
143c01f6-a317-4634-9a3b-cc52184f205c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008EAED2DDF59753406C3B12D495643140	2026-09-09 02:02:22.780309+00
65e4344a-16fb-4d5f-8773-89b14522b1db	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FFF3EAD2F5975340305173A895643140	2026-09-09 02:02:23.198172+00
1e4f0ec2-00d2-4bba-b6bf-2673e771558c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F9D7F2CAF59753409C638A8395643140	2026-09-09 02:02:23.516784+00
6ba04400-b9e4-46b0-8bc5-985cf197c72f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006A1D0BC0F5975340E900D24895643140	2026-09-09 02:02:24.040022+00
8f56d44f-ed5a-4672-9e73-be2f1f134a90	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000035666DAEF5975340C02500FF94643140	2026-09-09 02:02:24.582019+00
7f513628-bb7a-4f7d-88ba-500e0929d79f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006BEFF89BF5975340C0C9DBB694643140	2026-09-09 02:02:25.23329+00
fe1f60b5-06da-448b-8aae-ca42b91cb5bb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000821ABE85F5975340CC77955A94643140	2026-09-09 02:02:25.97797+00
6a635f43-56f1-407d-a608-09714030937c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F45FD67AF59753408A88073994643140	2026-09-09 02:02:26.241509+00
ec559448-b133-417e-90c8-553f48b79b29	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A6666A6DF5975340493D55CF93643140	2026-09-09 02:02:27.262467+00
50615461-f8ec-4560-a214-1f9506d80e05	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EE2CD560F597534043DC419193643140	2026-09-09 02:02:27.761+00
5b0ddbe7-58b3-41db-8480-55a60f5c5398	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000077B4BB51F5975340D86D066E93643140	2026-09-09 02:02:28.193968+00
43408902-f42f-48c5-9a09-5b81ade2eba5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A6214F37F5975340A98D452E93643140	2026-09-09 02:02:29.001428+00
2e34825f-f497-4eaf-8702-c947a2e614d2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000089AC7F21F597534073A895F892643140	2026-09-09 02:02:29.511315+00
f52f1085-90ff-4de3-a7e0-fc72b7e7c484	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002976340EF5975340734C71B092643140	2026-09-09 02:02:30.192225+00
882cf540-5805-49a0-b514-dfd956e2a65f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000234333F4F49753407AF53B5E92643140	2026-09-09 02:02:30.886316+00
84b7be0f-b4aa-475a-9519-38da70c6617e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A0A932E7F49753409109F83592643140	2026-09-09 02:02:31.212122+00
5ddd4a91-78ff-407b-aef3-898ea2b5bbd2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000006B75ACCF4975340213AA9D491643140	2026-09-09 02:02:31.996018+00
72f8d180-797d-4c74-84f7-e271e8dc9285	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002A0307B4F49753407AE1CE8591643140	2026-09-09 02:02:32.702407+00
21ac77ac-51a9-4f90-9d19-3f5d9105fdde	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000890B40A3F49753407480BB4791643140	2026-09-09 02:02:33.215436+00
e87b549e-268b-462d-9bd6-f4d6c3369026	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CAB5B28EF4975340F1A19F0491643140	2026-09-09 02:02:33.841991+00
61bc1503-6916-40af-afa3-e4725a03077f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B35CDB80F497534009B65BDC90643140	2026-09-09 02:02:34.208713+00
a650ba8c-5f91-4f53-9323-6200b0783735	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000083C13577F4975340C8C6CDBA90643140	2026-09-09 02:02:34.510068+00
2599ddef-0486-4ba4-b408-d63138427969	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006B685E69F4975340ECE4677E90643140	2026-09-09 02:02:35.032104+00
1a56a48b-2bb3-4935-a4bb-d4493579507d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000095D00259F4975340F28D322C90643140	2026-09-09 02:02:35.717927+00
a76a30a8-79e0-4fab-85d1-7097b147b027	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000095B9F946F49753408D24E6FE8F643140	2026-09-09 02:02:36.279403+00
f3b76107-e802-48aa-ac43-67ded827a219	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003683AE33F49753400A46CABB8F643140	2026-09-09 02:02:36.928703+00
34024eda-93b9-4bd8-a358-549a947ab6b7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002446CF2DF497534045D4449F8F643140	2026-09-09 02:02:37.199175+00
ed3531a9-9384-4fd8-807d-0798eb0cace7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E8894226F49753408767AE788F643140	2026-09-09 02:02:37.555725+00
a47af041-5c69-46ed-85b1-3294cf3ad75c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008F6FEF1AF4975340D404F63D8F643140	2026-09-09 02:02:38.113158+00
743ac365-b486-45ac-9ca6-a1ca0184f901	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008953F712F4975340D5A8D1F58E643140	2026-09-09 02:02:38.68117+00
5eb6a2d3-3a5c-4008-bcf1-4bd68c04d7d9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CB147310F4975340DB519CA38E643140	2026-09-09 02:02:39.244373+00
f952f5bb-5dad-45dd-b89f-0aa6cf259622	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000053B36213F49753401684F23E8E643140	2026-09-09 02:02:39.891636+00
d1f6b67e-24d0-4ab7-a783-0bcf331444af	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D1306B18F4975340B11AA6118E643140	2026-09-09 02:02:40.228704+00
1abdb66e-8ad9-4b8c-8988-fcaa5f51bda5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000242FC61BF49753401D2DBDEC8D643140	2026-09-09 02:02:40.510412+00
7c035d40-f8df-485e-9f04-b4d56bdfe4d1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000000CC1022F4975340F956DA988D643140	2026-09-09 02:02:41.059242+00
a9dd2dce-7c43-4f6d-9099-97e6d8b93477	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002A4BBE23F4975340AC014A438D643140	2026-09-09 02:02:41.693411+00
9b85ade2-1586-47de-bffc-1f70077f31f3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000834E081DF4975340F99E91088D643140	2026-09-09 02:02:42.238245+00
3b727235-c79b-4230-a2a9-7306df41e5ed	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006BF5300FF497534071BB86CF8C643140	2026-09-09 02:02:42.777088+00
14c71fe7-f3de-45e4-a570-6cc8b5421a53	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000071FA1F05F49753408ED4319D8C643140	2026-09-09 02:02:43.239596+00
c7ba1464-5c68-4adf-b76e-97641d9f8143	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000363E93FDF3975340FAE648788C643140	2026-09-09 02:02:43.54474+00
10963f11-94d9-48f6-969c-5e61e51c3195	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000548550EFF3975340A68CC92C8C643140	2026-09-09 02:02:44.194784+00
93904ec1-7bc9-4e38-b789-8a3d926f2095	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B9A981E6F397534071A719F78B643140	2026-09-09 02:02:44.641171+00
358e99f0-2984-4f74-b2eb-27d95b888de2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001ECEB2DDF3975340E2BE1FC88B643140	2026-09-09 02:02:45.165213+00
95beed8d-f854-4aae-a4ed-70f567faee1d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000083F2E3D4F3975340EE6CD96B8B643140	2026-09-09 02:02:45.33311+00
6f1a5529-7b40-480f-b620-0a6b1a55f377	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000421A5FC5F3975340249A40118B643140	2026-09-09 02:02:45.999065+00
32ca70d1-6b15-4331-bdb8-2ae3f9b86f43	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003CFE66BDF3975340CB3AD2CF8A643140	2026-09-09 02:02:46.469936+00
4318fb86-29ad-4a2a-9b30-cd610f029489	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DDC71BAAF3975340FB624A7F8A643140	2026-09-09 02:02:47.224613+00
1396228a-f943-41eb-9881-3a20f6e83a7f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C56E449CF39753408AEF1F668A643140	2026-09-09 02:02:47.789422+00
233fa4c8-44ec-410e-98cf-498d81855cea	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F4F2E093F39753400D7217618A643140	2026-09-09 02:02:48.316955+00
a14be01c-1cc7-460d-ba0b-3415e3745177	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000369D537FF39753408AEF1F668A643140	2026-09-09 02:02:48.928577+00
5380a279-e264-43fd-a035-ab0dbf1aa93c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E39EF87BF3975340137706578A643140	2026-09-09 02:02:49.204338+00
da26097c-326d-4e6c-8ade-ac3f086f4940	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000896D9C5EF3975340540A70308A643140	2026-09-09 02:02:50.06189+00
a09f3dcb-a31a-4817-a933-c5b33c0ed674	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F596BC4BF3975340A24B93AD89643140	2026-09-09 02:02:51.262494+00
9de97423-3f5b-46cb-b984-d27fa2beae99	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008A3F8A3AF3975340DD7DE94889643140	2026-09-09 02:02:51.951154+00
8adf0571-bf82-41aa-bbc1-5519c809aa92	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001EFF603BF3975340FB96941689643140	2026-09-09 02:02:52.228856+00
7dace246-e435-4be5-b2ae-330323de7a27	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005AA4E430F39753408566327788643140	2026-09-09 02:02:53.234655+00
b5e14892-1cad-4f79-85b6-41bb8565a9f2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000012C7702BF3975340FC82273E88643140	2026-09-09 02:02:53.543529+00
d5143861-0492-448e-ba18-72bad12d13e8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004E6CF420F3975340F621140088643140	2026-09-09 02:02:54.082918+00
0394b5d1-156a-4a75-b4e8-9d3955c1f164	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E930BA17F39753403E02243F87643140	2026-09-09 02:02:54.884858+00
69a1998a-0931-4b70-9811-5b8dc8746630	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E930BA17F39753400E2263FF86643140	2026-09-09 02:02:55.233069+00
829bd9e4-de1a-4367-beff-555c9af79628	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000030F7240BF39753408CE7227486643140	2026-09-09 02:02:56.22612+00
bde2ff27-3ee7-4ab1-b118-a8e27e0d6b08	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BF9A0304F3975340D9846A3986643140	2026-09-09 02:02:56.633207+00
d89336b9-70b3-4237-bd37-5da82b8e5c82	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B97E0BFCF2975340AAA4A9F985643140	2026-09-09 02:02:57.20824+00
408f2228-0e9f-40b8-8880-5855b98a7606	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006064B8F0F297534080C9D7AF85643140	2026-09-09 02:02:57.848962+00
bd3f0448-f03b-4101-ab41-e069646208c6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B96702EAF29753403FDA498E85643140	2026-09-09 02:02:58.182417+00
b12a49f1-a91e-445c-9918-ceb20c6b208c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008ACC5CE0F29753408C77915385643140	2026-09-09 02:02:58.693892+00
b9908a39-00fa-4053-a28b-f10ea00d294f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FB1175D5F29753402D13341C85643140	2026-09-09 02:02:59.214042+00
87654cf2-7cfc-4875-9187-6ebdb8298917	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A2F721CAF297534080B56AD784643140	2026-09-09 02:02:59.756316+00
f1ca8139-1878-4b33-b875-363653c70c81	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000071C53C1F2975340F8D15F9E84643140	2026-09-09 02:03:00.201286+00
5c54d91b-be65-41b1-b424-7ba793f2d01a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005A03A5B2F2975340DA006C4084643140	2026-09-09 02:03:00.929561+00
cecdf28f-fc8b-4c03-92b8-0e87e3cb20a7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BF27D6A9F2975340E0A936EE83643140	2026-09-09 02:03:03.635918+00
fbc7b377-bb1e-479e-a3e6-953adbaaf97b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007E384888F29753405E13D21A83643140	2026-09-09 02:03:03.640434+00
914d3b56-58b9-405e-81bd-64e250bfef29	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000724573AEF2975340F214281884643140	2026-09-09 02:03:03.632822+00
aadbd218-8b07-433e-9af4-0c4782e561c6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007E213F76F2975340E1815C3D82643140	2026-09-09 02:03:03.916438+00
0b400f95-13d2-465d-b8d9-2b8aee45185b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000019E6046DF297534005A0F60082643140	2026-09-09 02:03:04.206842+00
b7f62aa2-ccaa-4f9e-b3bd-82f314521034	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007E0A3664F2975340D5BF35C181643140	2026-09-09 02:03:04.570872+00
7ce70c91-2cb3-4c8c-b7b7-264c7d6e79c9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EF4F4E59F2975340B2E9526D81643140	2026-09-09 02:03:05.239597+00
724d46f0-3e94-41b4-89b1-2c28635c6d4a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CBD58F4DF2975340FF869A3281643140	2026-09-09 02:03:05.702182+00
4d4e2b78-cebf-4169-87a9-7ffef1a0435a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001FBDE13EF2975340471FF30181643140	2026-09-09 02:03:06.23691+00
d444f88c-c6e0-46bf-890d-989a067afe7c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E905442DF297534077476BB180643140	2026-09-09 02:03:06.989261+00
191b9081-ffa7-444e-8629-a6b2bfbcdc52	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000084CA0924F2975340D64FA4A080643140	2026-09-09 02:03:07.203931+00
a08ae6c7-502b-42b4-bdf7-1d6aaaf0ceaf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007EAE111CF29753403B5DCC8580643140	2026-09-09 02:03:07.496641+00
74903925-b4bc-49cf-8d63-5d3586f9d3ff	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C6747C0FF297534035FCB84780643140	2026-09-09 02:03:08.091747+00
fe4cb564-5dbe-466f-936e-7f2186f3a2e7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000195CCE00F2975340AD18AE0E80643140	2026-09-09 02:03:08.671784+00
f7f68fd5-feae-4b7b-85b0-a553486ea3b8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CC6262F3F19753401E30B4DF7F643140	2026-09-09 02:03:09.166946+00
21bdbe5f-6f3e-4603-8787-16a5dcefba54	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001F4AB4E4F1975340FA59D18B7F643140	2026-09-09 02:03:09.981225+00
7c0da3b0-5e75-4e09-8216-a0d01f66dc5b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000908FCCD9F1975340C57421567F643140	2026-09-09 02:03:10.496761+00
715277c1-668a-4004-8280-210c7815bc87	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000377579CEF1975340181758117F643140	2026-09-09 02:03:11.048231+00
f083bf02-04f0-48e9-be41-684b5da9f570	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000967DB2BDF19753402ACA00AB7E643140	2026-09-09 02:03:11.820243+00
f6bbcefc-2a77-4c65-96ca-a7ab955d8256	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009C82A1B3F1975340A2E6F5717E643140	2026-09-09 02:03:12.205327+00
6ee21090-c1b7-49b0-93cb-1e8db58834dc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A28790A9F1975340488787307E643140	2026-09-09 02:03:12.771376+00
eb230f69-29f7-4100-8c18-200261dd99a3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000061AF0B9AF19753407EFCA5457D643140	2026-09-09 02:03:13.242537+00
d042d830-7736-49d5-b5c9-3e8d180f66b2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009033A891F1975340133246DA7C643140	2026-09-09 02:03:13.537243+00
f47a6028-0117-4289-833e-a8ffb5a8f5e9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005B7C0A80F19753405B6E7A617C643140	2026-09-09 02:03:14.182079+00
c6771f6c-e9ce-469a-b0f6-3350222c9881	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000043233372F1975340BB1A8F087C643140	2026-09-09 02:03:14.787692+00
b72cf19f-ab54-474d-8052-2468ee5a7460	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007FC8B667F1975340323784CF7B643140	2026-09-09 02:03:15.261986+00
f203e6f1-0131-414c-ab4a-29890102f23a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007390C657F19753401A6B7F677B643140	2026-09-09 02:03:15.92205+00
b1135f96-9578-46e2-b16a-e18f0747d06f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CC931051F1975340327F3B3F7B643140	2026-09-09 02:03:16.175853+00
68cc902e-8d96-4f98-a403-4c4d9f824c9c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009CF86A47F1975340322317F77A643140	2026-09-09 02:03:16.710182+00
2e251d72-d78c-47cf-badc-f81f0d05a0ee	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E4BED53AF197534086C54DB27A643140	2026-09-09 02:03:17.241699+00
16e824c4-78d9-4166-a865-9555fdfafffa	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002B85402EF19753408669296A7A643140	2026-09-09 02:03:17.806145+00
245d69e7-04db-4229-ac62-9e4c05669256	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000142C6920F1975340D306712F7A643140	2026-09-09 02:03:18.272111+00
2f3413d4-d326-40a7-9fd2-4c8821360046	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008B485EE7F0975340BC82233779643140	2026-09-09 02:03:20.246036+00
46b74499-c392-4c56-a218-9bac87a18a19	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000557AB7C3F0975340C2CFC99C78643140	2026-09-09 02:03:21.508618+00
29c3a3de-cb24-406c-a9b3-0159018139c5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000079AF5A99F0975340BDB66DCE77643140	2026-09-09 02:03:22.722438+00
6570247d-aadf-4175-899e-4b527669874c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D8A08A76F09753404C2FD6DC76643140	2026-09-09 02:03:24.22076+00
d7a05fe6-4c6c-4740-83bc-e9635b65caab	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000142F055AF097534029A1AAF875643140	2026-09-09 02:03:25.622575+00
3bdab585-6491-47b6-809a-28a896a097ff	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000325FB939F097534035971B0C75643140	2026-09-09 02:03:27.206148+00
4e2ca926-66a0-4d83-b3dd-652d3f0cc72b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000067D13B15F09753400C04013274643140	2026-09-09 02:03:28.798504+00
17fe082f-1b02-4242-a763-ef9a3f15e23d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D3E352F0EF9753403CD0549973643140	2026-09-09 02:03:30.021571+00
2fec6887-df40-4120-994e-435dc14df19d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000624216B3EF9753408454409072643140	2026-09-09 02:03:32.212047+00
7c6aed04-f698-4c18-a055-e8dbf6c85ff0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CD542D8EEF975340723106D671643140	2026-09-09 02:03:33.674385+00
38318c14-31f2-47ac-9cad-d03da674b09e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B5E44C6EEF975340AE07382971643140	2026-09-09 02:03:34.965987+00
b55ae593-0f37-47d9-995d-008ba5fd624f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E551E053EF97534091DA1F8370643140	2026-09-09 02:03:36.252502+00
b851bf38-0b1a-4e6b-9d0e-f308ed3bb799	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BBBB2940EF97534091C6B2AA6F643140	2026-09-09 02:03:37.506996+00
e3d0ef67-c17e-4597-935b-e022c65ace00	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008C097B24EF9753405CCD959C6E643140	2026-09-09 02:03:39.234059+00
d30c2313-4435-45aa-b9a8-bc1cec338a95	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C8331E5B85975340CECE58EA0F633140	2026-09-09 02:33:49.21994+00
26d2ee82-1a05-4b3c-9048-1628a65d7766	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000033B9629085975340BCD3F8E010633140	2026-09-09 02:33:51.240564+00
384f4acd-7cbf-4257-8c59-7b9ef7c3e7bb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C28A53AD859753404A18175811633140	2026-09-09 02:33:52.71624+00
390d71db-8543-49ae-a82e-b17acbe29730	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008084BC7985975340AAB0BE2610633140	2026-09-09 02:33:54.229773+00
6c47f960-0413-49f9-998d-5a99cadc3890	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F3FA484859753402DEBFEB110633140	2026-09-09 02:33:56.200005+00
2278fd3e-cb1d-412d-a4d2-95c8ca3df6e2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000027AF84A4859753408C07A57911633140	2026-09-09 02:33:58.232592+00
42636c9d-5fe4-4bd1-afbd-c28f11f973ac	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000629923D0859753405C97755A12633140	2026-09-09 02:34:00.245804+00
5110825f-3d5a-414a-a840-2c06ef69da97	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000062C735F48597534079C48D0013633140	2026-09-09 02:34:01.951246+00
65ca072c-970b-4d8c-8526-adac5f122726	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FD74F2D8859753408059EBD511633140	2026-09-09 02:34:09.237465+00
ce79af4e-4017-43f9-94b4-4e3a9e2feced	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002D9D6A8885975340B672E5A210633140	2026-09-09 02:34:11.11342+00
f392d4b1-657c-44f1-b737-1268804d4dad	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000682BE56B8597534063BC410F10633140	2026-09-09 02:34:13.260078+00
708d1c8b-f856-48df-a049-ccd767109825	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000057050F7885975340CE86A17A10633140	2026-09-09 02:34:14.204834+00
124761cd-3642-4a41-8026-c6b5582b52c7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000626B11AC859753400985AD7E11633140	2026-09-09 02:34:16.23023+00
ce216acc-6646-4284-8868-8f730d71a6c6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000332C90EA85975340A41B615111633140	2026-09-09 02:34:34.234016+00
fecae237-4ba1-4a1d-910c-aacc032ea1ae	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000080530E1C86975340F72D292D12633140	2026-09-09 02:34:36.185579+00
52c8c38f-494b-4087-bccc-269da3bd935c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DFA0624186975340E4D6A4DB12633140	2026-09-09 02:34:38.212761+00
4b321422-feb2-4ed1-8e53-fc46adb65fb9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009EB1D41F86975340D36BB3B112633140	2026-09-09 02:34:39.212763+00
093ad486-d1ec-40e8-9bef-5c3e6f6a6880	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E560360186975340F0E082C712633140	2026-09-09 02:34:41.240422+00
c829171c-b32d-45b7-ad75-4827e301f7d1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009B8823B40A985340F73B1405FA643140	2026-09-13 13:00:28.639034+00
f2783d7e-0d86-4dec-a576-b91dd91bc8bd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008FAC57EC0A985340C3D265D6F7643140	2026-09-13 13:00:31.278477+00
e2677f6e-0eb4-4595-915b-845cf5f4203e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008F392A920A98534080C3FAF5F9643140	2026-09-13 13:00:34.167939+00
751af78d-166d-40f4-a511-7d51eb228a4a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000000AD54AB0A9853408D5D47C1F8643140	2026-09-13 13:00:36.227655+00
4b645a32-8059-4565-8eae-e0a7523f3dde	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C57D9A490A98534038E3EAB6FA643140	2026-09-13 13:00:39.265602+00
b23c2bfb-da2e-4630-a3e8-8a1aaa18af48	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A822707F0998534071E9F3ACFF643140	2026-09-13 13:00:42.248421+00
4dfed325-f8c3-41cc-8d0b-9c5c485fa33b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A83C15CB08985340397CD28904653140	2026-09-13 13:01:00.118458+00
5bdaba1f-201b-46fb-9c87-57f84c364562	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005527B1B50898534086D162DF04653140	2026-09-13 13:01:02.949065+00
608284a8-9344-40ca-a79f-26d5a086af67	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000022956B208985340A44632F504653140	2026-09-13 13:01:04.279107+00
f452d6fe-9183-4e78-97a0-85c82bbdf838	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000258C0BAC08985340B6B1231F05653140	2026-09-13 13:01:06.255916+00
89005045-97a7-4d86-a4b3-2c254ee37a26	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EACF7EA408985340EB96D35405653140	2026-09-13 13:01:09.253503+00
a78eeb4a-8250-4ad4-872b-fbcdf7124202	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D8929F9E08985340F1F7E69205653140	2026-09-13 13:01:11.272471+00
823a33e2-14ad-4d04-8665-93c38e9e270b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008594449B089853402DE285BE05653140	2026-09-13 13:01:14.187651+00
bd3acacd-9437-44fb-a93a-a2c04d3f694d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F0D46D9A0898534050B8681206653140	2026-09-13 13:01:17.283013+00
873195c2-783d-449f-8ee9-28b2eaf9567f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003DB7D0950898534092A7F63306653140	2026-09-13 13:01:20.251711+00
0414e53e-94fd-4546-81a9-56a663142003	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A8F7F9940898534038A4AC3A06653140	2026-09-13 13:01:21.319268+00
7d21e23c-b64e-49bd-b845-920fbeadd731	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DE978E940898534097080A7206653140	2026-09-13 13:01:22.545672+00
320457f3-bba7-4522-8394-9e59498b0387	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001338239408985340B57DD98706653140	2026-09-13 13:01:24.315272+00
2a0d7d6d-0614-44ba-a117-2def9ab10d02	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EAB8759208985340D3F2A89D06653140	2026-09-13 13:01:26.805543+00
329b22f5-8a0b-4018-bb83-c1fdb0528b95	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001338239408985340385CF5CA06653140	2026-09-13 13:01:29.207852+00
4ebf3b0d-3dba-4cdf-b73d-ed3edac0c312	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000080033840898534044C2F7FE06653140	2026-09-13 13:01:31.867939+00
d659a87f-0316-4b2b-83a1-8de49e3dae19	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005BD07B630898534055890D7107653140	2026-09-13 13:01:34.256097+00
fc1a0e41-99dd-4993-8c10-f0d89cdde597	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EA5C514A08985340CC5D4BC807653140	2026-09-13 13:01:37.382906+00
63661403-81c0-45c8-82a0-9bbda7310f4f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003D44A33B089853400243FBFD07653140	2026-09-13 13:01:38.914002+00
f050f3bb-c35a-4b5d-accc-969a7b489678	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003711A22108985340BAAAA22E08653140	2026-09-13 13:01:41.188541+00
76a22a8f-9c5b-48ce-9d5f-3550dd506c44	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000E92F41F0898534061A7583508653140	2026-09-13 13:01:41.957246+00
6132b5dd-ca08-4df9-a656-f43770dd730f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000037FA980F08985340A89BD54C08653140	2026-09-13 13:01:42.601167+00
41cb0eed-7731-45c7-b07a-cb786f9ef28a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000043ED6DE9079853406D0D5B6908653140	2026-09-13 13:01:45.239458+00
752720e1-b92e-4b2d-bc37-61c015be2b6f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001A57B7D50798534002FB438E08653140	2026-09-13 13:01:48.288169+00
ffc5b286-abb1-4083-b145-d5d9c94cad86	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001A40AEC3079853400D6146C208653140	2026-09-13 13:01:50.255622+00
b34c9790-1957-4f6e-9310-de6dd636628e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000002E7D6B50798534072CA92EF08653140	2026-09-13 13:01:53.203677+00
d7145891-b518-4cd4-836c-47bfabb79e76	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A2B83E07F19753403FBD63C279643140	2026-09-09 02:03:19.132816+00
a2647522-24df-44f9-ac1b-06e59a348056	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F6717ED4F0975340ECAA9BE678643140	2026-09-09 02:03:20.930075+00
84bd7989-2a6b-4a4a-910b-17f0b3bd7d1a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000085FE53BBF0975340DAE3857478643140	2026-09-09 02:03:21.966672+00
95c3b10e-a7f8-46ea-a9ee-cb67acae0688	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002CB6EE8BF0975340C35F387C77643140	2026-09-09 02:03:23.271681+00
e3b0d985-712c-4b3c-967a-cac0b3614d88	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002683ED71F0975340114537B176643140	2026-09-09 02:03:24.412684+00
961c1a2f-b2ca-4537-ba16-ccecfb208076	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000085741D4FF0975340B2CC6CA175643140	2026-09-09 02:03:26.208036+00
b9858fc0-8595-470b-962a-140ff847dc37	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009783EA30F0975340D632BED474643140	2026-09-09 02:03:27.626465+00
fd9af395-7303-47a4-b795-2a634431fed1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000EB7E809F0975340B3A492F073643140	2026-09-09 02:03:29.23946+00
b1e5f29c-7764-46a1-9ceb-a18518d1730f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007FB7E5C8EF975340A181583673643140	2026-09-09 02:03:31.109069+00
00db8981-7586-4a4c-a39b-17f143a4dafe	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000091C6B2AAEF9753409C68FC6772643140	2026-09-09 02:03:32.525495+00
db4d85c7-b039-467b-8412-c726e113ece2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000141B9881EF975340A2597E8571643140	2026-09-09 02:03:34.24432+00
502ac6a3-a0ed-4879-a77a-d0511592b336	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002C465D6BEF9753401F1F3EFA70643140	2026-09-09 02:03:35.194674+00
a8d40742-f75c-4c4e-83d1-5ce8df0d12db	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C1D72148EF97534044858F2D70643140	2026-09-09 02:03:36.826902+00
2f4dd137-a64f-414f-8480-f678993f15c9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C1C01836EF975340386744696F643140	2026-09-09 02:03:38.089404+00
28c20f30-1ac5-4811-b0b4-4a3df619948f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F7329B11EF9753409E04DB2D6E643140	2026-09-09 02:03:39.964424+00
fe0bada4-0a14-4d63-a662-bd8bc9c7ff72	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000FE0E30286975340D9CCC6EF12633140	2026-09-09 02:34:42.226126+00
886ac3e4-2613-47fa-9204-f099aa92a48e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004497811486975340CC1E0D4C13633140	2026-09-09 02:34:44.178771+00
0d295f5a-433e-4b25-8f50-dce218767241	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C12B932B86975340F6F9DE9513633140	2026-09-09 02:34:46.221301+00
48fcc4cf-8e23-4437-bf64-8792227006bb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C1429C3D8697534061681AB913633140	2026-09-09 02:34:47.655989+00
5712db9f-cf99-4df9-a729-682fcb60a186	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001BBCAFCA85975340A9A44E4013633140	2026-09-09 02:34:49.249404+00
d999703e-0d3b-46f4-ab18-6ca9ec27d715	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000363D8BC85975340D8840F8013633140	2026-09-09 02:34:51.266664+00
ccd3b894-f2ee-485b-ab31-61f1ea948c50	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000068B51BD885975340FC5AF2D313633140	2026-09-09 02:34:53.224535+00
abb77729-4081-4e79-91a7-6b8ca8ac5807	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F5A276BF0A985340F26A6FA6F8643140	2026-09-13 13:00:32.250915+00
f813a9da-0542-4808-ae68-c5ff7722f481	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000956C2BAC0A9853408D5D47C1F8643140	2026-09-13 13:00:35.289124+00
21c1ec10-1fee-4c1e-9f99-914f6f646cf8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FB7953910A985340ECC1A4F8F8643140	2026-09-13 13:00:37.247043+00
5b4e926a-352a-4a1b-b3b9-d63cb5b11f82	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EF891AF109985340976F229FFC643140	2026-09-13 13:00:40.232781+00
48d17288-ce67-4a5b-aa74-7d7c4c338067	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000614898B308985340034F6BE404653140	2026-09-13 13:01:03.237093+00
cfcb38d1-86f2-4742-a860-cbec84ff79ee	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000043EAD1AF089853406FBDA60705653140	2026-09-13 13:01:05.675155+00
c966649a-02c9-400e-8fd1-8370c266512f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000072E45A80898534027254E3805653140	2026-09-13 13:01:08.253637+00
4e80d028-956c-411c-b434-addeeaa26a9d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002B91FAA108985340338B506C05653140	2026-09-13 13:01:10.743312+00
ff208692-6d52-4320-bf38-5debba13d2ae	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000043D3C89D08985340626B11AC05653140	2026-09-13 13:01:13.388608+00
280e48f4-afc5-4a3b-b167-f82399cc8e8b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000090B52B99089853404A5755D405653140	2026-09-13 13:01:16.224124+00
3263a8a9-dff7-4c60-a91e-c1029f4cca9a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FCF55498089853401B2FDD2406653140	2026-09-13 13:01:19.373459+00
b160baf0-abee-4cab-ab86-ce3c57b00266	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DE978E94089853400F81238106653140	2026-09-13 13:01:23.223899+00
0dd00ae3-8961-452b-8ce1-7d91352016ba	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B418E192089853405675A09806653140	2026-09-13 13:01:26.211296+00
df6bd5e2-58e5-41b6-9d5a-bbd5a04dcf09	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B418E1920898534068E091C206653140	2026-09-13 13:01:28.2183+00
e060d96a-13c2-4790-9252-bf0ba38b8a36	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D25F9E84089853409DC541F806653140	2026-09-13 13:01:31.278788+00
6a993e0d-3922-4916-bf8b-9e3e2f07383f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EA8A636E089853403E192D5107653140	2026-09-13 13:01:33.292047+00
d92a6147-7e2d-4702-acc6-453f7e87bd23	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BAD8B4520898534008ECC5AB07653140	2026-09-13 13:01:36.229049+00
0aba5ea2-55e6-42f5-b721-f106643bfdd5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CCFE8A4608985340614B34ED07653140	2026-09-13 13:01:38.278158+00
425d9100-d5d8-4509-bbde-b5b7192b97f1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C6CB892C089853406DB1362108653140	2026-09-13 13:01:40.198611+00
fbb13773-4c54-45d7-ac09-dd7eafb529f5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D2A755F4079853401F14EF5B08653140	2026-09-13 13:01:44.232165+00
54dbd088-b662-4fdc-a1b8-1ecb512f3cd6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000E36D0D7079853405BFE8D8708653140	2026-09-13 13:01:47.280147+00
6c7cc220-2464-418a-b7f7-5e72e7c41751	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000611D22C90798534096E82CB308653140	2026-09-13 13:01:49.228334+00
42103886-6c3c-4c48-a592-49805da6f029	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A9E38CBC07985340FB5179E008653140	2026-09-13 13:01:52.303852+00
def948c6-4bb9-4ee3-a4e8-1cd5541ef0f4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000061E0B9F7F0975340BCDE477F79643140	2026-09-09 02:03:19.633986+00
d859f1ae-c2f4-46ac-9d92-a85c776c90eb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000913644CBF09753402D3E05C078643140	2026-09-09 02:03:21.216105+00
4ec45ffe-dfe6-4f7f-a69f-6dc1aa0cdc6e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A34511ADF0975340AB03C53478643140	2026-09-09 02:03:22.152588+00
d9cd87d6-bb09-4089-b556-7553783e3f66	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C67AB482F09753403A7C2D4377643140	2026-09-09 02:03:23.627717+00
b8a5ee9c-30f9-4400-9877-e5780261006c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000044CAAA63F09753404C778D4C76643140	2026-09-09 02:03:25.117734+00
d99893f5-b346-42e4-b9d2-d6c8fe70f439	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A3BBDA40F09753406B7CCB4175643140	2026-09-09 02:03:26.891067+00
9c1dcab8-1657-4026-b48c-9d90f4bdb968	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A9A9C024F09753405354A29174643140	2026-09-09 02:03:28.156306+00
7abd9f42-6672-4732-970e-e52bff90f4ce	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D3FA5B02F097534071B504CF73643140	2026-09-09 02:03:29.456108+00
eb2aa178-9adf-4ce6-8b60-3f09d64e199e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D39E37BAEF9753400D384BC972643140	2026-09-09 02:03:31.821666+00
c3ec5660-89cf-4ca2-92d6-269e15339d10	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000858EC29AEF9753401385F12E72643140	2026-09-09 02:03:33.105675+00
61ce7125-1671-440f-9f8b-8d00fd939243	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CD3D247CEF97534037EB426271643140	2026-09-09 02:03:34.427392+00
52f5d4e8-3e5d-48a8-b71e-f29678aa70fb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000262A6563EF9753403D38E9C770643140	2026-09-09 02:03:35.565971+00
d655d2c1-9775-4b0f-bca7-4dbebac4906e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006ED9C644EF97534073AD07DD6F643140	2026-09-09 02:03:37.219979+00
49315c5b-cbb8-473a-979d-e21f1927f049	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086048C2EEF975340F71B92FF6E643140	2026-09-09 02:03:38.693438+00
e1b1137b-8a75-45ec-9be6-549e13d6059a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AF55270CEF975340929ED8F96D643140	2026-09-09 02:03:40.191567+00
879340dc-0a9f-4d83-a28d-97a5a3e7b18b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006878B306EF9753408033E7CF6D643140	2026-09-09 02:03:40.541601+00
7f8d7766-fdc2-46e8-9286-5512a63824b8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000501FDCF8EE97534051F701486D643140	2026-09-09 02:03:41.147581+00
6bace9df-b08a-4b55-91be-5da9500d9204	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F4757E9EE9753406FB488CD6C643140	2026-09-09 02:03:41.84457+00
881d8ce6-2aa8-41dc-8753-53854fff5f53	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000032AA0CE3EE97534040D4C78D6C643140	2026-09-09 02:03:42.226093+00
b6ac9667-96a5-420f-9023-1257658f88e0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000091456CFEE9753402203D42F6C643140	2026-09-09 02:03:42.977159+00
453d74fe-ae0c-457d-850f-8de43fdb3cb2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007A596EC4EE975340DBB232D06B643140	2026-09-09 02:03:43.586267+00
cec52a6e-37d5-4684-a522-30a8f443f951	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000003E154B5EE975340ABD271906B643140	2026-09-09 02:03:44.190522+00
0698d22d-4dd7-4927-8da1-716d8437c361	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C108D0A5EE975340ED09B7216B643140	2026-09-09 02:03:44.861783+00
93bcfd61-a902-48b6-b96b-e2cc6a9c925d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001B0C1A9FEE97534094AA48E06A643140	2026-09-09 02:03:45.22387+00
dc9f419a-828c-44ad-9ec4-b3d3e9aa70d2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C7F6B589EE97534023DBF97E6A643140	2026-09-09 02:03:45.941251+00
1359952c-363e-4931-be4e-377a15ccea80	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C2DABD81EE975340BE71AD516A643140	2026-09-09 02:03:46.227151+00
4916c7d8-ad02-4f04-ab46-c2f50dd0bde9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C2C3B46FEE97534082870E266A643140	2026-09-09 02:03:46.717542+00
9745a83f-f5ee-42a7-b7ee-68a617506c6c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008C0C175EEE9753403B93910E6A643140	2026-09-09 02:03:47.181037+00
e95d4562-944b-4ff5-91b5-0245428c85de	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D9D77047EE97534059AC3CDC69643140	2026-09-09 02:03:47.825557+00
b09d6d1e-d60f-446e-a1d0-a05c7d7c9fd2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009E1BE43FEE975340413C5CBC69643140	2026-09-09 02:03:48.226386+00
bfd561b4-9c0e-44a0-b369-e7577c80724c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000625F5738EE975340F442F0AE69643140	2026-09-09 02:03:48.474442+00
256f6d74-a8bb-45d3-b7f1-c7bd92b69f60	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000039C9A024EE975340A04495AB69643140	2026-09-09 02:03:49.026944+00
8d794079-4483-46ea-bbac-1a15fcf91527	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000746E241AEE9753400B57AC8669643140	2026-09-09 02:03:49.601007+00
5e32048f-58da-4087-ae21-4ea99f192fdd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E59C33FDED9753408978904369643140	2026-09-09 02:03:50.208022+00
012986c6-a572-474d-835d-b295bc1ee759	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B6EA84E1ED9753402970575469643140	2026-09-09 02:03:50.982721+00
6c6527f5-73d3-4d96-8fd6-f9fea45dcada	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DA4D3ADBED9753402F75464A69643140	2026-09-09 02:03:51.221048+00
695252ef-c4aa-4bca-a841-54e5d4b1808e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CEFE40B9ED9753403BDB487E69643140	2026-09-09 02:03:52.183681+00
fdb60e02-3653-4251-a6a6-cd818f17d789	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000454948A4ED975340115C9B7C69643140	2026-09-09 02:03:52.842366+00
cb44548c-6b5d-4e26-9d8e-a6fbe8da96e5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000576F1E98ED97534094DE927769643140	2026-09-09 02:03:53.283148+00
f97d2f2b-44d5-4566-93aa-848d2c7b0568	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BC934F8FED975340BE5D407969643140	2026-09-09 02:03:53.452275+00
f8a73303-3fc6-423b-bb65-7a9b5c721012	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B6604E75ED975340655AF67F69643140	2026-09-09 02:03:54.206558+00
fe4ad669-8f97-4400-81d3-d469581e93c7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003FD12B54ED975340E8DCED7A69643140	2026-09-09 02:03:55.245532+00
eddcd4d2-3716-440b-b37e-d9ba16d802f8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E69FCF36ED9753403BDB487E69643140	2026-09-09 02:03:56.048105+00
74a5ceb3-9142-4e33-a1e8-56db59594de7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000010087426ED975340B253628D69643140	2026-09-09 02:03:56.566672+00
e055513d-9a1b-483b-934a-08b1e5f11040	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BCF20F11ED975340D0C831A369643140	2026-09-09 02:03:57.21049+00
70e87541-f647-4dde-868d-571f349ddeed	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B6BF0EF7EC975340E83812C369643140	2026-09-09 02:03:57.935657+00
f1e90056-1013-4792-8681-2e6e97d80668	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E643ABEEEC975340E23323CD69643140	2026-09-09 02:03:58.217007+00
b966c1ac-d9d4-4941-aecd-b793a8357d1b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002E0A16E2EC975340B2AF86D569643140	2026-09-09 02:03:58.554221+00
36b391a2-841d-4f25-be5e-24ad3e26a9e9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003914F4CDEC9753408830D9D369643140	2026-09-09 02:03:59.072332+00
fdc1a60a-2cc7-47ea-8b58-5cdb18e48bda	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000034E1F2B3EC975340822BEADD69643140	2026-09-09 02:03:59.816911+00
57d4bf3d-2bd3-48df-8056-78534af69b58	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001C881BA6EC975340CA1F67F569643140	2026-09-09 02:04:00.27066+00
a1b5edd8-26a1-41cc-b3c6-70adc3c3fb04	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007B794B83EC9753402984C42C6A643140	2026-09-09 02:04:01.376804+00
152134f1-f5e8-4278-ada8-df935d04711d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005F419AB1E89753402E2A98E777643140	2026-09-09 02:04:29.253798+00
27ceb1b2-bfd5-4ae8-91ce-c8d4e2e4761c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DD065A26E8975340ECAA9BE678643140	2026-09-09 02:04:30.253224+00
b28e65bc-16fd-45dc-b507-cf97e7b92c6a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007841E9B0E797534028DDF18178643140	2026-09-09 02:04:31.229254+00
836967ee-6221-41ef-8797-8f1514397435	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004ED944C1E7975340DAE3857478643140	2026-09-09 02:04:31.240765+00
972600d3-0ec3-46da-ac1d-816fe70bbc62	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F5BEF1B5E7975340934B2DA578643140	2026-09-09 02:04:32.030418+00
ad2b5b96-1ae1-4da9-b0a5-1b26f973d650	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008967BFA4E79753404552C19778643140	2026-09-09 02:04:32.268215+00
2594c3c1-f409-4cb7-b7ef-4a889a42e70c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000012EFA595E79753403F4DD2A178643140	2026-09-09 02:04:32.878428+00
9e486358-445a-47d2-818e-af7290b6474f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000955A947EE79753402D3E05C078643140	2026-09-09 02:04:33.426651+00
fbfc681a-5f93-400c-9142-111b40ac10dd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000016DAB59E7975340B0C0FCBA78643140	2026-09-09 02:04:34.28852+00
dcbf0435-3d09-4280-bbe0-38eb4b7fc0fd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001F9D5F39E7975340B6C5EBB078643140	2026-09-09 02:04:35.078994+00
08e146a5-570c-4b82-9ee8-32d746e0a53a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A80D3D18E797534045F69C4F78643140	2026-09-09 02:04:35.697593+00
8a29db8c-99c5-4e89-982c-867397f0d364	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DD96C805E7975340A5FED53E78643140	2026-09-09 02:04:36.153553+00
76182fb2-ae7e-4a8a-9a68-9b7af672c30d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B4E908E0E6975340F23FF9BB77643140	2026-09-09 02:04:36.883152+00
39a6fac3-46f1-42ad-98ff-80f58af41475	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000001B562C9E69753405EF6EB4E77643140	2026-09-09 02:04:37.252492+00
37f9520c-7e68-4027-9a9b-ae70e6b2e937	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000DA837A3E69753408214861277643140	2026-09-09 02:04:38.741593+00
5b8cbb39-1980-42eb-8b8b-3f3dac5e8d75	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004F3BA17CE6975340527C7C4276643140	2026-09-09 02:04:38.74974+00
52bc026b-95ad-4e90-a6ea-daf822b72c75	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000013680B63E69753401736B9CE75643140	2026-09-09 02:04:39.273899+00
06c40098-f156-407f-ae9a-b12a08ee8bf0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000049F19650E6975340056FA35C75643140	2026-09-09 02:04:39.540949+00
16818b44-6b39-4de9-b996-a7dd356451b4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000905BDDFBE5975340F373435376643140	2026-09-09 02:04:39.789978+00
911ab715-03ef-46c3-adb1-90dcfb7a2428	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000310E89D6E5975340114537B176643140	2026-09-09 02:04:40.205004+00
c7f7fb60-f4aa-4789-b586-c800eadf3c0b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002BDB87BCE597534011A15BF976643140	2026-09-09 02:04:40.590205+00
06a71eb2-ffd5-4bfa-9f78-4ed072dc1a2f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AE4676A5E5975340937F773C77643140	2026-09-09 02:04:41.132092+00
40694b5c-5606-49c9-8064-a1eab7defd49	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BA505491E597534058F1FC5877643140	2026-09-09 02:04:41.840756+00
f5412729-399a-42ab-a7e1-35ce57dff2a7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000833B78CE597534010FD7F4177643140	2026-09-09 02:04:42.240818+00
41225130-4db6-4368-b39f-8c37c124d564	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008B9EA575E597534058F1FC5877643140	2026-09-09 02:04:43.124452+00
37532af4-aa66-40ed-baa5-5bca7395ac11	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000E219D70E59753405895D81077643140	2026-09-09 02:04:43.613066+00
ca0ebd54-84a0-4e59-afc7-ec73bc88229d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001F477364E5975340462AE7E676643140	2026-09-09 02:04:44.242179+00
1ae964b2-e08c-40e4-b32b-febb70deb555	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003D8E3056E597534022B028DB76643140	2026-09-09 02:04:44.8639+00
ed6bd7f3-bd92-4cb8-a33c-3015f3b4bf25	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000061F1E54FE59753408EC23FB676643140	2026-09-09 02:04:45.273766+00
9646cde2-d1b6-403d-a8e4-ffb8eba60718	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000031564046E597534040C9D3A876643140	2026-09-09 02:04:45.533833+00
4dc52fa8-33df-4a23-9aa8-083efef88ec4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E42EC214E59753407095271076643140	2026-09-09 02:04:47.200615+00
f1471fd3-b1be-476f-b011-bb414d665083	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000085402E71E49753405F16C90D75643140	2026-09-09 02:04:59.022068+00
6e79a3f1-f6d9-461f-9bb0-45b358e55e41	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001A03A1ABE39753408170AA5A77643140	2026-09-09 02:05:00.160829+00
051e40ed-455e-40cf-86ea-f148cc05591d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A933524AE39753406F2D93E178643140	2026-09-09 02:05:01.482206+00
8c9f3146-7996-4fc6-b8bb-5cecff5b0347	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000804177EEE2975340274D83A279643140	2026-09-09 02:05:03.238306+00
e781827f-8c22-4293-87a0-5920efe6edfa	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AA4DF795E29753402D66DF707A643140	2026-09-09 02:05:05.133773+00
bf2cb4d9-b7ec-420c-80b6-cac58d2e6509	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003379B93EE2975340D3D226987B643140	2026-09-09 02:05:07.031183+00
e74ed720-5020-4a62-ab4d-49083e98ae31	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009225CEE5E1975340E451859A7C643140	2026-09-09 02:05:08.828586+00
a311a297-69ab-44ea-bf7a-be4ffdd79bd2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007B87DBA1E1975340EA6AE1687D643140	2026-09-09 02:05:13.952496+00
7f802612-8050-4792-8b86-7f056945dba5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000093B2A08BE197534066A032FE7D643140	2026-09-09 02:05:15.472047+00
43880f6e-6b63-4dff-935c-a2b307f752a1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000051AC0958E1975340F54075BD7E643140	2026-09-09 02:05:16.429222+00
11a2a156-7816-4a29-9800-17ceb4705c64	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002EED2F16E197534059BE2EC37F643140	2026-09-09 02:05:18.219952+00
5098589a-9eba-4293-b009-2950a460c539	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000100533A6E0975340C440D7BE80643140	2026-09-09 02:05:19.499117+00
f2dd7485-177c-4ee5-984e-8f2f9e4ac293	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000870A1F5BE09753405EFF644282643140	2026-09-09 02:05:21.581242+00
60067bf7-7a9b-4865-a740-606218e09a20	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004A9C700A8697534067B5C01E13633140	2026-09-09 02:34:43.223957+00
23623934-ed3f-4be4-9fee-d3c54b3abeb0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D351691F86975340B50A517413633140	2026-09-09 02:34:45.231485+00
c1726d0d-7672-4c84-89cb-82534d6f06fd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F25FF3886975340BA6B64B213633140	2026-09-09 02:34:47.195536+00
5cef9587-0d81-433c-a2bc-6af87d1d94f5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000056A64EF6859753409190926813633140	2026-09-09 02:34:48.195537+00
48ddc703-4891-4297-a1fb-f77b90b64f15	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A44396BB85975340D223FC4113633140	2026-09-09 02:34:50.224707+00
6892e285-b822-4ad0-9279-155d4223e2de	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005C7D2BC885975340E4EA11B413633140	2026-09-09 02:34:52.22281+00
e1e36b6a-27a8-4f36-9be0-e4d3796f3975	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D30C4EE985975340EA4B25F213633140	2026-09-09 02:34:54.687654+00
fb1e4deb-15a9-4e1b-a568-269312894c0d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002A430BBF0A985340D4F59F90F8643140	2026-09-13 13:00:33.287181+00
a2136b46-510a-4b90-a5cc-c5f7cd88f993	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CB0CC0AB0A9853408D5D47C1F8643140	2026-09-13 13:00:35.940597+00
9491d4f9-cb68-4cc2-8440-f0e8fea5d570	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000301AE8900A985340C242F7F6F8643140	2026-09-13 13:00:38.230889+00
743f61d8-ebf0-4e18-91b1-99a9f7d0b247	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B9E985F1099853409D741195FC643140	2026-09-13 13:00:41.239053+00
5b5e0fe1-4ef0-494f-8797-19974cff51fb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006605D03909985340B2B8A40F02653140	2026-09-13 13:01:00.118607+00
5ce51626-56f8-436c-bc12-5d6bc777685f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BA62EBBE08985340756671B504653140	2026-09-13 13:01:00.144507+00
22d21859-4447-4289-af0d-97415df591b9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000136635B8089853406357A4D304653140	2026-09-13 13:01:01.223398+00
b9cc6abd-4a7e-40c3-b87d-1ca42c1b0c32	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000D4A3DB008985340F8448DF804653140	2026-09-13 13:01:05.519181+00
2e867819-3c9e-4505-adc5-ec7fff87a7a6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000674D87A908985340AAA7453305653140	2026-09-13 13:01:07.273644+00
04ce9646-300d-49d1-9f2e-aee115935433	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C050D1A208985340DF8CF56805653140	2026-09-13 13:01:10.218959+00
0207bd39-6168-4951-a59e-718f6f1afd83	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A2F20A9F08985340BC6E5BA505653140	2026-09-13 13:01:12.26729+00
e5afab8a-5ad8-41a4-ae2b-95fdbfed12a1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002575029A08985340A45A9FCD05653140	2026-09-13 13:01:15.244983+00
6978b234-35a1-42eb-b77f-94034fb56064	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000090B52B99089853407432271E06653140	2026-09-13 13:01:18.244861+00
08205a49-40f3-449c-91c9-4d12c22ae5ee	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EAB8759208985340AF78EA9106653140	2026-09-13 13:01:25.270615+00
2e3ad5ea-0e68-4896-9345-691951756eff	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001338239408985340C7E8CAB106653140	2026-09-13 13:01:27.235534+00
0ff9b837-7075-4b25-ae59-07936b0e5216	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000133823940898534008D858D306653140	2026-09-13 13:01:30.248463+00
26fb84eb-bbd3-4fd9-86b4-8a30dfa5745c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001F42018008985340022F8E2507653140	2026-09-13 13:01:32.24444+00
3e170759-c605-449b-9c28-446f757a22aa	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FCB03962089853402605717907653140	2026-09-13 13:01:35.268556+00
538cf633-d91e-4670-b8bf-b8732ecf7563	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000559D7A4908985340F6DCF8C907653140	2026-09-13 13:01:37.509372+00
fbaab974-3979-4910-a1dd-4cead30055ef	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002B07C43508985340CCB96F1008653140	2026-09-13 13:01:39.175074+00
19ef1d7e-e612-4df0-b3d1-581dc34344a9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D8DA560E08985340FC99305008653140	2026-09-13 13:01:43.188024+00
a31140c8-011f-4449-bb28-64a746fdbf9b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001A6EC0E707985340130A117008653140	2026-09-13 13:01:46.214041+00
a5c3cbc2-9693-41e5-9f2a-87ffc117f0f0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000049DB53CD079853409CED1BA908653140	2026-09-13 13:01:48.74251+00
95cb686d-2632-4eff-9575-02375aac9e09	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F0C000C2079853408ADE4EC708653140	2026-09-13 13:01:51.21336+00
3e95c7e9-ece0-41f4-bb55-96cc20ac41a1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000313F3734E5975340E7C589AF76643140	2026-09-09 02:04:46.216905+00
87260f68-78ee-47db-848c-7a069de61bfd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A972350DE5975340DBA73EEB75643140	2026-09-09 02:04:47.459089+00
1c704a39-a2d0-456a-bbd0-7efb3e87b248	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000858549A7E4975340E2E0777874643140	2026-09-09 02:04:57.137404+00
95785861-6cb8-4cf5-a997-cd49dac08a48	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F0F384CAE4975340954330B374643140	2026-09-09 02:04:57.668285+00
d1cbb5b9-1abc-4028-a431-65fe14fd9cd9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000073A72A23E49753406B7CCB4175643140	2026-09-09 02:04:59.182857+00
2dc34788-0b32-4fe3-8242-8a8a6d83a9a5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006253420BE4975340E2F4E45075643140	2026-09-09 02:04:59.48879+00
9aa98066-5176-47fb-af93-005fbadc3447	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000096A9D5DE3975340E04499B278643140	2026-09-09 02:05:01.23344+00
7730b5ae-2579-498d-8f5b-7a5b366038bc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A4D23E0CE3975340CEED146179643140	2026-09-09 02:05:02.60257+00
08aa3225-2899-4885-894c-0bf8efc4dbcd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5208DAFE29753407A0327367A643140	2026-09-09 02:05:04.497642+00
de0e5b3d-89ac-4116-9e8c-2853a4e55bf1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000068476062E2975340140A6C297B643140	2026-09-09 02:05:06.514866+00
065f44d2-32fd-4908-9a24-b026668f20fe	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F8771101E2975340617369577C643140	2026-09-09 02:05:08.219381+00
fe4440fe-6005-41d9-8478-64b113b2b4f5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001563AAAAE19753401F98480E7D643140	2026-09-09 02:05:09.732236+00
ad7d570b-33e7-4aaf-8243-8f93252dfb63	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BC1A457BE19753408A62A8797D643140	2026-09-09 02:05:12.673765+00
be529c37-c6f9-4fa8-ae10-bed8dc9ddc48	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AA0B7899E19753403D693C6C7D643140	2026-09-09 02:05:13.404455+00
471e0468-5ee3-4918-bf07-a358fa33b92b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009EEA909BE1975340DDBC27C57D643140	2026-09-09 02:05:14.650689+00
9e4a0755-e728-4084-ba55-33b5c0404ac1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000016078662E1975340B956D6917E643140	2026-09-09 02:05:16.232155+00
29493f09-82a9-4601-919c-abc3c42018a7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006FC5B425E19753407DDCC8867F643140	2026-09-09 02:05:18.032555+00
0eb234c8-42ac-479d-af01-63844941b640	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FEF565C4E0975340B279C14C80643140	2026-09-09 02:05:19.023051+00
d38e2fa4-86b1-4a62-80e1-024b2fce4670	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C3DDB474E0975340523D3EC681643140	2026-09-09 02:05:21.012559+00
6ca368fb-6afb-4b20-b134-6ea51368de31	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001DA21BABDE955340924726964A643140	2026-09-12 07:29:23.849587+00
922dcf5e-0ae9-41e5-96cb-854f14837413	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000E08BEB307985340903F620509653140	2026-09-13 13:01:53.833336+00
8fb9d604-7c06-4c9e-bbe7-06a55f8b43fb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007931DEA00798534037983C5409653140	2026-09-13 13:01:56.221596+00
0f175149-61cf-41ae-833b-ee4f27a5c08c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000974A896E07985340AD24C33B0A653140	2026-09-13 13:01:59.249716+00
97a1ed67-4096-47fc-8352-0df026dcdccd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000020D26F5F07985340D7FF94850A653140	2026-09-13 13:02:00.223355+00
e40a95d7-90dd-4f84-b0ed-5e7a1aec7d7f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000149A7F4F07985340C54CECEB0A653140	2026-09-13 13:02:01.937422+00
eb7fac83-bffb-4b21-a2d5-c398e42b657b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FC12961D07985340E2D528DA0B653140	2026-09-13 13:02:03.239854+00
0ecf9332-cbab-4686-8144-8f50344082e0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FCE483F90698534047F7BD970C653140	2026-09-13 13:02:05.068971+00
f60b9a09-272d-4fd2-93ce-3ee7decf5ac3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FD9F68C3069853406A85E97B0D653140	2026-09-13 13:02:07.278377+00
1c9e2454-1393-4ea8-9c6b-b9a2ccc9158a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009D52149E0698534022A5D93C0E653140	2026-09-13 13:02:10.3734+00
f0e0659e-2142-4604-9659-2e3719d44f54	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004438C19206985340C3F8C4950E653140	2026-09-13 13:02:12.300907+00
a6174b46-edbf-4df3-aae2-c15f1cf67940	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000020BE028706985340225D22CD0E653140	2026-09-13 13:02:14.777848+00
7a2d4143-3cbb-4fbe-858a-21d46af150bd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CDBFA78306985340AB402D060F653140	2026-09-13 13:02:16.32294+00
eb41355f-0698-481f-b988-13d9da315d0b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AF61E17F069853405842D2020F653140	2026-09-13 13:02:18.240532+00
916a6525-0bce-436f-ba9a-e4253890120d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086E2337E06985340A53B3E100F653140	2026-09-13 13:02:20.161842+00
6f11bf29-b3c8-44ec-8cbb-42bcc36129cb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AF61E17F069853401CB4571F0F653140	2026-09-13 13:02:22.219527+00
de531709-03e3-4e33-9703-055c6adc8f4b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EA4ABA1CE5975340C3EFA65B76643140	2026-09-09 02:04:46.937387+00
1e54355b-37e2-4d21-a9a8-7e2b91f02af6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000073BB97FBE4975340EDB60BCD75643140	2026-09-09 02:04:48.050994+00
2e032b1c-b492-4227-a230-8d38cfb953b2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000079A97DDFE4975340893952C774643140	2026-09-09 02:04:58.380531+00
6b6b633c-1094-4cec-81e5-ce018b1c5ced	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006E2F0ED3E39753407C574E8C76643140	2026-09-09 02:04:59.682822+00
011bba1d-2ded-4b83-be9c-5b552ae78b1c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000026DF6C73E39753403FF1AD5978643140	2026-09-09 02:05:01.107812+00
f230c8cb-729d-4cd2-a770-e37ffd801333	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086A28A2CE3975340758EA61F79643140	2026-09-09 02:05:02.127336+00
616d8c8d-82d1-4f67-aa42-ca3cddd92408	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007AF76CC2E2975340159ADA087A643140	2026-09-09 02:05:04.221417+00
2d54f3fc-e5ac-46ec-836b-457e028f7b97	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086BC2F78E29753401AB336D77A643140	2026-09-09 02:05:05.724575+00
0fe7def2-932f-4bc3-933b-2dd03f093271	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E668441FE2975340141ED9017C643140	2026-09-09 02:05:07.64798+00
3c5a8825-2fa1-46fb-8759-a2f69cdcbaa5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000157AB3BCE19753408BAA5FE97C643140	2026-09-09 02:05:09.226049+00
afbe8697-a379-46d7-8570-f18f1dde060b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001B6899A0E1975340CC51369B7D643140	2026-09-09 02:05:14.544865+00
86aaa19a-1e46-4bbd-a667-f3c9206a2d22	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000057DF0A72E197534060F767507E643140	2026-09-09 02:05:15.872623+00
8d51b1a8-46f5-485f-a233-de389b1849de	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002E1B423AE19753402A82493B7F643140	2026-09-09 02:05:17.259792+00
84bc766c-1d99-4784-af74-c3ba28232c1d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F80780E0E0975340DC9C4A0680643140	2026-09-09 02:05:18.486035+00
3f1e6dfd-0d5d-4ec7-afc0-ffebcfcb1298	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FEB04A8EE09753405385F53581643140	2026-09-09 02:05:20.274094+00
eb8fcb8b-fbb8-4dc3-81a1-ea77d83c5f39	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009314FD46E097534082D5479682643140	2026-09-09 02:05:23.157997+00
75c297c7-e1b9-4f50-9896-d4c6a45dab57	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006A3D320C8E975340A1D1C20A5C633140	2026-09-09 02:21:09.27332+00
140f7097-f613-412a-93b6-fd39769298fc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000414EF3E98C975340B010678F61633140	2026-09-09 02:21:10.205862+00
eba8a9d0-c6d4-4910-8a81-bef226c78ce6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B220DE848C975340CA8CB7955E633140	2026-09-09 02:21:11.214976+00
6dc3394e-397b-4f0d-9a96-d539b3c8cf23	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D095AD9A8C975340CBAC94545C633140	2026-09-09 02:21:12.224899+00
ebbfc856-d208-428c-b093-ddae14d795aa	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006B2C616D8C975340A77A8DB85B633140	2026-09-09 02:21:13.228672+00
97849fc9-9539-49d0-9a40-c76177cefaca	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B825CD7A8C9753407295DD825B633140	2026-09-09 02:21:13.532235+00
1fa07564-06c5-4c5f-97a1-3c3c44f9ca57	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000177321A08C975340B328475C5B633140	2026-09-09 02:21:15.253145+00
64fd302e-bbe2-4d9d-8512-db20502ae6a8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EE2186C28C975340BABDA4315A633140	2026-09-09 02:21:16.206363+00
3d844cd8-9690-4ae3-93ec-4a36ba07e0c2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006B9F8EC78C97534037DF88EE59633140	2026-09-09 02:21:16.64557+00
93377fd9-6585-4978-acce-a392ad75c9f9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E217A8D68C975340A2F19FC959633140	2026-09-09 02:21:17.211988+00
4555081f-e87d-4274-9b50-7da81e09cbd2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E217A8D68C975340DE7F1AAD59633140	2026-09-09 02:21:18.205501+00
d32aa78b-e03a-4997-a72b-91745af74591	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000076D77ED78C9753402013848659633140	2026-09-09 02:21:18.522282+00
bcf71c31-dafc-4e30-a61a-056852624272	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000017B83CD68C975340AF9F596D59633140	2026-09-09 02:21:19.233122+00
51fab448-be59-44fe-87a3-e59d9e024971	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EE388FD48C975340EA2DD45059633140	2026-09-09 02:21:19.899099+00
ebbfe7ab-e9ec-41b9-afd2-7e52124334a7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009A3A34D18C975340C6B3154559633140	2026-09-09 02:21:20.213276+00
0aa57ee6-1177-4d22-9601-a5bbc93225f5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006B9F8EC78C9753403ED00A0C59633140	2026-09-09 02:21:21.024442+00
a6a3d1e0-8957-448b-bc23-5138bdc21468	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001DA622BA8C975340E4709CCA58633140	2026-09-09 02:21:21.781474+00
b6636c67-5890-4852-8312-e47b3d2f1a09	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000077A96CB38C975340B590DB8A58633140	2026-09-09 02:21:22.197494+00
25fa6098-17ed-44f6-a429-bff7b888fec6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000470EC7A98C9753406E403A2B58633140	2026-09-09 02:21:22.976551+00
439d1cbf-09e6-4517-9b43-f65c5b51e08b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000088CF42A78C97534086F8D1BA57633140	2026-09-09 02:21:23.528243+00
642e1c03-e889-4c86-a35c-6dd862128c90	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007CAE5BA98C975340AABA473657633140	2026-09-09 02:21:24.222631+00
22c8eea5-9902-4fac-9b83-b6ef8771402c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000718D74AB8C9753403FF0E7CA56633140	2026-09-09 02:21:24.781831+00
ce480ca1-d42c-4996-82fb-3a839c3a4174	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002FCCF8AD8C975340F29A577556633140	2026-09-09 02:21:25.226077+00
331cf6f8-de1d-44d9-97f2-55a7863fe2db	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A62D09AB8C975340ECDD1FEF55633140	2026-09-09 02:21:26.06344+00
a85029e2-fcd1-43a7-b723-548b6a5a635c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005F5095A58C9753403A1F436C55633140	2026-09-09 02:21:26.771243+00
d44d315e-fc54-4ed6-8652-ec51b789d7a5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FF3053A48C97534099CB571355633140	2026-09-09 02:21:27.213579+00
2d3af9a1-a834-4620-9830-b25b6b7ba0d6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B237E7968C9753409F7422C154633140	2026-09-09 02:21:27.549458+00
a5f5c3be-ea7b-4ff9-a393-dda3ce259991	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D07EA4888C975340DBA6785C54633140	2026-09-09 02:21:27.961418+00
aae7f8de-b62d-4d84-a54a-3cc266ac6cc7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002982EE818C975340344E9E0D54633140	2026-09-09 02:21:28.196094+00
0405e4c6-627e-4f95-b666-75bfc36f6a80	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002F87DD778C9753407080F4A853633140	2026-09-09 02:21:28.714419+00
2933a626-a3b1-418d-bb45-e37ae3a9dcf2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000053EA92718C97534011C0722953633140	2026-09-09 02:21:29.22522+00
c9da1209-18c8-49b6-aba3-c16a744bac5d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C42FAB668C975340418CC69052633140	2026-09-09 02:21:29.962796+00
d0bb3390-8e37-49f8-b616-50adce579398	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000011120E628C9753404130A24852633140	2026-09-09 02:21:30.20644+00
e64c6044-2e2f-4bd5-bdfe-c2dacff4a1d6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004196AA598C9753401250E10852633140	2026-09-09 02:21:30.519078+00
139e27c2-caa6-424e-939a-7d539cde9f1e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000479B994F8C975340F47EEDAA51633140	2026-09-09 02:21:31.117028+00
be5f896f-355a-411f-b0df-4fcaac77b61a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000CDF0C488C975340BF3D192D51633140	2026-09-09 02:21:31.807244+00
370b81dc-b5f0-43c6-badc-fcbd3f063a5e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001700F4458C9753406BE399E150633140	2026-09-09 02:21:32.217296+00
0c427f1f-2ec2-4833-beff-1634371982d0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000077082D358C9753406626625B50633140	2026-09-09 02:21:33.137489+00
1a2e0789-3132-43d6-8227-fc4be0fa2bf0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B8C9A8328C9753401FD6C0FB4F633140	2026-09-09 02:21:33.680567+00
7ed3c2eb-f7c5-4ccd-8c07-ac2a1f85b29b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008F4AFB308C9753407E82D5A24F633140	2026-09-09 02:21:34.217323+00
8299f0b9-90e3-4fc0-b11e-fdd210344a0a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000006AC0B2E8C975340439836774F633140	2026-09-09 02:21:34.432167+00
70c3c69f-74f9-48ae-b159-9b0ea4fc5006	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000290FC1278C9753400D5762F94E633140	2026-09-09 02:21:35.221688+00
bd0215dd-ca1a-4561-9bc9-eaf204812816	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000083120B218C975340B4F7F3B74E633140	2026-09-09 02:21:35.613527+00
c01f7747-22aa-446d-9b6f-efa0bf054083	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000047567E198C97534073AC414E4E633140	2026-09-09 02:21:36.177579+00
c4936339-5077-4a3d-90cf-b1888d13c447	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000000790A148C97534049D16F044E633140	2026-09-09 02:21:36.668638+00
e2c820b8-3b29-4f4f-881a-d48e6bdd7689	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004D5B6D0F8C975340BAE875D54D633140	2026-09-09 02:21:36.892771+00
3f9fe258-9cf0-492a-b9fb-087cb81c260f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D0DD640A8C975340910DA48B4D633140	2026-09-09 02:21:37.216325+00
97b394b1-cba5-4f98-a7b2-3fa20dd5a850	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F4401A048C975340C1351C3B4D633140	2026-09-09 02:21:37.640496+00
8f6c181e-7642-4f8f-a7e1-f9d3c5154ba8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000024C5B6FB8B97534020E230E24C633140	2026-09-09 02:21:38.201984+00
06e4f5b0-bddd-457c-a9ad-d03b5ff5209b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001EA9BEF38B975340202AE8514C633140	2026-09-09 02:21:38.928928+00
22abe1fe-3d66-4faf-a97c-329de3312ec8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007DC800F58B97534074CC1E0D4C633140	2026-09-09 02:21:39.20167+00
3f0f2dad-99ef-477e-afa7-e126dc44db36	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005F6A3AF18B975340509A17714B633140	2026-09-09 02:21:40.148089+00
f2b0e81f-c302-450b-bffa-6ec3d5d3a2d3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002ACAA5F18B9753408CCC6D0C4B633140	2026-09-09 02:21:40.691166+00
871e14ff-bba7-4527-a303-5bf53d0c49ff	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000089E9E7F28B9753409E7F16A64A633140	2026-09-09 02:21:41.273398+00
1bada38d-daa6-41d8-af04-dfb7ba9a6c8f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A12BB6EE8B97534093BDEF294A633140	2026-09-09 02:21:41.971752+00
0b4515e5-9987-4243-b51b-8689bfe8dcf7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000950ACFF08B9753400ADAE4F049633140	2026-09-09 02:21:42.193086+00
f219f510-42e5-47f9-9122-cbac3cebac9c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000077AC08ED8B97534040074C9649633140	2026-09-09 02:21:42.726051+00
dd9ab474-10f0-4761-8870-c640e4e39d9b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000C6CDFED8B9753406F2FC44549633140	2026-09-09 02:21:43.21642+00
a806e2b8-b864-4bee-9b23-23c6493443e9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EE0D19EA8B97534087E75BD548633140	2026-09-09 02:21:43.899954+00
515e5bdb-f080-4e95-afa4-22234c7062d7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000083CDEFEA8B975340AB05F69848633140	2026-09-09 02:21:44.21416+00
11f1d3c0-41f7-43b5-880e-7aa90b482df5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000024AEADE98B9753401C1DFC6948633140	2026-09-09 02:21:44.457178+00
d0712d37-1318-4db5-a8f3-8dfd6533001c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FA2E00E88B97534040DF71E547633140	2026-09-09 02:21:45.197884+00
7570a169-1344-4983-8a13-f23bf71768f5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A730A5E48B9753404D8D2B8947633140	2026-09-09 02:21:45.723562+00
141ceb5c-2430-47aa-a30c-0d24656e25a5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A7199CD28B975340DCBDDC2747633140	2026-09-09 02:21:46.19905+00
1c1db057-994f-46e8-9277-7fc9108f1f5b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002A9C93CD8B975340ACDD1BE846633140	2026-09-09 02:21:46.32622+00
a1cefea1-531a-4d52-bde4-4eabeb577985	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000777EF6C88B9753404113BC7C46633140	2026-09-09 02:21:46.915431+00
9aa1bae3-f7df-44bb-a6e6-aa0a38b934cd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AD1E8BC88B975340D690138145633140	2026-09-09 02:21:48.137206+00
d7190db3-8602-4385-b5ee-f57274ad50ab	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003BD972D38B97534096D5CFF643633140	2026-09-09 02:21:50.056973+00
ddc65088-bd0c-4b35-b355-5a1d98ce0863	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000125AC5D18B975340C6E9DACD42633140	2026-09-09 02:21:51.805787+00
fec75905-e370-4cca-897e-d44fb2dc7d4e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000593739D78B975340CCDA5CEB41633140	2026-09-09 02:21:53.084733+00
bb1ae1ce-0a53-43d9-b14d-a1950f3a6dd9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D6B441DC8B9753401503249A40633140	2026-09-09 02:21:54.982779+00
3cb566aa-9d0c-40b6-9c24-e0808814820d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003BC269C18B9753407AA0BA5E3F633140	2026-09-09 02:21:56.15735+00
3f3541e8-3843-4c7f-8436-12cb35c16721	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000047E350BF8B975340510DA0843E633140	2026-09-09 02:21:57.4402+00
e594c4e6-c8e6-4ec4-bb2b-6eda00e0a1eb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000530438BD8B975340F2F0F9BC3D633140	2026-09-09 02:21:58.666794+00
f46f7da0-0450-499e-9f53-7afd7ca23586	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000089A4CCBC8B975340CF62CED83C633140	2026-09-09 02:22:00.196969+00
3229e915-5c9c-4fd8-87d0-f12545f2ab2d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000308A79B18B975340234DBC033C633140	2026-09-09 02:22:01.665171+00
64b52f77-6661-4949-a611-ba3763b51b63	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A7EB89AE8B975340A6BB46263B633140	2026-09-09 02:22:03.202573+00
f65e29e8-22f1-45fc-a3f8-d68fe07d9589	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002A6E81A98B97534077C7180E3A633140	2026-09-09 02:22:04.829178+00
9ebc55f9-cecd-42aa-b184-6cc5a8612a5e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BE2D58AA8B975340482F0F3E39633140	2026-09-09 02:22:06.005045+00
68a3a144-e549-472b-8cbe-9a0584942688	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000047CC47AD8B9753409057D6EC37633140	2026-09-09 02:22:07.960319+00
935925df-fdf7-40d0-8008-d6cfe1572dea	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B30C71AC8B975340AEB8382A37633140	2026-09-09 02:22:09.114044+00
8a353bcb-ac4c-491c-bd63-918e3fd9c598	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006B2FFDA68B9753406D5919E835633140	2026-09-09 02:22:10.966464+00
58b27eab-22ba-4b52-aa94-5c12f995098f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000245289A18B975340D9B3E73235633140	2026-09-09 02:22:12.197932+00
b42e3027-24df-4e39-827b-35fe031f6e08	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B9E34D7E8B975340096CCEC133633140	2026-09-09 02:22:13.935798+00
d3d8664f-e838-436e-bf54-83a493ecbfb9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C5ED2B6A8B97534027CD30FF32633140	2026-09-09 02:22:15.201634+00
8f5de5e0-6ef4-4175-a3bb-2304eaa136ab	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D1F709568B975340E6255A4D32633140	2026-09-09 02:22:16.551146+00
66009908-7344-4f7f-8a25-6d9633f11285	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D1E000448B9753404C1F155A31633140	2026-09-09 02:22:18.21198+00
605baeb3-b2bd-4d1f-bddb-487618ab1744	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A74A4A308B9753401726F84B30633140	2026-09-09 02:22:20.125173+00
a8e1b049-1ba9-410d-a54c-caa07739a242	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000036EE28298B975340771AC4622F633140	2026-09-09 02:22:22.043742+00
d5cc1d14-77f3-4b1b-9c80-3f004fddd9fd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000004E94298B9753404ECF60F82D633140	2026-09-09 02:22:24.001857+00
e347af52-e3b3-43e5-96bd-ac9c9aa6ae1b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000036EE28298B975340A7BE3D192D633140	2026-09-09 02:22:25.763366+00
304d1ab7-60c4-4f92-9b8c-8f3c76978b62	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006B8EBD288B975340B410D3742C633140	2026-09-09 02:22:27.095289+00
94b9f4fe-8fc4-4377-8d14-c6ede26ddd7a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000420F10278B9753407912C7702B633140	2026-09-09 02:22:28.92875+00
c9fa95e0-d1f2-43a6-9855-9adb116e047c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B97020248B975340971705662A633140	2026-09-09 02:22:30.812886+00
9f36004b-7d13-499e-af3d-e92f3bcca7e2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003CF3171F8B97534032F66FA829633140	2026-09-09 02:22:32.007427+00
d91e23ba-d4fd-4d15-b5b1-130c185607c0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000089BE71088B9753402720DC5328633140	2026-09-09 02:22:33.883988+00
064f7fde-bc11-45bd-a90a-d578c23773a4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D184DCFB8A975340397760A527633140	2026-09-09 02:22:35.125006+00
e3fb75c5-059f-47ca-96c6-067a2692ba7b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DDA5C3F98A97534057D8C2E226633140	2026-09-09 02:22:36.514029+00
99ab00a1-b06f-4c00-bae2-d2d890dc87dd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A7052FFA8A975340ABC2B00D26633140	2026-09-09 02:22:38.202571+00
66838e10-c324-43e4-86c1-5345fdc50e16	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006644B3FC8A9753401D226E4E25633140	2026-09-09 02:22:39.580231+00
89412a9c-900d-4191-972d-28ee6117bd36	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001758117FDE955340DE99BFF858643140	2026-09-12 07:29:29.375741+00
bef9e3f3-c0fe-4b3e-abd1-5f6847a0f562	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005FF0694EDE955340DD4598A25C643140	2026-09-12 07:29:31.2416+00
a236ab0e-8577-49e3-9e73-d98588feb5cf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000231DD434DE95534071A312E85D643140	2026-09-12 07:29:31.758357+00
df990695-4a20-4178-b961-a1d2927ed47b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001D18E53EDE955340D668835D5E643140	2026-09-12 07:29:32.265913+00
afe68c4f-e2f7-4cd0-a338-b17207558ac3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B2D7BB3FDE9553408E18E2FD5D643140	2026-09-12 07:29:32.87972+00
f76f4828-2c57-4553-a736-235ab0c61b4a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B21CD775DE955340B83B6BB75D643140	2026-09-12 07:29:33.250121+00
7afde3cb-3e6d-428b-8e33-f21f628e5cc4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000044A852B307985340E43DBD0809653140	2026-09-13 13:01:54.24998+00
456026b5-f067-471b-8bf6-b0aeb2131418	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CC18309207985340137AA29009653140	2026-09-13 13:01:57.25269+00
2a6b99d6-fa0a-4504-8c18-6d84c9b7ebd5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CDEA1D6E07985340D7A3703D0A653140	2026-09-13 13:01:59.53825+00
12bfa6f1-9ef5-464a-bad7-62364f668439	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008B12995E079853402AFEEF880A653140	2026-09-13 13:02:00.609544+00
6082a77b-b923-42cb-9c80-33ec517e57f4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C19B244C07985340E3C1BB010B653140	2026-09-13 13:02:02.258181+00
5526dc21-9542-4e48-b6d9-08278e5baea8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C7FFD3C3069853406480FA850D653140	2026-09-13 13:02:06.254997+00
ccce6177-8d9d-4b21-8f43-02d229ebf9aa	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000091312DA0069853402EAFB7280E653140	2026-09-13 13:02:09.283566+00
f7299074-dd7d-4395-a5a3-ee1897718686	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000014B4249B06985340588A89720E653140	2026-09-13 13:02:11.249685+00
c1dbfbfe-c3f8-4441-8d26-e8c35e8eeca9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003E1CC98A06985340286211C30E653140	2026-09-13 13:02:14.224718+00
ad6b9c2f-fa24-484a-85fd-d88671fbcff7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C19EC0850698534034C813F70E653140	2026-09-13 13:02:15.749811+00
c2c23fed-cb2c-4439-af5f-b857a9cbdf2e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086E2337E06985340D5BFDA070F653140	2026-09-13 13:02:19.913127+00
018e0743-f599-43f1-bcaa-f8ae9f7073b3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086E2337E06985340A53B3E100F653140	2026-09-13 13:02:22.073375+00
90dd1ac1-04bc-442f-a7ee-c22d657f7eb6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000C3ECDC98B975340BE34A03946633140	2026-09-09 02:21:47.208393+00
96462ac0-227d-4723-95f2-84472af15bdb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E8DA17D08B9753408FE44DD944633140	2026-09-09 02:21:48.902109+00
de43c591-acae-418b-8c48-1a9414c2ce93	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000717907D38B9753407E09CB8E43633140	2026-09-09 02:21:50.618808+00
d9d8041c-db9b-49c6-a457-17424e0bdea1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000639DED38B975340198C118942633140	2026-09-09 02:21:52.214305+00
b5817918-da68-4219-9b1c-9e0c667b8de1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007795FFDA8B9753403E963E7441633140	2026-09-09 02:21:53.748241+00
ae02afa9-9ea9-4553-b5e6-4077e35cbb1d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E8DA17D08B975340F731303C40633140	2026-09-09 02:21:55.216635+00
1affe5f2-eead-4471-8370-1bc072cfcd4c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DCA227C08B975340BCD7FFEF3E633140	2026-09-09 02:21:56.796663+00
3baf389e-d891-41ba-9cab-4a84edf61602	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E8C30EBE8B9753402E37BD303E633140	2026-09-09 02:21:57.899304+00
408dcb0e-6c7f-4a7c-9a59-dc79d2155e25	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E8C30EBE8B975340C91528733D633140	2026-09-09 02:21:59.223854+00
84f0220f-7237-4736-b091-a3ea69264e28	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000095C5B3BA8B9753403A75E5B33C633140	2026-09-09 02:22:00.437551+00
cc2679d8-0ee0-40a6-a815-9e1b4ab16e85	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000060BCCAF8B97534023F197BB3B633140	2026-09-09 02:22:02.211402+00
208b12c6-463e-4ae6-ab2c-3ef33fd3b3b5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000047CC47AD8B9753404152FAF83A633140	2026-09-09 02:22:03.483901+00
bc379657-bc89-445e-aa04-398f7e5b2375	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001E4D9AAB8B975340A1EAA1C739633140	2026-09-09 02:22:05.207607+00
0ee3a7f8-f326-4096-b2cd-fa1a10b2d0a0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000047CC47AD8B975340E96E8DBE38633140	2026-09-09 02:22:06.717105+00
f444bf34-f34b-4fde-8c21-1f71f4dacfa7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000122CB3AD8B9753407EECE4C237633140	2026-09-09 02:22:08.215662+00
f731bb55-cff5-47eb-9640-f6ca66d48283	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002A6E81A98B975340C670D0B936633140	2026-09-09 02:22:09.76937+00
46043fdf-593d-42f8-a940-e22894f76dd9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000C10BBA58B975340D96B30C335633140	2026-09-09 02:22:11.202611+00
01f7edb2-da9d-4029-8870-cb551da82e24	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000047B53E9B8B975340E561A1D634633140	2026-09-09 02:22:12.892882+00
e6bc6753-14ac-4d88-bf05-dcaa43663557	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A7A66E788B9753402785798F33633140	2026-09-09 02:22:14.213213+00
9c93a659-9d4b-4075-b532-74575af8dcfe	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A1736D5E8B975340BC02D19332633140	2026-09-09 02:22:15.942202+00
15e247b1-2906-40c7-9861-e3ee3daacc23	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000891A96508B9753401049E30632633140	2026-09-09 02:22:17.097526+00
d3510a98-1814-43d5-89e9-c8d8f32d5380	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009524743C8B97534017DE40DC30633140	2026-09-09 02:22:18.980892+00
3d4cc756-ad44-44e6-83e9-b8393608545b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F42CAD2B8B975340F34F15F82F633140	2026-09-09 02:22:20.824451+00
7ae8620c-0c7e-4131-b9bf-31528e3d0a8f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002ACD412B8B97534041D9EFE42E633140	2026-09-09 02:22:22.681084+00
f4a45148-14ee-4199-a153-f502cd920030	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000004E94298B975340CBF044B52D633140	2026-09-09 02:22:24.533232+00
180fcf0e-6e25-409e-8679-bc97dbbfa993	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F42CAD2B8B97534072D98DE32C633140	2026-09-09 02:22:26.202511+00
dddd546e-0757-4070-b1aa-5aab6a6fa047	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000950D6B2A8B975340E3384B242C633140	2026-09-09 02:22:27.680579+00
af3e61b6-861d-4d3d-9108-1c553276309d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000420F10278B97534014A97A432B633140	2026-09-09 02:22:29.216813+00
b1232a95-16ee-4ac3-86bd-3567d32fd2dc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004E30F7248B9753403EB896242A633140	2026-09-09 02:22:31.221448+00
eced9ac8-aa02-41c7-ad94-8e24cc368f81	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A11749168B975340AFBB2F1D29633140	2026-09-09 02:22:32.584099+00
02f9cc7c-ff61-4956-9c3f-27dc22a5107a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000036C016058B9753406EB8342328633140	2026-09-09 02:22:34.198145+00
82d46400-c3ac-457f-85ec-35804fe9ebb9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000124658F98A9753409F28644227633140	2026-09-09 02:22:35.801759+00
3a809620-ea4a-40a1-8a24-269668b2008f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E9C6AAF78A975340D4F9A69F26633140	2026-09-09 02:22:37.068871+00
7e92aa7d-2bf7-4aaa-8254-7fe9601f331e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E9C6AAF78A9753408DF1BCAF25633140	2026-09-09 02:22:38.932784+00
a7685537-508d-4455-9025-7a6c246a7023	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008FC360FE8A9753407CCE82F524633140	2026-09-09 02:22:40.218716+00
96667dba-d512-41c2-8bd5-ff49f0bc5e58	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A62C9ED5DD95534073220BE24D643140	2026-09-12 08:07:22.73001+00
4b4cf4ea-8280-49be-becb-2c24186446f0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005F6633E2DD955340E4F159434E643140	2026-09-12 08:07:28.572411+00
f2abb542-49e3-4064-bcc4-a03f60c69b8d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000041086DDEDD955340C62066E54D643140	2026-09-12 08:07:31.192141+00
29f25095-a843-402a-9312-95c0312a54f6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000035E785E0DD955340F09F13E74D643140	2026-09-12 08:07:33.494746+00
3602219d-443e-49e5-b252-21461afb56fb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000077A801DEDD9553401A1FC1E84D643140	2026-09-12 08:07:34.233671+00
a5cac136-0b8e-43c2-a1a2-76be20abf5f0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B8697DDBDD955340439E6EEA4D643140	2026-09-12 08:07:34.692199+00
836701d8-f846-44de-b7dc-a8113515cd0d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D0C254E9DD955340EA9A24F14D643140	2026-09-12 08:07:35.494035+00
4d808c8a-bb78-4150-bc0f-b55bbba45437	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EE201BEDDD95534067182DF64D643140	2026-09-12 08:07:35.824054+00
420116f5-b56e-448b-833e-df8b219faee2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000023D8B8FEDD955340AE0CAA0D4E643140	2026-09-12 08:07:36.639347+00
3567664c-2a61-478b-983d-bc64ec368731	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000083F7FAFFDD95534049FF81284E643140	2026-09-12 08:07:37.006687+00
290af970-43ca-4016-b892-1eba384ebde7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FF8B0C17DE955340D2E28C614E643140	2026-09-12 08:07:37.76693+00
51678568-ca5f-4cd3-89c7-f3ce55a29578	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B2C0B22DDE955340E4F159434E643140	2026-09-12 08:07:43.703421+00
7287763d-bf12-4dac-a553-3f89a16d3b31	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005902846ADE9553406D1D1CEC4D643140	2026-09-12 08:07:43.814711+00
a77eb457-a742-42af-adb4-48e608215935	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002F2416E7DE9553405685611B4C643140	2026-09-12 08:07:43.867707+00
cafa3af6-602b-4d52-842e-87ae328076b0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007C629D2ADF95534098045E1C4B643140	2026-09-12 08:07:43.894231+00
b5ef9e7b-3803-4f59-a37f-0d525120bb0d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005E49F25CDF955340816CA34B49643140	2026-09-12 08:07:45.388499+00
194650a9-9816-4da6-810a-a0b35e55f12a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000238D6555DF95534077267ED646643140	2026-09-12 08:07:48.709357+00
dcdd05b9-38ff-4d13-a162-74fa485a09e1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F3ACA415DF955340D15D126745643140	2026-09-12 08:07:51.31723+00
e0e0fe76-44a1-47e6-8222-e67c92082e03	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000822271EADE9553401459106F42643140	2026-09-12 08:07:55.085031+00
586d7200-a66f-4b79-81c9-e3d78034b3fe	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B8C205EADE9553406963DB583F643140	2026-09-12 08:08:07.515828+00
86b8393a-e9b6-458b-9d36-a17fc331eead	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000023A70AA1DE95534056687B4F40643140	2026-09-12 08:08:16.633693+00
a0470037-8701-4d67-a451-802badf92e18	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000058E5FD3DE9553403F2CE5C63E643140	2026-09-12 08:08:24.170702+00
301ce870-4969-4d0c-81b1-54ae11fcfd63	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D24B31AC07985340A8AF422509653140	2026-09-13 13:01:55.281434+00
c18fe6ab-cfd2-4774-b498-fd678def6f56	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C1E03F82079853400DD1D7E209653140	2026-09-13 13:01:58.194978+00
d888cc4a-762f-4d5b-8a14-419c17484e28	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000028BB26D079853402AA2CB400A653140	2026-09-13 13:01:59.958691+00
b2a20941-accf-48d5-a7e0-b9f73f883145	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F652C25D07985340D1FAA58F0A653140	2026-09-13 13:02:01.732645+00
6ef05b02-a7ff-4232-aba5-84a0f0040304	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000E677E3507985340E21DE0490B653140	2026-09-13 13:02:02.583024+00
730081c1-f2cb-4ed7-9a54-dc2097f04ea6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004AF5F81807985340A142BF000C653140	2026-09-13 13:02:04.454366+00
de21b923-20e5-4bb3-8a3f-b77ab9b36e98	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D365D6F706985340BE6FD7A60C653140	2026-09-13 13:02:05.20295+00
35b1e250-0886-4afd-9193-7638023fc164	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F76C67A906985340A6CBACEF0D653140	2026-09-13 13:02:08.234906+00
ab088492-c9a0-45af-a2e0-0d99f52ab53c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005675A0980698534010960C5B0E653140	2026-09-13 13:02:10.779362+00
315041cc-92fa-4957-9164-0ce205784db6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007AD855920698534016F71F990E653140	2026-09-13 13:02:13.285619+00
9947f28f-06ff-4cb4-ae53-4f76bf9b0ede	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000971F1384069853406F568EDA0E653140	2026-09-13 13:02:15.173409+00
5dc52e49-5280-4b48-b92b-10d00bfd2722	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003800D18206985340FE3E88090F653140	2026-09-13 13:02:17.243885+00
c4aa0b79-94af-4d69-93cd-4747c9859896	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000026C3F17C069853407BBC900E0F653140	2026-09-13 13:02:19.338281+00
963a54a0-c3e2-4d29-928e-2f5e01edf5fb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000092031B7C06985340CFBAEB110F653140	2026-09-13 13:02:21.273856+00
ebc623cf-c7a5-4cf7-961e-708812f1c970	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AD1E8BC88B975340CAE259DD45633140	2026-09-09 02:21:47.6526+00
101ce086-59ad-46ea-9810-5b23f3cbf7b8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009BF8B4D48B9753400D06329644633140	2026-09-09 02:21:49.232667+00
b49e71f1-b1fe-4126-83de-889ba228a95a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A7199CD28B9753406138D73043633140	2026-09-09 02:21:51.217712+00
34c427ca-62a5-4627-8615-b487ab309209	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000655820D58B9753403DAAAB4C42633140	2026-09-09 02:21:52.499897+00
0eadf7fa-c12d-4b4d-887c-42ca5f94476d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D6B441DC8B9753406EBEB62341633140	2026-09-09 02:21:54.201974+00
7916bc83-8f1e-45b3-8c55-7445a8eea09c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000839FDDC68B9753405CE333D93F633140	2026-09-09 02:21:55.560826+00
25c6facc-4ba8-4045-b16d-2c4c4ddc3294	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DCA227C08B9753408DF73EB03E633140	2026-09-09 02:21:57.232073+00
1051aa5e-983e-45ef-ac27-465ef726d10c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B3237ABE8B975340454B79083E633140	2026-09-09 02:21:58.226388+00
43391892-dd51-44c9-9d06-04ddda86982f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000530438BD8B97534034CC1A063D633140	2026-09-09 02:21:59.883501+00
418e1be2-9571-4ced-a720-f8684d07dbfd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001848ABB58B975340FF2E22403C633140	2026-09-09 02:22:01.138128+00
4d6309f2-537d-4615-aa22-e5bfc43f5d91	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007D6CDCAC8B975340B221495A3B633140	2026-09-09 02:22:02.840418+00
141def2e-6060-452d-89d1-d24774400a48	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A1CF91A68B9753405305A3923A633140	2026-09-09 02:22:04.156739+00
556a9730-1bd6-4c2a-9ebb-c1326d0d231a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E8AC05AC8B975340E882FA9639633140	2026-09-09 02:22:05.434027+00
da25588a-81f9-4646-93c8-305083b4a19f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DC8B1EAE8B9753404216B36F38633140	2026-09-09 02:22:07.226163+00
ce8608c4-d3fa-4418-a9d9-bcc1455c0054	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007D6CDCAC8B975340D28E1B7E37633140	2026-09-09 02:22:08.617829+00
a28adbbc-1d45-4fb8-a15e-c62cf08696f9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000000EFD3A78B975340C614AC7136633140	2026-09-09 02:22:10.222787+00
b0fe3095-1180-4111-ac24-b7d70c9ca942	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007750E4A48B9753407F0CC28135633140	2026-09-09 02:22:11.659005+00
26196942-d477-458b-aa03-fd5fa4cbae0a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009597A1968B975340AF7CF1A034633140	2026-09-09 02:22:13.208375+00
b5d44889-cbb6-439c-8ab3-43a1ca164239	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D62A0B708B97534004AF963B33633140	2026-09-09 02:22:14.742667+00
cb2a020e-cbc9-4a55-b14c-8784761af84c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B9B53B5A8B975340CE119E7532633140	2026-09-09 02:22:16.229006+00
e355b7f7-a2c8-4044-b845-1936ebe242dc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004E5E09498B97534022FC8BA031633140	2026-09-09 02:22:17.713326+00
e70320c3-8e5a-49be-bc80-1a95671b7aed	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E206D7378B9753406A80779730633140	2026-09-09 02:22:19.541778+00
6f1d099e-bda1-4dba-8a85-f233413321ed	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BF8C182C8B9753403BE86DC72F633140	2026-09-09 02:22:21.223634+00
d40a0231-cccb-46e9-805b-fa4d6c3b0abb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BF8C182C8B9753408915246C2E633140	2026-09-09 02:22:23.222505+00
bfab9f12-f3c1-42ab-a643-431e7ff87c38	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000420F10278B975340CB94206D2D633140	2026-09-09 02:22:25.113114+00
8132f013-f93e-45e8-9c27-7d004a014674	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F42CAD2B8B975340AE6708C72C633140	2026-09-09 02:22:26.431063+00
813865c0-4582-4c08-bdf7-b44dd4227b9b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000950D6B2A8B975340675F1ED72B633140	2026-09-09 02:22:28.207002+00
6b333bff-b656-471b-a043-d9dfb9b4d513	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000083D08B248B975340326601C92A633140	2026-09-09 02:22:30.123596+00
dfbeb768-75f1-4532-8490-2119b46e59af	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000024B149238B97534056CC52FC29633140	2026-09-09 02:22:31.433456+00
cd388e72-0ac7-4621-841b-c8c2af60bbd4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005A3AD5108B975340EBED85B828633140	2026-09-09 02:22:33.220898+00
8d13323e-4765-42f3-8b55-48c595dbdea8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000186250018B975340E0CF3AF427633140	2026-09-09 02:22:34.519372+00
2f950da1-b00a-438a-9c50-1007a65ad0e6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A7052FFA8A9753401645590927633140	2026-09-09 02:22:36.191148+00
30161086-4316-4e4f-aa32-14f2316c3fe0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007D8681F88A975340E1A7604326633140	2026-09-09 02:22:37.784816+00
4aceec29-bcdd-405e-b2f6-fc8af02793f7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009BE447FC8A97534052071E8425633140	2026-09-09 02:22:39.237364+00
3eca8d95-00cd-435c-8f55-4cf940943445	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009BE447FC8A9753402F79F29F24633140	2026-09-09 02:22:40.826542+00
1f89735c-81dd-490b-a7b2-00e3942dd24f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000048E6ECF88A975340599C7B5924633140	2026-09-09 02:22:41.181425+00
973c259e-0971-4104-bd0e-c32cf2e2644c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D184DCFB8A9753400B47EB0324633140	2026-09-09 02:22:41.522573+00
0c3680eb-16d8-4116-986f-81198a62ea27	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D184DCFB8A975340417452A923633140	2026-09-09 02:22:42.125625+00
790b6d86-5663-4f8b-a4b1-897ed5f4e1a7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000778192028B975340A120675023633140	2026-09-09 02:22:42.68353+00
c5f3abae-a53c-4854-931a-1f153cae3b7e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002A9F2F078B9753407745950623633140	2026-09-09 02:22:43.220292+00
dae180a0-9610-43bf-b36e-1e03a8478569	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F4FE9A078B975340B97CDA9722633140	2026-09-09 02:22:44.02535+00
e7ed441e-a400-49ef-a314-a5b457417f10	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001E7E48098B975340601D6C5622633140	2026-09-09 02:22:44.542791+00
7095619a-4547-4b3f-a745-192ad1e87cd5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000095DF58068B9753406CCB25FA21633140	2026-09-09 02:22:45.223365+00
1878c828-2592-456e-ba8f-efe8fe74d9e2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000541EDD088B9753409BF39DA921633140	2026-09-09 02:22:45.852545+00
d23baa3e-3f17-4a3e-ab3f-f9d65e5f47dc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009BFB500E8B975340368A517C21633140	2026-09-09 02:22:46.198513+00
b10134cd-56e6-451c-aa29-edbf79a173b2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FA1A930F8B975340781DBB5521633140	2026-09-09 02:22:46.483376+00
f658f7a6-79cd-4534-92c8-8d0549e7e368	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005A3AD5108B975340D1C4E00621633140	2026-09-09 02:22:47.06363+00
cbd84a7c-3c6e-4568-9eb1-6bbe96fc7132	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000036D71F178B975340B4F3ECA820633140	2026-09-09 02:22:47.724922+00
deee7a99-9ef0-41b2-87a7-63a926380f1a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000012746A1D8B9753400D9B125A20633140	2026-09-09 02:22:48.223366+00
55ace2d6-fb86-4252-9b64-68dc6d25c2e1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FA319C218B975340795105ED1F633140	2026-09-09 02:22:48.927918+00
986daf07-f196-4793-815f-adbcaf165e93	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AD4F39268B9753403D6766C11F633140	2026-09-09 02:22:49.202519+00
a8cacc39-0ab3-4e41-9711-55bb29f5c461	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000420F10278B975340E407F87F1F633140	2026-09-09 02:22:49.641984+00
5e3efad3-50b4-4b13-b2aa-4ed4b499ac3b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A12E52288B9753403DAF1D311F633140	2026-09-09 02:22:50.116486+00
2e894f13-1f6b-48a1-b417-639d58300975	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000482B082F8B975340DEEE9BB11E633140	2026-09-09 02:22:50.763934+00
d344983d-eb11-41b7-9d40-469fa33aaf35	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FA48A5338B9753403896C1621E633140	2026-09-09 02:22:51.232735+00
8faec63d-346c-4b09-9298-488a99a3925b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000128B732F8B9753408CDCD3D51D633140	2026-09-09 02:22:52.037374+00
9e18c2a6-e24c-44df-acf8-5c431b5750f7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003C0A21318B975340C70E2A711D633140	2026-09-09 02:22:52.597498+00
4f0e69ce-be73-4519-b3c6-386b3713fd61	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000024C852358B975340B64714FF1C633140	2026-09-09 02:22:53.236073+00
e9c2ccd2-ab6a-4cc5-9d22-f6ea8e43dd3f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F443B63D8B9753407AA52C431C633140	2026-09-09 02:22:54.225816+00
7751e8d1-7d92-4b35-bae7-dfe25fe1bce6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005996F9588B975340AA7180AA1B633140	2026-09-09 02:22:55.217642+00
944d3978-1829-45e1-a4fb-aed1dce0b769	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000487023658B975340A5106D6C1B633140	2026-09-09 02:22:55.651457+00
ccb8d184-12c5-4b05-823e-2b1a6c9334e9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006BEAE1708B975340873F790E1B633140	2026-09-09 02:22:56.241044+00
55057ceb-438a-434a-a59c-6d0bfdcab130	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003C6645798B975340A5FCFF931A633140	2026-09-09 02:22:56.877984+00
052ca236-936f-483d-81e8-0987167df34e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D0251C7A8B975340CF1F894D1A633140	2026-09-09 02:22:57.232754+00
00c46f96-43c2-4cfa-ac9e-8e4eaa8ad136	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009B85877A8B975340CFC364051A633140	2026-09-09 02:22:57.583725+00
332afc50-8409-472c-b0d5-99230787946a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008F64A07C8B97534058EF26AE19633140	2026-09-09 02:22:58.054585+00
802e9f5f-c7ca-41de-92ea-84c0383a1441	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001E087F758B9753405E3CCD1319633140	2026-09-09 02:22:58.773419+00
2df6dc9a-b650-442b-91fb-9329c139a319	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E24BF26D8B975340946934B918633140	2026-09-09 02:22:59.267699+00
385f03be-c359-4804-a9db-cfbc35ca1e52	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000012B985538B975340299FD44D18633140	2026-09-09 02:22:59.573301+00
ea502c23-7cd7-40c8-8e83-ec77517644cd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000089038D3E8B975340596B28B517633140	2026-09-09 02:23:00.01987+00
81669878-fa8b-4722-86a7-f9710645ab72	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CBADFF298B97534047A4124317633140	2026-09-09 02:23:00.519055+00
5fd9d157-ca5f-4e27-b543-c3ac0934d0a7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000012746A1D8B975340B95FF4CB16633140	2026-09-09 02:23:01.223788+00
5bb9fcc0-3218-4795-ae4b-015640191322	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008FDA69108B975340AD9DCD4F16633140	2026-09-09 02:23:01.84938+00
a1916429-5dcf-49ea-9dbe-a826edadd83e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000089BE71088B97534078B81D1A16633140	2026-09-09 02:23:02.232448+00
047de9d0-ced7-45df-8a5e-83f560377ab6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B9420E008B9753403CCE7EEE15633140	2026-09-09 02:23:02.455612+00
6412d2e7-2f6b-4ec0-a58e-7aabd184335f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F4E791F58A975340BFF451A115633140	2026-09-09 02:23:02.932066+00
2bcbd393-670c-4056-90e4-557fa9fa92e4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000246C2EED8A975340D1031F8315633140	2026-09-09 02:23:03.20591+00
6418c8de-9f12-4562-a1af-0c3d5ef9a0ae	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000775380DE8A975340A8284D3915633140	2026-09-09 02:23:03.734182+00
af012f3a-8590-4147-8d79-0512206c6373	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F5B97FD18A975340A2C739FB14633140	2026-09-09 02:23:04.131094+00
22c6c398-5a5d-4e9f-9775-9e464e06f4fc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000364DE9AA8A9753404307B87B14633140	2026-09-09 02:23:05.232359+00
3881b1f0-4c95-414e-a44a-0be98fee237e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004E61A5828A975340374591FF13633140	2026-09-09 02:23:06.236719+00
268305d6-a8e3-4fbb-9dbd-ba82549dc464	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003608CE748A975340FC5AF2D313633140	2026-09-09 02:23:06.482131+00
5e9734bb-2583-4276-83f5-792a8076bb37	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000084A5153A8A97534061B0D12813633140	2026-09-09 02:23:07.837217+00
119962f7-a9b9-4a26-9d69-98afff2274e4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006CF019E48997534008F53E9F12633140	2026-09-09 02:23:08.924562+00
1889855d-ee5b-490b-8780-481fb5562e89	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000131E7E48899753401B4CC3F011633140	2026-09-09 02:23:11.242664+00
f3da4bff-b2d8-468d-a499-ccda6e52f3ef	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000015768D6889753409811836511633140	2026-09-09 02:23:13.195331+00
ff89ce98-7750-4613-9750-94db14a8c060	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005BE78475889753409E5E29CB10633140	2026-09-09 02:23:14.92755+00
00e7b36e-967d-43e2-af4b-87bc060d6792	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000EA9FD318897534098A1F14410633140	2026-09-09 02:23:16.217429+00
97350779-eb0d-4551-a437-1e7977b73a11	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D2904CE2879753404BF03CA70F633140	2026-09-09 02:23:17.845764+00
25f83c15-3a25-4f18-a37f-cb29b4bdd9ef	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009DAB9CAC879753408D1315600E633140	2026-09-09 02:23:19.227389+00
e79bcee0-b308-4d0c-9534-23ef327d5ed4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F07BE58B879753403B014D840D633140	2026-09-09 02:23:20.487432+00
faafa536-d515-4c45-8216-84f4e2649b7c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B591466087975340F4F862940C633140	2026-09-09 02:23:22.227625+00
5cf742f2-c65f-42d0-a315-26479720289e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003EEB1A2D87975340125AC5D10B633140	2026-09-09 02:23:24.237856+00
167ee8a5-5f5f-4462-b133-592c045004a2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BBF5F5D786975340AD4C9DEC0B633140	2026-09-09 02:23:26.158272+00
bf345ef7-3ab1-4c4d-b829-e1ac4bf3b766	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D309B2AF869753403B91BB630C633140	2026-09-09 02:23:27.946147+00
c187f24a-5efe-4289-82fb-9b7dade2e42b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000689B768C86975340116E32AA0C633140	2026-09-09 02:23:29.235094+00
bb3925d7-75b7-4f57-8bd0-0e5e5de4099e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CD7A8C4D86975340884270010D633140	2026-09-09 02:23:31.23218+00
b2ca9276-a43f-4c7e-98fd-6763492d2c67	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C1148A1986975340CA31FE220D633140	2026-09-09 02:23:33.197845+00
9da837b9-978d-4244-8f4d-bfafb549c962	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003E7B890C869753400B218C440D633140	2026-09-09 02:23:36.213018+00
865ee54b-7f24-489f-b625-9e9479540f89	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000909073186975340A00E75690D633140	2026-09-09 02:23:38.752433+00
5c625c01-8e5f-4f49-bab5-99794fd7242d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002162DE3E869753402FF76E980D633140	2026-09-09 02:23:41.210932+00
75afd54c-b586-4631-8f36-fa30ca589f07	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A3FBDE4B86975340BDDF68C70D633140	2026-09-09 02:23:44.2323+00
03553168-3f11-4056-8e6c-640b537cbe46	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CD91955F8697534088B201220E633140	2026-09-09 02:23:47.211604+00
b778a462-8079-4164-b509-fbf375f5f724	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005630856286975340CFA67E390E633140	2026-09-09 02:23:50.181655+00
4ca6dde7-9609-44bb-8f6b-f355e10189d3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005C4C7D6A86975340ED1B4E4F0E633140	2026-09-09 02:23:53.223443+00
b83851b5-e1d9-4969-8b00-203d1f97cfda	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000686D646886975340E7165F590E633140	2026-09-09 02:23:54.310848+00
3ae25b98-85e0-43fc-9e15-33984e1cfd42	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AF4AD86D869753407CA823360E633140	2026-09-09 02:23:54.506421+00
a4c0d010-7fc5-44aa-9198-b37aee70874a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000034933718697534022A5D93C0E633140	2026-09-09 02:23:56.201508+00
4d3810c3-873a-4743-998e-62634f44ff5d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009D24027A86975340BD97B1570E633140	2026-09-09 02:23:58.769417+00
98d5fe75-4968-42da-9008-0149e6d790ef	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003E05C078869753402201FE840E633140	2026-09-09 02:24:00.180817+00
aacaf460-0bd3-4937-8d7d-ce8c3c7d198a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000020A7F97486975340B1E9F7B30E633140	2026-09-09 02:24:01.692688+00
4405dd36-4664-4906-afb9-2e860c1fedcb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000748E4B66869753408D2782380F633140	2026-09-09 02:24:03.678288+00
cc836009-3676-41c1-a065-04a39f970fe0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000092BEFF4586975340ABF875960F633140	2026-09-09 02:24:05.220403+00
33bb07cf-d54f-46ea-8b0f-0c5c9041072d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D96D612786975340C8C969F40F633140	2026-09-09 02:24:06.832183+00
6a6e1ddd-a0bb-4a44-8114-0b4be03f90d7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EB93371B86975340BC6367C00F633140	2026-09-09 02:24:09.137302+00
0415a9a5-a76e-4fbe-b036-533775de6f7b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000152AEE2E869753400A01AF850F633140	2026-09-09 02:24:10.564026+00
5f933070-7ed0-4baa-8cdd-45c66d4eba51	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AF05BD3786975340AB9C514E0F633140	2026-09-09 02:24:12.20715+00
b097c60c-9b9e-4a0a-a96d-e25dadb5f7d2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009895DC1786975340ED7772970E633140	2026-09-09 02:24:14.234219+00
96d9294d-ac51-4ccf-a85d-f02585574808	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F0EF6268697534070FA69920E633140	2026-09-09 02:24:16.060472+00
60e8d1e9-0dc2-488a-adfe-cea5deeb4dbc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C7478B33869753409F7E068A0E633140	2026-09-09 02:24:18.200631+00
74ce179d-7131-466e-8c43-3c2a14acb64f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C730822186975340D50792770E633140	2026-09-09 02:24:20.217846+00
6554f109-9a5f-4b41-9868-d71675ba105e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D95658158697534052859A7C0E633140	2026-09-09 02:24:21.776234+00
a2710e76-b866-4b8c-9bc0-222525c3c031	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000050A15F0086975340113AE8120E633140	2026-09-09 02:24:23.258971+00
ebaf8af3-a119-4969-9767-dfed64d351d5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000056A64EF6859753403AB995140E633140	2026-09-09 02:24:24.515648+00
897ead04-e9dd-4676-9553-7a5f82e3946d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D92846F185975340F9252C3B0E633140	2026-09-09 02:24:27.226526+00
aef688f2-0699-4442-9bb8-4757be884908	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B6C590F785975340D50792770E633140	2026-09-09 02:24:30.236672+00
4da4c5bc-7b94-4e2e-b72b-ecb5d16a2f93	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AAA4A9F985975340D50792770E633140	2026-09-09 02:24:32.248025+00
d1fc8783-bdd0-4326-9a73-ef6785e6af6e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AFEEB325869753405EEB9CB00E633140	2026-09-09 02:24:35.276872+00
37a849dd-10d2-4590-acfa-248a1c5077e7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C75E9445869753400A4966F50E633140	2026-09-09 02:24:38.242388+00
f0074bbb-9f79-4ffd-91e7-18930eea842a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086860F368697534052E1BEC40E633140	2026-09-09 02:24:39.988675+00
d314261d-d1cf-4f65-a9a9-ead77084442c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005E4C8E96DE9553408BDAA2714D643140	2026-09-12 08:07:43.862385+00
efbf9c5e-f9b8-45cb-b58c-28434dd2564d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004C0C1357DF955340F840E1A249643140	2026-09-12 08:07:45.00777+00
7bc69fd2-ef04-4d9a-9ac0-8be67198db35	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FF29B05BDF9553409A58857247643140	2026-09-12 08:07:47.858709+00
61cb7149-7cef-4416-a44d-2cf6015f3405	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000094A46B26DF955340831CEFE945643140	2026-09-12 08:07:50.298049+00
5c25f0f9-c9df-470b-af10-e1cfcedb8dda	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CF1BDDF7DE9553408AE5965643643140	2026-09-12 08:07:53.886025+00
49c92fd6-b6d3-4ebc-b4da-038fc32233f3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DB25BBE3DE9553408BBDBCA541643140	2026-09-12 08:07:57.020732+00
32431185-2d73-4243-9cc2-3e87ad0ecb56	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000076BC6EB6DE95534056687B4F40643140	2026-09-12 08:07:58.499659+00
c82eb29b-0675-424e-92c7-3246ee4e567f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000023BE13B3DE9553402CE9CD4D40643140	2026-09-12 08:08:13.268341+00
a5b05f4a-d27f-4bf2-88ac-aff727dae387	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000082397AFCDE95534034B275BA3D643140	2026-09-12 08:08:25.070079+00
ed4ead2b-6397-4f9d-9ab3-445d96112e47	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E61000002530E763089853409E98F56228653140	2026-09-16 01:05:45.13495+00
4849f573-9bfb-45af-beb3-424695fd1dad	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E61000002530E763089853409E98F56228653140	2026-09-16 01:05:50.035139+00
95ea96d8-04cb-4e03-a494-e7c6f334cc67	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E61000004A0C022B07985340E6E214C20F653140	2026-09-16 01:05:55.225772+00
a61ae7dc-02b6-48b8-a3e7-bc2b188e9fcb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008AEF1F668A9753403DEE5BAD13633140	2026-09-09 02:23:06.822138+00
c8cbff6a-6ceb-4343-90d1-62bf0d7eaf1d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B92EA1278A975340F641960513633140	2026-09-09 02:23:08.246765+00
13a3b4fb-781c-4663-8f3a-92c47648cc2e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003C3E6BC8899753409D86037C12633140	2026-09-09 02:23:09.229213+00
64c16fd8-91f6-45b2-ac8c-b0aebd7d635f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002B1B310E8997534068E90AB611633140	2026-09-09 02:23:12.200727+00
12cc5fc6-5801-43b3-b370-6bf206d927e4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007FA65EB7889753400929893611633140	2026-09-09 02:23:13.759285+00
02935799-2c9b-48d6-a63d-1102ab9fec0e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E46E6B6688975340036C51B010633140	2026-09-09 02:23:15.197309+00
61cc05c1-61c6-43c4-99e4-50f157518307	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D8DA560E88975340EC43280010633140	2026-09-09 02:23:16.907593+00
27fe487d-449d-48b6-b8df-37c2a3c34c21	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008597E0D487975340BDAB1E300F633140	2026-09-09 02:23:18.083991+00
3d0d7ac9-1b67-458c-a6f1-bd3af9f92231	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003E75519987975340ABD09BE50D633140	2026-09-09 02:23:19.871048+00
cae18825-22b5-4fea-a08a-2342f8eb8d9e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008524B37A87975340A0B250210D633140	2026-09-09 02:23:21.118701+00
375a3558-2999-474b-ac06-df1c675c9144	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CDBC0B4A879753409538E1140C633140	2026-09-09 02:23:23.063514+00
17da5395-b0d9-4a9b-ae5b-f9a551319737	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007F958D1887975340CA6548BA0B633140	2026-09-09 02:23:24.743438+00
97a76891-d52c-46c2-8315-b1931ed36d94	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000853E58C686975340B8B29F200C633140	2026-09-09 02:23:26.707575+00
38524b23-9172-4baf-8934-4debda1f688e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000568CA9AA86975340B209D5720C633140	2026-09-09 02:23:28.234498+00
ea1979be-506f-4c51-99f7-c1ca1ed0c2f9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001A8B016D8697534076D77ED70C633140	2026-09-09 02:23:30.180947+00
3f209e47-a94e-4670-91a3-ae2206de2410	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002C83C53C8697534005C078060D633140	2026-09-09 02:23:31.73294+00
b32de491-1d9e-4801-bcd5-43a1e6626d58	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000325AA20E86975340F9B59A1A0D633140	2026-09-09 02:23:34.212526+00
1f8a959a-29e6-4f41-8c3c-4f7bd0b28083	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000068114020869753408299A5530D633140	2026-09-09 02:23:37.23677+00
1d78b4e0-80ac-4328-b020-76fe4c5cf586	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006828493286975340CA8D226B0D633140	2026-09-09 02:23:39.171325+00
4f50aec9-b754-44a0-baa5-93091c051a58	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000329FBD4486975340CFEE35A90D633140	2026-09-09 02:23:42.222476+00
44929af9-5a94-4905-b32c-234f24de63ab	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CD7A8C4D869753405ED72FD80D633140	2026-09-09 02:23:45.226502+00
68ed36d3-f0db-4a52-9ea0-dc101992f35e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000003322A5F8697534082AD122C0E633140	2026-09-09 02:23:48.217692+00
d18b738d-7b36-4434-8c3d-c3a95aeff157	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000748E4B66869753401CA0EA460E633140	2026-09-09 02:23:51.2134+00
5bce9c6b-871f-4f13-b3b3-37cf51f2bf4a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000038E9C77086975340FF2A1B310E633140	2026-09-09 02:23:55.193561+00
686179ea-92e1-47f5-8094-9b953ac9c183	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001586127786975340991DF34B0E633140	2026-09-09 02:23:57.217987+00
221cbf45-c8e8-495a-a7d8-ebf3cf2d7e33	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000068846D7A869753405E8F78680E633140	2026-09-09 02:23:59.207121+00
296d35da-b128-4c8b-8473-0a98a4483564	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000074A5547886975340467BBC900E633140	2026-09-09 02:24:00.618847+00
f7207a6c-d855-453b-ae2a-08b041f0898a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C187B77386975340ABE408BE0E633140	2026-09-09 02:24:02.126243+00
70a784c9-8b12-4e56-9ccd-371f318412db	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003ED7AD5486975340B1A140440F633140	2026-09-09 02:24:04.208966+00
4fea7b22-e764-42c8-b872-1eca206a727c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000038A4AC3A86975340B65E78CA0F633140	2026-09-09 02:24:05.798231+00
53a7dcd1-78b7-472b-87c0-c6b1f6b88be0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F1AF2F2386975340CECE58EA0F633140	2026-09-09 02:24:07.246573+00
e5d796f1-06e8-432d-b2ab-eeab624dcbd0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AFEEB32586975340756FEAA80F633140	2026-09-09 02:24:09.650635+00
e15c87cb-c7a2-4ac2-a677-f118ed46e796	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000092A7F63386975340EC8BDF6F0F633140	2026-09-09 02:24:11.207238+00
e9630cde-ef7f-4e17-a83e-df724af4c755	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5A55137869753400AA58A3D0F633140	2026-09-09 02:24:12.642228+00
89de1b9d-e8cf-4ea6-88e6-8b1be4d6da2a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003E92921E8697534076FF58880E633140	2026-09-09 02:24:15.217558+00
d6372181-2895-451d-9868-5ecdaf683183	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000068284932869753404076CD9A0E633140	2026-09-09 02:24:17.179975+00
b4bd08e3-5bec-47fb-a7da-f4a1bd5070d2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003EA99B308697534052859A7C0E633140	2026-09-09 02:24:18.728317+00
27aea808-7729-4a56-9d10-579153591146	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003E92921E869753402806ED7A0E633140	2026-09-09 02:24:20.481059+00
0d75a847-88d5-41ca-b1bb-d95fb5dcd209	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004A9C700A8697534076A334400E633140	2026-09-09 02:24:22.242576+00
111a0ea6-2c43-4187-957a-3382e3902db6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000009C4EBFA8597534094BCDF0D0E633140	2026-09-09 02:24:23.713157+00
47c7a720-a2aa-49f9-b5d8-6f707ce535e1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009867CAF3859753408EB7F0170E633140	2026-09-09 02:24:25.238717+00
9b6a7be9-f695-4731-9565-ebb628759403	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000044696FF085975340991DF34B0E633140	2026-09-09 02:24:28.212107+00
fbf32356-fac3-4461-a4e5-85ddb9da3cb6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000862AEBED859753403410CB660E633140	2026-09-09 02:24:30.883244+00
a40333ed-6702-4675-845b-3b91689a466c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000211DC30886975340F37C618D0E633140	2026-09-09 02:24:33.273005+00
f0105cc5-f042-4a63-8027-dc2ecdaed4d6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C7478B3386975340C959D8D30E633140	2026-09-09 02:24:36.231398+00
28562994-d3f1-4542-aeba-5e6f881c07ae	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000050E67A3686975340A5DF19C80E633140	2026-09-09 02:24:40.198559+00
1f43fad9-412d-4e63-aa9a-7357c9853fe7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002F3B1FF9DE955340D3A645D84B643140	2026-09-12 08:07:43.864888+00
511472e3-a73f-4b0e-8e20-b211aeb0ab1f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DBC6FA61DF95534034BBEEAD48643140	2026-09-12 08:07:46.28716+00
88720dce-eae0-481d-a8f6-46abaa6f2dc3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CF8E0A52DF955340CAC8B49146643140	2026-09-12 08:07:49.068281+00
b6af92dd-9cb2-44a5-9e6e-81ba48e2965d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B8F0170EDF9553404E7FF62345643140	2026-09-12 08:07:51.446864+00
c7ddc428-067e-4a88-87ea-e94193a3aa5c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004D54CAC6DE955340A4A99ECC3F643140	2026-09-12 08:08:10.005162+00
ef15c3e0-22fe-4fb3-8685-a17b4cca3014	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005342B0AADE955340B61490F63F643140	2026-09-12 08:08:20.984721+00
7aa1521b-105a-4a15-a463-cb73cb28f098	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E610000073B9C15007985340EB5795D810653140	2026-09-16 01:05:50.085129+00
03f39ae6-fdf7-4698-8a18-757cb5e3a906	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000187CF54C8A9753409795815E13633140	2026-09-09 02:23:07.406686+00
ddbcacd8-670b-4b31-9c65-e7d4e07c3164	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002558C1148A9753406254ADE012633140	2026-09-09 02:23:08.67501+00
d8df2126-7a27-43eb-a5c9-baf4f48a4570	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001F9B898E89975340CDAE7B2B12633140	2026-09-09 02:23:10.123399+00
50a554ea-c7fe-4dcb-bfae-0a9cb19ae21d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F0479BF48897534050792A9611633140	2026-09-09 02:23:12.676996+00
498571d7-4679-4fe0-99f6-4bb782ac3930	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000037B2E19F889753404BBCF20F11633140	2026-09-09 02:23:14.173996+00
58ff5fd4-7971-4821-b3fb-6c7f5af279a0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000559D7A4988975340278AEB7310633140	2026-09-09 02:23:15.780891+00
c7473826-8eaa-4a89-85de-001de17d06bd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009702D2FE87975340515150E50F633140	2026-09-09 02:23:17.232413+00
9d54283b-15d2-4a6d-a8b4-df2f9a320196	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000032827CBF879753402E6700B90E633140	2026-09-09 02:23:18.651407+00
ee3b0364-de95-4c1d-a825-a7b3888b87a8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000061D806938797534076EBEBAF0D633140	2026-09-09 02:23:20.210584+00
ab9d9715-30f1-4573-8110-062b9fb8f30e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AF8C576A879753407CDC6DCD0C633140	2026-09-09 02:23:21.763791+00
81002edd-3df1-4955-bbb6-5a9eaef38a40	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000073A2B83E879753407DC800F50B633140	2026-09-09 02:23:23.585638+00
6ca4b3b1-4b0c-4d1e-bda3-70190be71f0d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EBBEAD0587975340E8DA17D00B633140	2026-09-09 02:23:25.239217+00
2c1ad50b-5c82-4408-8a3f-1336bef11e76	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000915F3FC4869753402321DB430C633140	2026-09-09 02:23:27.199312+00
ef4cc3fe-ecbc-4ab0-9575-94f6ec6b10e7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D3F2A89D86975340A6FFF6860C633140	2026-09-09 02:23:28.592183+00
549cb526-88c8-40e3-89ed-df386d2a471c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A917D7538697534065C8B1F50C633140	2026-09-09 02:23:30.946232+00
6e65dada-b81d-4a84-b3a1-776b193da186	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A9E9C42F869753407C3892150D633140	2026-09-09 02:23:32.229718+00
92b4bf47-e755-4eb1-87e2-ab57751a5953	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000015FCDB0A86975340702EB4290D633140	2026-09-09 02:23:35.207759+00
4419b00c-3653-4c18-9074-684c8acf67b7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F7CB272B86975340A613645F0D633140	2026-09-09 02:23:38.207989+00
edd32647-fbd6-4c00-a8a8-c5a3f6b9c2f1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D9846A39869753408EFFA7870D633140	2026-09-09 02:23:40.226836+00
129c90fc-71ca-4bd8-a185-9821bfea1289	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5BC5A49869753401DE8A1B60D633140	2026-09-09 02:23:43.207617+00
40f70cec-3ec5-4258-8734-94c1c5efe7e6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F53115D869753406A3D320C0E633140	2026-09-09 02:23:46.212079+00
65096a4e-f553-466b-9e96-1059f842fcfc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002CB1D76086975340522976340E633140	2026-09-09 02:23:49.218081+00
2a7c1199-2009-46be-81e5-d5b7de5f0ee0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C78CA66986975340709E454A0E633140	2026-09-09 02:23:52.204488+00
28f8abf3-20f9-4e77-beb9-6f55f39a5c7c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F6A1A6F86975340FF2A1B310E633140	2026-09-09 02:23:55.953877+00
e5a4e1b1-370e-47b7-9e43-d350e4656ff5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FD43447B86975340E7165F590E633140	2026-09-09 02:23:58.214356+00
00b7c9d7-a6b3-490a-af27-80b5c78a1438	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000009652B7986975340058C2E6F0E633140	2026-09-09 02:23:59.621994+00
073c2654-8926-43e6-8c5f-4bf8ed631a83	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001586127786975340E16D94AB0E633140	2026-09-09 02:24:01.177025+00
782785e5-4732-45a3-a94a-061ac663349f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BB6BBF6B86975340A53B3E100F633140	2026-09-09 02:24:03.214884+00
22245dea-a99b-405e-b6c8-27e689508606	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A3FBDE4B86975340F290CE650F633140	2026-09-09 02:24:04.571572+00
a07435fe-ac18-4c96-b528-9c42e3ea39c3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002667CD348697534027D2A2E30F633140	2026-09-09 02:24:06.197786+00
2c03237a-50ee-4b40-a8b2-d03eb59f2769	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000003D60517869753400458E4D70F633140	2026-09-09 02:24:08.142759+00
5ebcec4a-5f0d-48c1-bbf7-55569beb3ce1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000214BD52C86975340ABF875960F633140	2026-09-09 02:24:10.226639+00
b78e7402-ce98-4ab5-95f3-6a12110406ce	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C7478B33869753401C107C670F633140	2026-09-09 02:24:11.437007+00
d2487b75-4655-4019-a80a-fd97b6d5c043	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005CF058228697534069519FE40E633140	2026-09-09 02:24:13.221312+00
2b99dd4a-5fd5-4ee9-b63e-7ffaff812712	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005CF05822869753401CFC0E8F0E633140	2026-09-09 02:24:15.577214+00
ac98cde6-fcc3-4e78-b651-f1ea1aefc7c6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C7478B338697534070FA69920E633140	2026-09-09 02:24:17.731729+00
d3964a69-30de-4272-bf27-e5faa16b6ca4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000056EB692C86975340D50792770E633140	2026-09-09 02:24:19.226626+00
3f579d9f-7f70-405b-9364-ad8850e239ef	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002D55B318869753407C04487E0E633140	2026-09-09 02:24:21.218307+00
543678a5-4192-4786-b5b1-ebbbe01d42d0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006EFF25048697534034B4A61E0E633140	2026-09-09 02:24:22.787977+00
940dab9f-5e01-446d-8790-ade83d72e06d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008025FCF785975340113AE8120E633140	2026-09-09 02:24:24.214003+00
0e45d284-74ea-4cf1-bc96-c8e5bc48283b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5492DEF8597534088B201220E633140	2026-09-09 02:24:26.182522+00
64a7ad40-612c-4746-b454-e53861e7e3db	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D92846F1859753405E8F78680E633140	2026-09-09 02:24:29.210584+00
e29e4641-ee7c-4e26-966e-353dbc6750a8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5492DEF85975340DB0C816D0E633140	2026-09-09 02:24:31.268348+00
8f192bc9-2ec2-437c-98f8-9ebfba50ab07	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F7B41E1986975340C3F8C4950E633140	2026-09-09 02:24:34.242163+00
f990c328-4d1b-4f98-bbf4-e88ff88ff037	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B521B53F86975340E7CEA7E90E633140	2026-09-09 02:24:37.186535+00
094db918-1184-4ac6-853c-d92ef5e90b1f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CD7A8C4D86975340E1C9B8F30E633140	2026-09-09 02:24:39.27276+00
c67e0cdb-25d7-42ec-b9c7-30ebd225cd20	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000050E67A368697534099D53BDC0E633140	2026-09-09 02:24:41.223722+00
76246a0f-c628-4cd9-878a-6f5879a32e49	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CD63833B8697534087C66EFA0E633140	2026-09-09 02:24:42.226662+00
f82f3bda-2e2b-4722-8520-bca430d4bef5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000074603942869753405842D2020F633140	2026-09-09 02:24:43.270244+00
6bd5f82b-9fe6-4de6-940d-d7d84bf8c8e6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5BC5A4986975340F83999130F633140	2026-09-09 02:24:44.237947+00
ade4b665-dac2-41a1-97f1-84c0d331e48f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000031B214D86975340F234AA1D0F633140	2026-09-09 02:24:45.269207+00
c0106b14-021e-49ac-be20-f38acebdf4d4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002C9ACE4E86975340463305210F633140	2026-09-09 02:24:46.232297+00
7db0015f-f822-4019-8dc6-e7527ddc37d9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007A7C314A869753404C38F4160F633140	2026-09-09 02:24:46.877042+00
7adc5007-f7fa-4c21-8594-fc26feeb85b7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F3C084B869753409F364F1A0F633140	2026-09-09 02:24:47.271482+00
47dfb518-f729-436d-93ba-654c33b64373	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5BC5A4986975340C9B5FC1B0F633140	2026-09-09 02:24:48.232027+00
d5edb75a-01c6-469b-a0cb-7c050a5ba71a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000683F5244869753404C38F4160F633140	2026-09-09 02:24:49.029137+00
1adb14f4-0bcf-4b16-8118-f203f6c7c9d1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003E92921E86975340ECD396DF0E633140	2026-09-09 02:24:50.238515+00
af15de3d-f448-437d-9072-017dd62769f8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EB93371B86975340C959D8D30E633140	2026-09-09 02:24:51.278001+00
4a36a85f-cdd0-435d-958c-39f07129ebe9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C730822186975340C959D8D30E633140	2026-09-09 02:24:52.232372+00
9715aa43-f78b-46fd-a3d2-7fa13de0ac98	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AFEEB32586975340225D22CD0E633140	2026-09-09 02:24:53.277649+00
a0d84469-a244-4c53-9df6-cfe3cb329464	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BB0F9B23869753402E6700B90E633140	2026-09-09 02:24:54.146122+00
87350f6f-ea96-435a-b866-a101a8358285	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000152AEE2E86975340DB68A5B50E633140	2026-09-09 02:24:55.271712+00
6e768974-338d-4dc6-839c-76d927afa159	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D9846A398697534058E6ADBA0E633140	2026-09-09 02:24:56.241646+00
c6524069-d5a6-4feb-94e8-da49aa36ac9f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000683F524486975340FEE263C10E633140	2026-09-09 02:24:57.272314+00
8e499b65-d9c8-4b7e-8a93-75acb2423c6b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000050FD83488697534052E1BEC40E633140	2026-09-09 02:24:57.673153+00
79974658-c8a7-4d93-b4c8-3c95a77557a9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5A55137869753408D6F39A80E633140	2026-09-09 02:24:58.231965+00
d597bdc9-9d87-44e3-ad2f-34bd7bc02cbe	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000806A172E86975340467BBC900E633140	2026-09-09 02:24:59.273101+00
3b6a8fdf-1830-47cc-984d-d7ce59e387af	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000152AEE2E8697534076FF58880E633140	2026-09-09 02:25:00.187715+00
ddf31dbc-fd00-4970-96cb-03eba783cf0c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003288B43286975340CF02A3810E633140	2026-09-09 02:25:01.210523+00
49b314f2-e2ce-42d0-ad3e-e5bfee07fc5b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BB26A43586975340931804560E633140	2026-09-09 02:25:02.241526+00
cfdf36fa-5526-40cc-b9c8-6997d7b60685	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008CA2073E86975340991DF34B0E633140	2026-09-09 02:25:03.26545+00
e1b23133-13c6-4c31-a961-836c267fcda5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009EDFE643869753401CA0EA460E633140	2026-09-09 02:25:04.2376+00
477ba786-dc4f-4a50-bdf5-314262816208	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005C1E6B4686975340FF2A1B310E633140	2026-09-09 02:25:05.277644+00
d0b5154a-8168-4f6a-9941-6c2add1de611	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BB3DAD47869753407CA823360E633140	2026-09-09 02:25:07.363411+00
6d45a429-7081-42f3-934b-00d6ed8c500b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002134CC1A869753402E5393E00D633140	2026-09-09 02:25:07.458549+00
d3981ade-fd83-4d9c-93f0-abf19e03eaff	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B5DC990986975340BDDF68C70D633140	2026-09-09 02:25:07.465527+00
f53eac47-2362-4a00-abc4-ca2d703f04ac	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002722B2FE85975340C9E946B30D633140	2026-09-09 02:25:08.237671+00
e0f7215d-9cc8-4023-97b3-8b19c081e144	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000009C4EBFA85975340F96DE3AA0D633140	2026-09-09 02:25:09.270834+00
67a695cc-0d39-43c8-937c-5be08c036343	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000009C4EBFA85975340A66F88A70D633140	2026-09-09 02:25:10.240007+00
41b4c49d-e1cd-45a2-853e-2b9e4cfc566d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000068E32DFC8597534052712DA40D633140	2026-09-09 02:25:11.262802+00
e67a5ef9-e11c-44a8-a60e-caa7deda06bd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009262DBFD8597534029F27FA20D633140	2026-09-09 02:25:12.232243+00
a6b20e75-1c7e-42b7-9903-8a53e16da9d9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000050A15F0086975340D5F3249F0D633140	2026-09-09 02:25:13.272124+00
53d0af1d-aa36-42dc-84cc-67285028b994	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B0C0A10186975340B87E55890D633140	2026-09-09 02:25:15.927657+00
dd12533b-daf6-492b-ba5b-504473c5397a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000068B51BD8859753400B7DB08C0D633140	2026-09-09 02:25:18.199882+00
3824ad48-2856-4efb-bf73-4a6740e706dd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C1B865D18597534011829F820D633140	2026-09-09 02:25:20.196904+00
10e71697-06bc-49d9-9b73-85534982960f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003F1F65C485975340A06A99B10D633140	2026-09-09 02:25:23.282993+00
f294d7e6-a7df-4f6b-bbf5-e37b42ad2e48	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B63B5A8B8597534011829F820D633140	2026-09-09 02:25:26.238436+00
8c95ebfd-d43e-4050-8a14-3942820c5e1b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F1E0DD80859753405ED72FD80D633140	2026-09-09 02:25:29.299809+00
8e6bc953-a158-48f7-89e9-23dcd869d4c4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F1E0DD80859753400B35F91C0E633140	2026-09-09 02:25:31.28202+00
99322290-68da-4f6a-afa5-816c6b53b1af	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000806DB367859753406AF57A9C0E633140	2026-09-09 02:25:34.238576+00
27550768-60a1-45d4-853b-c991612cceb3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005792E11D859753403B014D840D633140	2026-09-09 02:25:37.282132+00
0a37f98a-45fc-48bf-b785-2fa040db97ea	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005176E91585975340DBF813950D633140	2026-09-09 02:25:39.213593+00
ee65f3a7-2ad4-45ba-a555-aa713c86d7f6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000075AB8CEB849753400B7DB08C0D633140	2026-09-09 02:25:42.238136+00
7455d8bb-53ff-48a1-8213-4c0be44a7c4a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005E7AA0BADE95534085C146A34C643140	2026-09-12 08:07:43.847349+00
bdf9c82b-e81f-4a1f-aa36-ee23e565357e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E7D0D84DDF955340C8748D3B4A643140	2026-09-12 08:07:44.197233+00
44bcc2ca-9b46-4dba-ba91-6e6c4f6e036f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F308C95DDF955340EDB204BE47643140	2026-09-12 08:07:47.492687+00
734c6c4a-2ac2-482d-b01a-364e373c1d32	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000173E6C33DF955340E8853B1746643140	2026-09-12 08:07:49.994744+00
199e2a47-30f8-4e6e-9d80-4bfcfe315ecc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C916EE01DF95534007770C3444643140	2026-09-12 08:07:52.683409+00
0f8f618f-92cf-420e-b5dc-893515ee936c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F98381E7DE95534062CE7D8340643140	2026-09-12 08:07:57.220496+00
626180c8-d02d-44dc-8bef-51cb4356561b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CABAC9B9DE9553404A02791B40643140	2026-09-12 08:08:11.891864+00
6b5b92f1-998c-4f5f-beab-8d41862037bb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BE99E2BBDE955340B65C47663F643140	2026-09-12 08:08:22.405145+00
eb622e9a-7088-4a30-aedb-03d1998a9836	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	0101000020E61000000246973707985340EC43280010653140	2026-09-16 01:05:59.239475+00
ce9a2692-5c29-4a66-b49e-32e2c0bc6606	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A49FBA0386975340A06A99B10D633140	2026-09-09 02:25:14.230702+00
7cbbe68b-3b6f-488d-97e3-9bfd9cd46c7a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000015CEC9E6859753406480FA850D633140	2026-09-09 02:25:16.206031+00
359ed31d-7c37-49eb-acc4-079aa59af3db	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C1B865D185975340ED07E1760D633140	2026-09-09 02:25:20.090627+00
eacdc61b-fc3d-4c65-be2f-a62dd8649b7b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000443B5DCC8597534035FC5D8E0D633140	2026-09-09 02:25:21.292875+00
bc7fd929-8049-4dd1-b2db-c1cd2f8442b5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003F1F65C4859753403A5D71CC0D633140	2026-09-09 02:25:24.253434+00
018c1673-da49-48ee-a7f3-b1b3d3284e22	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000045DF38848597534088FAB8910D633140	2026-09-09 02:25:27.27161+00
2bbd06b3-a568-40b1-9fce-fe48ff7f74ac	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DFA3FE7A859753404C24873E0E633140	2026-09-09 02:25:32.226226+00
80d30fb4-2df9-457a-a899-69ec57e61c8b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000039622D3E859753408E5BCCCF0D633140	2026-09-09 02:25:35.281942+00
90bc3e7c-1c29-491f-8847-3eceb13a9de8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E635C01685975340E1FD028B0D633140	2026-09-09 02:25:38.238497+00
3445e9ae-8967-40dc-b038-fff6e73a4ac8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DAFDCF0685975340AC74779D0D633140	2026-09-09 02:25:40.244098+00
82adce7f-81fe-4ac3-8940-5fcc129ad30b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DACFBDE284975340BE83447F0D633140	2026-09-09 02:25:43.282783+00
1257a552-a54b-4e21-acaa-78dd00ef2628	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004CF50945DF9553406FCD678A4A643140	2026-09-12 08:07:43.90522+00
1761ebf0-34f1-48bd-a379-21290e1bf8c7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000011678F61DF955340B7E1C16048643140	2026-09-12 08:07:46.669018+00
18b9a7db-c6f3-4af5-b032-3a55c8324358	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A60F5D50DF955340655F686446643140	2026-09-12 08:07:49.356356+00
a6918580-34c5-4d28-b047-379893e67e59	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001D154905DF955340ADCFE68244643140	2026-09-12 08:07:52.287688+00
b343533d-172a-46fd-8ef7-16451130b940	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000070E591E4DE95534079F6A63341643140	2026-09-12 08:07:57.099674+00
1098a280-f491-4d9e-a402-1c73d0744777	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007CD866BEDE955340399787F13F643140	2026-09-12 08:08:10.540599+00
8d49cbbd-319d-4247-a03d-57a7b4bc229e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005E7AA0BADE9553405CB521B53F643140	2026-09-12 08:08:21.288121+00
170f6ff0-a454-4cbe-bdf9-d3e6c3c2ade8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005287CBE0DE95534099D30A783E643140	2026-09-12 08:08:24.102913+00
a5ad6d15-6886-4a6e-beda-df8bee9f1d27	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000FE0E30286975340AC74779D0D633140	2026-09-09 02:25:15.268446+00
b605bc83-a86a-4c86-b92f-59e4a35e71f3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000996D9D6859753406A85E97B0D633140	2026-09-09 02:25:17.271381+00
be269dd3-7144-4522-b438-d0a12776e28e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AA5F8EC3859753402FF76E980D633140	2026-09-09 02:25:22.234774+00
e1c52e50-a391-48a0-9ee6-0cb5915b4807	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086FCD8C9859753402E5393E00D633140	2026-09-09 02:25:25.05212+00
c4e2efd8-94d1-4e80-b66b-12b2d7ad0dce	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086A0B481859753409A65AABB0D633140	2026-09-09 02:25:28.237739+00
8cc59be7-2240-4bd6-be34-66e5f8dc63d0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086A0B48185975340764710F80D633140	2026-09-09 02:25:30.197563+00
c0b4f3ee-d172-4ef0-afee-848daa1b6a3e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FDEABB6C85975340058C2E6F0E633140	2026-09-09 02:25:33.282492+00
75a5caf9-413b-4320-8bf7-054538b963bb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001BED5D288597534035FC5D8E0D633140	2026-09-09 02:25:36.241737+00
e8ea9292-81b4-4c1d-9b44-ca008012103a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009237651385975340E1FD028B0D633140	2026-09-09 02:25:38.963079+00
b06b25a4-f7a6-44fe-9e31-387ab88c58f8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006385B6F7849753400578C1960D633140	2026-09-09 02:25:41.29256+00
3eedab37-9107-4352-8ae5-8b31d5ecc960	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000974A896E87975340294EA4EA0D633140	2026-09-09 02:29:45.493038+00
1f7b6241-6aa6-44ce-b867-75e0913ef835	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000E7E874787975340F4F862940C633140	2026-09-09 02:29:49.789834+00
361514cd-550f-49d2-bdb5-ab98de767436	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008BE4863A879753400CB1FA230C633140	2026-09-09 02:29:50.162679+00
d6c8aa3a-0ff1-4041-81ed-974b7ff866ab	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5E7D033879753400650E7E50B633140	2026-09-09 02:29:50.549379+00
5a145bb1-8369-4873-a5d7-c1b05397d8ff	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007FDAA84E87975340BE5B6ACE0B633140	2026-09-09 02:29:51.202338+00
006da8fd-adc8-4202-b44d-2afc9191cda1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E415E3578797534036785F950B633140	2026-09-09 02:29:52.209765+00
2ec4c195-7ac7-4797-898b-967698346068	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BB963556879753400093AF5F0B633140	2026-09-09 02:29:53.201307+00
5cc309d0-ede6-4415-be1f-ed1633e11d4b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002CDC4D4B87975340C5A810340B633140	2026-09-09 02:29:54.209533+00
1ad75cff-9800-4606-9224-a1d694e2f3c4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000085C88E3287975340A733411E0B633140	2026-09-09 02:29:54.562394+00
1906dbc9-a11d-49ef-b178-623bb9ee0074	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000038143E5B8797534065B4441D0C633140	2026-09-09 02:29:55.211241+00
f1620555-c44d-4f29-90c5-8a3c7d73637a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005B8EFC6687975340C418A2540C633140	2026-09-09 02:29:56.209615+00
4a610e5e-4292-4abb-80a4-2eaff3a56679	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000014C8917387975340651069650C633140	2026-09-09 02:29:57.18998+00
0db69171-9f56-4df7-8eea-46583f386250	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CDEA1D6E87975340E89260600C633140	2026-09-09 02:29:58.200915+00
ef482026-ffe3-4f4e-9d1c-09987ebda8f8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000506D156987975340F49C3E4C0C633140	2026-09-09 02:29:59.220023+00
1d70c45d-88ba-457d-bae9-6859c5cbb065	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D37CDF0987975340ACA8C1340C633140	2026-09-09 02:30:00.226462+00
5ae718a6-25f0-4060-810e-693c72f1a13f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000915F3FC48697534065B4441D0C633140	2026-09-09 02:30:01.225608+00
177a346c-092e-4107-bd14-37f0cd5b54f9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000149D1B8986975340EE3B2B0E0C633140	2026-09-09 02:30:02.210233+00
c6ac36ce-72f6-4bad-9a92-0f3506159a4b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007AAA436E86975340D6276F360C633140	2026-09-09 02:30:03.75554+00
8e79e748-6869-43ee-802e-3eeed3798c72	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000440AAF6E869753401D1CEC4D0C633140	2026-09-09 02:30:03.783323+00
787d96e5-5c85-4dbe-a92e-8a5aa237070d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005C07623486975340EEF3739E0C633140	2026-09-09 02:30:04.191008+00
2d949cbb-2c1e-4c41-be9f-f43db202940f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C1FD80078697534070D28FE10C633140	2026-09-09 02:30:05.196612+00
a7af870a-7e7d-413f-b529-dd882b835dc0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000270BA9EC85975340FFBA89100D633140	2026-09-09 02:30:06.214343+00
d1b88b1b-ee04-4eca-99a8-e05373636ed5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003F366ED6859753406424D63D0D633140	2026-09-09 02:30:07.219493+00
8a79204b-6648-40ab-94d8-3fe6f9d8226a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009E3EA7C5859753404C101A660D633140	2026-09-09 02:30:08.230491+00
169c63f3-2cf4-4067-b286-e2843c2c1618	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002DE285BE85975340E702F2800D633140	2026-09-09 02:30:09.244876+00
982036ba-0571-4c37-811d-561bcb43098f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000033E774B48597534052712DA40D633140	2026-09-09 02:30:10.211732+00
7bd9b069-3af4-472b-ae87-f1d4d1a12a16	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001B8E9DA68597534005D4E5DE0D633140	2026-09-09 02:30:11.213066+00
93d62443-d673-4b77-bc45-3bcc598a82a1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000098F49C998597534034B4A61E0E633140	2026-09-09 02:30:12.250922+00
08087451-8e80-4404-8c07-8531e052e455	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F56AD9685975340522976340E633140	2026-09-09 02:30:12.868329+00
79b6b546-0267-4032-9728-5135bd78c30c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F1AF2F2386975340BD97B1570E633140	2026-09-09 02:30:13.205074+00
5ed4272f-c136-4c79-b429-a86bcdc3fe8a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000038D2BE5E869753402201FE840E633140	2026-09-09 02:30:14.240288+00
8d0cf1e9-8d04-4be2-a00e-66368c7d2a0c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001A8B016D8697534016F71F990E633140	2026-09-09 02:30:15.251942+00
ba71c116-c002-49cc-b93e-3d91d1add3a0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000086CB2A6C86975340ABE408BE0E633140	2026-09-09 02:30:16.247099+00
f282711e-438b-4bee-929e-0a8713c685b8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D3AD8D678697534046D7E0D80E633140	2026-09-09 02:30:17.226577+00
cb192573-06aa-4682-98b4-22f7d93d63b7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002090F062869753408DCB5DF00E633140	2026-09-09 02:30:18.24432+00
5618a6c7-d246-43bb-8d7a-d5799bc25991	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007A933A5C86975340D5BFDA070F633140	2026-09-09 02:30:19.271987+00
14f73ba0-1e24-48bd-aa7c-54c7ace2fd46	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C7759D5786975340CFBAEB110F633140	2026-09-09 02:30:20.228789+00
a5b4d4dc-39c2-43c9-bb41-ea2254c8dde3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007477425486975340F234AA1D0F633140	2026-09-09 02:30:21.253133+00
3bf1d1fa-1f1c-4776-85f5-db6b6a20309d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000746039428697534010960C5B0E633140	2026-09-09 02:30:22.072049+00
57cadffb-1afa-433d-acdf-91def58ec412	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C1429C3D86975340D5AB6D2F0E633140	2026-09-09 02:30:22.214001+00
8c9eb842-fe2c-446d-9e52-0f95e07c05c9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F25FF3886975340DBB05C250E633140	2026-09-09 02:30:23.249238+00
aa941bc7-0043-4e40-b7a2-c5a119f29221	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B50AAC2D86975340F9252C3B0E633140	2026-09-09 02:30:24.389897+00
a99d75c4-5dbb-419b-aac8-96addd86d172	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E58E482586975340BD97B1570E633140	2026-09-09 02:30:25.235291+00
5fc2f537-8f26-4841-9104-a1aa4490f3cd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009895DC1786975340FF863F790E633140	2026-09-09 02:30:26.205083+00
5c013ce2-d4be-448a-93be-e5ae45dbb337	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D9565815869753402201FE840E633140	2026-09-09 02:30:27.231579+00
3ae3d386-465e-473d-9655-25297f53065e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001B18D4128697534070FA69920E633140	2026-09-09 02:30:28.204329+00
7962934f-cc55-474d-80a5-69c77be9d525	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000741B1E0C869753408D6F39A80E633140	2026-09-09 02:30:29.209387+00
8ff0d0e4-ed1c-4c39-8ede-797e01b2b4b1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000FE0E3028697534081655BBC0E633140	2026-09-09 02:30:30.225312+00
83144cdb-e4b3-4f9f-bb76-2a19455fdc72	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001BEAC1EE859753405E8F78680E633140	2026-09-09 02:30:31.021839+00
ef38c06f-1d4f-43c4-8ec5-546a64557273	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FD8BFBEA859753406A9956540E633140	2026-09-09 02:30:31.211886+00
fd91849a-e142-401d-8fc8-fae800a06cdb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000074ED0BE885975340BD97B1570E633140	2026-09-09 02:30:32.189884+00
cf66c8f8-1c79-44e1-8798-1638d1c1dfa4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000800EF3E585975340B792C2610E633140	2026-09-09 02:30:33.254062+00
2d835261-a4d8-47ed-8990-e1851b0be603	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EB4E1CE585975340820937740E633140	2026-09-09 02:30:34.195377+00
d7976eb0-ab5a-473c-bcc7-7b76d8d1d05b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DF162CD585975340C3F8C4950E633140	2026-09-09 02:30:35.200636+00
0128ca3d-f038-4ad1-ad15-4a297babd8cc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E51B1BCB859753408D6F39A80E633140	2026-09-09 02:30:36.18939+00
d724270b-6aee-46fd-afa4-23558dcfdc84	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B68075C185975340DB68A5B50E633140	2026-09-09 02:30:37.214971+00
da51ce48-b25b-4759-a5af-ea69da746d12	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008C01C8BF85975340FEE263C10E633140	2026-09-09 02:30:38.232169+00
7f83c4bb-39e7-4392-8413-c14a6ae4b93a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000452454BA85975340755B7DD00E633140	2026-09-09 02:30:39.248332+00
47481b2b-6981-4925-a65b-505a0c4e0b05	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005C4F19A4859753406F568EDA0E633140	2026-09-09 02:30:40.095469+00
658e772e-8d48-4ea7-b6f4-7f4e878ef40d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BB6BBF6B86975340876A4AB20E633140	2026-09-09 02:30:41.228732+00
d167fbec-6311-42df-9da0-486771d260e8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D3DB9F8B86975340D563B6BF0E633140	2026-09-09 02:30:42.261278+00
cd56d87b-7fd4-4e8a-a002-4f9e386c13ef	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C7BAB88D8697534069519FE40E633140	2026-09-09 02:30:43.230455+00
3949a410-a66a-45e0-8251-36cede96f6fb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C7BAB88D869753401CB4571F0F633140	2026-09-09 02:30:44.205967+00
02727fea-38c8-4f1c-856f-1628e55414d8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003800D182869753401C107C670F633140	2026-09-09 02:30:45.229605+00
30b9e4e2-f1a7-45ec-9442-3ee2d9e591e5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000009652B79869753403FE65EBB0F633140	2026-09-09 02:30:46.28506+00
bd8f961d-3586-4138-b386-e1350da3af5b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007AAA436E86975340C8C969F40F633140	2026-09-09 02:30:47.250805+00
ff9773a4-c230-43ee-9952-faf5b9022902	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000156F0965869753409EA6E03A10633140	2026-09-09 02:30:48.221828+00
69c72a83-c480-4ca0-97c3-f50bc6fdd163	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AF33CF5B86975340157B1E9210633140	2026-09-09 02:30:49.25092+00
f741eab3-3c26-4819-b554-7224a2db1ce5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000747ADE8D85975340E6E214C20F633140	2026-09-09 02:30:50.225132+00
5dd985eb-9e21-4242-b46f-10bbcb579a77	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D46B0E6B85975340D4D347E00F633140	2026-09-09 02:30:51.270176+00
9b61e7be-43f4-400f-b611-cdd75ffbde28	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007A51BB5F859753408131112510633140	2026-09-09 02:30:52.218836+00
0e106444-bd55-4513-a676-788ed3295d8b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002D584F52859753406979799510633140	2026-09-09 02:30:53.228347+00
771c7c8b-7acf-4479-8df3-006bfdd23d1d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000003D9A150859753409811836511633140	2026-09-09 02:30:55.209926+00
b36956c3-02f9-454a-b7cc-3d39a1de0b77	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006814DC5985975340093DF60E12633140	2026-09-09 02:30:57.224464+00
1e639bd4-2477-45e3-ade4-acdcd28eb541	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007A51BB5F859753406E02678412633140	2026-09-09 02:30:58.671944+00
5977bd7d-6167-4739-9066-d8bd96f3c40d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5BFF682859753409EA6E03A10633140	2026-09-09 02:31:00.228372+00
b83006d3-1aa0-4750-a1e2-6fe7c2c53443	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F1E0DD80859753403394C95F10633140	2026-09-09 02:31:02.216445+00
ae8c7f83-87da-427e-9844-68b4b17081f6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000027817280859753400F2E782C11633140	2026-09-09 02:31:04.236216+00
6bb67ba7-9a18-47e0-a9b1-0240cfe83097	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EBDBEE8A859753409D2ADF3312633140	2026-09-09 02:31:06.255557+00
4e58139d-3a54-405e-876d-20d2aa32acb6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000021938C9C859753407F25A13E13633140	2026-09-09 02:31:07.933886+00
725fd156-1998-4f28-b610-f1184fb36880	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BCFB2D4B8597534092B06F2711633140	2026-09-09 02:31:09.224855+00
5ee5c456-e732-4f78-8f81-77ce5683d76f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000045B1266085975340AA20504711633140	2026-09-09 02:31:11.230662+00
8162aab1-3429-405b-8e31-5cb4b73db453	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008C32761D85975340A46318C110633140	2026-09-09 02:31:19.205738+00
df5f078e-c647-4eb0-a1c2-34dd6445b7db	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007AF5961785975340A46318C110633140	2026-09-09 02:31:20.248236+00
ec74745c-6a3d-47b7-9f2d-cba3e4694a5a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B69A1A0D859753404A18175811633140	2026-09-09 02:31:22.2449+00
f6772a25-f186-4e90-b52f-a9ad9d67ca85	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003F5013228597534008F53E9F12633140	2026-09-09 02:31:24.24075+00
f11ee46c-a5cd-4f6d-ad22-c99b316e5f13	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000152D8A68859753404F594DD713633140	2026-09-09 02:31:26.20983+00
a4c1ae26-8ea8-466f-b553-1f8a20097bdf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CE97CDD2849753407A9CB34F11633140	2026-09-09 02:31:28.225813+00
22a7a9aa-f849-4434-8692-665bce332e29	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003F390A1085975340CD5257E311633140	2026-09-09 02:31:30.210637+00
06796dc6-6927-44ec-83d4-7e132d2e12af	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008084BC7985975340A9482AF812633140	2026-09-09 02:31:32.2104+00
4ac0537a-5038-4aab-b9ba-947ffeeb42f1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004A5755D48597534020D5B0DF13633140	2026-09-09 02:31:34.222035+00
1e3829b6-9eb4-47e5-be80-93f78fd7bb19	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004A8567F885975340849A215514633140	2026-09-09 02:31:35.490243+00
76200d39-89af-4884-9369-8e9c04625d3f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000038143E5B87975340097140A610633140	2026-09-09 02:31:37.208253+00
2b6f8103-ee6d-4b97-806b-c4457808a410	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DE3E068687975340DA907F6610633140	2026-09-09 02:31:39.225452+00
b2bad6f2-234a-4454-bbc9-d97fe012bc03	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E4CCC012D99553404D9DEC0B8D643140	2026-09-12 08:10:59.070391+00
ea1de825-33b9-4114-9f60-ac4950f56b8a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007A3AB24D85975340CE3EEA0A11633140	2026-09-09 02:30:54.245619+00
30b5c731-575c-4f2c-aef1-a9340c6baa9f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008056AA558597534038656EBE11633140	2026-09-09 02:30:56.229925+00
6ab1e36c-cf99-4e7a-b40d-e603770d149f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BC12375D85975340A990E16712633140	2026-09-09 02:30:58.23324+00
5bd799db-c748-4dda-9d1b-d2d50c33dede	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B6245179859753403F56F0DB10633140	2026-09-09 02:30:59.24282+00
94fdb145-2aec-414f-9721-bd1b791b24d8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000027817280859753404BA8853710633140	2026-09-09 02:31:01.233518+00
ca8b1f26-395a-4db9-b4df-9cb3a3afc4de	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000033A2597E85975340FD6662BA10633140	2026-09-09 02:31:03.231532+00
eb7a5835-14e5-4d36-8f23-ae7e8ce18795	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007A7FCD83859753406EEEF9AB11633140	2026-09-09 02:31:05.225932+00
83656f6a-a4f2-49fa-bb93-d5671c027aa3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D9B51897859753403EDAEED412633140	2026-09-09 02:31:07.228813+00
a8d73562-f48a-4df1-a3c3-61c3de652083	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000057050F78859753406E4A1EF411633140	2026-09-09 02:31:08.214237+00
51c14101-1117-48a3-a2ae-0cf710b4a9c6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009898785185975340F7BD970C11633140	2026-09-09 02:31:10.20122+00
a0b5c4e3-a223-4b09-a6e8-02f6c20b0082	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DFBA078D85975340B55208E412633140	2026-09-09 02:31:14.265223+00
c91f61dc-6c23-43bb-b8de-9c013e38e5fc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C7A64BB5859753402BDF8ECB13633140	2026-09-09 02:31:16.225815+00
06e22e4e-26e8-4cef-9667-154f70249f0c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E047DA3285975340EBB3B92011633140	2026-09-09 02:31:18.215579+00
ad2fcc3e-3cb3-4055-95f9-23c819eadf69	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003859599187975340CE86A17A10633140	2026-09-09 02:31:40.249386+00
69a5bd69-d594-40e7-a66a-3e7d2479c59e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003FCB4E9AE1955340D7F6764B72643140	2026-09-12 08:11:01.471113+00
1d73e852-4d8d-4f15-af41-cd2313f97358	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000682BE56B8597534032607FC811633140	2026-09-09 02:31:13.119456+00
ff0baf2a-7122-47cd-a1d8-faa1697ff24b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DFA3FE7A85975340DF196D5512633140	2026-09-09 02:31:13.280174+00
32f5106f-5064-4fc2-8307-b3a41d4a3f14	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000951BEA0859753403288597913633140	2026-09-09 02:31:15.234086+00
71a8b3e8-fbad-4acd-be9f-ec12cbaf7bcf	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EB200AC1859753400EC6E3FD13633140	2026-09-09 02:31:17.100425+00
17317aa2-9f3a-4ecd-be7a-a80de7db41ef	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000055B71F9587975340BC77D49810633140	2026-09-09 02:31:41.265221+00
479e763d-d5d0-447d-9150-7a53b7bbe690	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009ED38789E19553403CBCE7C072643140	2026-09-12 08:11:01.711397+00
ec48d1a4-a669-4cc1-bf32-ead87c3113e2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000063B3C81B8597534063D0AEE710633140	2026-09-09 02:31:21.21562+00
2def46ba-24eb-47c9-a86c-08c7a2869ef4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CEDCE808859753403EC681FC11633140	2026-09-09 02:31:23.219885+00
7ebe0f2c-390d-4fa7-a40a-dd20e069687c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BCFB2D4B85975340F098CB5713633140	2026-09-09 02:31:25.253738+00
f4a2443e-bb50-4da8-bc35-a1a54bdc921a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000F7052E284975340D3FB219111633140	2026-09-09 02:31:27.22817+00
b8c33bdf-f7e0-4fa2-a5a7-56f07965e363	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002DCE18E6849753408C07A57911633140	2026-09-09 02:31:29.251261+00
7fe0a630-4f16-42fe-8848-7bacd3956251	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000803FA143859753402009FB7612633140	2026-09-09 02:31:31.230992+00
763c5601-57de-42a1-a5da-fdf3feaf51dd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000034CCFAA85975340388D486F13633140	2026-09-09 02:31:33.251791+00
15e09630-6413-4792-be61-ed5c2b46a66b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E5492DEF85975340C0289C3814633140	2026-09-09 02:31:35.213002+00
9f2723e0-a360-4a7d-a2fd-461600ec6ec1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000002017C0187975340D3FB219111633140	2026-09-09 02:31:36.189672+00
989e8524-f829-491e-99c1-49790b55c672	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E443F57B87975340DA907F6610633140	2026-09-09 02:31:38.215589+00
28e1b763-d9ee-4388-875c-d8e96a62b595	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A9B57A9887975340576AACB310633140	2026-09-09 02:31:42.256025+00
5cf62d2f-6522-41e3-93a8-4a358bb61a42	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008B57B4948797534098593AD510633140	2026-09-09 02:31:43.026132+00
334ffa63-de03-4828-9042-6ca91f201e63	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008552C59E879753405DCBBFF110633140	2026-09-09 02:31:44.221005+00
d8858792-a3e7-4ff9-a52f-b8b3fbf60e91	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000008D5BC998797534051C1E10511633140	2026-09-09 02:31:44.642721+00
4a168a7c-ae37-4b96-b965-c4f0723f7b06	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DFCBD82B87975340C2C47AFE0F633140	2026-09-09 02:31:45.250727+00
f4f0c71c-e217-42c1-a405-232a3aa91fba	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000855561D886975340FE9AAC510F633140	2026-09-09 02:31:46.204647+00
5542d1f7-ac51-4fb8-a169-ad0b8bdf7053	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006ECE77A686975340E62ACC310F633140	2026-09-09 02:31:47.230604+00
3110ae52-461c-4068-bc53-04d8d4458b2e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000565E9786869753403424383F0F633140	2026-09-09 02:31:48.212563+00
4a8ffbe9-c7a0-49f9-8dc9-d74a2864c1d5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F7274C7386975340E686F0790F633140	2026-09-09 02:31:49.198667+00
77405e03-5550-44dc-abae-dab3b25e8f2e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A92EE065869753404BF03CA70F633140	2026-09-09 02:31:50.242545+00
fdb3747b-0d1f-4bc2-ae82-2098044908c2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F1F44A5986975340E0DD25CC0F633140	2026-09-09 02:31:51.236544+00
6f79926e-830c-4455-9c78-1c5fa7a29912	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000050FD83488697534022CDB3ED0F633140	2026-09-09 02:31:52.220928+00
74c8caa8-a9bc-42e9-b076-8fbf826c69e4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CD63833B869753408D3BEF1010633140	2026-09-09 02:31:53.231456+00
a9b38b07-ce2e-4428-8f08-8083d38a91fd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000050E67A368697534051AD742D10633140	2026-09-09 02:31:53.851441+00
c8da94c5-8b9c-40bf-9e04-4191a48c2705	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D30C4EE985975340877EB78A0F633140	2026-09-09 02:31:54.217866+00
d0a2d3aa-b757-4597-895d-e9449fb21d42	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005C6622B68597534069ADC32C0F633140	2026-09-09 02:31:55.235917+00
6e86325f-55d4-4f08-966a-60200f153a49	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000039D55A9885975340FE3E88090F633140	2026-09-09 02:31:56.230472+00
9f724b1f-f75b-4428-8bf6-482bde764b1d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B01F628385975340523DE30C0F633140	2026-09-09 02:31:57.232279+00
372e9ec3-d577-473c-8cca-ed11483a200b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000051E9167085975340C3B00D260F633140	2026-09-09 02:31:58.220053+00
f7a6c0b1-20ce-4fe3-afe3-4d359b55d627	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000620FED6385975340AB9C514E0F633140	2026-09-09 02:31:59.219976+00
e7dc0a4a-de71-467c-99d6-b4e2564ac8e9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002753605C85975340B70254820F633140	2026-09-09 02:32:00.2324+00
f8dad0d8-efb1-41ae-a805-3beca8905b30	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AAD55757859753401667B1B90F633140	2026-09-09 02:32:01.230329+00
3582a2d7-3e17-4052-9af5-bbb5aad46a2e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F7B7BA528597534027D2A2E30F633140	2026-09-09 02:32:02.25447+00
36d0a31b-f33d-47c6-bae1-816854affc9c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A4B95F4F85975340F24817F60F633140	2026-09-09 02:32:02.945429+00
853bc1d6-6005-4b77-8d80-55111d521299	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C2E9132F85975340402E162B0F633140	2026-09-09 02:32:03.240738+00
99744720-1a7c-41e0-8f0c-34f1aa79904a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000027F73B14859753405EEB9CB00E633140	2026-09-09 02:32:04.23006+00
258c3f6f-7cf8-4b42-8867-bc6753db5685	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008C0464F984975340AB88E4750E633140	2026-09-09 02:32:05.223623+00
40ec42b3-d828-4cfd-80c0-2382302c38a9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000574DC6E784975340E11170630E633140	2026-09-09 02:32:06.208741+00
083b1ac4-8c81-421c-891e-538d84136e75	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000DACFBDE284975340B18DD36B0E633140	2026-09-09 02:32:07.238688+00
eb17fc6d-ce69-44e7-a6fd-d04a2b814045	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000027B220DE84975340AB88E4750E633140	2026-09-09 02:32:08.230234+00
393f3610-7574-45d0-8ccb-494d306d1317	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000009545ADA84975340F37C618D0E633140	2026-09-09 02:32:09.249987+00
d49237dc-43a1-4227-aa7e-66c9b9886aa8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000759483D984975340E16D94AB0E633140	2026-09-09 02:32:10.228727+00
8bc6b492-d455-46d2-bc6c-6da8962a7a5f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000080B56AD784975340F8DD74CB0E633140	2026-09-09 02:32:11.268623+00
57f9f8a3-0f8b-400f-9930-4991bb749586	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009EE51EB784975340ED1B4E4F0E633140	2026-09-09 02:32:12.060665+00
a5a1e56b-37b4-41db-8d96-b30ce55054c9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A4EA0DAD8497534005300A270E633140	2026-09-09 02:32:12.195872+00
cd13fccb-6846-45f8-9d63-3d6815d45edc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001B3515988497534046C373000E633140	2026-09-09 02:32:13.22471+00
8f9fd72b-9355-4e16-b9e4-e06f5dfd1cc5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B0DDE286849753402349B5F40D633140	2026-09-09 02:32:14.223037+00
0868d415-f2fb-403a-b357-160c194eeef8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D44098808497534046C373000E633140	2026-09-09 02:32:15.230983+00
c6aa354d-b221-462b-ab1f-87c05b0077bc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AAC1EA7E84975340E1B54B1B0E633140	2026-09-09 02:32:16.221308+00
9fef89ee-b7f9-4309-a1ba-3392d189a0fe	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003360DA8184975340709E454A0E633140	2026-09-09 02:32:17.229692+00
5b24cce0-00c4-4146-8e6c-d38b30d6b44f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BCFEC98484975340D50792770E633140	2026-09-09 02:32:18.220725+00
2e4deb01-1e18-425e-b56c-039665382fc9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E67D77868497534010F230A30E633140	2026-09-09 02:32:19.249906+00
c4caf12b-e5d7-4771-97b9-c201abed599d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000459DB98784975340755B7DD00E633140	2026-09-09 02:32:20.215416+00
cc67f0bb-d0c2-4a38-9e5f-48e2417640ff	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000459DB98784975340E7CEA7E90E633140	2026-09-09 02:32:21.212008+00
0f8e3175-aec2-4566-be78-1e3e83610b9c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004BD0BAA184975340F3203D450E633140	2026-09-09 02:32:22.233406+00
574a4849-ab2d-4a0d-8c3e-596003f76e9f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005D0D9AA78497534082AD122C0E633140	2026-09-09 02:32:23.199002+00
07ebcc0f-4db7-4f3d-867b-9b682d22dc50	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000045CBCBAB84975340FF2A1B310E633140	2026-09-09 02:32:24.217482+00
05b55b5f-ff0a-4813-bba5-506a47bfce62	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006F4A79AD84975340ED1B4E4F0E633140	2026-09-09 02:32:25.228626+00
7562f1da-0cff-498b-b27a-b7c3681d558e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000098C926AF84975340AB88E4750E633140	2026-09-09 02:32:26.221964+00
c7b2e2d7-cd73-4523-9524-4d4dca96d9a3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000045CBCBAB8497534010F230A30E633140	2026-09-09 02:32:27.240739+00
268c36cb-e68e-4e75-ae6f-0c31696ee0a7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000081704FA1849753406F568EDA0E633140	2026-09-09 02:32:28.210585+00
3578d970-ae5e-408f-91b9-23b95a335066	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F2B56796849753409F364F1A0F633140	2026-09-09 02:32:29.210453+00
7e2ed496-5f8d-47d9-a392-165b849b81e5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C21AC28C849753402E1F49490F633140	2026-09-09 02:32:30.125917+00
e8d40afd-563c-45bc-af10-02aa9b8850cb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003993DB9B849753409F22E2410E633140	2026-09-09 02:32:31.231757+00
150f49a4-8d4e-4790-b495-5a1adf7ef871	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B610E4A0849753407C4CFFED0D633140	2026-09-09 02:32:32.227336+00
39d365a1-007d-4e3f-ae4d-77f2022d73e0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000092C437B9849753401DE8A1B60D633140	2026-09-09 02:32:33.235994+00
36e15345-3ae0-4357-809b-bb20061eece5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009EFC27C9849753406AE10DC40D633140	2026-09-09 02:32:34.212002+00
a36f57d1-c340-436c-83e5-c2a3a178ffbd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000045F9DDCF8497534052CD51EC0D633140	2026-09-09 02:32:36.047595+00
8997220b-ca2b-49ba-bd66-18432e1adab6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002DB70FD484975340B7369E190E633140	2026-09-09 02:32:36.220588+00
563c5aa8-aae2-4266-a147-0d8001ef0f9c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008CBF48C38497534088B201220E633140	2026-09-09 02:32:37.2515+00
a652696b-e930-4778-889a-a666e0ecdfb4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002DB70FD484975340991DF34B0E633140	2026-09-09 02:32:38.204624+00
3a120520-0389-453a-9702-45126c839cbb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000009E1331DB849753408D1315600E633140	2026-09-09 02:32:39.106483+00
6ba6b73d-4830-4d40-9bf9-1a01c37c910a	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000081423D7D849753400B35F91C0E633140	2026-09-09 02:32:40.216334+00
378cdd7e-8591-4941-b7a1-e1046fdd5e18	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CE0D976684975340CFA67E390E633140	2026-09-09 02:32:41.195182+00
ac6cdf82-5cf0-449a-b2f3-1ea5e8993b99	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000394EC065849753402201FE840E633140	2026-09-09 02:32:42.235849+00
3012c021-01e2-4944-be4a-b400a2e45899	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008D4C1B6984975340C354E9DD0E633140	2026-09-09 02:32:43.236169+00
13f6afda-ed4e-40af-8081-75c6b7abb078	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001B07037484975340E62ACC310F633140	2026-09-09 02:32:44.233147+00
e8de4bbf-0093-42c8-b11e-edb7b390007f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000057C38F7B849753400A01AF850F633140	2026-09-09 02:32:45.204945+00
6ab83892-bd14-41ae-b721-3d6859b40f47	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FEBF458284975340AA549ADE0F633140	2026-09-09 02:32:46.194555+00
1ff9fcfc-2c2c-40db-a16b-343069c6b6b0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000063FB7F8B84975340CE2A7D3210633140	2026-09-09 02:32:47.20768+00
1be3259c-2b8e-458a-8cbe-f962a5d3ea91	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000213A048E8497534086EE48AB10633140	2026-09-09 02:32:48.203749+00
59c81922-b48b-429b-a8ca-3117acd08542	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C2D5A65684975340ECE703B80F633140	2026-09-09 02:32:49.209508+00
008fd4aa-463e-4de4-93ac-0d73ccc77aca	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000081CF0F238497534069519FE40E633140	2026-09-09 02:32:51.205438+00
12871eb4-e11b-4a39-bc84-784b67c1705d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000022B0CD2184975340B1451CFC0E633140	2026-09-09 02:32:53.240414+00
0029ee7f-57be-49e2-9837-f01cefb911da	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000A6EFF258497534010AA79330F633140	2026-09-09 02:32:55.230616+00
dc255696-ae48-49a1-a929-0dc0382106f1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E60A4A2C84975340BD0743780F633140	2026-09-09 02:32:57.234859+00
5214ea32-7142-4319-ac12-1b32be078c90	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F2FD1E06849753403A71DEA40E633140	2026-09-09 02:32:59.218894+00
9ed0843f-b29d-4a51-ba84-3f56989b8c40	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002711E15F84975340E15927D30D633140	2026-09-09 02:33:11.185674+00
b38f1c23-9c97-4b0b-bff5-51b5206d9f04	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008D63247B84975340F9252C3B0E633140	2026-09-09 02:33:13.199887+00
4bedd91b-3176-4058-9722-df917e0b7ca3	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006917789384975340BD4FFAE70E633140	2026-09-09 02:33:15.230635+00
54a0e47b-3743-432f-a650-a458b92de91d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C8050C37859753406304F97E0F633140	2026-09-09 02:33:30.210246+00
e41aba46-55b2-4ffa-8514-03c870d3726e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000152D8A68859753402D33B62110633140	2026-09-09 02:33:32.185437+00
b2f23cac-26f1-4331-8a0f-2a10cb1354c0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C25C4189859753407B88467710633140	2026-09-09 02:33:34.231921+00
9cac2ad9-5ceb-49cf-be72-d4ac27763ead	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000063CAD12D8597534092B06F2711633140	2026-09-09 02:33:36.215481+00
4118d8bf-36c6-4409-bd02-6c52388ed678	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EB68C130859753400985AD7E11633140	2026-09-09 02:33:38.220955+00
d889b0d8-d253-4a94-82aa-31ecb742bc76	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000092F7BBC1E1955340FB84A22F73643140	2026-09-12 08:11:03.26635+00
f059b309-6586-452f-96dc-6738f32bd728	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002DE8BD31849753404C38F4160F633140	2026-09-09 02:32:50.229233+00
db227ae3-90b0-431c-a438-de5959b60512	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000008DF0F6208497534093D04CE60E633140	2026-09-09 02:32:52.22998+00
4796fabd-1647-4d1c-b3ba-ed876dfbe5d9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000A6EFF2584975340F83999130F633140	2026-09-09 02:32:54.236946+00
6bc7b022-e307-4dbd-bac3-f2760b8520b1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D4CD6A268497534022156B5D0F633140	2026-09-09 02:32:56.200928+00
ace90190-5a18-43a7-a81a-fb295f3bb5df	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F819170E849753402E6700B90E633140	2026-09-09 02:32:58.224921+00
fa426a4f-a05e-4709-83fa-cd98e130cafa	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000087BDF506849753408D6F39A80E633140	2026-09-09 02:33:00.229073+00
56124cdb-866f-4a85-94f1-137dcb8fc428	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F2FD1E06849753405EEB9CB00E633140	2026-09-09 02:33:01.210581+00
a928f82c-e82f-4b43-8e86-60e279229220	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E69480988497534034C813F70E633140	2026-09-09 02:33:15.888628+00
7182bf36-8d4f-44e7-9efb-469361b720a2	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000057DA988D8497534029F27FA20D633140	2026-09-09 02:33:17.230594+00
8303c8b0-02c4-4b1b-8c6f-9feb868e7cc9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004BE7C3B384975340F96DE3AA0D633140	2026-09-09 02:33:19.210401+00
ca4b38ec-d555-40e0-a251-f6274cd03346	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F2118CDE84975340E7165F590E633140	2026-09-09 02:33:21.22978+00
602130ef-be28-4326-aea4-ca3aed2b9d4f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000015A353FC84975340CFBAEB110F633140	2026-09-09 02:33:23.230862+00
b7666ec5-9e3f-4fc3-a7c2-0598ed6b0bb1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FD497CEE8497534081655BBC0E633140	2026-09-09 02:33:25.156689+00
ef1b8d6f-ca08-46a8-8bf5-b15b6bf04bf4	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000015A353FC8497534081655BBC0E633140	2026-09-09 02:33:27.239295+00
70fe2ce0-8366-41ea-9ac7-85e2a70cfa7b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000E64CC92885975340579EF64A0F633140	2026-09-09 02:33:29.219977+00
2ce0eaed-800d-4666-93fd-0d7f462606a0	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000067CF0AB11F985340B97768B345653140	2026-09-12 14:00:55.219302+00
c06ea622-168a-4b84-a53e-1ed1897a099d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000CC2C9D6A08985340E00E79701C653140	2026-09-12 14:00:57.229523+00
a432e072-31c6-4ecd-a4c1-5ec9b4b73e5f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AECED66608985340CF1F894D1A653140	2026-09-12 14:00:59.24863+00
0a541085-a356-4cde-9c4d-cf9dca316adb	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000611A868F089853404CF9B59A1A653140	2026-09-12 14:01:02.215478+00
6c4dfbc0-f415-4f62-b10a-11a468376c3e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000096BA1A8F08985340D52478431A653140	2026-09-12 14:01:05.191343+00
fa0033e2-044e-4439-8103-0d9e5fb460a8	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000096A3117D08985340528E137019653140	2026-09-12 14:01:08.210408+00
2ce3149f-eac9-4d31-b45d-71645bc26c48	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000000EEE186808985340DBB9D51819653140	2026-09-12 14:01:11.22471+00
fe4fc569-d7ad-497e-ac1f-9ee5a2c7ec7f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D2318C60089853402F5C0CD418653140	2026-09-12 14:01:14.250104+00
21318799-f370-4669-a140-e8ae6084559b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C610A5620898534059DBB9D518653140	2026-09-12 14:01:15.175635+00
96f04244-ef27-43bc-9c76-1c54ab83f100	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D2318C6008985340CAF2BFA618653140	2026-09-12 14:01:16.207642+00
62f89fa2-d04b-4acf-bf2b-a68fe8c9d763	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EA735A5C08985340C491AC6818653140	2026-09-12 14:01:19.219706+00
117d5720-a097-44fb-be87-e194068ff70d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000073124A5F08985340894BE9F417653140	2026-09-12 14:01:21.046762+00
b8575173-9b2d-4a7f-8c67-9f8e3add41de	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007F33315D08985340A66494C217653140	2026-09-12 14:01:24.260842+00
6b0f861b-1604-4b05-97a1-09182247d89d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004377A45508985340E2F20EA617653140	2026-09-12 14:01:27.187618+00
477b4fb9-d206-4fe8-aae9-a4f8eb48eba5	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000695F2F0384975340FEE263C10E633140	2026-09-09 02:33:02.28456+00
2854b1a3-27b6-48f6-93f7-6de4cb8c0e55	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BC5D8A0684975340044477FF0E633140	2026-09-09 02:33:04.211864+00
929846b3-431e-43df-b8e7-107671dbb940	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000AB37B412849753405DA3E5400F633140	2026-09-09 02:33:06.231231+00
3b39cf69-ea24-4de8-ae33-744998309cd7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000698D412784975340FF72D2A00D633140	2026-09-09 02:33:07.222547+00
1822fa47-aad5-4afc-91de-f5e0cbc4bd0e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C8C38C3A84975340A00E75690D633140	2026-09-09 02:33:09.203695+00
cb1cc1bb-dcb5-4409-acc9-f0f07394665e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000002728EA7184975340173FD7080E633140	2026-09-09 02:33:12.229491+00
77df1093-bc94-4bed-88c5-f775b9f179d6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005DDF8783849753409374289E0E633140	2026-09-09 02:33:14.231099+00
85fd3f4b-125d-4f7d-89b9-68c20f99e0b6	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000A4B95F4F859753400A5DD3CD0F633140	2026-09-09 02:33:31.252379+00
5ecbd4c9-d056-444d-9998-840c94d57bde	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007463D57B859753403999B85510633140	2026-09-09 02:33:33.220294+00
e880a9e4-a86f-478e-8999-6c36b902bfaa	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BCFB2D4B859753403F56F0DB10633140	2026-09-09 02:33:35.210812+00
c788a40d-3626-415a-a8ea-eca0becbe1ae	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000456C0B2A85975340C7951F5D11633140	2026-09-09 02:33:37.242875+00
760bfc6d-1707-45c5-8c8c-2af7bb95d516	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007A23A93B859753402DFF6B8A11633140	2026-09-09 02:33:39.222999+00
edd76ba7-4e75-4bb4-a306-0b7c69afca9e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D808693208985340EBD09FEC1C653140	2026-09-12 14:00:55.616973+00
d03ade71-54bc-459c-ae3e-bbee092499d1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000096A3117D08985340287FF78E1A653140	2026-09-12 14:01:00.284241+00
79d1a776-9ff3-4e0d-9fc2-bfed6125b87b	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C039C890089853403489D57A1A653140	2026-09-12 14:01:03.29384+00
3348135b-83c6-42c3-ac32-d627ae8e4688	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C63EB78608985340286B8AB619653140	2026-09-12 14:01:06.248123+00
6cf1ca44-e8b9-4783-a030-a087ad8e5f07	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FCC74274089853403A1E335019653140	2026-09-12 14:01:09.242403+00
6c2e76ea-b31c-447f-a1e5-7086c84a580c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F08F5264089853406A46ABFF18653140	2026-09-12 14:01:12.2547+00
f7be5e2f-8ca1-4584-8909-da63c90a581d	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000014F3075E08985340D6FC9D9218653140	2026-09-12 14:01:17.308577+00
e667af0c-d0fa-44ff-9b99-35a664cbd2cd	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000049939C5D08985340652D4F3118653140	2026-09-12 14:01:19.609577+00
1d9c4966-3cae-410a-81f4-65533eae6e75	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000D2318C600898534018D8BEDB17653140	2026-09-12 14:01:22.220316+00
97b9f9f7-919d-42e1-a9bf-fcf17a94b744	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F694415A089853402FEC7AB317653140	2026-09-12 14:01:25.23313+00
a04b7d2d-22b4-4805-8727-3f3912cd4ea7	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001AF8F653089853408FF4B3A217653140	2026-09-12 14:01:28.226605+00
940b61da-a9a1-4847-935e-0d86e48b47b9	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C87E7104849753406F568EDA0E633140	2026-09-09 02:33:03.244316+00
6d553cd1-6ece-4231-b17e-042062668d11	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C279820E849753409F364F1A0F633140	2026-09-09 02:33:05.327131+00
a74067b4-b39e-48f1-9504-0708555c5308	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006F92301D84975340C9A18F430E633140	2026-09-09 02:33:06.650388+00
68c30e8b-9858-4d63-8fc0-977ef57b377e	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000F847293284975340A613645F0D633140	2026-09-09 02:33:08.210455+00
887241ac-d452-4628-be0d-e39c8df086b1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000005179854F84975340D5F3249F0D633140	2026-09-09 02:33:10.842883+00
4ecb882f-1d52-422d-a8d7-4c9d894d4157	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000397CD28984975340B7369E190E633140	2026-09-09 02:33:16.232091+00
ba250a6e-ebb9-4721-97eb-c111542ab464	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000006312899D849753408EFFA7870D633140	2026-09-09 02:33:18.233476+00
65278950-ac4e-4b19-9c59-321e0a721747	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000033BCFEC9849753401D44C6FE0D633140	2026-09-09 02:33:20.230795+00
063c11df-6cdd-4ab8-b1f1-02f264f00069	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000FD497CEE84975340286211C30E633140	2026-09-09 02:33:22.210424+00
1ebed436-319f-482e-9d2e-e5bae824ce20	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004B5AF10D859753406F0ED76A0F633140	2026-09-09 02:33:24.231243+00
3bbead78-1073-48a3-a148-5ce9249d14d1	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000004B2CDFE984975340C9FDB38B0E633140	2026-09-09 02:33:26.26058+00
8916e0c5-d534-4edb-85bd-76df1722dc12	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000B0952B178597534028BE350B0F633140	2026-09-09 02:33:28.209424+00
09110520-67a0-4820-9a64-5359e4a78acc	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000BCFB2D4B85975340C1EC54AF11633140	2026-09-09 02:33:40.200085+00
206c1e33-7f62-4b87-ac4a-a3139fc4e488	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000055B4835B08985340D9C1D20A1D653140	2026-09-12 14:00:56.268712+00
05e731d7-a1e7-4362-bd8e-406634b8718c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003D72B55F08985340C88A2B781B653140	2026-09-12 14:00:58.213531+00
26dd2761-f90e-4ed1-8884-b19aa86f07fa	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000795C548B08985340C976BE9F1A653140	2026-09-12 14:01:01.505784+00
8edf80a4-07c8-48d2-91a0-651853ed4e91	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000001F590A9208985340761C3F541A653140	2026-09-12 14:01:04.265064+00
7c0da4b1-e4c1-4421-b80e-93c5839890ea	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000007F61438108985340947DA19119653140	2026-09-12 14:01:07.297568+00
f79443d0-ba2d-4ea5-b256-d403fc05c7ff	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000C00BB66C08985340C9AA083719653140	2026-09-12 14:01:10.287284+00
175d4505-8e72-4b5f-a393-e9e8dd18968f	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000067F1626108985340D053D3E418653140	2026-09-12 14:01:13.247036+00
abcab437-e315-45d1-9461-f42fe5c95c44	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E6100000EA735A5C089853408E08217B18653140	2026-09-12 14:01:18.206011+00
f13feb9f-a7b7-4413-8cab-52a4e9d39267	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000014F3075E08985340773C1C1318653140	2026-09-12 14:01:20.027799+00
71fa058d-8bcc-4d06-ab0c-3dc0ec891129	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E610000073124A5F08985340CADE52CE17653140	2026-09-12 14:01:23.29384+00
e90ffc6c-ad64-4751-b9a7-884ec055bd1c	c3c8b679-7537-497c-a9d2-b45f29d5fa07	0101000020E61000003756BD570898534089EFC4AC17653140	2026-09-12 14:01:26.261528+00
\.


--
-- Data for Name: delivery_partner_locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delivery_partner_locations (partner_id, order_id, latitude, longitude, heading, speed, updated_at) FROM stdin;
84359302-3168-4193-95d9-3a8655e8339a	\N	17.5182693	78.3964135	0	0	2026-09-08 12:26:03.286+00
c3c8b679-7537-497c-a9d2-b45f29d5fa07	\N	17.394762	78.3753967	0	0.06752632558345795	2026-09-13 13:02:21.931+00
c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	\N	17.3947754	78.3754405	89.70542907714844	3.2183990478515625	2026-09-16 01:06:00.572+00
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, content, embedding) FROM stdin;
\.


--
-- Data for Name: group_areas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.group_areas (group_id, area_id) FROM stdin;
\.


--
-- Data for Name: groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.groups (id, name, area_id, description, created_at) FROM stdin;
\.


--
-- Data for Name: inventory_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_history (id, product_variant_combination_id, change_type, quantity_change, new_quantity, order_id, notes, created_at) FROM stdin;
55ac3061-130f-45e2-925b-69d3f8ba456e	2d143dfe-1c4a-47d3-a38e-8bc9dc7c8ba0	sale	-1	99	5ede5947-3053-4d03-bb2f-726873dc077e	\N	2026-09-07 09:46:28.153212+00
36270456-8d2b-4d5f-8c09-c9d54f86f73f	24d3aafb-cfb0-4bc1-928e-718d5a784258	sale	-1	99	5ede5947-3053-4d03-bb2f-726873dc077e	\N	2026-09-07 09:46:28.153212+00
03a0b1c2-5b03-48e9-92be-89a1f3026cce	505e67ec-8d73-45e9-ade9-7aec52f8eea1	sale	-1	99	cf4c142d-36d1-4334-8c4a-a756516a1e4f	\N	2026-09-08 12:05:00.76864+00
092d2c94-904f-474b-8ca2-95611d4fce51	83bfeb53-5dae-4426-8346-e678449de598	sale	-1	99	cf4c142d-36d1-4334-8c4a-a756516a1e4f	\N	2026-09-08 12:05:00.76864+00
bd6e9994-f867-4804-867e-06213c97a80a	609366e8-356c-4ece-a1fd-7bc759660bae	sale	-1	99	567a8f09-76f0-42aa-a59b-2d7fcb0c30f9	\N	2026-09-09 02:34:07.626492+00
2ba68e27-df69-412d-86f7-f3479339b7ee	ba415b1c-8bd4-48f7-bb99-3f86050edd6f	sale	-1	99	96997cdf-1213-4391-837e-a8aabae33d82	\N	2026-09-13 10:13:24.495953+00
89bcfe68-f228-4990-8a62-01cfc1e8a9e8	8161f217-4c07-4076-9039-c348d300c07b	sale	-1	99	54847309-7fba-457e-a0c7-67d62b089286	\N	2026-09-13 10:19:16.100104+00
91214045-1062-4ee5-80d0-233355bbc799	2bda225f-c195-4a1c-aefe-495a3ca66c0b	sale	-1	99	dc53c559-8471-48d4-9eed-efcddf124e31	\N	2026-09-13 10:29:36.967649+00
970efe8b-ca5d-40c5-a6e0-d6788045fe62	2bda225f-c195-4a1c-aefe-495a3ca66c0b	sale	-1	98	dc53c559-8471-48d4-9eed-efcddf124e31	\N	2026-09-13 10:34:15.803516+00
98dc27e4-6b53-41b0-9f1c-5af97988ab2f	505e67ec-8d73-45e9-ade9-7aec52f8eea1	sale	-1	98	60edfc7c-64fb-442f-91b5-ee0c06242c38	\N	2026-09-13 10:50:24.688684+00
b8c1a4cd-cc39-4cd6-b8ce-b31098192913	794d0289-0de1-4f00-9eaf-b158908c30f7	sale	-1	99	22bc8ce9-1066-4b01-a3ea-a9fb52258901	\N	2026-09-13 12:46:02.672729+00
4c758013-c46d-4821-9a24-6b592229989c	277c5463-8315-4361-9258-f6b9e2872048	sale	-1	99	22bc8ce9-1066-4b01-a3ea-a9fb52258901	\N	2026-09-13 12:46:02.672729+00
c4163cb4-c4e7-4b20-83a7-9b9413ff2bbe	d29863e1-ecce-489b-9071-449747927024	sale	-1	99	856bf57d-b5ee-4766-926a-66b73d649c67	\N	2026-09-16 01:13:34.751054+00
\.


--
-- Data for Name: location_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.location_history (id, user_id, user_email, latitude, longitude, device_name, accuracy, "timestamp", created_at) FROM stdin;
\.


--
-- Data for Name: message_summaries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.message_summaries (id, conversation_id, summary, message_count, created_at) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.messages (id, created_at, sender_id, group_id, text, image_url, sender_email, media_url, media_type) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_items (id, order_id, product_variant_combination_id, quantity, price) FROM stdin;
9bd07344-c488-4945-a064-b6372241e590	7c4a51d6-22ce-4750-9bf1-3e388d3de173	\N	1	100000.00
93785299-d0c4-4538-9beb-47c0b6c3cbdb	40f63887-1983-49d1-8602-b1de2de659d4	\N	1	100000.00
bf9efb93-ed96-4785-8cde-8ba008324af0	37ce3520-3b14-439d-817b-79016db46c2f	\N	1	1000000.00
d9edd4ae-1d4a-4b66-9bde-954238a653a1	feab5519-48ed-4dcd-a0c3-7929cc72957a	\N	2	700.00
9e8b699e-c3d6-4906-8ee1-390efb2ce6ca	feab5519-48ed-4dcd-a0c3-7929cc72957a	\N	1	600.00
e4585288-7404-4a2d-a376-18151f5441e3	5ede5947-3053-4d03-bb2f-726873dc077e	2d143dfe-1c4a-47d3-a38e-8bc9dc7c8ba0	1	600.00
0a1d05ce-b36d-4287-be94-17ce260dd5b1	5ede5947-3053-4d03-bb2f-726873dc077e	24d3aafb-cfb0-4bc1-928e-718d5a784258	1	700.00
8889e6fa-2528-469a-ac0c-9142e459999b	b1630ab1-0093-41bc-a86c-1bb3bd25f981	fc4f90d8-0683-4b96-a56e-a3d1d308fb3c	1	700.00
79b3378a-229b-4f04-ab15-5b4e7b362836	b1630ab1-0093-41bc-a86c-1bb3bd25f981	2d143dfe-1c4a-47d3-a38e-8bc9dc7c8ba0	1	600.00
d6f1ddc6-73b5-4192-a947-98a9c7d9ecf7	b1630ab1-0093-41bc-a86c-1bb3bd25f981	794d0289-0de1-4f00-9eaf-b158908c30f7	2	600.00
b5167e6f-64b7-4522-8925-720adc528eb2	c2198ae7-5f0e-4637-93df-4f9bae355ac3	95300a9e-0e59-4f26-95ae-7d77d2e1519d	1	2500.00
5e160295-557d-4c61-887a-8a6d4b5ea648	cf4c142d-36d1-4334-8c4a-a756516a1e4f	505e67ec-8d73-45e9-ade9-7aec52f8eea1	1	380.00
1140eda4-e769-4aad-9cf5-859e9434cc26	cf4c142d-36d1-4334-8c4a-a756516a1e4f	83bfeb53-5dae-4426-8346-e678449de598	1	250.00
6e560cb2-c5d9-4395-9863-6c615e3d080a	5a7a794c-3ae2-4e8f-b148-8a72e18a2039	2d143dfe-1c4a-47d3-a38e-8bc9dc7c8ba0	1	600.00
5dc946c8-c56b-4293-9771-dbd8f31b0a25	e3da1cab-b42a-40a4-8a33-3b28cfb30f57	\N	1	100000.00
41506087-7b45-4031-9efc-da532d280385	5d8f40ac-125c-4661-911e-65e4e8cef410	150764ac-0f51-4770-8d5d-37df4631424d	1	600000.00
8dc217a4-a912-47f8-af66-612157c01a4f	5d8f40ac-125c-4661-911e-65e4e8cef410	8161f217-4c07-4076-9039-c348d300c07b	1	650000.00
f10f499d-dabb-44eb-916e-3213b04a46b4	5d8f40ac-125c-4661-911e-65e4e8cef410	b2570e9e-230b-4296-a7c0-4cf7fc142a1e	1	750000.00
7d92b66c-ef51-492c-ae5f-ef2a5161b255	567a8f09-76f0-42aa-a59b-2d7fcb0c30f9	609366e8-356c-4ece-a1fd-7bc759660bae	1	100.00
b38ef083-38de-4c36-98bf-b855aa438b03	dc822aca-05f9-4eae-83e8-f57bc380476a	2d143dfe-1c4a-47d3-a38e-8bc9dc7c8ba0	1	600.00
3c074d0d-2d3b-415b-9f23-f8052a273dc1	dc822aca-05f9-4eae-83e8-f57bc380476a	24d3aafb-cfb0-4bc1-928e-718d5a784258	1	700.00
79885054-323a-43c8-b67e-e455f37a6b63	ceabd8aa-c7c5-4018-84ed-74bd313b3baf	2804e975-d98f-40ac-b4c5-7cb601fc4750	1	500000.00
478f0dae-ba5f-46d5-9376-8240605ad44a	084689d8-7ee6-4376-96b5-3a8302b1359f	9a6afda3-7d74-4b83-9e7d-34fa05fb267a	1	600000.00
fdae1cf9-28e9-4ad7-84ec-e17f0a83f63b	2fe9a8dc-4ffa-4560-954e-ccd9194d474b	794d0289-0de1-4f00-9eaf-b158908c30f7	2	600.00
3e3f4d5e-43a1-4eed-9161-887c7072442c	bf166a16-9ec6-4834-baaa-1b65981a21bf	4ce07fd5-2a29-4d0c-931a-5ecb2e739a50	1	500000.00
68fabeaa-4dbb-4110-8b29-d2bc9a61d343	1eb111b0-0363-4d9b-b928-93c61a8a942e	505e67ec-8d73-45e9-ade9-7aec52f8eea1	1	380.00
fddf6720-842e-4c39-8930-25db8907aa5b	1eb111b0-0363-4d9b-b928-93c61a8a942e	83bfeb53-5dae-4426-8346-e678449de598	1	250.00
566d739e-81a4-453e-b1df-a74b78432e7d	23e483cb-1f48-4e3e-985c-17e26a7bd36e	2d143dfe-1c4a-47d3-a38e-8bc9dc7c8ba0	1	600.00
f73d365a-1140-4103-9ae9-e750e7312308	498addbc-c8b9-400a-aa4a-dd7d83e7c110	ba415b1c-8bd4-48f7-bb99-3f86050edd6f	1	500000.00
137c93ad-279a-4a3f-8d66-b5aa2e6c0f7c	b70da9d6-ce1e-46bc-b117-85e06fb321ed	8161f217-4c07-4076-9039-c348d300c07b	1	650000.00
ae6ad077-38db-457e-8128-9a2afe13ca4f	7f285a8c-f97b-49d5-9f9a-8369e4d8b3ec	b2570e9e-230b-4296-a7c0-4cf7fc142a1e	1	750000.00
dd36b225-b97a-44ad-87bc-128b0f52d105	a8657367-91ca-4d33-924e-cf7de038424b	9a6afda3-7d74-4b83-9e7d-34fa05fb267a	1	600000.00
a28ec610-5580-4eb4-8460-29f58c220588	ad32931a-f914-4528-a0be-fbb1bc535091	9a6afda3-7d74-4b83-9e7d-34fa05fb267a	1	600000.00
7fca5833-38e1-45f5-be07-c407ae772ca9	7326ec38-2edc-44d0-86e8-8492bf0ccf31	b2570e9e-230b-4296-a7c0-4cf7fc142a1e	1	750000.00
0a83a78e-b68d-47b9-8970-891a74b2d8a7	26e961f5-0848-4dde-a758-daa7ec931e3f	2bda225f-c195-4a1c-aefe-495a3ca66c0b	1	500000.00
61b79aeb-22ad-4660-8570-173ed6c2a97a	96997cdf-1213-4391-837e-a8aabae33d82	ba415b1c-8bd4-48f7-bb99-3f86050edd6f	1	500000.00
63061b3e-46c0-4501-ab4e-5d25d7fed00c	54847309-7fba-457e-a0c7-67d62b089286	8161f217-4c07-4076-9039-c348d300c07b	1	650000.00
e568f476-cc2f-42aa-809d-4b1800132cb0	dc53c559-8471-48d4-9eed-efcddf124e31	2bda225f-c195-4a1c-aefe-495a3ca66c0b	1	500000.00
0e35f772-f152-4608-a966-31245131f138	60edfc7c-64fb-442f-91b5-ee0c06242c38	505e67ec-8d73-45e9-ade9-7aec52f8eea1	1	380.00
a6de4ba1-a627-433f-bfdb-0f8d51f3009f	22bc8ce9-1066-4b01-a3ea-a9fb52258901	794d0289-0de1-4f00-9eaf-b158908c30f7	1	600.00
0b9efa5e-bddd-49c7-875a-eb5548ecb9a1	22bc8ce9-1066-4b01-a3ea-a9fb52258901	277c5463-8315-4361-9258-f6b9e2872048	1	500.00
0e19438a-8ce8-43e3-b67d-f1c42d697bd3	856bf57d-b5ee-4766-926a-66b73d649c67	d29863e1-ecce-489b-9071-449747927024	1	100.00
\.


--
-- Data for Name: order_number_sequences; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_number_sequences (sequence_date, last_value) FROM stdin;
2026-09-06	4
2026-09-07	2
2026-09-08	4
2026-09-09	3
2026-09-10	2
2026-09-12	4
2026-09-13	18
2026-09-16	1
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, user_id, shipping_address, total_amount, status, created_at, payment_method, delivery_manager_id, order_number, order_type, table_no, seller_id) FROM stdin;
7c4a51d6-22ce-4750-9bf1-3e388d3de173	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	{"city": "hyderabad", "name": "narasimha kovvuri", "address": "alkapure township", "country": "India", "postalCode": "500069"}	100000.00	pending_payment	2026-09-06 05:47:03.123426+00	upi	\N	20260906-0001	shop-order	Main counter	\N
40f63887-1983-49d1-8602-b1de2de659d4	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	{"city": "hyderabad", "name": "narasimha kovvuri", "address": "alkapure township", "country": "India", "postalCode": "500069"}	100000.00	processing	2026-09-06 05:47:29.223462+00	cod	\N	20260906-0002	shop-order	Main counter	\N
37ce3520-3b14-439d-817b-79016db46c2f	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	{"city": "hyderabad", "name": "Narasihma Reddy", "phone": "9849535153", "mobile": "9849535153", "address": "pla not 87", "country": "India", "latitude": 17.3962345, "longitude": 78.37549925, "postalCode": "500069"}	1000000.00	processing	2026-09-06 09:36:52.38891+00	cod	\N	20260906-0003	shop-order	Main counter	\N
feab5519-48ed-4dcd-a0c3-7929cc72957a	40744ecd-86dd-407d-9230-cdd3313ac885	{"city": "Narsingi", "name": "Nasing Narsingi shop", "phone": "9849535111", "mobile": "9849535111", "address": "Healthway, Narsingi", "country": "India", "latitude": 17.3971965463041, "longitude": 78.3525981903949, "postalCode": "500089"}	2000.00	completed	2026-09-06 20:26:28.435397+00	upi	\N	20260906-0004	shop-order	Main counter	\N
e3da1cab-b42a-40a4-8a33-3b28cfb30f57	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	{"city": "hyderabad", "name": "Narasihma Reddy", "phone": "9849535153", "mobile": "9849535153", "address": "pla not 87", "country": "India", "latitude": 17.3962345, "longitude": 78.37549925, "postalCode": "500069"}	100000.00	processing	2026-09-08 10:03:15.597759+00	cod	\N	20260908-0001	shop-order	Main counter	\N
084689d8-7ee6-4376-96b5-3a8302b1359f	a59dbff8-2dde-4ac3-a2df-e881be9b2a25	{"city": "Ibrahim Bagh", "name": "Narasimha Grocwey", "phone": "8328426765", "mobile": "8328426765", "address": "Narsingi, Alkapur Township", "country": "India", "latitude": 17.3940791348769, "longitude": 78.37395429611206, "postalCode": "500089"}	600000.00	processing	2026-09-10 18:44:07.411515+00	cod	\N	20260910-0002	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
1eb111b0-0363-4d9b-b928-93c61a8a942e	a4306874-67b7-422c-a616-d2a4bcf31f2c	{"city": "Hyderabad", "name": "Naraimha Reddy app2", "phone": "9849535152", "mobile": "9849535152", "address": "Satavahana Nagar, Vasantha Nagar", "country": "India", "latitude": 17.50014841, "longitude": 78.38978243, "postalCode": "500085"}	630.00	processing	2026-09-12 07:07:26.498949+00	cod	\N	20260912-0003	delivery	\N	e125551d-8f87-42a2-9a42-75fde4d47549
23e483cb-1f48-4e3e-985c-17e26a7bd36e	131f51a1-df0c-4571-85ab-b1d23817da07	{"city": "Manchirevula", "name": "Vikram Raju", "phone": "9502080135", "mobile": "9502080135", "address": "Golden Mile Road, Kokapet", "country": "India", "latitude": 17.3917799, "longitude": 78.3416655, "postalCode": "500075"}	600.00	processing	2026-09-12 08:06:36.234272+00	cod	\N	20260912-0004	delivery	\N	40744ecd-86dd-407d-9230-cdd3313ac885
26e961f5-0848-4dde-a758-daa7ec931e3f	bf05ba57-8b0a-4f35-9449-3aad3c81fc59	{"city": "Ibrahim Bagh", "name": "Narasimha Twenty", "phone": "9849535153", "mobile": "9849535153", "address": "Narsingi, Puppalguda", "country": "India", "latitude": 17.3955948, "longitude": 78.3769343, "postalCode": "500089"}	500000.00	processing	2026-09-13 07:28:53.145912+00	cod	\N	20260913-0008	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
2fe9a8dc-4ffa-4560-954e-ccd9194d474b	a4306874-67b7-422c-a616-d2a4bcf31f2c	{"city": "Hyderabad", "name": "Naraimha Reddy app2", "phone": "9849535152", "mobile": "9849535152", "address": "Satavahana Nagar, Vasantha Nagar", "country": "India", "latitude": 17.50014841, "longitude": 78.38978243, "postalCode": "500085"}	1200.00	processing	2026-09-12 07:07:23.834222+00	cod	\N	20260912-0001	delivery	\N	40744ecd-86dd-407d-9230-cdd3313ac885
498addbc-c8b9-400a-aa4a-dd7d83e7c110	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	{"city": "hyderabad", "name": "Narasihma Reddy", "phone": "9849535153", "mobile": "9849535153", "address": "hiteck city LG cafe", "country": "India", "latitude": 17.44824385, "longitude": 78.38195801, "postalCode": "500069"}	500000.00	processing	2026-09-13 05:30:47.87381+00	cod	\N	20260913-0001	shop-order	Main counter	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
567a8f09-76f0-42aa-a59b-2d7fcb0c30f9	a4306874-67b7-422c-a616-d2a4bcf31f2c	{"city": "Hyderabad", "name": "Naraimha Reddy app2", "phone": "9849535153", "mobile": "9849535153", "address": "Ward 114 KPHB Colony, Satyanarayanaswamy Nagar", "country": "India", "latitude": 17.49618378, "longitude": 78.38376045, "postalCode": "500085"}	100.00	completed	2026-09-09 02:18:36.675365+00	cod	c3c8b679-7537-497c-a9d2-b45f29d5fa07	20260909-0002	delivery	\N	0f4611de-7b02-4212-a1ea-4ea9f3c22620
5a7a794c-3ae2-4e8f-b148-8a72e18a2039	40744ecd-86dd-407d-9230-cdd3313ac885	{"city": "Narsingi", "name": "narsimhaaipapp5 reddy", "phone": "9849535111", "mobile": "9849535111", "address": "Healthway, Narsingi", "country": "India", "latitude": 17.3971965463041, "longitude": 78.3525981903949, "postalCode": "500089"}	600.00	out_for_delivery	2026-09-08 12:22:16.078279+00	cod	\N	20260908-0004	shop-order	Main counter	40744ecd-86dd-407d-9230-cdd3313ac885
5d8f40ac-125c-4661-911e-65e4e8cef410	a4306874-67b7-422c-a616-d2a4bcf31f2c	{"city": "Hyderabad", "name": "Naraimha Reddy app2", "phone": "9849535153", "mobile": "9849535153", "address": "Ward 114 KPHB Colony, Satyanarayanaswamy Nagar", "country": "India", "latitude": 17.49618378, "longitude": 78.38376045, "postalCode": "500085"}	2000000.00	cancelled	2026-09-09 01:51:18.163992+00	cod	c3c8b679-7537-497c-a9d2-b45f29d5fa07	20260909-0001	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
5ede5947-3053-4d03-bb2f-726873dc077e	40744ecd-86dd-407d-9230-cdd3313ac885	{"city": "Narsingi", "name": "narsimhaaipapp5 reddy", "phone": "9849535111", "mobile": "9849535111", "address": "Healthway, Narsingi", "country": "India", "latitude": 17.3971965463041, "longitude": 78.3525981903949, "postalCode": "500089"}	1300.00	completed	2026-09-07 09:45:58.816514+00	upi	\N	20260907-0001	shop-order	Main counter	40744ecd-86dd-407d-9230-cdd3313ac885
7326ec38-2edc-44d0-86e8-8492bf0ccf31	bf05ba57-8b0a-4f35-9449-3aad3c81fc59	{"city": "Ibrahim Bagh", "name": "Narasimha Twenty", "phone": "9849535153", "mobile": "9849535153", "address": "Narsingi, Puppalguda", "country": "India", "latitude": 17.3955948, "longitude": 78.3769343, "postalCode": "500089"}	750000.00	processing	2026-09-13 07:25:18.714261+00	cod	\N	20260913-0007	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
7f285a8c-f97b-49d5-9f9a-8369e4d8b3ec	bf05ba57-8b0a-4f35-9449-3aad3c81fc59	{"city": "Ibrahim Bagh", "name": "Narasimha Twenty", "phone": "9849535153", "mobile": "9849535153", "address": "Narsingi, Puppalguda", "country": "India", "latitude": 17.395594800000005, "longitude": 78.3769343, "postalCode": "500089"}	750000.00	processing	2026-09-13 06:34:51.325342+00	cod	\N	20260913-0003	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
a8657367-91ca-4d33-924e-cf7de038424b	bf05ba57-8b0a-4f35-9449-3aad3c81fc59	{"city": "Ibrahim Bagh", "name": "Narasimha Twenty", "phone": "9849535153", "mobile": "9849535153", "address": "Narsingi, Puppalguda", "country": "India", "latitude": 17.3955948, "longitude": 78.3769343, "postalCode": "500089"}	600000.00	processing	2026-09-13 07:17:56.058803+00	cod	\N	20260913-0005	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
ad32931a-f914-4528-a0be-fbb1bc535091	bf05ba57-8b0a-4f35-9449-3aad3c81fc59	{"city": "Ibrahim Bagh", "name": "Narasimha Twenty", "phone": "9849535153", "mobile": "9849535153", "address": "Narsingi, Puppalguda", "country": "India", "latitude": 17.3955948, "longitude": 78.3769343, "postalCode": "500089"}	600000.00	processing	2026-09-13 07:21:01.872031+00	cod	\N	20260913-0006	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
b1630ab1-0093-41bc-a86c-1bb3bd25f981	40744ecd-86dd-407d-9230-cdd3313ac885	{"city": "Narsingi", "name": "narsimhaaipapp5 reddy", "phone": "9849535111", "mobile": "9849535111", "address": "Healthway, Narsingi", "country": "India", "latitude": 17.3971965463041, "longitude": 78.3525981903949, "postalCode": "500089"}	2500.00	processing	2026-09-07 09:48:46.202545+00	cod	\N	20260907-0002	shop-order	Main counter	40744ecd-86dd-407d-9230-cdd3313ac885
b70da9d6-ce1e-46bc-b117-85e06fb321ed	54862933-5dd9-4f58-929b-3fe71d29c733	{"city": "Ibrahim Bagh", "name": "narasimhaaipp2 reddy", "phone": "9849535153", "mobile": "9849535153", "address": "Royal Heights, Narsingi, Fair Fields Colony", "country": "India", "latitude": 17.394893748217367, "longitude": 78.37697982788087, "postalCode": "500089"}	650000.00	processing	2026-09-13 05:36:19.171706+00	cod	\N	20260913-0002	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
bf166a16-9ec6-4834-baaa-1b65981a21bf	a4306874-67b7-422c-a616-d2a4bcf31f2c	{"city": "Hyderabad", "name": "Naraimha Reddy app2", "phone": "9849535152", "mobile": "9849535152", "address": "Satavahana Nagar, Vasantha Nagar", "country": "India", "latitude": 17.50014841, "longitude": 78.38978243, "postalCode": "500085"}	500000.00	processing	2026-09-12 07:07:26.034113+00	cod	\N	20260912-0002	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
c2198ae7-5f0e-4637-93df-4f9bae355ac3	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	{"city": "hyderabad", "name": "Narasihma Reddy", "phone": "9849535153", "mobile": "9849535153", "address": "pla not 87", "country": "India", "latitude": 17.3962345, "longitude": 78.37549925, "postalCode": "500069"}	2500.00	processing	2026-09-08 12:04:20.530698+00	cod	\N	20260908-0002	shop-order	Main counter	4e70fd28-564e-4352-9335-f751a5ea7fce
ceabd8aa-c7c5-4018-84ed-74bd313b3baf	38c510c6-7543-4e22-a983-89dae86ced97	{"city": "Hyderabad", "name": "narasimha grocery", "phone": "8328426765", "mobile": "8328426765", "address": "Gachibowli Flyover, Ward 104 Kondapur", "country": "India", "latitude": 17.438209699742057, "longitude": 78.3644485473633, "postalCode": "500032"}	500000.00	processing	2026-09-10 18:32:49.044216+00	cod	\N	20260910-0001	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
dc822aca-05f9-4eae-83e8-f57bc380476a	a4306874-67b7-422c-a616-d2a4bcf31f2c	{"city": "Ibrahim Bagh", "name": "Naraimha Reddy app2", "phone": "9849535152", "mobile": "9849535152", "address": "Manikonda, Greenlands", "country": "India", "latitude": 17.3868083, "longitude": 78.3675357, "postalCode": "500089"}	1300.00	cancelled	2026-09-09 02:27:30.558513+00	cod	c3c8b679-7537-497c-a9d2-b45f29d5fa07	20260909-0003	delivery	\N	40744ecd-86dd-407d-9230-cdd3313ac885
72537550-df37-4732-8631-993df4d63328	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	{"city": "hyderabad", "name": "Narasihma Reddy", "phone": "9849535153", "mobile": "9849535153", "address": "pla not 87", "country": "India", "latitude": 17.3962345, "longitude": 78.37549925, "postalCode": "500069"}	600000.00	shipped	2026-09-13 09:33:08.912372+00	cod	\N	20260913-0009	shop-order	Main counter	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
42231b4e-3b0d-4851-8a00-b1886a87242d	54862933-5dd9-4f58-929b-3fe71d29c733	{"city": "Ibrahim Bagh", "name": "narasimhaaipp2 reddy", "phone": "9849535153", "mobile": "9849535153", "address": "Royal Heights, Narsingi, Fair Fields Colony", "country": "India", "latitude": 17.39489375, "longitude": 78.37697983, "postalCode": "500089"}	650000.00	processing	2026-09-13 09:41:58.719042+00	cod	\N	20260913-0010	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
779f8473-fdb4-4e3b-98a4-3872de3afe2f	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	{"city": "hyderabad", "name": "Narasihma Reddy", "phone": "9849535153", "mobile": "9849535153", "address": "pla not 87", "country": "India", "latitude": 17.3962345, "longitude": 78.37549925, "postalCode": "500069"}	500000.00	processing	2026-09-13 09:55:43.509519+00	cod	\N	20260913-0013	shop-order	Main counter	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
96997cdf-1213-4391-837e-a8aabae33d82	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	{"city": "hyderabad", "name": "Narasihma Reddy", "phone": "9849535153", "mobile": "9849535153", "address": "pla not 87", "country": "India", "latitude": 17.3962345, "longitude": 78.37549925, "postalCode": "500069"}	500000.00	out_for_delivery	2026-09-13 10:13:24.190355+00	cod	\N	20260913-0014	shop-order	Main counter	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
8c14e6a8-6c49-423f-a7c4-b1e3ebbf7a75	54862933-5dd9-4f58-929b-3fe71d29c733	{"city": "Ibrahim Bagh", "name": "narasimhaaipp2 reddy", "phone": "9849535153", "mobile": "9849535153", "address": "Narsingi, Puppalguda", "country": "India", "latitude": 17.3947676, "longitude": 78.3754298, "postalCode": "500089"}	1000000.00	Completed	2026-09-13 09:48:18.796507+00	cod	c3c8b679-7537-497c-a9d2-b45f29d5fa07	20260913-0012	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
54847309-7fba-457e-a0c7-67d62b089286	54862933-5dd9-4f58-929b-3fe71d29c733	{"city": "Ibrahim Bagh", "name": "narasimhaaipp2 reddy", "phone": "9849535153", "mobile": "9849535153", "address": "Royal Heights, Narsingi, Fair Fields Colony", "country": "India", "latitude": 17.39489375, "longitude": 78.37697983, "postalCode": "500089"}	650000.00	Completed	2026-09-13 10:19:15.906716+00	cod	c3c8b679-7537-497c-a9d2-b45f29d5fa07	20260913-0015	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
dc53c559-8471-48d4-9eed-efcddf124e31	54862933-5dd9-4f58-929b-3fe71d29c733	{"city": "Ibrahim Bagh", "name": "narasimhaaipp2 reddy", "phone": "9849535153", "mobile": "9849535153", "address": "Narsingi, Puppalguda", "country": "India", "latitude": 17.3947676, "longitude": 78.3754298, "postalCode": "500089"}	500000.00	completed	2026-09-13 10:29:36.811644+00	cod	c3c8b679-7537-497c-a9d2-b45f29d5fa07	20260913-0016	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
cf4c142d-36d1-4334-8c4a-a756516a1e4f	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	{"city": "hyderabad", "name": "Narasihma Reddy", "phone": "9849535153", "mobile": "9849535153", "address": "pla not 87", "country": "India", "latitude": 17.3962345, "longitude": 78.37549925, "postalCode": "500069"}	630.00	cancelled	2026-09-08 12:04:21.04847+00	cod	\N	20260908-0003	shop-order	Main counter	e125551d-8f87-42a2-9a42-75fde4d47549
d43bfeec-5182-422e-86b6-27252fff11eb	54862933-5dd9-4f58-929b-3fe71d29c733	{"city": "Ibrahim Bagh", "name": "narasimhaaipp2 reddy", "phone": "9849535153", "mobile": "9849535153", "address": "Royal Heights, Narsingi, Fair Fields Colony", "country": "India", "latitude": 17.39489375, "longitude": 78.37697983, "postalCode": "500089"}	650000.00	Completed	2026-09-13 09:42:22.4294+00	cod	c3c8b679-7537-497c-a9d2-b45f29d5fa07	20260913-0011	delivery	\N	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331
856bf57d-b5ee-4766-926a-66b73d649c67	a59dbff8-2dde-4ac3-a2df-e881be9b2a25	{"city": "Ibrahim Bagh", "name": "Narasimha Grocwey", "phone": "8328426765", "mobile": "8328426765", "address": "Narsingi, Alkapur Township", "country": "India", "latitude": 17.39407913, "longitude": 78.3739543, "postalCode": "500089"}	100.00	processing	2026-09-16 01:13:34.56097+00	cod	\N	20260916-0001	shop-order	Main counter	a59dbff8-2dde-4ac3-a2df-e881be9b2a25
60edfc7c-64fb-442f-91b5-ee0c06242c38	54862933-5dd9-4f58-929b-3fe71d29c733	{"city": "Ibrahim Bagh", "name": "narasimhaaipp2 reddy", "phone": "9849535153", "mobile": "9849535153", "address": "Royal Heights, Narsingi, Fair Fields Colony", "country": "India", "latitude": 17.39489375, "longitude": 78.37697983, "postalCode": "500089"}	380.00	Completed	2026-09-13 10:50:24.342403+00	cod	c3c8b679-7537-497c-a9d2-b45f29d5fa07	20260913-0017	delivery	\N	e125551d-8f87-42a2-9a42-75fde4d47549
22bc8ce9-1066-4b01-a3ea-a9fb52258901	303c99b8-f76d-4c55-a23b-38c86c9bee99	{"city": "Ibrahim Bagh", "name": "narasimh rrr", "phone": "9849535153", "mobile": "9849535153", "address": "Narsingi, Puppalguda", "country": "India", "latitude": 17.395609783785787, "longitude": 78.37549924850465, "postalCode": "500089"}	1100.00	Completed	2026-09-13 12:46:02.345236+00	cod	c3c8b679-7537-497c-a9d2-b45f29d5fa07	20260913-0018	delivery	\N	40744ecd-86dd-407d-9230-cdd3313ac885
\.


--
-- Data for Name: places; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.places (id, name, location) FROM stdin;
\.


--
-- Data for Name: product_media; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_media (id, product_id, media_url, media_type, created_at) FROM stdin;
e1b5cddc-55bc-4476-b6d6-a76c10eb4148	4042a0ea-93ff-473e-8f20-61b6d8c79d16	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/4042a0ea-93ff-473e-8f20-61b6d8c79d16/1788714711684_c8581o.jpg	image	2026-09-06 17:11:53.431405+00
d72cf89b-6f24-4685-a082-be8e5d893e61	4042a0ea-93ff-473e-8f20-61b6d8c79d16	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/4042a0ea-93ff-473e-8f20-61b6d8c79d16/1788714713009_9co9ji.jpg	image	2026-09-06 17:11:55.882676+00
ede2088b-2b41-4128-9434-a7a5055b9e5a	4042a0ea-93ff-473e-8f20-61b6d8c79d16	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/4042a0ea-93ff-473e-8f20-61b6d8c79d16/1788714715414_1pc7ji.jpg	image	2026-09-06 17:11:56.195559+00
cbadf92c-3eca-4166-be00-fabf5e505c95	ad9eb743-c4ac-4653-87a3-3afb09e781f8	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/ad9eb743-c4ac-4653-87a3-3afb09e781f8/1788724427875_6pjg8u.jpg	image	2026-09-06 19:53:48.236711+00
b9a3d298-ea21-468e-84a2-1628be141223	ad9eb743-c4ac-4653-87a3-3afb09e781f8	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/ad9eb743-c4ac-4653-87a3-3afb09e781f8/1788724428597_pt5ydw.jpg	image	2026-09-06 19:53:48.578623+00
af285852-cea1-4ed6-a670-2d6c1b9ecd59	4e6ccebe-759c-45a9-a5f6-968020dc1984	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/4e6ccebe-759c-45a9-a5f6-968020dc1984/1788724562608_914wzb.jpg	image	2026-09-06 19:56:02.730115+00
826de05d-3098-448b-8051-44678b74f773	4e6ccebe-759c-45a9-a5f6-968020dc1984	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/4e6ccebe-759c-45a9-a5f6-968020dc1984/1788724563097_gm4h9e.jpg	image	2026-09-06 19:56:03.364743+00
e16d3141-9889-4a03-93ef-8247992bbf72	0830f456-3b34-48e7-9ce5-faed5ea8f801	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/0830f456-3b34-48e7-9ce5-faed5ea8f801/1788725181405_re93tl.jpg	image	2026-09-06 20:06:21.831837+00
adfd7a3b-e50b-46d2-bc2c-2aeeeafb4589	0830f456-3b34-48e7-9ce5-faed5ea8f801	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/0830f456-3b34-48e7-9ce5-faed5ea8f801/1788725182191_f7gjp1.jpg	image	2026-09-06 20:06:22.274385+00
e7af4bfd-b8fe-4f2e-9f87-02c74434bb74	896ef96e-5fe5-473d-9562-87e7d8774dcc	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/896ef96e-5fe5-473d-9562-87e7d8774dcc/1788769236841_01i0i8.jpg	image	2026-09-07 08:20:38.289379+00
57ee00ec-a9f0-4c38-a7ac-701e2f46a88e	ef5d373d-fcff-402d-868e-39581839b4bd	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/ef5d373d-fcff-402d-868e-39581839b4bd/1788891071365_da2xti.png	image	2026-09-08 18:11:12.862559+00
c620bdf6-3dc2-47da-a953-79d109cd0379	ef5d373d-fcff-402d-868e-39581839b4bd	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/ef5d373d-fcff-402d-868e-39581839b4bd/1788891072401_0f0pyw.png	image	2026-09-08 18:11:13.38507+00
d64efae1-2982-4ff7-a66a-c124c7950dba	ef5d373d-fcff-402d-868e-39581839b4bd	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/ef5d373d-fcff-402d-868e-39581839b4bd/1788891072921_o6jzmu.png	image	2026-09-08 18:11:13.990064+00
84b45d25-eb03-4cdf-99f2-b79716acaf1b	9f7bf200-d458-4284-bfb7-43daf6d58da0	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/9f7bf200-d458-4284-bfb7-43daf6d58da0/1788891538953_zx7vsq.png	image	2026-09-08 18:19:00.509601+00
8b2dd673-9b74-4708-9068-d993a1a63d53	9f7bf200-d458-4284-bfb7-43daf6d58da0	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/9f7bf200-d458-4284-bfb7-43daf6d58da0/1788891540056_lisjs8.png	image	2026-09-08 18:19:01.25583+00
95b39481-26b3-4fce-86c8-15078b6c3806	9f7bf200-d458-4284-bfb7-43daf6d58da0	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/9f7bf200-d458-4284-bfb7-43daf6d58da0/1788891540751_2necn5.png	image	2026-09-08 18:19:02.018798+00
5058dad6-cb2b-418d-9ecd-8bb12b8eb18c	e8a9631b-b2e1-4db2-bf63-686975645f6c	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/e8a9631b-b2e1-4db2-bf63-686975645f6c/1788891955299_ghkrxi.png	image	2026-09-08 18:25:57.093523+00
9144ebc9-9397-4cf0-9dc3-93872c05a5ae	1d4e3559-dbf3-4ece-9202-4aa8f0c54cc3	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/1d4e3559-dbf3-4ece-9202-4aa8f0c54cc3/1788892080739_4xd4cc.png	image	2026-09-08 18:28:02.267102+00
df497536-5e2f-4b5c-8022-36f8bcb901b1	354ce661-081d-4902-93e6-13ff1c14df26	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/354ce661-081d-4902-93e6-13ff1c14df26/1788892366406_0unwi7.png	image	2026-09-08 18:32:48.033249+00
67da0777-aa93-4307-bf92-052b732beba8	19385258-d235-4c36-a8cb-6888a39e0099	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/19385258-d235-4c36-a8cb-6888a39e0099/1789053874547_zfv6kr.jpg	image	2026-09-10 15:24:35.345508+00
82dc543d-9bf8-4432-bf5e-d6ffab281b22	33ed195b-fd87-413e-b52c-d0772a4b3f08	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/33ed195b-fd87-413e-b52c-d0772a4b3f08/1789053908943_bxg3hl.jpg	image	2026-09-10 15:25:09.315067+00
f70fcf95-7f2a-4de8-9054-ae97e56dbf87	130c7db7-ddca-4d62-be1b-84ed530a7a4c	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/130c7db7-ddca-4d62-be1b-84ed530a7a4c/1789054035448_vbl1p0.jpg	image	2026-09-10 15:27:15.851782+00
3e0f5d29-298b-4a1b-bc86-bf185cd9137e	c08ad2a5-8c29-47e6-b934-9f6ae872d740	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/c08ad2a5-8c29-47e6-b934-9f6ae872d740/1789054063874_lhalxb.jpg	image	2026-09-10 15:27:43.965765+00
2cd2ccc4-f200-4c43-bafa-6455f19fdbff	54d87e16-5220-443b-9970-b6dda380a1f6	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/54d87e16-5220-443b-9970-b6dda380a1f6/1789054104770_pzj91g.jpg	image	2026-09-10 15:28:25.14914+00
d82b06c4-f62b-4648-93e2-6a5111b8bf22	3da479cf-3073-42f9-9bbf-b9d02d527fc1	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/product_media/3da479cf-3073-42f9-9bbf-b9d02d527fc1/1789521104218_71v2y8.jpg	image	2026-09-16 01:11:43.368151+00
\.


--
-- Data for Name: product_variant_combinations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_variant_combinations (id, product_id, combination_string, price, quantity, sku) FROM stdin;
9a6afda3-7d74-4b83-9e7d-34fa05fb267a	9f7bf200-d458-4284-bfb7-43daf6d58da0	Default	600000.00	100	
150764ac-0f51-4770-8d5d-37df4631424d	e8a9631b-b2e1-4db2-bf63-686975645f6c	Default	600000.00	100	
b2570e9e-230b-4296-a7c0-4cf7fc142a1e	354ce661-081d-4902-93e6-13ff1c14df26	Default	750000.00	100	
609366e8-356c-4ece-a1fd-7bc759660bae	896ef96e-5fe5-473d-9562-87e7d8774dcc	potato:small	100.00	99	small
2804e975-d98f-40ac-b4c5-7cb601fc4750	19385258-d235-4c36-a8cb-6888a39e0099	Default	500000.00	100	
c84a5c35-9192-4c42-83ee-34df787b2118	33ed195b-fd87-413e-b52c-d0772a4b3f08	Default	500000.00	100	
56b9409e-f51d-4a89-b581-642b257923ac	c08ad2a5-8c29-47e6-b934-9f6ae872d740	Default	500000.00	100	
4ce07fd5-2a29-4d0c-931a-5ecb2e739a50	54d87e16-5220-443b-9970-b6dda380a1f6	Default	500000.00	100	
ba415b1c-8bd4-48f7-bb99-3f86050edd6f	ef5d373d-fcff-402d-868e-39581839b4bd	Default	500000.00	99	
8161f217-4c07-4076-9039-c348d300c07b	1d4e3559-dbf3-4ece-9202-4aa8f0c54cc3	Default	650000.00	99	
2bda225f-c195-4a1c-aefe-495a3ca66c0b	130c7db7-ddca-4d62-be1b-84ed530a7a4c	Default	500000.00	98	
505e67ec-8d73-45e9-ade9-7aec52f8eea1	4042a0ea-93ff-473e-8f20-61b6d8c79d16	Fry piece Biriyani:Full	380.00	98	Full
794d0289-0de1-4f00-9eaf-b158908c30f7	ad9eb743-c4ac-4653-87a3-3afb09e781f8	Shirt:Large	600.00	99	Large
277c5463-8315-4361-9258-f6b9e2872048	ad9eb743-c4ac-4653-87a3-3afb09e781f8	Shirt:Small	500.00	99	Small
d29863e1-ecce-489b-9071-449747927024	3da479cf-3073-42f9-9bbf-b9d02d527fc1	Default	100.00	99	
95300a9e-0e59-4f26-95ae-7d77d2e1519d	f94dd944-ec0d-404d-9f82-790bdca8e88a	Default	2500.00	100	
83bfeb53-5dae-4426-8346-e678449de598	4042a0ea-93ff-473e-8f20-61b6d8c79d16	Fry piece Biriyani:Half	250.00	99	Half
fc4f90d8-0683-4b96-a56e-a3d1d308fb3c	0830f456-3b34-48e7-9ce5-faed5ea8f801	Sarries:Large	700.00	48	Large
73ce1da6-f539-44a3-a29d-cb34ef50a12a	0830f456-3b34-48e7-9ce5-faed5ea8f801	Sarries:Small	600.00	5	Small
2d143dfe-1c4a-47d3-a38e-8bc9dc7c8ba0	4e6ccebe-759c-45a9-a5f6-968020dc1984	Pants:Small	600.00	99	Small
24d3aafb-cfb0-4bc1-928e-718d5a784258	4e6ccebe-759c-45a9-a5f6-968020dc1984	Pants:Large	700.00	99	Large
\.


--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_variants (id, product_id, name) FROM stdin;
054a8cf9-ca3d-4b54-9da3-3cdae3255ddf	4042a0ea-93ff-473e-8f20-61b6d8c79d16	Fry piece Biriyani
a557b6d5-c102-49d4-8b36-eef94e89e27e	896ef96e-5fe5-473d-9562-87e7d8774dcc	potato
8f0dc402-cac2-4492-8020-7ff892200cbb	4e6ccebe-759c-45a9-a5f6-968020dc1984	Pants
da96918d-261b-4afe-ab2e-c3825bee1cb1	ad9eb743-c4ac-4653-87a3-3afb09e781f8	Shirt
249266a4-9e6a-4ec6-9e67-92c6913a30be	0830f456-3b34-48e7-9ce5-faed5ea8f801	Sarries
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, customer_id, product_name, amount, size, start_date, end_date, is_active, display_order, created_at, updated_at, description, product_type, unit, user_id, visible_from, visible_to, category_id, subcategory_id, subcategory) FROM stdin;
4042a0ea-93ff-473e-8f20-61b6d8c79d16	\N	Biriyani's	250.00	\N	2026-09-06	2026-09-30	t	0	2026-09-06 14:58:48.76548+00	2026-09-06 14:58:48.76548+00		snacks_beverages	pack	e125551d-8f87-42a2-9a42-75fde4d47549	2026-09-06 14:57:06.353+00	2026-09-06 14:57:06.353+00	49e1bd86-2793-4ff2-90b4-7dbcc1f6bfa1	\N	\N
896ef96e-5fe5-473d-9562-87e7d8774dcc	\N	tset	100.00	\N	2026-09-07	2026-09-30	t	0	2026-09-07 08:20:35.290666+00	2026-09-07 08:20:35.290666+00	test	grocery		0f4611de-7b02-4212-a1ea-4ea9f3c22620	2026-09-07 08:19:38.549+00	2026-09-07 08:19:38.549+00	905ed5f2-e171-4cfd-8e91-2b603d66b347	b09dbad2-e417-4b37-a1b6-00f1dd0fe911	Narasimha Organics
4e6ccebe-759c-45a9-a5f6-968020dc1984	\N	Pants	600.00	\N	2026-09-06	2026-10-30	t	0	2026-09-06 19:56:01.155691+00	2026-09-06 19:56:01.155691+00	Pants	clothing		40744ecd-86dd-407d-9230-cdd3313ac885	2026-09-06 19:38:43.738+00	2026-09-06 19:38:43.738+00	3f301f9c-ead4-438a-b20d-4a5ffaf029e0	9d15a8e8-932a-46e3-a412-24ffd42d914f	Men's Wear
ad9eb743-c4ac-4653-87a3-3afb09e781f8	\N	Shirt	500.00	\N	2026-09-06	2026-10-30	t	0	2026-09-06 19:53:46.311168+00	2026-09-06 19:53:46.311168+00	Shirt	clothing		40744ecd-86dd-407d-9230-cdd3313ac885	2026-09-06 19:38:43.738+00	2026-09-06 19:38:43.738+00	3f301f9c-ead4-438a-b20d-4a5ffaf029e0	9d15a8e8-932a-46e3-a412-24ffd42d914f	Men's Wear
0830f456-3b34-48e7-9ce5-faed5ea8f801	\N	Sarees	300.00	\N	2026-09-06	2027-03-25	t	50	2026-09-06 20:06:19.931621+00	2026-09-06 20:06:19.931621+00	Sarees	clothing		40744ecd-86dd-407d-9230-cdd3313ac885	2026-09-06 20:02:14.403+00	2026-09-06 20:02:14.403+00	3f301f9c-ead4-438a-b20d-4a5ffaf029e0	e59583b4-5649-49ad-9ce7-cf544f428e16	Women's Wear
f94dd944-ec0d-404d-9f82-790bdca8e88a	\N	SS TUITIONS	2500.00	\N	2026-09-08	2026-09-08	t	0	2026-09-08 10:44:19.265964+00	2026-09-08 10:44:19.265964+00	4th to 12 th class	other		4e70fd28-564e-4352-9335-f751a5ea7fce	2026-09-08 10:38:51.52+00	2026-09-08 10:38:51.52+00	ac1cb2b5-ed03-43ad-865c-76d77bf48830	\N	\N
ef5d373d-fcff-402d-868e-39581839b4bd	\N	Diamond Necles  Emerald	500000.00	\N	2026-09-08	2026-09-27	t	0	2026-09-08 18:11:11.013595+00	2026-09-08 18:11:11.013595+00		goldnarsing	grams	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-08 18:01:47.869+00	2026-09-08 18:01:47.869+00	26b78285-d0ba-4145-966c-11be3861debc	706ec686-a120-4114-904d-e38d675e6cb0	Neckles
9f7bf200-d458-4284-bfb7-43daf6d58da0	\N	Diamond Necles Ruby	600000.00	\N	2026-09-08	2026-09-26	t	0	2026-09-08 18:18:58.747017+00	2026-09-08 18:18:58.747017+00		goldnarsing		c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-08 18:13:52.018+00	2026-09-08 18:13:52.018+00	26b78285-d0ba-4145-966c-11be3861debc	706ec686-a120-4114-904d-e38d675e6cb0	Neckles
e8a9631b-b2e1-4db2-bf63-686975645f6c	\N	KH 135	600000.00	\N	2026-09-08	2026-09-26	t	0	2026-09-08 18:25:55.108153+00	2026-09-08 18:25:55.108153+00		goldnarsing	grams	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-08 18:13:52.018+00	2026-09-08 18:13:52.018+00	26b78285-d0ba-4145-966c-11be3861debc	e11c0e15-8bc4-4ce2-bc31-d03d1f0a6459	Long Harams
1d4e3559-dbf3-4ece-9202-4aa8f0c54cc3	\N	KH 136 	650000.00	\N	2026-09-08	2026-09-26	t	0	2026-09-08 18:28:00.65651+00	2026-09-08 18:28:00.65651+00		goldnarsing	grams	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-08 18:13:52.018+00	2026-09-08 18:13:52.018+00	26b78285-d0ba-4145-966c-11be3861debc	e11c0e15-8bc4-4ce2-bc31-d03d1f0a6459	Long Harams
354ce661-081d-4902-93e6-13ff1c14df26	\N	KH 138	750000.00	\N	2026-09-08	2026-09-26	t	0	2026-09-08 18:32:46.387649+00	2026-09-08 18:32:46.387649+00		goldnarsing	grams	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-08 18:13:52.018+00	2026-09-08 18:13:52.018+00	26b78285-d0ba-4145-966c-11be3861debc	e11c0e15-8bc4-4ce2-bc31-d03d1f0a6459	Long Harams
19385258-d235-4c36-a8cb-6888a39e0099	\N	Long harams 3E0000003	500000.00	\N	2026-09-10	2026-11-20	t	0	2026-09-10 15:24:33.438848+00	2026-09-10 15:24:33.438848+00	Long harams 3E0000003	goldnarsing		c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-10 15:23:25.882+00	2026-09-10 15:23:25.882+00	26b78285-d0ba-4145-966c-11be3861debc	e11c0e15-8bc4-4ce2-bc31-d03d1f0a6459	Long Harams
33ed195b-fd87-413e-b52c-d0772a4b3f08	\N	Long harams 3E0001	500000.00	\N	2026-09-10	2026-11-20	t	0	2026-09-10 15:25:08.105461+00	2026-09-10 15:25:08.105461+00	Long harams 3E00001	goldnarsing		c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-10 15:23:25.882+00	2026-09-10 15:23:25.882+00	26b78285-d0ba-4145-966c-11be3861debc	e11c0e15-8bc4-4ce2-bc31-d03d1f0a6459	Long Harams
130c7db7-ddca-4d62-be1b-84ed530a7a4c	\N	Neckles 3E0002	500000.00	\N	2026-09-10	2027-01-29	t	0	2026-09-10 15:27:14.409778+00	2026-09-10 15:27:14.409778+00	Neckles 3E00001	goldnarsing		c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-10 15:23:25.882+00	2026-09-10 15:23:25.882+00	26b78285-d0ba-4145-966c-11be3861debc	706ec686-a120-4114-904d-e38d675e6cb0	Neckles
c08ad2a5-8c29-47e6-b934-9f6ae872d740	\N	Neckles 3E0003	500000.00	\N	2026-09-10	2027-01-29	t	0	2026-09-10 15:27:43.068292+00	2026-09-10 15:27:43.068292+00	Neckles 3E00003	goldnarsing		c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-10 15:23:25.882+00	2026-09-10 15:23:25.882+00	26b78285-d0ba-4145-966c-11be3861debc	706ec686-a120-4114-904d-e38d675e6cb0	Neckles
54d87e16-5220-443b-9970-b6dda380a1f6	\N	Neckles 3E0004	500000.00	\N	2026-09-10	2027-01-29	t	0	2026-09-10 15:28:23.856214+00	2026-09-10 15:28:23.856214+00	Neckles 3E00004	goldnarsing		c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	2026-09-10 15:23:25.882+00	2026-09-10 15:23:25.882+00	26b78285-d0ba-4145-966c-11be3861debc	706ec686-a120-4114-904d-e38d675e6cb0	Neckles
3da479cf-3073-42f9-9bbf-b9d02d527fc1	\N	Grass	100.00	\N	2026-09-16	2026-09-16	t	0	2026-09-16 01:11:41.985035+00	2026-09-16 01:11:41.985035+00	Grass	fruits_vegetables	kg	a59dbff8-2dde-4ac3-a2df-e881be9b2a25	2026-09-16 01:10:25.996+00	2026-09-16 01:10:25.996+00	e7c11baa-ccbe-4238-85f2-57d140855dfb	dd1eb251-952c-4cb1-bd47-0285cb2c8fa6	Fresh Fruits
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, address_line_1, address_line_2, city, state, zip_code, latitude, longitude, created_at, updated_at, role, mobile, full_name, email, avatar_url, push_token, media_urls) FROM stdin;
c3c8b679-7537-497c-a9d2-b45f29d5fa07	\N	\N	\N	\N	\N	\N	\N	2026-09-06 13:23:24.937652+00	2026-09-12 08:07:20.35+00	delivery_manager	\N	narasimhareddy aiapp4	narasimhareddyaiapp4@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocI4Y6MATfOAW1uhjEiGo4r8LdzNtjzOOkEfE9CiDa_XpQqjMA=s96-c	web-notifications-active	[]
bf05ba57-8b0a-4f35-9449-3aad3c81fc59	\N	\N	\N	\N	\N	\N	\N	2026-09-11 01:20:40.303823+00	2026-09-13 06:31:35.609+00	customer	\N	narasimhareddyaiapp20	narasimhareddyaiapp20@gmail.com	\N	web-notifications-active	[{"type": "store_settings", "map_active": true, "updated_at": "2026-09-12T07:20:01.93465+00:00", "store_active": false, "product_active": false}]
54862933-5dd9-4f58-929b-3fe71d29c733	\N	\N	\N	\N	\N	\N	\N	2026-09-06 13:16:59.02814+00	2026-09-13 10:26:32.008+00	customer	\N	narasimhaaipp2 reddy	narasimhareddyaiapp2@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocISbGghs5S_7ju6RMG3z82YZ-y-i5aZ20toKHuZH4f8S_oN9g=s96-c	\N	[]
e125551d-8f87-42a2-9a42-75fde4d47549	jubilee gardens		Hyderabad	Telangana	500084	17.463768101275335	78.36952400214615	2026-09-06 14:56:53.690333+00	2026-09-13 10:44:47.023+00	seller	9849535150	Srikany Comfort	narasimhareddyaiapp12@gmail.com	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/e125551d-8f87-42a2-9a42-75fde4d47549/1788707147742-e125551d-8f87-42a2-9a42-75fde4d47549-1788707147742_nlz3hx.jpg	web-notifications-active	[{"uri": "https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/e125551d-8f87-42a2-9a42-75fde4d47549/1788707147742-e125551d-8f87-42a2-9a42-75fde4d47549-1788707147742_nlz3hx.jpg", "type": "image"}, {"type": "store_settings", "map_active": true, "updated_at": "2026-09-08T12:33:01.526716+00:00", "store_active": true, "product_active": true}]
c4aac7bc-b8ae-466f-bfd9-0a558ffe2331						\N	\N	2026-09-06 05:27:23.387006+00	2026-09-16 01:05:41.021+00	seller	9849535153	Narasihma Reddy	narasimhareddyaiapp1@gmail.com	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/c4aac7bc-b8ae-466f-bfd9-0a558ffe2331/1788892614813-c4aac7bc-b8ae-466f-bfd9-0a558ffe2331-1788892614813_o23l4g.png	web-notifications-active	[{"uri": "https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/c4aac7bc-b8ae-466f-bfd9-0a558ffe2331/1788892614813-c4aac7bc-b8ae-466f-bfd9-0a558ffe2331-1788892614813_o23l4g.png", "type": "image"}, {"type": "store_settings", "map_active": true, "updated_at": "2026-09-08T18:36:56.632031+00:00", "store_active": true, "product_active": true}]
303c99b8-f76d-4c55-a23b-38c86c9bee99	\N	\N	\N	\N	\N	\N	\N	2026-09-12 07:32:11.870906+00	2026-09-12 07:32:11.870906+00	customer	\N	narasimh rrr	narasimhareddyaiapp15@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocJGs_TQ2fhbr__CEO8sjn-S8KHKM-v1ZyPcP4vEVOEzzJD4gQ=s96-c	\N	[]
0f4611de-7b02-4212-a1ea-4ea9f3c22620						\N	\N	2026-09-07 07:12:10.310294+00	2026-09-12 07:22:03.879966+00	admin	\N	narasimha reddy	narasimhareddyprocess@gmail.com	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/0f4611de-7b02-4212-a1ea-4ea9f3c22620/1788807935731-0f4611de-7b02-4212-a1ea-4ea9f3c22620-1788807935731_xg11gx.jpg	web-notifications-active	[{"uri": "https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/0f4611de-7b02-4212-a1ea-4ea9f3c22620/1788807935731-0f4611de-7b02-4212-a1ea-4ea9f3c22620-1788807935731_xg11gx.jpg", "type": "image"}, {"uri": "https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/0f4611de-7b02-4212-a1ea-4ea9f3c22620/1788807936251-0f4611de-7b02-4212-a1ea-4ea9f3c22620-1788807936251_9hujz0.jpg", "type": "image"}, {"uri": "https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/0f4611de-7b02-4212-a1ea-4ea9f3c22620/1788807936551-0f4611de-7b02-4212-a1ea-4ea9f3c22620-1788807936551_v3flu4.jpg", "type": "image"}, {"type": "store_settings", "map_active": false, "updated_at": "2026-09-12T07:22:03.879966+00:00", "store_active": false, "product_active": false}]
a4306874-67b7-422c-a616-d2a4bcf31f2c	\N	\N	\N	\N	\N	\N	\N	2026-09-08 18:43:05.674085+00	2026-09-09 02:06:47.554+00	customer	9849535152	Naraimha Reddy app2	narasimhareddaiapp2@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocIZMKS2RTmRyJpLPXMuGKSEzdsqzIF-7pVWUP-FcKdgUj2RBg=s96-c	web-notifications-active	[]
4e70fd28-564e-4352-9335-f751a5ea7fce	Gajularamaram		Hyderabad	Telangana	500055	17.517387138134534	78.41793537134436	2026-09-08 10:37:50.937008+00	2026-09-08 10:42:23.34836+00	seller	\N	SS ENTERTAINMENT	srinu.0483@gmail.com	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/4e70fd28-564e-4352-9335-f751a5ea7fce/1788864140404-4e70fd28-564e-4352-9335-f751a5ea7fce-1788864140404_9exjd2.jpg	\N	[{"uri": "https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/4e70fd28-564e-4352-9335-f751a5ea7fce/1788864140404-4e70fd28-564e-4352-9335-f751a5ea7fce-1788864140404_9exjd2.jpg", "type": "image"}, {"type": "store_settings", "map_active": true, "updated_at": "2026-09-08T10:42:23.34836+00:00", "store_active": true, "product_active": true}]
4525e63d-c188-4cf8-963b-96e6e08b96b9	\N	\N	\N	\N	\N	\N	\N	2026-09-08 12:14:50.172222+00	2026-09-08 12:14:50.172222+00	customer	\N	Nagi Reddy	nagireddy.mallidi@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocKXYNjcMafBHgKArr8zlDEnMfL605ABQQWgk3bB6Z0vAPFHK0yu=s96-c	\N	[]
131f51a1-df0c-4571-85ab-b1d23817da07	\N	\N	\N	\N	\N	\N	\N	2026-09-12 08:05:23.140461+00	2026-09-12 08:06:19.631+00	customer	9502080135	Vikram Raju	vikram1raju@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocLRp-2qYbLK4dQLrXye5UeGAxJMC1AkAvvbZ3i3BAffq7jqP7T9bA=s96-c	\N	[]
40744ecd-86dd-407d-9230-cdd3313ac885	Healthway, Narsingi		Narsingi	Telangana	500089	17.397196546304112	78.35259819039494	2026-09-06 19:31:10.926444+00	2026-09-12 07:19:45.162881+00	seller	9849535111	Nasing Narsingi shop	narasimhareddyaiapp6@gmail.com	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/40744ecd-86dd-407d-9230-cdd3313ac885/1788723738894-40744ecd-86dd-407d-9230-cdd3313ac885-1788723738894_wq5jxu.jpg	web-notifications-active	[{"uri": "https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/40744ecd-86dd-407d-9230-cdd3313ac885/1788723738894-40744ecd-86dd-407d-9230-cdd3313ac885-1788723738894_wq5jxu.jpg", "type": "image"}, {"uri": "https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/40744ecd-86dd-407d-9230-cdd3313ac885/1788723739532-40744ecd-86dd-407d-9230-cdd3313ac885-1788723739532_kulmco.jpg", "type": "image"}, {"type": "store_settings", "map_active": true, "updated_at": "2026-09-12T07:19:45.162881+00:00", "store_active": true, "product_active": true}]
38c510c6-7543-4e22-a983-89dae86ced97	\N	\N	\N	\N	\N	\N	\N	2026-09-10 18:28:20.071446+00	2026-09-10 18:32:48.962+00	customer	8328426765	narasimha grocery	narasimhagrocery1@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocLulH6BFp-MDb13TufAUStqYzOajkMoB_IWOjG-HHGvdORxkQ=s96-c	web-notifications-active	[]
a59dbff8-2dde-4ac3-a2df-e881be9b2a25	\N	\N	\N	\N	\N	\N	\N	2026-09-10 18:42:28.904741+00	2026-09-16 01:10:19.739+00	seller	\N	Narasimha Grocwey	narasimhagrocery2@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocKjIP8hsKWcW37hdbcxJBBjN-aOpnijo09RIb9V2foW6X0vlw=s96-c	web-notifications-active	[]
c93fe626-856f-4b66-8c04-4fb988f4bf9c	\N	\N	\N	\N	\N	\N	\N	2026-09-13 10:42:36.384121+00	2026-09-13 10:42:38.005+00	seller	\N	narasimha nine kovvuri	narasimhareddyaiapp9@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocL5p3LxisOeoUwLwfx-KLiimHmVaNB6CLlMhLTt4bjj_XTi2A=s96-c	web-notifications-active	[]
84359302-3168-4193-95d9-3a8655e8339a	\N	\N	\N	\N	\N	\N	\N	2026-09-08 12:20:51.411072+00	2026-09-16 01:07:23.38+00	seller	\N	Narasimha app5 Reddy	narasimhareddyaiapp5@gmail.com	https://lh3.googleusercontent.com/a/ACg8ocIvevzbe6HmEK6zSb9S16sFoNv_RXnocRiyh6AZdnAfPRSjKQ=s96-c	\N	[]
\.


--
-- Data for Name: push_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.push_tokens (id, user_id, token, created_at) FROM stdin;
\.


--
-- Data for Name: repayment_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.repayment_plans (id, name, frequency, periods, base_amount, repayment_per_period, advance_amount, late_fee_per_period, description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: subcategories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subcategories (id, category_id, name, code, description, display_order, is_active, created_at, updated_at) FROM stdin;
b09dbad2-e417-4b37-a1b6-00f1dd0fe911	905ed5f2-e171-4cfd-8e91-2b603d66b347	Narasimha Organics	code_0001	Narasimha Organics	4	t	2026-09-07 07:30:46.434379+00	2026-09-07 07:31:38.809216+00
24e2559f-078d-49da-bcc7-a8f9e6609779	26b78285-d0ba-4145-966c-11be3861debc	Ear Rings	goldearrings		1	t	2026-09-08 17:52:10.734996+00	2026-09-08 17:52:10.734996+00
bd72df8b-b897-47e5-8f7b-e060c3b26d1a	905ed5f2-e171-4cfd-8e91-2b603d66b347	Rice & Rice Products	rice_products	Rice & Rice Products	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:33.897931+00
d5bb700d-92ce-418a-bfa8-0e22263a1607	905ed5f2-e171-4cfd-8e91-2b603d66b347	Dals & Pulses	dals_pulses	Dals & Pulses	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:34.073933+00
d0595dba-dc73-4eb7-b0b0-1c526b1393ff	905ed5f2-e171-4cfd-8e91-2b603d66b347	Edible Oils & Ghee	oils_ghee	Edible Oils & Ghee	4	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:34.231324+00
671f57e5-de0f-423f-b272-ee40e8c12c3f	905ed5f2-e171-4cfd-8e91-2b603d66b347	Spices & Masalas	spices_masalas	Spices & Masalas	5	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:34.348978+00
d0bc98cd-01b9-40cd-8927-b3be850cdedb	905ed5f2-e171-4cfd-8e91-2b603d66b347	Salt, Sugar & Jaggery	salt_sugar	Salt, Sugar & Jaggery	6	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:34.52816+00
2c7fc5fd-6974-4b4a-8054-02d376c4112a	e7c11baa-ccbe-4238-85f2-57d140855dfb	Fresh Vegetables	fresh_vegetables	Fresh Vegetables	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:34.837209+00
dd1eb251-952c-4cb1-bd47-0285cb2c8fa6	e7c11baa-ccbe-4238-85f2-57d140855dfb	Fresh Fruits	fresh_fruits	Fresh Fruits	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:35.070215+00
f3610881-3d82-4f20-8306-2ba37ae38320	e7c11baa-ccbe-4238-85f2-57d140855dfb	Leafy Greens & Herbs	leafy_greens	Leafy Greens & Herbs	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:35.401103+00
9e41cca1-132f-40b5-97ce-e4cb214b6e12	e7c11baa-ccbe-4238-85f2-57d140855dfb	Organic & Exotic	organic_exotic	Organic & Exotic	4	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:35.542897+00
85dc2492-afa8-439d-bd46-0d89cb812992	651eadca-6210-4596-85f8-c9cf3e012e44	Milk & Cream	milk_cream	Milk & Cream	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:35.8997+00
d3878590-ea84-4093-bb52-e0c9c868f0dd	651eadca-6210-4596-85f8-c9cf3e012e44	Curd & Yogurt	curd_yogurt	Curd & Yogurt	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:36.039938+00
167d5956-aac2-46d5-81a5-6c14c5e0c060	651eadca-6210-4596-85f8-c9cf3e012e44	Paneer, Butter & Cheese	paneer_cheese	Paneer, Butter & Cheese	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:36.322316+00
32627834-0d94-40a9-8adf-9ba456d45f87	651eadca-6210-4596-85f8-c9cf3e012e44	Breads & Pav	breads_pav	Breads & Pav	4	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:37.843402+00
c5662f55-f647-4d8a-9247-068dd0a089bf	651eadca-6210-4596-85f8-c9cf3e012e44	Cakes & Rusk	cakes_rusk	Cakes & Rusk	5	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:38.179869+00
93948cf2-634b-4d32-a02a-2d871f2c6a56	49e1bd86-2793-4ff2-90b4-7dbcc1f6bfa1	Biscuits & Cookies	biscuits_cookies	Biscuits & Cookies	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:40.017455+00
0b6defbb-0cfd-4d3d-82dd-6aa7417ff0cc	49e1bd86-2793-4ff2-90b4-7dbcc1f6bfa1	Chips & Namkeen	chips_namkeen	Chips & Namkeen	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:40.164553+00
0029af7a-7d06-4530-8550-853c42352152	49e1bd86-2793-4ff2-90b4-7dbcc1f6bfa1	Tea & Coffee	tea_coffee	Tea & Coffee	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:40.35768+00
df245dfa-48b7-4c1b-b407-ef7f84169fa5	49e1bd86-2793-4ff2-90b4-7dbcc1f6bfa1	Cold Drinks & Juices	cold_drinks_juices	Cold Drinks & Juices	4	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:40.745242+00
43e80ce6-6db4-426e-af83-104f33e30b66	49e1bd86-2793-4ff2-90b4-7dbcc1f6bfa1	Noodles & Instant Food	instant_food	Noodles & Instant Food	5	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:41.005379+00
9d15a8e8-932a-46e3-a412-24ffd42d914f	3f301f9c-ead4-438a-b20d-4a5ffaf029e0	Men's Wear	mens_wear	Men's Wear	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:41.306871+00
e59583b4-5649-49ad-9ce7-cf544f428e16	3f301f9c-ead4-438a-b20d-4a5ffaf029e0	Women's Wear	womens_wear	Women's Wear	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:41.461445+00
feae4c40-97ec-4b1d-a68e-0d4c94268928	3f301f9c-ead4-438a-b20d-4a5ffaf029e0	Kids' Clothing	kids_clothing	Kids' Clothing	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:41.593856+00
6613d91a-2ee5-4505-977f-c61126ef4c05	3f301f9c-ead4-438a-b20d-4a5ffaf029e0	Footwear	footwear	Footwear	4	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:41.736707+00
8d03f7ea-c317-43c7-a955-f77e35372c5f	3f301f9c-ead4-438a-b20d-4a5ffaf029e0	Fashion Accessories	fashion_accessories	Fashion Accessories	5	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:41.833604+00
6e187287-4986-4f8f-a3b0-ad9290cd5148	8b3df926-46a4-4c43-bac0-3749b587d8bb	Mobile Accessories	mobile_accessories	Mobile Accessories	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:42.098246+00
4950e9ba-cf84-484c-a64f-a59fd803c377	8b3df926-46a4-4c43-bac0-3749b587d8bb	Audio & Earphones	audio_earphones	Audio & Earphones	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:42.21782+00
3bf4e990-611c-41b3-841b-687facaf5f90	8b3df926-46a4-4c43-bac0-3749b587d8bb	Smart Wearables	smart_wearables	Smart Wearables	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:42.358071+00
1a0a6872-cae9-433c-bbd8-2ef2e7d122a7	8b3df926-46a4-4c43-bac0-3749b587d8bb	Small Appliances	small_appliances	Small Appliances	4	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:42.561432+00
9e86b2ad-e8c6-45ad-a6f0-518d9b098943	7ec6b457-1198-45bf-840b-db56de25702b	Skin & Face Care	skincare	Skin & Face Care	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:44.158026+00
0edf863d-c632-4b08-98fa-531dbc58bb03	7ec6b457-1198-45bf-840b-db56de25702b	Hair Care	haircare	Hair Care	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:44.256461+00
feb58e3a-7451-408c-9a5e-3c4d065b618b	7ec6b457-1198-45bf-840b-db56de25702b	Bath & Body	bath_body	Bath & Body	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:44.532766+00
2daf0df8-71d4-44c7-a16c-2f4886150a59	7ec6b457-1198-45bf-840b-db56de25702b	Oral Care	oral_care	Oral Care	4	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:44.681097+00
6a8fee39-538a-41b0-80d8-90524e6de8df	cee0e19d-92d0-4fb7-ae86-e3754d182469	Cleaning & Detergents	cleaning_detergents	Cleaning & Detergents	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:45.101686+00
369c57df-6f2f-4e7a-bf39-779125275965	cee0e19d-92d0-4fb7-ae86-e3754d182469	Cookware & Utensils	cookware_utensils	Cookware & Utensils	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:45.306745+00
4e167cbf-229c-4399-8c4f-ed71c594e8ca	cee0e19d-92d0-4fb7-ae86-e3754d182469	Pooja Needs	pooja_needs	Pooja Needs	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:45.459231+00
35baa6b9-ee88-48a8-aa2c-887f59a373d8	cee0e19d-92d0-4fb7-ae86-e3754d182469	Disposables & Trash Bags	disposables	Disposables & Trash Bags	4	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:45.611213+00
4921af74-2a3f-4c53-83c0-6b5b0912494d	7a8a92f4-615a-44c8-b827-07c524600629	First Aid & Antiseptics	first_aid	First Aid & Antiseptics	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:45.829559+00
44ff6b1d-d025-4b0f-a9a6-a7fcae758968	7a8a92f4-615a-44c8-b827-07c524600629	Vitamins & Supplements	vitamins_supplements	Vitamins & Supplements	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:46.161291+00
53592f51-833b-44c5-a8b6-45ec348582d5	7a8a92f4-615a-44c8-b827-07c524600629	Healthcare Devices	healthcare_devices	Healthcare Devices	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:46.388123+00
1f2b23ba-0b3d-4a39-9ce2-3e781f51d968	7a8a92f4-615a-44c8-b827-07c524600629	Digestives & Pain Relief	digestives_pain	Digestives & Pain Relief	4	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:46.530153+00
f59d964c-d734-4366-b8b7-ef5e751c20a8	ac1cb2b5-ed03-43ad-865c-76d77bf48830	Stationery & School	stationery	Stationery & School	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:46.933124+00
77030e96-b9c5-4c1f-b166-3ffd0aefd56c	ac1cb2b5-ed03-43ad-865c-76d77bf48830	Hardware & Electricals	hardware_electricals	Hardware & Electricals	2	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:47.14552+00
759e69dd-1eff-4583-9354-a7dfe0a67857	ac1cb2b5-ed03-43ad-865c-76d77bf48830	General Miscellaneous	general_misc	General Miscellaneous	3	t	2026-09-07 06:39:17.348291+00	2026-09-07 07:32:47.322955+00
f1b9950f-0575-4d16-8866-86a6416a0c5f	905ed5f2-e171-4cfd-8e91-2b603d66b347	Atta full, Flours & Grains	atta_flours	Atta, Flours & Grains	1	t	2026-09-07 06:39:17.348291+00	2026-09-07 09:57:28.912133+00
d62b39de-ba5c-48be-936d-74bbf645a19a	26b78285-d0ba-4145-966c-11be3861debc	Bangles	g_bangles		1	t	2026-09-08 17:45:18.938879+00	2026-09-08 17:45:18.938879+00
42f499ef-55b7-486c-aa7a-1b13fb9a7193	26b78285-d0ba-4145-966c-11be3861debc	Vottiyanan	gold_vottantanam		1	t	2026-09-08 17:47:25.394496+00	2026-09-08 17:47:25.394496+00
e11c0e15-8bc4-4ce2-bc31-d03d1f0a6459	26b78285-d0ba-4145-966c-11be3861debc	Long Harams	goldharams		1	t	2026-09-08 17:48:49.718138+00	2026-09-08 17:48:49.718138+00
706ec686-a120-4114-904d-e38d675e6cb0	26b78285-d0ba-4145-966c-11be3861debc	Neckles	goldneckles		1	t	2026-09-08 17:50:54.071348+00	2026-09-08 17:50:54.071348+00
08b2621b-b206-499d-a873-47a912f0b43a	26b78285-d0ba-4145-966c-11be3861debc	Black beads	goldblackbeads		1	t	2026-09-08 17:54:11.76123+00	2026-09-08 17:54:11.76123+00
b5e2516b-24cd-47df-8708-5790d79cddf8	26b78285-d0ba-4145-966c-11be3861debc	Short Harams	goldharamsdhort		1	t	2026-09-08 17:55:56.89216+00	2026-09-08 17:55:56.89216+00
\.


--
-- Data for Name: tenant_credentials; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_credentials (id, tenant_id, supabase_url, supabase_service_role_key, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tenantmasterusers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenantmasterusers (id, user_id, tenant_id, role, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenants (id, tenant_code, name, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: transaction_cycles_completed; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transaction_cycles_completed (id, customer_id, user_id, amount, transaction_type, payment_mode, remarks, transaction_date, created_at, updated_at, archived_at) FROM stdin;
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, customer_id, user_id, amount, transaction_type, remarks, transaction_date, created_at, payment_mode, upi_image, latitude, longitude, area_id) FROM stdin;
\.


--
-- Data for Name: user_addresses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_addresses (id, user_id, tag, recipient_name, mobile, address_line_1, address_line_2, city, state, zip_code, country, latitude, longitude, is_default, created_at, updated_at) FROM stdin;
df19d5f8-803d-4f67-b297-860243cba7c9	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	Home	Narasihma Reddy	9849535153	pla not 87		hyderabad		500069	India	17.39623450	78.37549925	t	2026-09-06 09:35:26.199096+00	2026-09-06 09:35:23.223+00
43d964b4-e422-4a95-9cc7-19df03575011	c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	Work	Narasihma Reddy	9849535153	hiteck city LG cafe		hyderabad		500069	India	17.44824385	78.38195801	f	2026-09-06 09:36:15.34029+00	2026-09-06 09:36:12.91+00
1c282d0a-3bfb-423e-9ab6-2cc27eba732b	a4306874-67b7-422c-a616-d2a4bcf31f2c	Work	Naraimha Reddy app2	9849535152	Satavahana Nagar, Vasantha Nagar		Hyderabad	Telangana	500085	India	17.50014841	78.38978243	t	2026-09-09 01:49:53.427138+00	2026-09-09 01:49:52.698+00
f7cc5ccc-a865-447e-9525-213843913f2f	a4306874-67b7-422c-a616-d2a4bcf31f2c	Work	Naraimha Reddy app2	9849535153	Ward 114 KPHB Colony, Satyanarayanaswamy Nagar		Hyderabad	Telangana	500085	India	17.49618378	78.38376045	f	2026-09-09 01:50:16.406795+00	2026-09-09 01:50:16.047+00
5a9da4e1-2550-4340-bbe2-3de2d8b46a61	a4306874-67b7-422c-a616-d2a4bcf31f2c	Work	Naraimha Reddy app2	9849535152	Manikonda, Greenlands		Ibrahim Bagh	Telangana	500089	India	17.38680830	78.36753570	f	2026-09-09 02:26:56.221629+00	2026-09-09 02:26:56.264+00
515b9686-8898-4fe2-b888-947b45cdc714	38c510c6-7543-4e22-a983-89dae86ced97	Home	narasimha grocery	9849535153	Neknampur Road, Narsingi, Pioneer Colony		Hyderabad	Telangana	500089	India	17.39283044	78.37687683	t	2026-09-10 18:31:00.571579+00	2026-09-10 18:31:00.405+00
da57f72e-4f17-4fbc-af6a-4c2e3fd4c002	38c510c6-7543-4e22-a983-89dae86ced97	Home	narasimha grocery	9849535153	Healthway, Narsingi		Gandipet mandal	Telangana	500089	India	17.39741846	78.35183144	f	2026-09-10 18:31:32.885227+00	2026-09-10 18:31:32.902+00
05a00c82-a329-4aca-90bc-0cbe72ba624a	38c510c6-7543-4e22-a983-89dae86ced97	Work	narasimha grocery	8328426765	Gachibowli Flyover, Ward 104 Kondapur		Hyderabad	Telangana	500032	India	17.43820970	78.36444855	f	2026-09-10 18:32:28.19611+00	2026-09-10 18:32:27.738+00
d42456a5-6ea8-4922-b843-92dd88f7a8bb	e125551d-8f87-42a2-9a42-75fde4d47549	Home	Narasimha Reddy	9849535150	park walk path, Kothaguda		Hyderabad	Telangana	500084	India	17.46024303	78.36453438	t	2026-09-10 18:36:07.894084+00	2026-09-10 18:36:07.947+00
9c1c8c95-8062-45ae-86ad-b8799fbce627	a59dbff8-2dde-4ac3-a2df-e881be9b2a25	Home	Narasimha Grocwey	8328426765	Narsingi, Alkapur Township		Ibrahim Bagh	Telangana	500089	India	17.39407913	78.37395430	t	2026-09-10 18:43:49.120746+00	2026-09-10 18:43:49.087+00
e7ba1b27-764a-4e9d-93e3-0fc1a76d65ff	a4306874-67b7-422c-a616-d2a4bcf31f2c	Other	Naraimha Reddy app2	9849535152	Golden Mile Road, Kokapet		Manchirevula	Telangana	500075	India	17.39165530	78.34165250	f	2026-09-12 07:05:16.839654+00	2026-09-12 07:05:15.305+00
fcd8039c-d4ad-4ef3-82e2-026217faa86f	131f51a1-df0c-4571-85ab-b1d23817da07	Home	Vikram Raju	9502080135	Golden Mile Road, Kokapet		Manchirevula	Telangana	500075	India	17.39177990	78.34166550	t	2026-09-12 08:06:20.42312+00	2026-09-12 08:06:19.363+00
4cbd4b15-1eab-4606-af3e-31ccef79a9b1	54862933-5dd9-4f58-929b-3fe71d29c733	Other	narasimhaaipp2 reddy	9849535153	Royal Heights, Narsingi, Fair Fields Colony		Ibrahim Bagh	Telangana	500089	India	17.39489375	78.37697983	t	2026-09-13 05:35:48.038482+00	2026-09-13 05:35:44.962+00
bbfc6730-2357-416e-9976-1e2891c37f6c	bf05ba57-8b0a-4f35-9449-3aad3c81fc59	Other	Narasimha Twenty	9849535153	Narsingi, Puppalguda		Ibrahim Bagh	Telangana	500089	India	17.39559480	78.37693430	t	2026-09-13 06:34:24.292017+00	2026-09-13 06:34:22.629+00
a0cd4716-edbf-4bdc-bf11-78178b373680	bf05ba57-8b0a-4f35-9449-3aad3c81fc59	Work	Narasimha Twenty	9849535153	Outer Ring Road, Narsingi		Gandipet mandal	Telangana	500075	India	17.39602708	78.35045815	f	2026-09-13 06:39:28.538736+00	2026-09-13 06:39:26.373+00
6f22b608-930b-41d4-8c17-9fe202454340	54862933-5dd9-4f58-929b-3fe71d29c733	Other	narasimhaaipp2 reddy	9849535153	Narsingi, Puppalguda		Ibrahim Bagh	Telangana	500089	India	17.39476760	78.37542980	f	2026-09-13 09:48:11.088552+00	2026-09-13 09:48:10.474+00
f2e0d3af-8cb6-46ad-b3c6-7926141d4c49	303c99b8-f76d-4c55-a23b-38c86c9bee99	Home	narasimh rrr	9849535153	Narsingi, Puppalguda		Ibrahim Bagh	Telangana	500089	India	17.39560978	78.37549925	t	2026-09-13 12:45:46.853088+00	2026-09-13 12:45:44.991+00
\.


--
-- Data for Name: user_expenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_expenses (id, user_id, amount, expense_type, remarks, latitude, longitude, created_at, updated_at, area_id) FROM stdin;
\.


--
-- Data for Name: user_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_groups (user_id, group_id, assigned_by, assigned_at, is_group_admin) FROM stdin;
\.


--
-- Data for Name: user_push_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_push_tokens (id, user_id, push_token, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_qr_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_qr_codes (id, user_id, qr_image_url, name, is_active, created_at, updated_at) FROM stdin;
1abd554a-96c6-45dc-ae94-8b310457d98e	40744ecd-86dd-407d-9230-cdd3313ac885	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/qr_codes/qr_codes/40744ecd-86dd-407d-9230-cdd3313ac885/1788726205271-40744ecd-86dd-407d-9230-cdd3313ac885.png	98464677677@upi	t	2026-09-06 20:23:26.152348+00	2026-09-06 20:23:39.598+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, name, created_at, mobile, profile_photo_data, latitude, longitude, device_name, updated_at, location_status, user_type, location_update_interval, expo_push_token, previous_last_login_at, tenant_id) FROM stdin;
c3c8b679-7537-497c-a9d2-b45f29d5fa07	narasimhareddyaiapp4@gmail.com	narasimhareddy aiapp4	2026-09-06 13:23:24.937652+00	\N	https://lh3.googleusercontent.com/a/ACg8ocI4Y6MATfOAW1uhjEiGo4r8LdzNtjzOOkEfE9CiDa_XpQqjMA=s96-c	\N	\N	\N	2026-09-12 08:07:20.35+00	0	delivery_manager	30	\N	\N	\N
bf05ba57-8b0a-4f35-9449-3aad3c81fc59	narasimhareddyaiapp20@gmail.com	narasimhareddyaiapp20	2026-09-11 01:20:40.303823+00	\N	\N	\N	\N	\N	2026-09-13 06:31:35.609+00	0	customer	30	\N	\N	\N
54862933-5dd9-4f58-929b-3fe71d29c733	narasimhareddyaiapp2@gmail.com	narasimhaaipp2 reddy	2026-09-06 13:16:59.02814+00	\N	https://lh3.googleusercontent.com/a/ACg8ocISbGghs5S_7ju6RMG3z82YZ-y-i5aZ20toKHuZH4f8S_oN9g=s96-c	\N	\N	\N	2026-09-13 10:26:32.008+00	0	customer	30	\N	\N	\N
e125551d-8f87-42a2-9a42-75fde4d47549	narasimhareddyaiapp12@gmail.com	Srikany Comfort	2026-09-06 14:56:53.690333+00	9849535150	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/e125551d-8f87-42a2-9a42-75fde4d47549/1788707147742-e125551d-8f87-42a2-9a42-75fde4d47549-1788707147742_nlz3hx.jpg	17.4637681012753	78.3695240021462	\N	2026-09-13 10:44:47.023+00	0	seller	30	\N	\N	\N
c4aac7bc-b8ae-466f-bfd9-0a558ffe2331	narasimhareddyaiapp1@gmail.com	Narasihma Reddy	2026-09-06 05:27:23.387006+00	9849535153	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/c4aac7bc-b8ae-466f-bfd9-0a558ffe2331/1788892614813-c4aac7bc-b8ae-466f-bfd9-0a558ffe2331-1788892614813_o23l4g.png	\N	\N	\N	2026-09-16 01:05:41.021+00	0	seller	30	\N	\N	\N
303c99b8-f76d-4c55-a23b-38c86c9bee99	narasimhareddyaiapp15@gmail.com	narasimh rrr	2026-09-12 07:32:11.870906+00	\N	https://lh3.googleusercontent.com/a/ACg8ocJGs_TQ2fhbr__CEO8sjn-S8KHKM-v1ZyPcP4vEVOEzzJD4gQ=s96-c	\N	\N	\N	2026-09-12 07:32:11.870906+00	0	customer	30	\N	\N	\N
0f4611de-7b02-4212-a1ea-4ea9f3c22620	narasimhareddyprocess@gmail.com	narasimha reddy	2026-09-07 07:12:10.310294+00	\N	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/0f4611de-7b02-4212-a1ea-4ea9f3c22620/1788807935731-0f4611de-7b02-4212-a1ea-4ea9f3c22620-1788807935731_xg11gx.jpg	\N	\N	\N	2026-09-12 07:22:03.879966+00	0	admin	30	\N	\N	\N
a4306874-67b7-422c-a616-d2a4bcf31f2c	narasimhareddaiapp2@gmail.com	Naraimha Reddy app2	2026-09-08 18:43:05.674085+00	9849535152	https://lh3.googleusercontent.com/a/ACg8ocIZMKS2RTmRyJpLPXMuGKSEzdsqzIF-7pVWUP-FcKdgUj2RBg=s96-c	\N	\N	\N	2026-09-09 02:06:47.554+00	0	customer	30	\N	\N	\N
4e70fd28-564e-4352-9335-f751a5ea7fce	srinu.0483@gmail.com	SS ENTERTAINMENT	2026-09-08 10:37:50.937008+00	\N	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/4e70fd28-564e-4352-9335-f751a5ea7fce/1788864140404-4e70fd28-564e-4352-9335-f751a5ea7fce-1788864140404_9exjd2.jpg	17.5173871381345	78.4179353713444	\N	2026-09-08 10:42:23.34836+00	0	seller	30	\N	\N	\N
4525e63d-c188-4cf8-963b-96e6e08b96b9	nagireddy.mallidi@gmail.com	Nagi Reddy	2026-09-08 12:14:50.172222+00	\N	https://lh3.googleusercontent.com/a/ACg8ocKXYNjcMafBHgKArr8zlDEnMfL605ABQQWgk3bB6Z0vAPFHK0yu=s96-c	\N	\N	\N	2026-09-08 12:14:50.172222+00	0	customer	30	\N	\N	\N
131f51a1-df0c-4571-85ab-b1d23817da07	vikram1raju@gmail.com	Vikram Raju	2026-09-12 08:05:23.140461+00	9502080135	https://lh3.googleusercontent.com/a/ACg8ocLRp-2qYbLK4dQLrXye5UeGAxJMC1AkAvvbZ3i3BAffq7jqP7T9bA=s96-c	\N	\N	\N	2026-09-12 08:06:19.631+00	0	customer	30	\N	\N	\N
40744ecd-86dd-407d-9230-cdd3313ac885	narasimhareddyaiapp6@gmail.com	Nasing Narsingi shop	2026-09-06 19:31:10.926444+00	9849535111	https://cikxysaxvbixrcwlgzds.supabase.co/storage/v1/object/public/productsmedia/profile_media/40744ecd-86dd-407d-9230-cdd3313ac885/1788723738894-40744ecd-86dd-407d-9230-cdd3313ac885-1788723738894_wq5jxu.jpg	17.3971965463041	78.3525981903949	\N	2026-09-12 07:19:45.162881+00	0	seller	30	\N	\N	\N
38c510c6-7543-4e22-a983-89dae86ced97	narasimhagrocery1@gmail.com	narasimha grocery	2026-09-10 18:28:20.071446+00	8328426765	https://lh3.googleusercontent.com/a/ACg8ocLulH6BFp-MDb13TufAUStqYzOajkMoB_IWOjG-HHGvdORxkQ=s96-c	\N	\N	\N	2026-09-10 18:32:48.962+00	0	customer	30	\N	\N	\N
a59dbff8-2dde-4ac3-a2df-e881be9b2a25	narasimhagrocery2@gmail.com	Narasimha Grocwey	2026-09-10 18:42:28.904741+00	\N	https://lh3.googleusercontent.com/a/ACg8ocKjIP8hsKWcW37hdbcxJBBjN-aOpnijo09RIb9V2foW6X0vlw=s96-c	\N	\N	\N	2026-09-16 01:10:19.739+00	0	seller	30	\N	\N	\N
c93fe626-856f-4b66-8c04-4fb988f4bf9c	narasimhareddyaiapp9@gmail.com	narasimha nine kovvuri	2026-09-13 10:42:36.384121+00	\N	https://lh3.googleusercontent.com/a/ACg8ocL5p3LxisOeoUwLwfx-KLiimHmVaNB6CLlMhLTt4bjj_XTi2A=s96-c	\N	\N	\N	2026-09-13 10:42:38.005+00	0	seller	30	\N	\N	\N
84359302-3168-4193-95d9-3a8655e8339a	narasimhareddyaiapp5@gmail.com	Narasimha app5 Reddy	2026-09-08 12:20:51.411072+00	\N	https://lh3.googleusercontent.com/a/ACg8ocIvevzbe6HmEK6zSb9S16sFoNv_RXnocRiyh6AZdnAfPRSjKQ=s96-c	\N	\N	\N	2026-09-16 01:07:23.38+00	0	seller	30	\N	\N	\N
\.


--
-- Data for Name: variant_options; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.variant_options (id, variant_id, value) FROM stdin;
77a13ba9-f497-405d-871b-c7fe1f6cc7de	054a8cf9-ca3d-4b54-9da3-3cdae3255ddf	Full
2cbca2ef-a050-42a2-9d47-247b69cd11c5	054a8cf9-ca3d-4b54-9da3-3cdae3255ddf	Half
a19654d7-e7eb-44c2-a24d-ce0352b7f100	a557b6d5-c102-49d4-8b36-eef94e89e27e	small
a20a8a54-5993-452f-90bd-b29ced75e6c0	8f0dc402-cac2-4492-8020-7ff892200cbb	Large
ed598694-56d5-436b-a3fc-8f9479bebf42	8f0dc402-cac2-4492-8020-7ff892200cbb	Small
3f393a91-b203-4f53-b056-8a68d1faa741	da96918d-261b-4afe-ab2e-c3825bee1cb1	Large
0f771401-4763-4165-ac02-c05b2f197194	da96918d-261b-4afe-ab2e-c3825bee1cb1	Small
c3f337f8-78a3-4890-80e3-cee02817f07a	249266a4-9e6a-4ec6-9e67-92c6913a30be	Large
fc1bbf61-049d-4d8f-b4e2-17fe3f782695	249266a4-9e6a-4ec6-9e67-92c6913a30be	Small
\.


--
-- Name: area_master_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.area_master_id_seq', 1, false);


--
-- Name: conversation_participants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.conversation_participants_id_seq', 1, false);


--
-- Name: conversations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.conversations_id_seq', 1, false);


--
-- Name: customer_documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_documents_id_seq', 1, false);


--
-- Name: customer_types_sequence_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_types_sequence_id_seq', 1, false);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customers_id_seq', 1, false);


--
-- Name: damage_report_files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.damage_report_files_id_seq', 2, true);


--
-- Name: documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.documents_id_seq', 1, false);


--
-- Name: groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.groups_id_seq', 1, false);


--
-- Name: location_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.location_history_id_seq', 1, false);


--
-- Name: message_summaries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.message_summaries_id_seq', 1, false);


--
-- Name: places_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.places_id_seq', 1, false);


--
-- Name: repayment_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.repayment_plans_id_seq', 1, false);


--
-- Name: transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.transactions_id_seq', 1, false);


--
-- Name: area_master area_master_pin_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.area_master
    ADD CONSTRAINT area_master_pin_code_key UNIQUE (pin_code);


--
-- Name: area_master area_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.area_master
    ADD CONSTRAINT area_master_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_account_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_account_number_key UNIQUE (account_number);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_transactions bank_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: carts carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);


--
-- Name: categories categories_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_code_key UNIQUE (code);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: conversation_participants conversation_participants_conversation_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_profile_id_key UNIQUE (conversation_id, profile_id);


--
-- Name: conversation_participants conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: customer_cycles_completed customer_cycles_completed_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_cycles_completed
    ADD CONSTRAINT customer_cycles_completed_pkey PRIMARY KEY (id);


--
-- Name: customer_documents customer_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_documents
    ADD CONSTRAINT customer_documents_pkey PRIMARY KEY (id);


--
-- Name: customer_types customer_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types
    ADD CONSTRAINT customer_types_pkey PRIMARY KEY (id);


--
-- Name: customer_types customer_types_sequence_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types
    ADD CONSTRAINT customer_types_sequence_id_key UNIQUE (sequence_id);


--
-- Name: customer_types customer_types_status_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_types
    ADD CONSTRAINT customer_types_status_name_key UNIQUE (status_name);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: damage_report_files damage_report_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_report_files
    ADD CONSTRAINT damage_report_files_pkey PRIMARY KEY (id);


--
-- Name: damage_reports damage_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_reports
    ADD CONSTRAINT damage_reports_pkey PRIMARY KEY (id);


--
-- Name: delivery_manager_locations delivery_manager_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_manager_locations
    ADD CONSTRAINT delivery_manager_locations_pkey PRIMARY KEY (id);


--
-- Name: delivery_partner_locations delivery_partner_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_partner_locations
    ADD CONSTRAINT delivery_partner_locations_pkey PRIMARY KEY (partner_id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: group_areas group_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_areas
    ADD CONSTRAINT group_areas_pkey PRIMARY KEY (group_id, area_id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: inventory_history inventory_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_history
    ADD CONSTRAINT inventory_history_pkey PRIMARY KEY (id);


--
-- Name: location_history location_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_history
    ADD CONSTRAINT location_history_pkey PRIMARY KEY (id);


--
-- Name: message_summaries message_summaries_conversation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_summaries
    ADD CONSTRAINT message_summaries_conversation_id_key UNIQUE (conversation_id);


--
-- Name: message_summaries message_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_summaries
    ADD CONSTRAINT message_summaries_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_number_sequences order_number_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_number_sequences
    ADD CONSTRAINT order_number_sequences_pkey PRIMARY KEY (sequence_date);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: places places_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_pkey PRIMARY KEY (id);


--
-- Name: product_media product_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_pkey PRIMARY KEY (id);


--
-- Name: product_variant_combinations product_variant_combinations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant_combinations
    ADD CONSTRAINT product_variant_combinations_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_mobile_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_mobile_key UNIQUE (mobile);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_token_key UNIQUE (token);


--
-- Name: repayment_plans repayment_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repayment_plans
    ADD CONSTRAINT repayment_plans_pkey PRIMARY KEY (id);


--
-- Name: subcategories subcategories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategories
    ADD CONSTRAINT subcategories_pkey PRIMARY KEY (id);


--
-- Name: tenant_credentials tenant_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_credentials
    ADD CONSTRAINT tenant_credentials_pkey PRIMARY KEY (id);


--
-- Name: tenant_credentials tenant_credentials_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_credentials
    ADD CONSTRAINT tenant_credentials_tenant_id_key UNIQUE (tenant_id);


--
-- Name: tenantmasterusers tenantmasterusers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenantmasterusers
    ADD CONSTRAINT tenantmasterusers_pkey PRIMARY KEY (id);


--
-- Name: tenantmasterusers tenantmasterusers_user_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenantmasterusers
    ADD CONSTRAINT tenantmasterusers_user_id_tenant_id_key UNIQUE (user_id, tenant_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_tenant_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_tenant_code_key UNIQUE (tenant_code);


--
-- Name: transaction_cycles_completed transaction_cycles_completed_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_cycles_completed
    ADD CONSTRAINT transaction_cycles_completed_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: customers unique_customer_area_book; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT unique_customer_area_book UNIQUE (area_id, book_no);


--
-- Name: user_push_tokens unique_user_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT unique_user_id UNIQUE (user_id);


--
-- Name: subcategories uq_category_subcategory_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategories
    ADD CONSTRAINT uq_category_subcategory_code UNIQUE (category_id, code);


--
-- Name: user_addresses user_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_pkey PRIMARY KEY (id);


--
-- Name: user_expenses user_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_expenses
    ADD CONSTRAINT user_expenses_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (user_id, group_id);


--
-- Name: user_push_tokens user_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_push_tokens user_push_tokens_push_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_push_token_key UNIQUE (push_token);


--
-- Name: user_qr_codes user_qr_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_qr_codes
    ADD CONSTRAINT user_qr_codes_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: variant_options variant_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_options
    ADD CONSTRAINT variant_options_pkey PRIMARY KEY (id);


--
-- Name: idx_conversation_participants_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_participants_conversation_id ON public.conversation_participants USING btree (conversation_id);


--
-- Name: idx_conversation_participants_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_participants_profile_id ON public.conversation_participants USING btree (profile_id);


--
-- Name: idx_customers_mobile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_mobile ON public.customers USING btree (mobile);


--
-- Name: idx_customers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_user_id ON public.customers USING btree (user_id);


--
-- Name: idx_delivery_partner_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_partner_order_id ON public.delivery_partner_locations USING btree (order_id);


--
-- Name: idx_location_history_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_history_timestamp ON public.location_history USING btree ("timestamp");


--
-- Name: idx_location_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_history_user_id ON public.location_history USING btree (user_id);


--
-- Name: idx_location_history_user_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_history_user_timestamp ON public.location_history USING btree (user_id, "timestamp");


--
-- Name: idx_message_summaries_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_summaries_conversation_id ON public.message_summaries USING btree (conversation_id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_delivery_manager_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_delivery_manager_id ON public.orders USING btree (delivery_manager_id);


--
-- Name: idx_orders_seller_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_seller_id ON public.orders USING btree (seller_id);


--
-- Name: idx_orders_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);


--
-- Name: idx_places_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_location ON public.places USING gist (location);


--
-- Name: idx_transactions_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_customer_id ON public.transactions USING btree (customer_id);


--
-- Name: idx_user_addresses_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_addresses_user_id ON public.user_addresses USING btree (user_id);


--
-- Name: idx_users_location_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_location_status ON public.users USING btree (location_status);


--
-- Name: idx_users_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_updated_at ON public.users USING btree (updated_at);


--
-- Name: tenantmasterusers_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenantmasterusers_role_idx ON public.tenantmasterusers USING btree (role);


--
-- Name: tenantmasterusers_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenantmasterusers_tenant_id_idx ON public.tenantmasterusers USING btree (tenant_id);


--
-- Name: tenantmasterusers_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenantmasterusers_user_id_idx ON public.tenantmasterusers USING btree (user_id);


--
-- Name: user_push_tokens_push_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_push_tokens_push_token_idx ON public.user_push_tokens USING btree (push_token);


--
-- Name: user_push_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_push_tokens_user_id_idx ON public.user_push_tokens USING btree (user_id);


--
-- Name: bank_transactions notify_bank_transactions_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_bank_transactions_insert AFTER INSERT ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.notify_edge_function();


--
-- Name: customers notify_customers_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_customers_insert AFTER INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.notify_edge_function();

ALTER TABLE public.customers DISABLE TRIGGER notify_customers_insert;


--
-- Name: transactions notify_transactions_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_transactions_insert AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.notify_edge_function();


--
-- Name: bank_transactions on_bank_transaction_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_bank_transaction_insert AFTER INSERT ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.notify_bank_tx_insert();


--
-- Name: customers on_customer_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_customer_insert AFTER INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.notify_customers_insert();

ALTER TABLE public.customers DISABLE TRIGGER on_customer_insert;


--
-- Name: orders on_new_delivery_order_notify_managers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_delivery_order_notify_managers AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_new_delivery_order_notification();


--
-- Name: order_items on_new_order_item_notify_seller; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_order_item_notify_seller AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.handle_new_order_notification();


--
-- Name: TRIGGER on_new_order_item_notify_seller ON order_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER on_new_order_item_notify_seller ON public.order_items IS 'When a new order item is created, trigger a push notification to the seller.';


--
-- Name: products on_new_product_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_product_created AFTER INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.trigger_notify_new_product_function();


--
-- Name: TRIGGER on_new_product_created ON products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER on_new_product_created ON public.products IS 'When a new product is created, trigger an Edge Function to notify all buyers.';


--
-- Name: orders on_order_assigned_notify_delivery_manager; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_order_assigned_notify_delivery_manager AFTER INSERT OR UPDATE OF delivery_manager_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_order_delivery_assignment_notification();


--
-- Name: orders on_order_completed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_order_completed AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_order_completed();


--
-- Name: orders on_order_created_notify_buyer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_order_created_notify_buyer AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_new_order_buyer_notification();


--
-- Name: order_items on_order_item_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_order_item_insert AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.handle_new_order_item_inventory();


--
-- Name: orders on_order_status_and_delivery_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_order_status_and_delivery_notify AFTER UPDATE OF delivery_manager_id, status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_and_delivery_notifications();


--
-- Name: orders order_status_update_notification_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER order_status_update_notification_trigger AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.notify_order_update();


--
-- Name: TRIGGER order_status_update_notification_trigger ON orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER order_status_update_notification_trigger ON public.orders IS 'Fires after an order status is updated to send a notification.';


--
-- Name: orders set_order_number_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_order_number_trigger BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_order_number();


--
-- Name: repayment_plans set_updated_at_on_repayment_plans; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_on_repayment_plans BEFORE UPDATE ON public.repayment_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customers trg_archive_customer_on_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_archive_customer_on_status_change AFTER UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.archive_customer_data();

ALTER TABLE public.customers DISABLE TRIGGER trg_archive_customer_on_status_change;


--
-- Name: products trg_ensure_default_product_combination; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_default_product_combination AFTER INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.ensure_default_product_combination();


--
-- Name: order_items trg_sync_order_seller_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_order_seller_id AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.sync_order_seller_id_from_item();


--
-- Name: bank_transactions trg_update_area_finance_balances; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_area_finance_balances AFTER INSERT OR DELETE OR UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.update_area_finance_balances();


--
-- Name: categories trigger_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: orders trigger_new_order_notify_sellers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_new_order_notify_sellers AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_new_order_notify_sellers();


--
-- Name: orders trigger_order_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_order_assignment AFTER INSERT OR UPDATE OF delivery_manager_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_order_assignment_notification();


--
-- Name: orders trigger_order_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_order_status_change AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_change_notifications();


--
-- Name: subcategories trigger_subcategories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_subcategories_updated_at BEFORE UPDATE ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: customers update_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.customers DISABLE TRIGGER update_customers_updated_at;


--
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bank_transactions bank_transactions_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.area_master(id) ON DELETE RESTRICT;


--
-- Name: bank_transactions bank_transactions_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE SET NULL;


--
-- Name: bank_transactions bank_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: cart_items cart_items_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_product_variant_combination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_product_variant_combination_id_fkey FOREIGN KEY (product_variant_combination_id) REFERENCES public.product_variant_combinations(id) ON DELETE CASCADE;


--
-- Name: carts carts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: customer_documents customer_documents_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_documents
    ADD CONSTRAINT customer_documents_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customers customers_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.area_master(id);


--
-- Name: customers customers_repayment_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_repayment_plan_id_fkey FOREIGN KEY (repayment_plan_id) REFERENCES public.repayment_plans(id);


--
-- Name: customers customers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: damage_reports damage_reports_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_reports
    ADD CONSTRAINT damage_reports_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.area_master(id);


--
-- Name: damage_reports damage_reports_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_reports
    ADD CONSTRAINT damage_reports_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: damage_reports damage_reports_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_reports
    ADD CONSTRAINT damage_reports_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES auth.users(id);


--
-- Name: delivery_manager_locations delivery_manager_locations_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_manager_locations
    ADD CONSTRAINT delivery_manager_locations_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: delivery_partner_locations delivery_partner_locations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_partner_locations
    ADD CONSTRAINT delivery_partner_locations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: delivery_partner_locations delivery_partner_locations_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_partner_locations
    ADD CONSTRAINT delivery_partner_locations_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_expenses fk_area; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_expenses
    ADD CONSTRAINT fk_area FOREIGN KEY (area_id) REFERENCES public.area_master(id) ON DELETE SET NULL;


--
-- Name: customer_documents fk_customer_documents_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_documents
    ADD CONSTRAINT fk_customer_documents_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: damage_report_files fk_damage_report; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_report_files
    ADD CONSTRAINT fk_damage_report FOREIGN KEY (damage_report_id) REFERENCES public.damage_reports(id) ON DELETE CASCADE;


--
-- Name: messages fk_sender; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT fk_sender FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: group_areas group_areas_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_areas
    ADD CONSTRAINT group_areas_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.area_master(id) ON DELETE CASCADE;


--
-- Name: group_areas group_areas_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_areas
    ADD CONSTRAINT group_areas_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: groups groups_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.area_master(id);


--
-- Name: inventory_history inventory_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_history
    ADD CONSTRAINT inventory_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: inventory_history inventory_history_product_variant_combination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_history
    ADD CONSTRAINT inventory_history_product_variant_combination_id_fkey FOREIGN KEY (product_variant_combination_id) REFERENCES public.product_variant_combinations(id) ON DELETE CASCADE;


--
-- Name: location_history location_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_history
    ADD CONSTRAINT location_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: message_summaries message_summaries_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_summaries
    ADD CONSTRAINT message_summaries_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_variant_combination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_variant_combination_id_fkey FOREIGN KEY (product_variant_combination_id) REFERENCES public.product_variant_combinations(id) ON DELETE SET NULL;


--
-- Name: orders orders_delivery_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_delivery_manager_id_fkey FOREIGN KEY (delivery_manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: orders orders_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: product_media product_media_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_variant_combinations product_variant_combinations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant_combinations
    ADD CONSTRAINT product_variant_combinations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: products products_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: products products_subcategory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.subcategories(id) ON DELETE SET NULL;


--
-- Name: products products_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_tokens push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: subcategories subcategories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategories
    ADD CONSTRAINT subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: tenant_credentials tenant_credentials_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_credentials
    ADD CONSTRAINT tenant_credentials_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenantmasterusers tenantmasterusers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenantmasterusers
    ADD CONSTRAINT tenantmasterusers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenantmasterusers tenantmasterusers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenantmasterusers
    ADD CONSTRAINT tenantmasterusers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_addresses user_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_expenses user_expenses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_expenses
    ADD CONSTRAINT user_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_groups user_groups_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: user_groups user_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: user_groups user_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_push_tokens user_push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_qr_codes user_qr_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_qr_codes
    ADD CONSTRAINT user_qr_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: variant_options variant_options_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_options
    ADD CONSTRAINT variant_options_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: bank_transactions Admin/Superadmin can delete bank transactions.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Superadmin can delete bank transactions." ON public.bank_transactions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.user_type = 'admin'::text) OR (users.user_type = 'superadmin'::text))))));


--
-- Name: bank_transactions Admin/Superadmin can insert bank transactions.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Superadmin can insert bank transactions." ON public.bank_transactions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.user_type = 'admin'::text) OR (users.user_type = 'superadmin'::text))))));


--
-- Name: bank_accounts Admin/Superadmin can manage bank_accounts.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Superadmin can manage bank_accounts." ON public.bank_accounts TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.user_type = 'admin'::text) OR (users.user_type = 'superadmin'::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.user_type = 'admin'::text) OR (users.user_type = 'superadmin'::text))))));


--
-- Name: bank_transactions Admin/Superadmin can update bank transactions.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Superadmin can update bank transactions." ON public.bank_transactions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.user_type = 'admin'::text) OR (users.user_type = 'superadmin'::text))))));


--
-- Name: bank_transactions Admin/Superadmin can view all bank transactions.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Superadmin can view all bank transactions." ON public.bank_transactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.user_type = 'admin'::text) OR (users.user_type = 'superadmin'::text))))));


--
-- Name: profiles Admins and owners can update profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and owners can update profiles" ON public.profiles FOR UPDATE USING (((auth.uid() = id) OR public.is_admin_user()));


--
-- Name: products Admins and sellers can delete products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and sellers can delete products" ON public.products FOR DELETE USING (((auth.uid() = user_id) OR public.is_admin_user()));


--
-- Name: products Admins and sellers can update products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and sellers can update products" ON public.products FOR UPDATE USING (((auth.uid() = user_id) OR public.is_admin_user()));


--
-- Name: categories Admins can delete categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete categories" ON public.categories FOR DELETE USING (((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'appadmin'::text, 'app_admin'::text])))) OR (auth.role() = 'service_role'::text)));


--
-- Name: subcategories Admins can delete subcategories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete subcategories" ON public.subcategories FOR DELETE USING (((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'appadmin'::text, 'app_admin'::text])))) OR (auth.role() = 'service_role'::text)));


--
-- Name: categories Admins can insert categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert categories" ON public.categories FOR INSERT WITH CHECK (((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'appadmin'::text, 'app_admin'::text])))) OR (auth.role() = 'service_role'::text)));


--
-- Name: subcategories Admins can insert subcategories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert subcategories" ON public.subcategories FOR INSERT WITH CHECK (((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'appadmin'::text, 'app_admin'::text])))) OR (auth.role() = 'service_role'::text)));


--
-- Name: categories Admins can update categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE USING (((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'appadmin'::text, 'app_admin'::text])))) OR (auth.role() = 'service_role'::text)));


--
-- Name: subcategories Admins can update subcategories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update subcategories" ON public.subcategories FOR UPDATE USING (((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'appadmin'::text, 'app_admin'::text])))) OR (auth.role() = 'service_role'::text)));


--
-- Name: users Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.users USING (true);


--
-- Name: location_history Allow all inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all inserts" ON public.location_history FOR INSERT WITH CHECK (true);


--
-- Name: location_history Allow all selects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all selects" ON public.location_history FOR SELECT USING (true);


--
-- Name: tenants Allow authenticated users to read tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read tenants" ON public.tenants FOR SELECT TO authenticated USING (true);


--
-- Name: profiles Allow individual insert on profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow individual insert on profiles" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Allow public select on profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public select on profiles" ON public.profiles FOR SELECT USING (true);


--
-- Name: push_tokens Allow users to insert their own push tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow users to insert their own push tokens" ON public.push_tokens FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: push_tokens Allow users to view their own push tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow users to view their own push tokens" ON public.push_tokens FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: products Anyone can view active products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active products" ON public.products FOR SELECT USING ((is_active = true));


--
-- Name: product_variant_combinations Anyone can view combinations for active products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view combinations for active products" ON public.product_variant_combinations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variant_combinations.product_id) AND (products.is_active = true)))));


--
-- Name: delivery_partner_locations Anyone can view live partner locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view live partner locations" ON public.delivery_partner_locations FOR SELECT USING (true);


--
-- Name: variant_options Anyone can view options for active products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view options for active products" ON public.variant_options FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.product_variants pv
     JOIN public.products p ON ((pv.product_id = p.id)))
  WHERE ((pv.id = variant_options.variant_id) AND (p.is_active = true)))));


--
-- Name: product_media Anyone can view product media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view product media" ON public.product_media FOR SELECT USING (true);


--
-- Name: product_variants Anyone can view variants for active products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view variants for active products" ON public.product_variants FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variants.product_id) AND (products.is_active = true)))));


--
-- Name: bank_accounts Authenticated users can view bank_accounts.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view bank_accounts." ON public.bank_accounts FOR SELECT TO authenticated USING (true);


--
-- Name: damage_report_files Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users only" ON public.damage_report_files FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: damage_reports Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users only" ON public.damage_reports FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: damage_report_files Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.damage_report_files FOR SELECT USING (true);


--
-- Name: damage_reports Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.damage_reports FOR SELECT USING (true);


--
-- Name: user_groups Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.user_groups FOR SELECT USING (true);


--
-- Name: order_items Order items delete policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Order items delete policy" ON public.order_items FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.seller_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))))))));


--
-- Name: order_items Order items insert policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Order items insert policy" ON public.order_items FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.user_id = auth.uid()) OR (o.seller_id = auth.uid()) OR (auth.uid() IS NULL))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: order_items Order items update policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Order items update policy" ON public.order_items FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.seller_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))))))));


--
-- Name: order_items Order items view policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Order items view policy" ON public.order_items FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.user_id = auth.uid()) OR (o.seller_id = auth.uid()) OR (o.delivery_manager_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'delivery_manager'::text]))))))))) OR (EXISTS ( SELECT 1
   FROM (public.product_variant_combinations pvc
     JOIN public.products p ON ((pvc.product_id = p.id)))
  WHERE ((pvc.id = order_items.product_variant_combination_id) AND ((p.user_id = auth.uid()) OR (p.customer_id IN ( SELECT customers.id
           FROM public.customers
          WHERE (customers.user_id = auth.uid())))))))));


--
-- Name: orders Orders delete policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Orders delete policy" ON public.orders FOR DELETE USING (((auth.uid() = seller_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: orders Orders insert policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Orders insert policy" ON public.orders FOR INSERT WITH CHECK (((auth.uid() = user_id) OR (auth.uid() = seller_id) OR (auth.uid() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: orders Orders update policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Orders update policy" ON public.orders FOR UPDATE USING (((auth.uid() = seller_id) OR (auth.uid() = user_id) OR (auth.uid() = delivery_manager_id) OR ((delivery_manager_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'delivery_manager'::text))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))))) WITH CHECK (((auth.uid() = seller_id) OR (auth.uid() = user_id) OR (auth.uid() = delivery_manager_id) OR ((delivery_manager_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'delivery_manager'::text))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: orders Orders view policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Orders view policy" ON public.orders FOR SELECT USING (((auth.uid() = user_id) OR (auth.uid() = seller_id) OR (auth.uid() = delivery_manager_id) OR ((delivery_manager_id IS NULL) AND ((order_type IS NULL) OR (order_type <> 'shop-order'::text)) AND (status <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'delivery_manager'::text))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: delivery_partner_locations Partners can manage own location; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can manage own location" ON public.delivery_partner_locations USING ((auth.uid() = partner_id)) WITH CHECK ((auth.uid() = partner_id));


--
-- Name: categories Public can view active categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active categories" ON public.categories FOR SELECT USING (((is_active = true) OR (auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'appadmin'::text, 'app_admin'::text]))))));


--
-- Name: subcategories Public can view active subcategories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active subcategories" ON public.subcategories FOR SELECT USING (((is_active = true) OR (auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'appadmin'::text, 'app_admin'::text]))))));


--
-- Name: product_media Sellers can delete media for their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can delete media for their own products" ON public.product_media FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_media.product_id) AND (products.user_id = auth.uid())))));


--
-- Name: product_media Sellers can insert media for their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can insert media for their own products" ON public.product_media FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_media.product_id) AND (products.user_id = auth.uid())))));


--
-- Name: products Sellers can insert their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can insert their own products" ON public.products FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: product_variant_combinations Sellers can manage combinations for their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can manage combinations for their own products" ON public.product_variant_combinations USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variant_combinations.product_id) AND (products.user_id = auth.uid())))));


--
-- Name: variant_options Sellers can manage options for their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can manage options for their own products" ON public.variant_options USING ((EXISTS ( SELECT 1
   FROM (public.product_variants pv
     JOIN public.products p ON ((pv.product_id = p.id)))
  WHERE ((pv.id = variant_options.variant_id) AND (p.user_id = auth.uid())))));


--
-- Name: product_variants Sellers can manage variants for their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can manage variants for their own products" ON public.product_variants USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variants.product_id) AND (products.user_id = auth.uid())))));


--
-- Name: product_media Sellers can update media for their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can update media for their own products" ON public.product_media FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_media.product_id) AND (products.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_media.product_id) AND (products.user_id = auth.uid())))));


--
-- Name: message_summaries Service role can manage summaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage summaries" ON public.message_summaries TO service_role USING (true) WITH CHECK (true);


--
-- Name: conversation_participants Users can add participants to their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add participants to their conversations" ON public.conversation_participants FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.conversation_participants cp
  WHERE ((cp.conversation_id = conversation_participants.conversation_id) AND (cp.profile_id = ( SELECT auth.uid() AS uid))))) OR (profile_id = ( SELECT auth.uid() AS uid))));


--
-- Name: conversations Users can create conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: product_media Users can delete own product media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own product media" ON public.product_media FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_media.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: product_variant_combinations Users can delete own product variant combinations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own product variant combinations" ON public.product_variant_combinations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variant_combinations.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: product_variants Users can delete own product variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own product variants" ON public.product_variants FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variants.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: products Users can delete own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own products" ON public.products FOR DELETE USING ((auth.uid() = ( SELECT customers.user_id
   FROM public.customers
  WHERE (customers.id = products.customer_id))));


--
-- Name: variant_options Users can delete own variant options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own variant options" ON public.variant_options FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.product_variants pv
     JOIN public.products p ON ((pv.product_id = p.id)))
  WHERE ((pv.id = variant_options.variant_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = p.customer_id)))))));


--
-- Name: user_addresses Users can delete their own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own addresses" ON public.user_addresses FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: product_media Users can insert own product media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own product media" ON public.product_media FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_media.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: product_variant_combinations Users can insert own product variant combinations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own product variant combinations" ON public.product_variant_combinations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variant_combinations.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: product_variants Users can insert own product variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own product variants" ON public.product_variants FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variants.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: products Users can insert own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own products" ON public.products FOR INSERT WITH CHECK ((auth.uid() = ( SELECT customers.user_id
   FROM public.customers
  WHERE (customers.id = products.customer_id))));


--
-- Name: variant_options Users can insert own variant options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own variant options" ON public.variant_options FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.product_variants pv
     JOIN public.products p ON ((pv.product_id = p.id)))
  WHERE ((pv.id = variant_options.variant_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = p.customer_id)))))));


--
-- Name: user_addresses Users can insert their own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own addresses" ON public.user_addresses FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: carts Users can manage own cart; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own cart" ON public.carts USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: cart_items Users can manage own cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own cart items" ON public.cart_items USING ((EXISTS ( SELECT 1
   FROM public.carts
  WHERE ((carts.id = cart_items.cart_id) AND (carts.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.carts
  WHERE ((carts.id = cart_items.cart_id) AND (carts.user_id = auth.uid())))));


--
-- Name: push_tokens Users can manage their own push tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own push tokens" ON public.push_tokens USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: conversation_participants Users can remove participants from their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove participants from their conversations" ON public.conversation_participants FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.conversation_participants cp
  WHERE ((cp.conversation_id = conversation_participants.conversation_id) AND (cp.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: product_variant_combinations Users can update own product variant combinations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own product variant combinations" ON public.product_variant_combinations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variant_combinations.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: product_variants Users can update own product variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own product variants" ON public.product_variants FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variants.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: products Users can update own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own products" ON public.products FOR UPDATE USING ((auth.uid() = ( SELECT customers.user_id
   FROM public.customers
  WHERE (customers.id = products.customer_id))));


--
-- Name: variant_options Users can update own variant options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own variant options" ON public.variant_options FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.product_variants pv
     JOIN public.products p ON ((pv.product_id = p.id)))
  WHERE ((pv.id = variant_options.variant_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = p.customer_id)))))));


--
-- Name: conversations Users can update their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their conversations" ON public.conversations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.conversation_participants
  WHERE ((conversation_participants.conversation_id = conversations.id) AND (conversation_participants.profile_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK (true);


--
-- Name: user_addresses Users can update their own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own addresses" ON public.user_addresses FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: product_media Users can view own product media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own product media" ON public.product_media FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_media.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: product_variant_combinations Users can view own product variant combinations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own product variant combinations" ON public.product_variant_combinations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variant_combinations.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: product_variants Users can view own product variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own product variants" ON public.product_variants FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variants.product_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = products.customer_id)))))));


--
-- Name: products Users can view own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own products" ON public.products FOR SELECT USING ((auth.uid() = ( SELECT customers.user_id
   FROM public.customers
  WHERE (customers.id = products.customer_id))));


--
-- Name: variant_options Users can view own variant options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own variant options" ON public.variant_options FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.product_variants pv
     JOIN public.products p ON ((pv.product_id = p.id)))
  WHERE ((pv.id = variant_options.variant_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = p.customer_id)))))));


--
-- Name: conversation_participants Users can view participants of their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view participants of their conversations" ON public.conversation_participants FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.conversation_participants cp
  WHERE ((cp.conversation_id = conversation_participants.conversation_id) AND (cp.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: message_summaries Users can view summaries of their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view summaries of their conversations" ON public.message_summaries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.conversation_participants
  WHERE ((conversation_participants.conversation_id = message_summaries.conversation_id) AND (conversation_participants.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: conversations Users can view their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their conversations" ON public.conversations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.conversation_participants
  WHERE ((conversation_participants.conversation_id = conversations.id) AND (conversation_participants.profile_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: user_addresses Users can view their own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own addresses" ON public.user_addresses FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: inventory_history Users can view their own inventory history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own inventory history" ON public.inventory_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.products p
     JOIN public.product_variant_combinations pvc ON ((p.id = pvc.product_id)))
  WHERE ((pvc.id = inventory_history.product_variant_combination_id) AND (auth.uid() = ( SELECT customers.user_id
           FROM public.customers
          WHERE (customers.id = p.customer_id)))))));


--
-- Name: cart_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

--
-- Name: carts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_partner_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_partner_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_delete_policy ON public.order_items FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND ((auth.uid() = orders.seller_id) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))))))));


--
-- Name: order_items order_items_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_insert_policy ON public.order_items FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND ((auth.uid() = orders.user_id) OR (auth.uid() = orders.seller_id) OR (auth.uid() IS NULL))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: order_items order_items_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_select_policy ON public.order_items FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND ((auth.uid() = orders.user_id) OR (auth.uid() = orders.seller_id) OR (auth.uid() = orders.delivery_manager_id) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'delivery_manager'::text]))))))))) OR (EXISTS ( SELECT 1
   FROM (public.product_variant_combinations pvc
     JOIN public.products p ON ((pvc.product_id = p.id)))
  WHERE ((pvc.id = order_items.product_variant_combination_id) AND ((p.user_id = auth.uid()) OR (p.customer_id IN ( SELECT customers.id
           FROM public.customers
          WHERE (customers.user_id = auth.uid())))))))));


--
-- Name: order_items order_items_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_update_policy ON public.order_items FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND ((auth.uid() = orders.seller_id) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))))))));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_delete_policy ON public.orders FOR DELETE USING (((auth.uid() = seller_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: orders orders_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_insert_policy ON public.orders FOR INSERT WITH CHECK (((auth.uid() = user_id) OR (auth.uid() = seller_id) OR (auth.uid() IS NULL) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: orders orders_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_select_policy ON public.orders FOR SELECT USING (((auth.uid() = user_id) OR (auth.uid() = seller_id) OR (auth.uid() = delivery_manager_id) OR ((delivery_manager_id IS NULL) AND ((order_type IS NULL) OR (order_type <> 'shop-order'::text)) AND (status <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'delivery_manager'::text))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: orders orders_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_update_policy ON public.orders FOR UPDATE USING (((auth.uid() = seller_id) OR (auth.uid() = user_id) OR (auth.uid() = delivery_manager_id) OR ((delivery_manager_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'delivery_manager'::text))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))))) WITH CHECK (((auth.uid() = seller_id) OR (auth.uid() = user_id) OR (auth.uid() = delivery_manager_id) OR ((delivery_manager_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'delivery_manager'::text))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: product_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variant_combinations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variant_combinations ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: subcategories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

--
-- Name: user_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: variant_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variant_options ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict Dq9f6blaNjzA6vMXXkEDQLIp2Z8apNw0M9ZR9nlcIar5E51QpjrlUEME9dVb2Ze

