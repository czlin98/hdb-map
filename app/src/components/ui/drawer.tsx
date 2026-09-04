import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "../../lib/utils";

export const Drawer = DrawerPrimitive.Root;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerTitle = DrawerPrimitive.Title;

export const DrawerContent = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) => (
  <DrawerPrimitive.Portal>
    <DrawerPrimitive.Content
      className={cn("fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-xl bg-white", className)}
      {...props}
    >
      <div className="mx-auto my-2 h-1.5 w-10 rounded-full bg-slate-300" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPrimitive.Portal>
);
