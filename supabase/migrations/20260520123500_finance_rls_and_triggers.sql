
CREATE OR REPLACE FUNCTION public.recalc_invoice_payments(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
SECURITY DEFINER
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

CREATE POLICY "doctor view invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'doctor'));

CREATE POLICY "doctor view invoice_items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'doctor'));

