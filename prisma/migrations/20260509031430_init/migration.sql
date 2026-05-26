-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('HARDWARE_STORE', 'PLUMBING_SUPPLY', 'ELECTRICAL_SUPPLY', 'PAINT_AND_FINISHES', 'TOOLS_AND_EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('ACTIVE', 'PENDING_REVIEW', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PartnerRole" AS ENUM ('OWNER', 'MANAGER', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('USD', 'LRD');

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessPhone" TEXT NOT NULL,
    "businessType" "BusinessType" NOT NULL DEFAULT 'HARDWARE_STORE',
    "email" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "role" "PartnerRole" NOT NULL DEFAULT 'OWNER',
    "status" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "shopEnabled" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT NOT NULL,
    "setupProgress" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingsGeneral" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Monrovia',
    "defaultCurrency" "CurrencyCode" NOT NULL DEFAULT 'USD',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettingsGeneral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Partner_email_key" ON "Partner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SettingsGeneral_partnerId_key" ON "SettingsGeneral"("partnerId");

-- AddForeignKey
ALTER TABLE "SettingsGeneral" ADD CONSTRAINT "SettingsGeneral_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
