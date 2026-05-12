
-- contact_messages
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  subject text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can submit contact" ON public.contact_messages
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin view contact" ON public.contact_messages
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update contact" ON public.contact_messages
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete contact" ON public.contact_messages
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER contact_messages_set_updated_at
BEFORE UPDATE ON public.contact_messages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Role-based policies on existing tables
-- Patients: doctor + receptionist
CREATE POLICY "doctor recept patients" ON public.patients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'receptionist'))
  WITH CHECK (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'receptionist'));

-- Appointments: doctor + receptionist
CREATE POLICY "doctor recept appts" ON public.appointments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'receptionist'))
  WITH CHECK (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'receptionist'));

-- Medical records: doctor
CREATE POLICY "doctor records" ON public.medical_records
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'doctor'))
  WITH CHECK (public.has_role(auth.uid(),'doctor'));

-- Prescriptions: doctor
CREATE POLICY "doctor rx" ON public.prescriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'doctor'))
  WITH CHECK (public.has_role(auth.uid(),'doctor'));

-- Lab reports: doctor
CREATE POLICY "doctor labs" ON public.lab_reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'doctor'))
  WITH CHECK (public.has_role(auth.uid(),'doctor'));

-- Doctors directory: doctor + receptionist read
CREATE POLICY "doctor recept view doctors" ON public.doctors
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'receptionist'));

-- Invoices: receptionist
CREATE POLICY "recept invoices" ON public.invoices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'receptionist'))
  WITH CHECK (public.has_role(auth.uid(),'receptionist'));
CREATE POLICY "recept invoice_items" ON public.invoice_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'receptionist'))
  WITH CHECK (public.has_role(auth.uid(),'receptionist'));

-- user_roles management by admin
CREATE POLICY "admin view user_roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin insert user_roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete user_roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Profiles: admin can view all (for user management page)
CREATE POLICY "admin view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Update default new-user role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  -- If no users yet, make admin; else receptionist by default
  IF (SELECT count(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'receptionist');
  END IF;
  RETURN NEW;
END;
$function$;
