"use client";
import Link from "next/link";
import { BookOpen, ClipboardCheck, Command, FlaskConical, KanbanSquare, LifeBuoy, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard, Kbd } from "@/components/ui/primitives";
import { Accordion, AccordionItem } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/states";
import { BRAND } from "@/lib/brand";

const GUIDES = [
  { icon: ClipboardCheck, title: "Review an interview", body: "Open Interviews → Review Required, watch the session, read the transcript, then shortlist or mark for follow-up.", href: "/admin/interviews?tab=review" },
  { icon: KanbanSquare, title: "Move candidates", body: "Drag cards in the Recruitment Pipeline, or use the card menu to move with the keyboard.", href: "/admin/pipeline" },
  { icon: FlaskConical, title: "Present the demo", body: "Settings → Demo Controls lets you reset data, simulate completions, and preview error states.", href: "/admin/settings#demo" },
];

export default function HelpPage() {
  return (
    <div>
      <PageHeader title="Help" description="Guides for the recruitment workspace and this interactive demo." actions={<Button variant="secondary" asChild><a href={`mailto:${BRAND.supportEmail}`}><Mail />Contact support</a></Button>} />
      <div className="grid gap-4 md:grid-cols-3">
        {GUIDES.map((g) => (
          <Link key={g.title} href={g.href} className="surface rounded-xl p-5 transition-colors hover:border-glow/50">
            <g.icon className="size-5 text-brand-cyan" aria-hidden />
            <h2 className="mt-4 text-base font-semibold">{g.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{g.body}</p>
          </Link>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <GlassCard className="px-6">
          <Accordion type="single" collapsible>
            <AccordionItem value="ai" question="Does the AI make hiring decisions?">No. AI assessments summarise job-related answer content as decision support. Every status change is made and recorded by a member of the HR team.</AccordionItem>
            <AccordionItem value="video" question="Is video analysed for emotions or expressions?">No. The platform does not infer emotion, personality, honesty, or confidence from video. Assessments refer only to interview answers.</AccordionItem>
            <AccordionItem value="data" question="Where is demo data stored?">In your browser&apos;s local storage, for this prototype only. Nothing is sent to a server. Use Settings → Demo Controls → Reset to restore the original data.</AccordionItem>
            <AccordionItem value="auth" question="Is the login secure?">The demo login accepts any non-empty credentials and stores no password. Production authentication and server-side authorisation will replace it.</AccordionItem>
          </Accordion>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="flex items-center gap-2 text-sm font-semibold"><Command className="size-4 text-brand-cyan" aria-hidden />Keyboard shortcuts</p>
          <ul className="mt-4 space-y-3 text-sm text-fg-secondary">
            <li className="flex items-center justify-between">Search workspace<span className="flex gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span></li>
            <li className="flex items-center justify-between">Close dialogs<Kbd>Esc</Kbd></li>
            <li className="flex items-center justify-between">Navigate results<span className="flex gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd></span></li>
          </ul>
          <div className="mt-6 flex items-center gap-2 text-xs text-fg-muted"><BookOpen className="size-3.5" aria-hidden />See README for the full demo walkthrough.</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-fg-muted"><LifeBuoy className="size-3.5" aria-hidden />{BRAND.supportEmail}</div>
        </GlassCard>
      </div>
    </div>
  );
}
