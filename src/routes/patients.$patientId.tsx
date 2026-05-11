import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2, Plus, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PatientFormDialog } from "@/components/app/PatientFormDialog";
import { RecordFormDialog } from "@/components/app/RecordFormDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/patients/$patientId")({
  head: () => ({ meta: [{ title: "Patient — MediClinic" }] }),
  component: PatientDetail,
});

function PatientDetail() {
  const { patientId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [recOpen, setRecOpen] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients").select("*").eq("id", patientId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: records } = useQuery({
    queryKey: ["records", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medical_records")
        .select("*")
        .eq("patient_id", patientId)
        .order("visit_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const remove = async () => {
    const { error } = await supabase.from("patients").delete().eq("id", patientId);
    if (error) return toast.error(error.message);
    toast.success("Patient deleted");
    qc.invalidateQueries({ queryKey: ["patients"] });
    navigate({ to: "/patients" });
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!patient) return <div className="text-sm text-muted-foreground">Patient not found.</div>;

  const fields: Array<[string, string | null | undefined]> = [
    ["Date of birth", patient.date_of_birth],
    ["Gender", patient.gender],
    ["Phone", patient.phone],
    ["Email", patient.email],
    ["Address", patient.address],
    ["Blood type", patient.blood_type],
    ["Allergies", patient.allergies],
    ["Chronic conditions", patient.chronic_conditions],
    ["Emergency contact", [patient.emergency_contact_name, patient.emergency_contact_phone].filter(Boolean).join(" · ") || null],
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/patients"><ArrowLeft className="h-4 w-4" /> Back to patients</Link>
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-lg font-semibold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            {patient.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{patient.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              Patient since {new Date(patient.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this patient?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the patient and all their medical records.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y">
              {fields.map(([k, v]) => (
                <div key={k} className="grid grid-cols-3 gap-2 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="col-span-2">{v || <span className="text-muted-foreground/60">—</span>}</dd>
                </div>
              ))}
              {patient.notes && (
                <div className="py-2.5 text-sm">
                  <div className="text-muted-foreground mb-1">Notes</div>
                  <div className="whitespace-pre-wrap">{patient.notes}</div>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Medical records</CardTitle>
            <Button size="sm" onClick={() => setRecOpen(true)}>
              <Plus className="h-4 w-4" /> Add visit
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {!records || records.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {records.map((r) => (
                  <li key={r.id} className="p-5 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">{new Date(r.visit_date).toLocaleDateString()}</span>
                      {r.diagnosis && <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">{r.diagnosis}</span>}
                    </div>
                    {r.chief_complaint && <Detail label="Complaint" v={r.chief_complaint} />}
                    {r.treatment && <Detail label="Treatment" v={r.treatment} />}
                    {r.prescriptions && <Detail label="Prescriptions" v={r.prescriptions} />}
                    {r.notes && <Detail label="Notes" v={r.notes} />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <PatientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={patient}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["patient", patientId] });
          qc.invalidateQueries({ queryKey: ["patients"] });
        }}
      />
      <RecordFormDialog
        open={recOpen}
        onOpenChange={setRecOpen}
        patientId={patientId}
        onSaved={() => qc.invalidateQueries({ queryKey: ["records", patientId] })}
      />
    </div>
  );
}

function Detail({ label, v }: { label: string; v: string }) {
  return (
    <div className="text-sm">
      <span className="text-xs text-muted-foreground">{label}: </span>
      <span className="whitespace-pre-wrap">{v}</span>
    </div>
  );
}
