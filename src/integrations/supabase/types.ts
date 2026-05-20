export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          created_at: string
          doctor_id: string | null
          duration_minutes: number
          id: string
          notes: string | null
          patient_id: string
          reason: string | null
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctor_id?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          patient_id: string
          reason?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctor_id?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          patient_id?: string
          reason?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          available_days: string[] | null
          commission_type: string
          commission_value: number
          consultation_fee: number | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          license_number: string | null
          notes: string | null
          phone: string | null
          shift: string | null
          shift_end: string | null
          shift_start: string | null
          specialty: string | null
          updated_at: string
        }
        Insert: {
          available_days?: string[] | null
          commission_type?: string
          commission_value?: number
          consultation_fee?: number | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          license_number?: string | null
          notes?: string | null
          phone?: string | null
          shift?: string | null
          shift_end?: string | null
          shift_start?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          available_days?: string[] | null
          commission_type?: string
          commission_value?: number
          consultation_fee?: number | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          license_number?: string | null
          notes?: string | null
          phone?: string | null
          shift?: string | null
          shift_end?: string | null
          shift_start?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          assigned_to: string | null
          channel: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          inquiry_id: string | null
          notes: string | null
          notify_patient: boolean
          notify_staff: boolean
          patient_id: string | null
          patient_notified_at: string | null
          priority: string
          reminder_days_before: number
          staff_notified_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          inquiry_id?: string | null
          notes?: string | null
          notify_patient?: boolean
          notify_staff?: boolean
          patient_id?: string | null
          patient_notified_at?: string | null
          priority?: string
          reminder_days_before?: number
          staff_notified_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          inquiry_id?: string | null
          notes?: string | null
          notify_patient?: boolean
          notify_staff?: boolean
          patient_id?: string | null
          patient_notified_at?: string | null
          priority?: string
          reminder_days_before?: number
          staff_notified_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          address: string | null
          age: number | null
          assigned_to: string | null
          converted_at: string | null
          converted_patient_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          follow_up_date: string | null
          full_name: string
          gender: string | null
          id: string
          notes: string | null
          phone: string | null
          purpose: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          age?: number | null
          assigned_to?: string | null
          converted_at?: string | null
          converted_patient_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          follow_up_date?: string | null
          full_name: string
          gender?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          purpose?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          age?: number | null
          assigned_to?: string | null
          converted_at?: string | null
          converted_patient_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          follow_up_date?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          purpose?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category: string | null
          created_at: string
          expiry_date: string | null
          id: string
          name: string
          notes: string | null
          quantity: number
          reorder_level: number
          sku: string | null
          supplier: string | null
          unit: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          name: string
          notes?: string | null
          quantity?: number
          reorder_level?: number
          sku?: string | null
          supplier?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          quantity?: number
          reorder_level?: number
          sku?: string | null
          supplier?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          category: string
          created_at: string
          description: string
          doctor_id: string | null
          id: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          doctor_id?: string | null
          id?: string
          invoice_id: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          doctor_id?: string | null
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          discount: number
          doctor_id: string | null
          due_date: string | null
          id: string
          invoice_number: string
          invoice_type: string
          notes: string | null
          paid_amount: number
          patient_id: string
          status: string
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount?: number
          doctor_id?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          invoice_type?: string
          notes?: string | null
          paid_amount?: number
          patient_id: string
          status?: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount?: number
          doctor_id?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          invoice_type?: string
          notes?: string | null
          paid_amount?: number
          patient_id?: string
          status?: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          method: string
          notes: string | null
          paid_at: string
          patient_id: string
          receipt_no: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          method?: string
          notes?: string | null
          paid_at?: string
          patient_id: string
          receipt_no?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          patient_id?: string
          receipt_no?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_reports: {
        Row: {
          created_at: string
          file_url: string | null
          id: string
          notes: string | null
          ordered_date: string
          patient_id: string
          result_date: string | null
          results: string | null
          status: string
          test_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          id?: string
          notes?: string | null
          ordered_date?: string
          patient_id: string
          result_date?: string | null
          results?: string | null
          status?: string
          test_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_url?: string | null
          id?: string
          notes?: string | null
          ordered_date?: string
          patient_id?: string
          result_date?: string | null
          results?: string | null
          status?: string
          test_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_commission_rules: {
        Row: {
          active: boolean
          calc_type: string
          created_at: string
          doctor_id: string
          id: string
          invoice_type: string | null
          scope: string
          service_category: string | null
          service_match: string | null
          updated_at: string
          value: number
        }
        Insert: {
          active?: boolean
          calc_type?: string
          created_at?: string
          doctor_id: string
          id?: string
          invoice_type?: string | null
          scope?: string
          service_category?: string | null
          service_match?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          active?: boolean
          calc_type?: string
          created_at?: string
          doctor_id?: string
          id?: string
          invoice_type?: string | null
          scope?: string
          service_category?: string | null
          service_match?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "doctor_commission_rules_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string | null
          doctor_id: string | null
          id: string
          incurred_on: string
          notes: string | null
          payment_method: string
          recurring_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          id?: string
          incurred_on?: string
          notes?: string | null
          payment_method?: string
          recurring_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          id?: string
          incurred_on?: string
          notes?: string | null
          payment_method?: string
          recurring_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          day_of_month: number
          doctor_id: string | null
          id: string
          last_generated_month: string | null
          name: string
          notes: string | null
          payment_method: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number
          doctor_id?: string | null
          id?: string
          last_generated_month?: string | null
          name: string
          notes?: string | null
          payment_method?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number
          doctor_id?: string | null
          id?: string
          last_generated_month?: string | null
          name?: string
          notes?: string | null
          payment_method?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_sequences: {
        Row: {
          last_no: number
          updated_at: string
          year: number
        }
        Insert: {
          last_no?: number
          updated_at?: string
          year: number
        }
        Update: {
          last_no?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      medical_records: {
        Row: {
          chief_complaint: string | null
          created_at: string
          created_by: string | null
          diagnosis: string | null
          id: string
          notes: string | null
          patient_id: string
          prescriptions: string | null
          treatment: string | null
          visit_date: string
        }
        Insert: {
          chief_complaint?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          prescriptions?: string | null
          treatment?: string | null
          visit_date?: string
        }
        Update: {
          chief_complaint?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          prescriptions?: string | null
          treatment?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          allergies: string | null
          blood_type: string | null
          chronic_conditions: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          gender: string | null
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          allergies?: string | null
          blood_type?: string | null
          chronic_conditions?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          gender?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          allergies?: string | null
          blood_type?: string | null
          chronic_conditions?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          created_at: string
          doctor_id: string | null
          dosage: string | null
          duration: string | null
          frequency: string | null
          id: string
          instructions: string | null
          medication: string
          patient_id: string
          prescribed_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctor_id?: string | null
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medication: string
          patient_id: string
          prescribed_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctor_id?: string | null
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medication?: string
          patient_id?: string
          prescribed_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_recurring_expenses: {
        Args: {
          p_month?: string
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_receipt_no: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      recalc_invoice_payments: {
        Args: {
          p_invoice_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "doctor" | "staff" | "receptionist"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "doctor", "staff", "receptionist"],
    },
  },
} as const
