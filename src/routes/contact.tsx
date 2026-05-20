import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Send, Mail, Phone, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import logoUrl from "@/assets/kpc-logo.svg";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact KPC — Get in touch" },
      { name: "description", content: "Contact KPC for appointments, inquiries, and patient support." },
    ],
  }),
  component: ContactPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Valid email required").max(255),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  subject: z.string().trim().max(150).optional().or(z.literal("")),
  message: z.string().trim().min(5, "Message too short").max(2000),
});

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.from("contact_messages").insert({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      subject: parsed.data.subject || null,
      message: parsed.data.message,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Message sent. We'll get back to you soon.");
    setForm({ name: "", email: "", phone: "", subject: "", message: "" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="KPC" className="h-9 w-9" />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold">KPC</span>
              <span className="text-xs text-muted-foreground">Powered by IT Relevant</span>
            </div>
          </Link>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Staff sign in</Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-12 grid gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <h1 className="text-4xl font-semibold tracking-tight">Get in touch</h1>
          <p className="text-muted-foreground">
            Have a question, want to book an appointment, or need patient support? Send us a message and our team will respond within one business day.
          </p>
          <div className="space-y-4 pt-4">
            <div className="flex items-start gap-3"><Mail className="h-5 w-5 text-primary mt-0.5" /><div><div className="font-medium">Email</div><div className="text-sm text-muted-foreground">care@mediclinic.com</div></div></div>
            <div className="flex items-start gap-3"><Phone className="h-5 w-5 text-primary mt-0.5" /><div><div className="font-medium">Phone</div><div className="text-sm text-muted-foreground">+1 (555) 010-2030</div></div></div>
            <div className="flex items-start gap-3"><MapPin className="h-5 w-5 text-primary mt-0.5" /><div><div className="font-medium">Address</div><div className="text-sm text-muted-foreground">200 Wellness Ave, Suite 100</div></div></div>
          </div>
        </div>

        <Card className="border-border/60 shadow-lg">
          <CardHeader>
            <CardTitle>Send a message</CardTitle>
            <CardDescription>We'll never share your details.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="c-name">Name</Label><Input id="c-name" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="c-email">Email</Label><Input id="c-email" type="email" required maxLength={255} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="c-phone">Phone (optional)</Label><Input id="c-phone" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="c-subject">Subject</Label><Input id="c-subject" maxLength={150} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="c-msg">Message</Label><Textarea id="c-msg" rows={5} required maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={busy}>
                <Send className="h-4 w-4" /> {busy ? "Sending…" : "Send message"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
