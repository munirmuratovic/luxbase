import { Tabs as BaseTabs } from "@base-ui-components/react/tabs";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Tabs = BaseTabs.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof BaseTabs.List>,
  React.ComponentPropsWithoutRef<typeof BaseTabs.List>
>(({ className, ...props }, ref) => (
  <BaseTabs.List
    ref={ref}
    className={cn("flex items-center gap-1.5", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTab = React.forwardRef<
  React.ComponentRef<typeof BaseTabs.Tab>,
  React.ComponentPropsWithoutRef<typeof BaseTabs.Tab>
>(({ className, ...props }, ref) => (
  <BaseTabs.Tab
    ref={ref}
    className={cn(
      "rounded-full px-3 py-1 text-xs font-semibold capitalize transition-all",
      "text-muted hover:bg-surface-sunken hover:text-foreground",
      "data-[selected]:bg-accent data-[selected]:text-on-accent data-[selected]:hover:bg-accent",
      className,
    )}
    {...props}
  />
));
TabsTab.displayName = "TabsTab";

export const TabsPanel = React.forwardRef<
  React.ComponentRef<typeof BaseTabs.Panel>,
  React.ComponentPropsWithoutRef<typeof BaseTabs.Panel>
>(({ className, ...props }, ref) => (
  <BaseTabs.Panel
    ref={ref}
    className={cn("min-h-0 flex-1 outline-none", className)}
    {...props}
  />
));
TabsPanel.displayName = "TabsPanel";
