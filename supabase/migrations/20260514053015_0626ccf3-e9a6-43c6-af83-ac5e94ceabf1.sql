
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'OPD',
  ADD COLUMN IF NOT EXISTS doctor_id uuid,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax numeric NOT NULL DEFAULT 0;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'OPD',
  ADD COLUMN IF NOT EXISTS doctor_id uuid;

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS commission_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift text,
  ADD COLUMN IF NOT EXISTS shift_start time,
  ADD COLUMN IF NOT EXISTS shift_end time,
  ADD COLUMN IF NOT EXISTS available_days text[] DEFAULT '{}'::text[];

ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS reminder_days_before integer NOT NULL DEFAULT 0;
