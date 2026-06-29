"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Submit button that disables itself and shows a spinner while its parent
 * `<form>` action is pending. Drop it inside any form in place of a plain
 * `<Button type="submit">` to prevent double-submits (e.g. "Tambah" creating
 * duplicate rows) when the server action is slow.
 *
 * `useFormStatus` reads the nearest `<form>` boundary, so this MUST be a child
 * (descendant) of the form element.
 */
export function SubmitButton({
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && <Loader2Icon className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
