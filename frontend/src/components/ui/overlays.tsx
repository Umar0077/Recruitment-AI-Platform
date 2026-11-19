"use client";
/** Radix-based overlays styled for InterviewOS: dialog, confirmation, drawer, dropdown, tooltip, popover, tabs, select, accordion. */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Check, ChevronDown, X, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/* ---------------- Dialog ---------------- */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlayCls = "fixed inset-0 z-50 bg-scrim/40 dark:bg-scrim/70 backdrop-blur-sm data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out";

export function DialogContent({
  className,
  children,
  title,
  description,
  size = "md",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: React.ReactNode; description?: React.ReactNode; size?: "sm" | "md" | "lg" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayCls} />
      <DialogPrimitive.Content
        className={cn(
          "surface-solid edge-light fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6 shadow-float focus:outline-none data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
          { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" }[size],
          className,
        )}
        {...props}
      >
        <div className="mb-5 pr-8">
          <DialogPrimitive.Title className="font-display text-lg font-semibold text-fg">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-fg-muted">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</DialogPrimitive.Description>
          )}
        </div>
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-overlay/5 hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
);

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} size="sm">
        {tone === "danger" && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/[0.07] p-3 text-[13px] text-red-700 dark:text-red-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            This changes the candidate&apos;s recruitment record. The decision is recorded against your name.
          </div>
        )}
        {children}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Drawer ---------------- */
export function Drawer({
  open,
  onOpenChange,
  side = "right",
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  side?: "left" | "right";
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayCls} />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 z-50 flex w-[min(420px,calc(100vw-2.5rem))] flex-col border-subtle bg-ink-900 shadow-float focus:outline-none",
            side === "right"
              ? "right-0 border-l data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out"
              : "left-0 border-r data-[state=open]:animate-drawer-left-in data-[state=closed]:animate-drawer-left-out",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-subtle px-5 py-4">
            <div>
              <DialogPrimitive.Title className="font-display text-base font-semibold">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className={description ? "mt-0.5 text-[13px] text-fg-muted" : "sr-only"}>{description ?? title}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-overlay/5 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------------- Dropdown ---------------- */
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuLabel = ({ className, ...p }: React.ComponentProps<typeof DropdownPrimitive.Label>) => (
  <DropdownPrimitive.Label className={cn("px-2.5 py-1.5 text-xs font-medium text-fg-muted", className)} {...p} />
);
export const DropdownMenuSeparator = () => <DropdownPrimitive.Separator className="my-1 h-px bg-overlay/[0.07]" />;

export function DropdownMenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn("surface-solid z-50 min-w-[200px] rounded-xl p-1.5 shadow-float data-[state=open]:animate-pop-in", className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof DropdownPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-secondary outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-overlay/[0.06] data-[highlighted]:text-fg data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-fg-muted",
        destructive && "text-red-700 dark:text-red-300 data-[highlighted]:text-red-700 dark:data-[highlighted]:text-red-200 [&_svg]:text-red-700 dark:[&_svg]:text-red-300",
        className,
      )}
      {...props}
    />
  );
}

export const DropdownMenuSub = DropdownPrimitive.Sub;
export function DropdownMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof DropdownPrimitive.SubTrigger>) {
  return (
    <DropdownPrimitive.SubTrigger
      className={cn("flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-secondary outline-none data-[highlighted]:bg-overlay/[0.06] data-[state=open]:bg-overlay/[0.06] [&_svg]:size-4 [&_svg]:text-fg-muted", className)}
      {...props}
    >
      {children}
      <ChevronDown className="ml-auto -rotate-90" />
    </DropdownPrimitive.SubTrigger>
  );
}
export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.SubContent>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.SubContent sideOffset={6} className={cn("surface-solid z-50 max-h-[60vh] min-w-[220px] overflow-y-auto rounded-xl p-1.5 shadow-float data-[state=open]:animate-pop-in", className)} {...props} />
    </DropdownPrimitive.Portal>
  );
}

/* ---------------- Tooltip ---------------- */
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={8} className="z-[60] max-w-xs rounded-lg border border-subtle bg-ink-800 px-2.5 py-1.5 text-xs text-fg shadow-float data-[state=delayed-open]:animate-pop-in">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ---------------- Popover ---------------- */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className, align = "end", ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={8} collisionPadding={12} className={cn("surface-solid z-50 rounded-xl shadow-float focus:outline-none data-[state=open]:animate-pop-in", className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}

/* ---------------- Tabs ---------------- */
export const Tabs = TabsPrimitive.Root;
export const TabsContent = ({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn("focus-visible:outline-none data-[state=active]:animate-fade-in", className)} {...p} />
);
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("relative flex max-w-full items-center gap-1 overflow-x-auto border-b border-subtle", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative -mb-px inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-fg-muted transition-colors duration-micro hover:text-fg data-[state=active]:border-brand-electric data-[state=active]:text-fg [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------- Select ---------------- */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  label,
  size = "md",
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-xl border border-subtle bg-white px-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-overlay/[0.035] dark:shadow-none text-sm text-fg-secondary transition-colors hover:border-slate-400/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/60 data-[placeholder]:text-fg-muted",
          size === "sm" ? "h-9" : "h-10",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-fg-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className="surface-solid z-[60] max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl p-1.5 shadow-float data-[state=open]:animate-pop-in">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm text-fg-secondary outline-none data-[highlighted]:bg-overlay/[0.06] data-[highlighted]:text-fg"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2.5">
                  <Check className="size-4 text-brand-cyan" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ---------------- Accordion ---------------- */
export const Accordion = AccordionPrimitive.Root;
export function AccordionItem({ value, question, children }: { value: string; question: string; children: React.ReactNode }) {
  return (
    <AccordionPrimitive.Item value={value} className="group border-b border-subtle last:border-b-0">
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger className="flex w-full items-center justify-between gap-6 py-5 text-left text-[15px] font-medium text-fg transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/60 sm:text-base">
          {question}
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-subtle text-fg-muted transition-[transform,border-color,color] duration-300 ease-premium group-data-[state=open]:rotate-180 group-data-[state=open]:border-glow group-data-[state=open]:text-brand-cyan">
            <ChevronDown className="size-4" />
          </span>
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="pb-5 pr-12 text-[15px] leading-relaxed text-fg-muted">{children}</div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}

/* ---------------- Inline notice ---------------- */
export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "demo"; title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 text-[13px] leading-relaxed",
        tone === "warning" ? "border-amber-400/25 bg-amber-400/[0.06] text-amber-700 dark:text-amber-100" : tone === "demo" ? "border-indigo-400/25 bg-indigo-400/[0.06] text-indigo-700 dark:text-indigo-100" : "border-sky-400/20 bg-sky-400/[0.05] text-sky-700 dark:text-sky-100",
        className,
      )}
      role="note"
    >
      {tone === "warning" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div>
        {title && <p className="font-medium text-fg">{title}</p>}
        <div className={cn(title && "mt-0.5", "text-fg-secondary")}>{children}</div>
      </div>
    </div>
  );
}
