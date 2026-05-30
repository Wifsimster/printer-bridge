import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { alertVariants } from "./alert-variants";
import { AlertTitle } from "./alert-title";
import { AlertDescription } from "./alert-description";

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

export { Alert, AlertTitle, AlertDescription };
