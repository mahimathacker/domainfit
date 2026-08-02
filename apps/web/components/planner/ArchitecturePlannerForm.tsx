"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { createMockResult } from "@/lib/domainfit/mock-result";
import { defaultPlannerInput, plannerSchema, type PlannerInput } from "@/lib/domainfit/schemas";

const DRAFT_KEY = "domainfit:planner-draft";
const steps = ["Use case", "Runtime needs", "Risk & evidence", "Operations"];

export function ArchitecturePlannerForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isSubmitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const form = useForm<PlannerInput>({ resolver: zodResolver(plannerSchema), defaultValues: defaultPlannerInput, mode: "onBlur" });

  useEffect(() => {
    const saved = window.localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try { form.reset(plannerSchema.partial().parse(JSON.parse(saved)) as PlannerInput); } catch { window.localStorage.removeItem(DRAFT_KEY); }
    }
    const subscription = form.watch(value => window.localStorage.setItem(DRAFT_KEY, JSON.stringify(value)));
    return () => subscription.unsubscribe();
  }, [form]);

  async function next() {
    const fields: (keyof PlannerInput)[][] = [
      ["use_case", "users", "domain", "stable_behaviour"],
      ["changing_facts", "citations_required", "live_private_data", "external_actions"],
      ["mistake_impact", "human_approval", "available_documents", "document_change_frequency"],
      ["latency_requirements", "usage_requirements"],
    ];
    if (await form.trigger(fields[step])) setStep(value => Math.min(value + 1, steps.length - 1));
  }

  async function submit(input: PlannerInput) {
    setSubmitting(true);
    setSubmitError("");
    try {
      const id = crypto.randomUUID();
      const result = createMockResult(input);
      window.localStorage.setItem(`domainfit:result:${id}`, JSON.stringify({ input, result, mode: "mock", createdAt: new Date().toISOString() }));
      window.localStorage.removeItem(DRAFT_KEY);
      router.push(`/results/${id}`);
    } catch {
      setSubmitError("We could not create the plan. Your draft is saved; please try again.");
      setSubmitting(false);
    }
  }

  return <form onSubmit={form.handleSubmit(submit)} className="card mt-10 overflow-hidden" noValidate>
    <div className="border-b border-line px-6 py-5 sm:px-8"><div className="flex items-center justify-between text-sm"><span className="font-semibold">Step {step + 1} of {steps.length}</span><span className="text-ink/50">{steps[step]}</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-moss transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div></div>
    <div className="min-h-[31rem] p-6 sm:p-8">
      {step === 0 && <fieldset className="space-y-6"><legend className="text-2xl font-semibold">Start with the job to be done</legend><TextArea label="What are you building?" hint="Example: An assistant that triages developer support tickets." error={form.formState.errors.use_case?.message} {...form.register("use_case")} /><TextInput label="Who will use it?" hint="Example: Support engineers and API customers" error={form.formState.errors.users?.message} {...form.register("users")} /><TextInput label="What domain does it operate in?" hint="Example: Developer infrastructure" error={form.formState.errors.domain?.message} {...form.register("domain")} /><TextArea label="What behaviour should remain consistent?" hint="Include tone, formats, decision patterns, and escalation rules." {...form.register("stable_behaviour")} /></fieldset>}
      {step === 1 && <fieldset className="space-y-6"><legend className="text-2xl font-semibold">What must happen at runtime?</legend><TextArea label="Which facts change frequently?" hint="Prices, policies, documentation, inventory, account state…" {...form.register("changing_facts")} /><Toggle label="Answers must cite approved sources" {...form.register("citations_required")} /><Toggle label="The system needs live or private data" {...form.register("live_private_data")} /><Toggle label="The system performs external actions" {...form.register("external_actions")} /></fieldset>}
      {step === 2 && <fieldset className="space-y-6"><legend className="text-2xl font-semibold">Risk and evidence</legend><label className="label">What happens if it makes a mistake?<select className="field" {...form.register("mistake_impact")}><option value="low">Low impact</option><option value="medium">Medium impact</option><option value="high">High impact</option><option value="critical">Critical impact</option></select></label><Toggle label="Human approval is required" {...form.register("human_approval")} /><TextArea label="What documents or examples are available?" hint="List policies, examples, manuals, taxonomies, or reviewed conversations." {...form.register("available_documents")} /><label className="label">How often do those documents change?<select className="field" {...form.register("document_change_frequency")}><option value="rarely">Rarely</option><option value="quarterly">Quarterly</option><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="daily">Daily</option></select></label></fieldset>}
      {step === 3 && <fieldset className="space-y-6"><legend className="text-2xl font-semibold">Operating requirements</legend><TextArea label="Expected latency" hint="Example: Interactive, under five seconds at p95." {...form.register("latency_requirements")} /><TextArea label="Expected usage" hint="Example: 5,000 requests per day with weekday peaks." {...form.register("usage_requirements")} /><div className="rounded-xl border border-moss/20 bg-moss/5 p-5"><p className="font-semibold">Ready to create your plan</p><p className="mt-2 text-sm leading-6 text-ink/60">Mock mode produces a realistic, schema-valid result without consuming Nugen credits.</p></div></fieldset>}
      {submitError && <div role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{submitError}</div>}
    </div>
    <div className="flex items-center justify-between border-t border-line px-6 py-5 sm:px-8"><button type="button" className="button-secondary" onClick={() => setStep(value => Math.max(0, value - 1))} disabled={step === 0}><ArrowLeft size={16} /> Back</button>{step < steps.length - 1 ? <button type="button" className="button-primary" onClick={next}>Continue <ArrowRight size={16} /></button> : <button type="submit" className="button-primary" disabled={isSubmitting}>{isSubmitting ? <><LoaderCircle className="animate-spin" size={16} /> Building plan</> : <>Build my plan <ArrowRight size={16} /></>}</button>}</div>
  </form>;
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string };
function TextInput({ label, hint, error, ...props }: FieldProps) { const id = props.name; return <label className="label" htmlFor={id}>{label}<input id={id} className="field" placeholder={hint} {...props} />{error && <span className="mt-2 block text-sm text-red-700">{error}</span>}</label>; }
type AreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string };
function TextArea({ label, hint, error, ...props }: AreaProps) { const id = props.name; return <label className="label" htmlFor={id}>{label}<textarea id={id} className="field min-h-28 resize-y" placeholder={hint} {...props} />{error && <span className="mt-2 block text-sm text-red-700">{error}</span>}</label>; }
function Toggle({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="flex cursor-pointer items-center justify-between gap-6 rounded-xl border border-line bg-white p-4 font-medium"><span>{label}</span><input type="checkbox" className="size-5 accent-moss" {...props} /></label>; }
