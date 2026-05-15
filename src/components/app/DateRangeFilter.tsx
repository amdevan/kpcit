import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DateRange = "all" | "today" | "week" | "15days" | "month";

const LABELS: Record<DateRange, string> = {
  all: "All time",
  today: "Today",
  week: "Last 7 days",
  "15days": "Last 15 days",
  month: "Last 30 days",
};

export function rangeStart(range: DateRange): Date | null {
  if (range === "all") return null;
  const d = new Date();
  if (range === "today") { d.setHours(0, 0, 0, 0); return d; }
  const days = range === "week" ? 7 : range === "15days" ? 15 : 30;
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function DateRangeFilter({ value, onChange, className }: {
  value: DateRange;
  onChange: (v: DateRange) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DateRange)}>
      <SelectTrigger className={"w-40 " + (className ?? "")}><SelectValue /></SelectTrigger>
      <SelectContent>
        {(Object.keys(LABELS) as DateRange[]).map((k) => (
          <SelectItem key={k} value={k}>{LABELS[k]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}