
CREATE POLICY "staff view patients" ON public.patients
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'staff'));

CREATE POLICY "staff view doctors" ON public.doctors
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'staff'));

CREATE POLICY "staff view invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'staff'));

CREATE POLICY "staff view invoice_items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'staff'));

CREATE POLICY "staff all invoice_payments" ON public.invoice_payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'staff'));

CREATE POLICY "staff all expense_categories" ON public.expense_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'staff'));

CREATE POLICY "staff all expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'staff'));

CREATE POLICY "staff all recurring_expenses" ON public.recurring_expenses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'staff'));

CREATE POLICY "staff all doctor_commission_rules" ON public.doctor_commission_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'staff'));

