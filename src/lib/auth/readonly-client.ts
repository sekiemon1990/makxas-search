"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isReadonlyDemoEmail,
  READONLY_DEMO_MESSAGE,
} from "@/lib/auth/readonly";
import { toast } from "@/lib/toast";

let cachedReadonly: boolean | null = null;
let pendingReadonly: Promise<boolean> | null = null;

export async function isReadonlyClientUser(): Promise<boolean> {
  if (cachedReadonly !== null) return cachedReadonly;
  if (pendingReadonly) return pendingReadonly;

  pendingReadonly = (async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;
    if (isReadonlyDemoEmail(user.email)) return true;

    const { data, error } = await supabase
      .from("profiles")
      .select("is_readonly")
      .eq("id", user.id)
      .maybeSingle();

    if (error) return false;
    return (data as { is_readonly?: boolean } | null)?.is_readonly === true;
  })()
    .then((readonly) => {
      cachedReadonly = readonly;
      pendingReadonly = null;
      return readonly;
    })
    .catch(() => {
      cachedReadonly = false;
      pendingReadonly = null;
      return false;
    });

  return pendingReadonly;
}

export async function ensureWritableClient(): Promise<boolean> {
  if (!(await isReadonlyClientUser())) return true;
  toast({
    message: READONLY_DEMO_MESSAGE,
    variant: "info",
  });
  return false;
}

export function useReadonlyDemo(): boolean {
  const [readonly, setReadonly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isReadonlyClientUser().then((next) => {
      if (!cancelled) setReadonly(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return readonly;
}
