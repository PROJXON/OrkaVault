/**
 * Terms acceptance + System Use Notice acknowledgment (NEW-FEAT §3, §4).
 *
 * A user "needs" a document when the version they last accepted differs
 * from the required one in config/legalVersions.ts, so bumping
 * LEGAL_TERMS_VERSION / LEGAL_NOTICE_VERSION re-prompts everyone on their
 * next page load. Each acceptance writes an AuditLog row.
 */
import { prisma } from "../lib/prismaClient";
import { REQUIRED_TERMS_VERSION, REQUIRED_NOTICE_VERSION } from "../config/legalVersions";

export type AcceptanceType = "terms" | "notice";

export interface AcceptanceFields {
  termsVersionAccepted: string | null;
  noticeVersionAcknowledged: string | null;
}

export interface AcceptanceFlags {
  needsTermsAcceptance: boolean;
  needsNoticeAcknowledgment: boolean;
}

export function acceptanceFlags(user: AcceptanceFields): AcceptanceFlags {
  return {
    needsTermsAcceptance: user.termsVersionAccepted !== REQUIRED_TERMS_VERSION,
    needsNoticeAcknowledgment: user.noticeVersionAcknowledged !== REQUIRED_NOTICE_VERSION,
  };
}

export function requiredVersion(type: AcceptanceType): string {
  return type === "terms" ? REQUIRED_TERMS_VERSION : REQUIRED_NOTICE_VERSION;
}

export async function recordAcceptance(
  userId: string,
  type: AcceptanceType,
  version: string,
  ip: string | null,
): Promise<void> {
  const now = new Date();
  const data =
    type === "terms"
      ? { termsVersionAccepted: version, termsAcceptedAt: now }
      : { noticeVersionAcknowledged: version, noticeAcknowledgedAt: now };

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data }),
    prisma.auditLog.create({
      data: {
        userId,
        accountId: null,
        action: type === "terms" ? "TERMS_ACCEPTED" : "NOTICE_ACKNOWLEDGED",
        metadata: { version },
        ipAddress: ip,
      },
    }),
  ]);
}
