import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2, Plus, FileText, Calendar, Receipt, Pill, FlaskConical, BellRing, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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

  const { data: history } = useQuery({
    queryKey: ["patient-history", patientId],
    queryFn: async () => {
      const [appts, invs, rxs, labs, fups, inq] = await Promise.all([
        supabase.from("appointments").select("*, doctors(full_name)").eq("patient_id", patientId).order("scheduled_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }),
        supabase.from("prescriptions").select("*, doctors(full_name)").eq("patient_id", patientId).order("prescribed_date", { ascending: false }),
        supabase.from("lab_reports").select("*").eq("patient_id", patientId).order("ordered_date", { ascending: false }),
        supabase.from("follow_ups").select("*").eq("patient_id", patientId).order("due_date", { ascending: false }),
        supabase.from("inquiries").select("*").eq("converted_patient_id", patientId).maybeSingle(),
      ]);
      const billed = (invs.data ?? []).reduce((s: number, i: any) => s + Number(i.total ?? 0), 0);
      const paid = (invs.data ?? []).reduce((s: number, i: any) => s + Number(i.paid_amount ?? 0), 0);
      return {
        appts: appts.data ?? [], invs: invs.data ?? [], rxs: rxs.data ?? [],
        labs: labs.data ?? [], fups: fups.data ?? [], inq: inq.data ?? null,
        billed, paid, due: billed - paid,
      };
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
            {history && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="Billed" value={`Rs ${history.billed.toLocaleString("en-IN")}`} />
                <Stat label="Paid" value={`Rs ${history.paid.toLocaleString("en-IN")}`} />
                <Stat label="Due" value={`Rs ${history.due.toLocaleString("en-IN")}`} highlight={history.due > 0} />
              </div>
            )}
            {history?.inq && (
              <div className="mt-4 rounded-md border bg-muted/40 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-medium mb-1"><ClipboardList className="h-3.5 w-3.5" /> Originated from inquiry</div>
                <div className="text-muted-foreground">
                  {history.inq.source ? `${history.inq.source} · ` : ""}{history.inq.purpose ?? "—"}
                  {history.inq.created_at && ` · ${new Date(history.inq.created_at).toLocaleDateString()}`}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Patient history</CardTitle>
            <Button size="sm" onClick={() => setRecOpen(true)}>
              <Plus className="h-4 w-4" /> Add visit
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="visits" className="w-full">
              <TabsList className="mx-5 mt-1">
                <TabsTrigger value="visits"><FileText className="h-3.5 w-3.5 mr-1" />Visits</TabsTrigger>
                <TabsTrigger value="appts"><Calendar className="h-3.5 w-3.5 mr-1" />Appointments</TabsTrigger>
                <TabsTrigger value="invoices"><Receipt className="h-3.5 w-3.5 mr-1" />Invoices</TabsTrigger>
                <TabsTrigger value="rx"><Pill className="h-3.5 w-3.5 mr-1" />Rx</TabsTrigger>
                <TabsTrigger value="labs"><FlaskConical className="h-3.5 w-3.5 mr-1" />Labs</TabsTrigger>
                <TabsTrigger value="followups"><BellRing className="h-3.5 w-3.5 mr-1" />Follow-ups</TabsTrigger>
              </TabsList>

              <TabsContent value="visits" className="m-0">
                {!records || records.length === 0
                  ? <Empty icon={FileText} text="No visits recorded yet." />
                  : <ul className="divide-y">
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
                    </ul>}
              </TabsContent>

              <TabsContent value="appts" className="m-0">
                {!history?.appts.length ? <Empty icon={Calendar} text="No appointments." />
                  : <ul className="divide-y">{history.appts.map((a: any) => (
                      <li key={a.id} className="p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{a.reason || "Appointment"}{a.doctors?.full_name && <span className="text-muted-foreground font-normal"> · Dr. {a.doctors.full_name}</span>}</div>
                          <div className="text-xs text-muted-foreground">{new Date(a.scheduled_at).toLocaleString()} · {a.duration_minutes} min</div>
                        </div>
                        <Badge variant="secondary" className="capitalize">{a.status}</Badge>
                      </li>))}</ul>}
              </TabsContent>

              <TabsContent value="invoices" className="m-0">
                {!history?.invs.length ? <Empty icon={Receipt} text="No invoices." />
                  : <ul className="divide-y">{history.invs.map((i: any) => (
                      <li key={i.id} className="p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{i.invoice_number} <span className="text-[10px] uppercase text-primary">{i.invoice_type ?? "OPD"}</span></div>
                          <div className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}{i.due_date ? ` · due ${i.due_date}` : ""}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">Rs {Number(i.total).toLocaleString("en-IN")}</div>
                          <Badge variant="secondary" className="capitalize">{i.status}</Badge>
                        </div>
                      </li>))}</ul>}
              </TabsContent>

              <TabsContent value="rx" className="m-0">
                {!history?.rxs.length ? <Empty icon={Pill} text="No prescriptions." />
                  : <ul className="divide-y">{history.rxs.map((r: any) => (
                      <li key={r.id} className="p-4">
                        <div className="text-sm font-medium">{r.medication} <span className="text-xs text-muted-foreground">{r.dosage}</span></div>
                        <div className="text-xs text-muted-foreground">{[r.frequency, r.duration].filter(Boolean).join(" · ")} · {r.prescribed_date}{r.doctors?.full_name && ` · Dr. ${r.doctors.full_name}`}</div>
                      </li>))}</ul>}
              </TabsContent>

              <TabsContent value="labs" className="m-0">
                {!history?.labs.length ? <Empty icon={FlaskConical} text="No lab reports." />
                  : <ul className="divide-y">{history.labs.map((l: any) => (
                      <li key={l.id} className="p-4 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{l.test_name}</div>
                          <div className="text-xs text-muted-foreground">ordered {l.ordered_date}{l.result_date ? ` · result ${l.result_date}` : ""}</div>
                        </div>
                        <Badge variant="secondary" className="capitalize">{l.status}</Badge>
                      </li>))}</ul>}
              </TabsContent>

              <TabsContent value="followups" className="m-0">
                {!history?.fups.length ? <Empty icon={BellRing} text="No follow-ups." />
                  : <ul className="divide-y">{history.fups.map((f: any) => (
                      <li key={f.id} className="p-4 flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{f.title}</div>
                          <div className="text-xs text-muted-foreground">Due {f.due_date} · {f.channel}{f.priority && f.priority !== "normal" ? ` · ${f.priority}` : ""}</div>
                        </div>
                        <Badge variant="secondary" className="capitalize">{f.status}</Badge>
                      </li>))}</ul>}
              </TabsContent>
            </Tabs>
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

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="p-8 text-center">
      <Icon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"text-sm font-semibold " + (highlight ? "text-amber-600" : "")}>{value}</div>
    </div>
  );
}
