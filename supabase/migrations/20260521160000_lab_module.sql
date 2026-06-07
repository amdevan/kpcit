CREATE TABLE IF NOT EXISTS public.lab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text NOT NULL,
  department text NOT NULL DEFAULT 'General',
  specimen text,
  unit text,
  ref_low numeric,
  ref_high numeric,
  ref_text text,
  price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'lab_tests_code_unique'
  ) THEN
    CREATE UNIQUE INDEX lab_tests_code_unique ON public.lab_tests(code) WHERE code IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lab_tests_department ON public.lab_tests(department);
CREATE INDEX IF NOT EXISTS idx_lab_tests_name ON public.lab_tests(name);

DROP TRIGGER IF EXISTS trg_lab_tests_updated ON public.lab_tests;
CREATE TRIGGER trg_lab_tests_updated BEFORE UPDATE ON public.lab_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.lab_test_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  department text,
  price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_packages_name ON public.lab_test_packages(name);

DROP TRIGGER IF EXISTS trg_lab_packages_updated ON public.lab_test_packages;
CREATE TRIGGER trg_lab_packages_updated BEFORE UPDATE ON public.lab_test_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.lab_test_package_items (
  package_id uuid NOT NULL REFERENCES public.lab_test_packages(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.lab_tests(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, test_id)
);

CREATE TABLE IF NOT EXISTS public.lab_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'requested',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  verified_by_name text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON public.lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON public.lab_orders(status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_ordered_at ON public.lab_orders(ordered_at);

DROP TRIGGER IF EXISTS trg_lab_orders_updated ON public.lab_orders;
CREATE TRIGGER trg_lab_orders_updated BEFORE UPDATE ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.lab_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  test_id uuid REFERENCES public.lab_tests(id) ON DELETE SET NULL,
  test_name text NOT NULL,
  department text,
  unit text,
  ref_low numeric,
  ref_high numeric,
  ref_text text,
  price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_order_items_order ON public.lab_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_lab_order_items_test_name ON public.lab_order_items(test_name);

DROP TRIGGER IF EXISTS trg_lab_order_items_updated ON public.lab_order_items;
CREATE TRIGGER trg_lab_order_items_updated BEFORE UPDATE ON public.lab_order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.lab_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  barcode text UNIQUE,
  collected_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  collected_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_samples_status ON public.lab_samples(status);

DROP TRIGGER IF EXISTS trg_lab_samples_updated ON public.lab_samples;
CREATE TRIGGER trg_lab_samples_updated BEFORE UPDATE ON public.lab_samples
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.lab_order_items(id) ON DELETE CASCADE,
  value_text text,
  value_numeric numeric,
  flag text,
  remarks text,
  entered_by uuid REFERENCES auth.users(id),
  entered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_lab_results_updated ON public.lab_results;
CREATE TRIGGER trg_lab_results_updated BEFORE UPDATE ON public.lab_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_test_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_test_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_tests manage" ON public.lab_tests;
CREATE POLICY "lab_tests manage" ON public.lab_tests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));

DROP POLICY IF EXISTS "lab_tests view" ON public.lab_tests;
CREATE POLICY "lab_tests view" ON public.lab_tests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  );

DROP POLICY IF EXISTS "lab_packages manage" ON public.lab_test_packages;
CREATE POLICY "lab_packages manage" ON public.lab_test_packages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));

DROP POLICY IF EXISTS "lab_packages view" ON public.lab_test_packages;
CREATE POLICY "lab_packages view" ON public.lab_test_packages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  );

DROP POLICY IF EXISTS "lab_package_items manage" ON public.lab_test_package_items;
CREATE POLICY "lab_package_items manage" ON public.lab_test_package_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));

DROP POLICY IF EXISTS "lab_package_items view" ON public.lab_test_package_items;
CREATE POLICY "lab_package_items view" ON public.lab_test_package_items FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  );

DROP POLICY IF EXISTS "lab_orders all" ON public.lab_orders;
CREATE POLICY "lab_orders all" ON public.lab_orders FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  );

DROP POLICY IF EXISTS "lab_order_items all" ON public.lab_order_items;
CREATE POLICY "lab_order_items all" ON public.lab_order_items FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  );

DROP POLICY IF EXISTS "lab_samples all" ON public.lab_samples;
CREATE POLICY "lab_samples all" ON public.lab_samples FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  );

DROP POLICY IF EXISTS "lab_results all" ON public.lab_results;
CREATE POLICY "lab_results all" ON public.lab_results FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'staff')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'receptionist')
  );

