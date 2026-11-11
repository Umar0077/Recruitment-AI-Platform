import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-button ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-[#3B82F6] to-brand text-white shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_8px_24px_-10px_rgba(37,99,235,0.9)] hover:from-brand hover:to-brand-hover hover:shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_10px_30px_-8px_rgba(37,99,235,1)]",
        secondary: "border border-subtle bg-white text-fg shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:border-glow hover:bg-slate-50 dark:bg-overlay/[0.05] dark:shadow-none dark:hover:bg-overlay/[0.08]",
        ghost: "text-fg-secondary hover:bg-overlay/[0.06] hover:text-fg",
        outline: "border border-glow/60 bg-transparent text-fg hover:bg-brand/10",
        danger: "border border-danger/40 bg-danger/10 text-red-700 dark:text-red-200 hover:bg-danger/20",
        success: "border border-success/40 bg-success/10 text-emerald-700 dark:text-emerald-200 hover:bg-success/20",
        link: "h-auto p-0 text-brand-cyan underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 rounded-[10px] px-3 text-[13px]",
        md: "h-10 rounded-xl px-4 text-sm",
        lg: "h-12 rounded-xl px-6 text-[15px]",
        xl: "h-14 rounded-2xl px-7 text-base",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-8 rounded-[10px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
