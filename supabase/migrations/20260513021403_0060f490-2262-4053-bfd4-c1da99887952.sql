
-- INQUIRIES
CREATE TABLE public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  email text,
  age integer,
  gender text,
  address text,
  source text,
  purpose text,
  notes text,
  status text NOT NULL DEFAULT 'new',
  assigned_to uuid,
  follow_up_date date,
  converted_patient_id uuid,
  converted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all inquiries" ON public.inquiries FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "recept inquiries" ON public.inquiries FOR ALL TO authenticated
  USING (has_role(auth.uid(),'receptionist')) WITH CHECK (has_role(auth.uid(),'receptionist'));
CREATE POLICY "doctor view inquiries" ON public.inquiries FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'doctor'));
CREATE TRIGGER trg_inquiries_updated BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FOLLOW UPS
CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid,
  inquiry_id uuid,
  title text NOT NULL,
  notes text,
  due_date date NOT NULL,
  channel text NOT NULL DEFAULT 'call',
  status text NOT NULL DEFAULT 'pending',
  assigned_to uuid,
  notify_staff boolean NOT NULL DEFAULT true,
  notify_patient boolean NOT NULL DEFAULT false,
  patient_notified_at timestamptz,
  staff_notified_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all followups" ON public.follow_ups FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "recept followups" ON public.follow_ups FOR ALL TO authenticated
  USING (has_role(auth.uid(),'receptionist')) WITH CHECK (has_role(auth.uid(),'receptionist'));
CREATE POLICY "doctor followups" ON public.follow_ups FOR ALL TO authenticated
  USING (has_role(auth.uid(),'doctor')) WITH CHECK (has_role(auth.uid(),'doctor'));
CREATE TRIGGER trg_followups_updated BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_followups_due ON public.follow_ups(due_date) WHERE status='pending';
CREATE INDEX idx_inquiries_status ON public.inquiries(status);
