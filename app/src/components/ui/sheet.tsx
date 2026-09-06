import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";

// Right-side panel on Radix Dialog: no drag (unlike the Vaul Drawer), no overlay.
export const Sheet = DialogPrimitive.Root;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;

export const SheetContent = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Content
      data-slot="sheet-content"
      className={cn(
        "fixed inset-y-0 right-0 z-40 w-96 max-w-[85vw] overflow-y-auto border-l bg-white shadow-lg",
        // Slide from the right edge; keyframes in index.css.
        "data-[state=open]:animate-[sheet-in_300ms_ease-out]",
        "data-[state=closed]:animate-[sheet-out_250ms_ease-in]",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
);
