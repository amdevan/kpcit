-- Add patient_code (MRN) to patients
ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS patient_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'patients_patient_code_unique'
  ) THEN
    CREATE UNIQUE INDEX patients_patient_code_unique ON public.patients (patient_code) WHERE patient_code IS NOT NULL;
  END IF;
END $$;

