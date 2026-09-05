import { Button as BaseButton } from "@base-ui-components/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

type BaseButtonProps = React.ComponentPropsWithRef<typeof BaseButton>;

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-on-accent shadow-[0_8px_20px_-8px_var(--ring)] hover:shadow-[0_10px_24px_-6px_var(--ring)] hover:brightness-110 active:scale-95",
        ghost: "text-muted hover:bg-surface-sunken hover:text-foreground active:scale-95",
        outline:
          "border border-border bg-transparent hover:bg-surface-sunken hover:border-accent/40 active:scale-95",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-8 px-3 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = Omit<BaseButtonProps, "className"> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    children?: React.ReactNode;
  };

export const Button = React.forwardRef<HTMLElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <BaseButton
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...(props as BaseButtonProps)}
    />
  ),
);
Button.displayName = "Button";
