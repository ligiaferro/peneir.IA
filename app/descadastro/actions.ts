"use server";

import { unsubscribeWithToken } from "@/lib/unsubscribe-user";

export type UnsubscribeState = { status?: "done" | "invalid" | "error" };

export async function unsubscribeAction(
  _previousState: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  const status = await unsubscribeWithToken(
    String(formData.get("u") ?? ""),
    String(formData.get("t") ?? ""),
  );
  return { status };
}
