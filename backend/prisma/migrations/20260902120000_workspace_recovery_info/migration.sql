-- CreateTable
CREATE TABLE "WorkspaceRecoveryInfo" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "recoveryEmail" TEXT,
    "recoveryPhone" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceRecoveryInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRecoveryInfo_userEmail_key" ON "WorkspaceRecoveryInfo"("userEmail");

-- CreateIndex
CREATE INDEX "WorkspaceRecoveryInfo_userEmail_idx" ON "WorkspaceRecoveryInfo"("userEmail");
