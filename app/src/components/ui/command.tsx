import { Command as CommandPrimitive } from "cmdk";
import { cn } from "../../lib/utils";

export const Command = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) => (
  <CommandPrimitive
    className={cn("flex flex-col overflow-hidden rounded-md bg-white text-sm shadow", className)}
    {...props}
  />
);

export const CommandInput = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) => (
  <CommandPrimitive.Input
    className={cn("h-11 w-full border-b px-3 outline-none", className)}
    {...props}
  />
);

export const CommandList = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) => (
  <CommandPrimitive.List className={cn("max-h-72 overflow-y-auto", className)} {...props} />
);

export const CommandEmpty = CommandPrimitive.Empty;

export const CommandItem = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) => (
  <CommandPrimitive.Item
    className={cn("cursor-pointer px-3 py-2 aria-selected:bg-slate-100", className)}
    {...props}
  />
);
