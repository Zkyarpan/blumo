"use server";

import { getProfile } from "@/features/auth/get-profile";
import { getUser } from "@/features/auth/get-user";
import {
  selectRepository,
  type SelectRepositoryResult,
} from "@/features/github/repository-selection.service";

export async function selectRepositoryAction(
  repositoryId: string
): Promise<SelectRepositoryResult> {
  const user = await getUser();

  if (!user) {
    return { ok: false, errorCode: "UNAUTHENTICATED" };
  }

  const profile = await getProfile();

  if (!profile?.onboarding_completed_at) {
    return { ok: false, errorCode: "NOT_ONBOARDED" };
  }

  return selectRepository(repositoryId, user.id);
}
