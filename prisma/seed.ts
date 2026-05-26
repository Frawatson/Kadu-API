/**
 * Seed the canonical mock partner so the smoke-test backend mirrors
 * the frontend's MSW fixture. Use these credentials at /login:
 *
 *   email:    info@monroviahardware.lr
 *   password: Password!23
 *
 * The password clears the frontend's MIN_PASSWORD_LENGTH (8) and the
 * settings-page strength meter (12 chars + complexity).
 */

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_EMAIL = "info@monroviahardware.lr";
const SEED_PASSWORD = "Password!23";

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const partner = await prisma.partner.upsert({
    where: { email: SEED_EMAIL },
    update: {},
    create: {
      businessName: "Monrovia Hardware & Supply",
      businessPhone: "+231770001234",
      businessType: "HARDWARE_STORE",
      email: SEED_EMAIL,
      ownerName: "Emmanuel Kollie",
      role: "OWNER",
      status: "ACTIVE",
      shopEnabled: true,
      passwordHash,
      setupProgress: {
        profileComplete: true,
        photosUploaded: true,
        catalogHasItems: true,
        payoutMethodSet: true,
        percentComplete: 100,
      },
    },
  });

  await prisma.settingsGeneral.upsert({
    where: { partnerId: partner.id },
    update: {},
    create: {
      partnerId: partner.id,
      displayName: "Monrovia Hardware & Supply",
      language: "en",
      timezone: "Africa/Monrovia",
      defaultCurrency: "USD",
    },
  });

  console.log(`✅ Seeded partner ${partner.email} (${partner.id})`);
  console.log(`   Login with: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
