
CREATE TABLE public.receipt_sequences (
  year int PRIMARY KEY,
  last_no int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.receipt_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all receipt_sequences" ON public.receipt_sequences FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.next_receipt_no()
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  y int := EXTRACT(YEAR FROM now())::int;
  n int;
BEGIN
  LOOP
    UPDATE public.receipt_sequences
    SET last_no = last_no + 1,
        updated_at = now()
    WHERE year = y
    RETURNING last_no INTO n;

    IF FOUND THEN
      EXIT;
    END IF;

    BEGIN
      INSERT INTO public.receipt_sequences(year, last_no) VALUES (y, 1);
      n := 1;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;

  RETURN 'RCPT-' || y::text || '-' || lpad(n::text, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_receipt_no() TO authenticated;

CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  receipt_no text NOT NULL DEFAULT public.next_receipt_no(),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'cash',
  paid_at timestamptz NOT NULL DEFAULT now(),
  reference text,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all invoice_payments" ON public.invoice_payments FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE UNIQUE INDEX idx_invoice_payments_receipt_no ON public.invoice_payments(receipt_no);
CREATE INDEX idx_invoice_payments_invoice ON public.invoice_payments(invoice_id, paid_at DESC);
CREATE INDEX idx_invoice_payments_patient ON public.invoice_payments(patient_id, paid_at DESC);

CREATE OR REPLACE FUNCTION public.recalc_invoice_payments(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p numeric(10,2);
  t numeric(10,2);
  s text;
BEGIN
  SELECT COALESCE(SUM(amount), 0)::numeric(10,2) INTO p
  FROM public.invoice_payments
  WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(total, 0)::numeric(10,2) INTO t
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF p >= t AND t > 0 THEN
    s := 'paid';
  ELSIF p > 0 THEN
    s := 'partial';
  ELSE
    s := 'unpaid';
  END IF;

  UPDATE public.invoices
  SET paid_amount = p,
      status = s,
      updated_at = now()
  WHERE id = p_invoice_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.recalc_invoice_payments(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_invoice_payments_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  inv_id uuid;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF inv_id IS NOT NULL THEN
    PERFORM public.recalc_invoice_payments(inv_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
GRANT EXECUTE ON FUNCTION public.trg_invoice_payments_recalc() TO authenticated;

CREATE TRIGGER trg_invoice_payments_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_payments_recalc();

CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all expense_categories" ON public.expense_categories FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL DEFAULT 'cash',
  day_of_month int NOT NULL DEFAULT 1 CHECK (day_of_month >= 1 AND day_of_month <= 28),
  active boolean NOT NULL DEFAULT true,
  last_generated_month date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all recurring_expenses" ON public.recurring_expenses FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_recurring_expenses_updated BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  recurring_id uuid REFERENCES public.recurring_expenses(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  incurred_on date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'cash',
  vendor text,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all expenses" ON public.expenses FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_expenses_incurred_on ON public.expenses(incurred_on DESC);
CREATE INDEX idx_expenses_category ON public.expenses(category_id);
CREATE INDEX idx_expenses_doctor ON public.expenses(doctor_id);
CREATE UNIQUE INDEX idx_expenses_recurring_unique ON public.expenses(recurring_id, incurred_on) WHERE recurring_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_recurring_expenses(p_month date DEFAULT CURRENT_DATE)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  m date := date_trunc('month', p_month)::date;
  r record;
  incurred date;
  inserted int := 0;
BEGIN
  FOR r IN
    SELECT *
    FROM public.recurring_expenses
    WHERE active = true
      AND (last_generated_month IS NULL OR last_generated_month < m)
  LOOP
    incurred := (m + (r.day_of_month - 1))::date;
    INSERT INTO public.expenses(category_id, doctor_id, recurring_id, amount, incurred_on, payment_method, vendor, notes)
    VALUES (r.category_id, r.doctor_id, r.id, r.amount, incurred, r.payment_method, NULL, r.notes)
    ON CONFLICT (recurring_id, incurred_on) DO NOTHING;
    GET DIAGNOSTICS inserted = inserted + ROW_COUNT;
  END LOOP;

  UPDATE public.recurring_expenses
  SET last_generated_month = m,
      updated_at = now()
  WHERE active = true
    AND (last_generated_month IS NULL OR last_generated_month < m);

  RETURN inserted;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_recurring_expenses(date) TO authenticated;

CREATE TABLE public.doctor_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'visit' CHECK (scope IN ('visit', 'service', 'salary')),
  invoice_type text,
  service_category text,
  service_match text,
  calc_type text NOT NULL DEFAULT 'percent' CHECK (calc_type IN ('percent', 'fixed')),
  value numeric(10,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doctor_commission_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all doctor_commission_rules" ON public.doctor_commission_rules FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_doctor_commission_rules_updated BEFORE UPDATE ON public.doctor_commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_doctor_commission_rules_doctor ON public.doctor_commission_rules(doctor_id);

