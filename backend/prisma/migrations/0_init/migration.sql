-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('GOOGLE_WORKSPACE', 'THIRD_PARTY', 'FINANCE');

-- CreateEnum
CREATE TYPE "HealthLabel" AS ENUM ('WEAK', 'MEDIUM', 'STRONG');

-- CreateEnum
CREATE TYPE "RefreshCycle" AS ENUM ('MONTHLY', 'FOUR_MONTHS', 'SIX_MONTHS', 'ANNUALLY', 'MANUAL');

-- CreateEnum
CREATE TYPE "QAStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('VIEW_90S', 'TEMP_24H', 'ONGOING');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "NotifType" AS ENUM ('ACCESS_REQUEST', 'ACCESS_APPROVED', 'ACCESS_DENIED', 'PASSWORD_WEAK', 'ROTATION_DUE', 'OFFBOARDING_ALERT', 'REGISTRATION_APPROVED', 'NEW_ENTRY_QA', 'WORKSPACE_SUSPICIOUS_LOGIN', 'WORKSPACE_NEW_OAUTH_APP', 'WORKSPACE_LOGIN_ALLOWLIST_VIOLATION', 'WORKSPACE_LOGIN_FAILURE', 'ACCESS_APPROVAL_EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "googleId" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "notificationsOn" BOOLEAN NOT NULL DEFAULT true,
    "department" TEXT,
    "clearanceLevel" TEXT,
    "internationalAccess" BOOLEAN NOT NULL DEFAULT false,
    "devices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avatarUrl" TEXT,
    "favorites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "discordUserId" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "platformType" "PlatformType" NOT NULL,
    "secretRef" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "healthLabel" "HealthLabel" NOT NULL DEFAULT 'WEAK',
    "refreshCycle" "RefreshCycle" NOT NULL DEFAULT 'FOUR_MONTHS',
    "nextRotationDue" TIMESTAMP(3),
    "lastUpdatedBy" TEXT,
    "lastUpdatedAt" TIMESTAMP(3),
    "qaStatus" "QAStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "passwordHash" TEXT,
    "totpQrBase64" TEXT,
    "isGoogleSSO" BOOLEAN NOT NULL DEFAULT false,
    "requiredClearance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "collectionId" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "accessType" TEXT NOT NULL DEFAULT 'ONGOING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstRevealedAt" TIMESTAMP(3),

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requestType" "RequestType" NOT NULL,
    "reason" TEXT NOT NULL,
    "deviceName" TEXT,
    "location" TEXT,
    "internationalAccessRequested" BOOLEAN NOT NULL DEFAULT false,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "actionedBy" TEXT,
    "actionedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RotationSchedule" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "cycle" "RefreshCycle" NOT NULL,
    "lastRotated" TIMESTAMP(3),
    "nextDue" TIMESTAMP(3) NOT NULL,
    "alertDaysBefore" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "RotationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "NotifType" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceActivityEvent" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "appName" TEXT,
    "ipAddress" TEXT,
    "regionCode" TEXT,
    "subdivisionCode" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "uniqueQualifier" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedApp" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appName" TEXT,
    "scopes" TEXT[],
    "nativeApp" BOOLEAN NOT NULL DEFAULT false,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectedApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceDevice" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceType" TEXT,
    "model" TEXT,
    "osVersion" TEXT,
    "managementState" TEXT,
    "lastSyncTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "value" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ManagedCollections" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ManagedCollections_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordUserId_key" ON "User"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RotationSchedule_accountId_key" ON "RotationSchedule"("accountId");

-- CreateIndex
CREATE INDEX "WorkspaceActivityEvent_occurredAt_idx" ON "WorkspaceActivityEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "WorkspaceActivityEvent_userEmail_idx" ON "WorkspaceActivityEvent"("userEmail");

-- CreateIndex
CREATE INDEX "ConnectedApp_userEmail_idx" ON "ConnectedApp"("userEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedApp_userEmail_clientId_key" ON "ConnectedApp"("userEmail", "clientId");

-- CreateIndex
CREATE INDEX "WorkspaceDevice_userEmail_idx" ON "WorkspaceDevice"("userEmail");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceDevice_userEmail_deviceId_key" ON "WorkspaceDevice"("userEmail", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_name_key" ON "Collection"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE INDEX "_ManagedCollections_B_index" ON "_ManagedCollections"("B");

-- AddForeignKey
ALTER TABLE "MfaDevice" ADD CONSTRAINT "MfaDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RotationSchedule" ADD CONSTRAINT "RotationSchedule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ManagedCollections" ADD CONSTRAINT "_ManagedCollections_A_fkey" FOREIGN KEY ("A") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ManagedCollections" ADD CONSTRAINT "_ManagedCollections_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

