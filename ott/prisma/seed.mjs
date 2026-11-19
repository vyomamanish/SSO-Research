// Puts OTT's database into its "before SSO" state. Safe to re-run: it wipes
// users and recreates them, so every demo starts the same way.
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
// The legacy scheme from src/lib/hash.ts: unsalted SHA-256 (ott-sso.md 2.5).
const legacyHash = (password) => createHash("sha256").update(password).digest("hex");
const daysFromNow = (days) => new Date(Date.now() + days * 86_400_000);

const courses = [
  { id: "intro-sanskrit", title: "Introduction to Sanskrit", description: "Script, sounds and your first sentences.", accessLevel: "FREE", durationMin: 45 },
  { id: "bhagavad-gita", title: "Bhagavad Gita Intensive", description: "Chapter-by-chapter reading with commentary.", accessLevel: "GOLD", durationMin: 180 },
  { id: "vedic-chanting", title: "Advanced Vedic Chanting", description: "Svara, metre and recitation practice.", accessLevel: "PLATINUM", durationMin: 150 },
  { id: "panini-grammar", title: "Panini's Grammar Masterclass", description: "The Ashtadhyayi, sutra by sutra.", accessLevel: "PAID", price: 2999, durationMin: 240 },
];

await prisma.sessionRevocation.deleteMany();
await prisma.user.deleteMany(); // cascades to purchases and progress
for (const course of courses) {
  await prisma.course.upsert({ where: { id: course.id }, create: course, update: course });
}

// Existing subscriber: a GOLD plan, one paid course and watch progress. Her
// first SSO login must keep all of it.
await prisma.user.create({
  data: {
    email: "meera@vyoma.demo",
    name: "Meera Iyer",
    password: legacyHash("old-wordpress-password"),
    plan: "GOLD",
    planInterval: "YEARLY",
    planStartedAt: daysFromNow(-60),
    planExpiresAt: daysFromNow(305),
    coins: 120,
    purchases: { create: { courseId: "panini-grammar", amount: 2999 } },
    progress: { create: { courseId: "bhagavad-gita", seconds: 2 * 3600 + 14 * 60 } },
  },
});

// Existing staff. Their roles will be replaced by what Authentik says.
await prisma.user.create({
  data: { email: "asha@vyoma.demo", name: "Asha Rao", role: "SUPER_ADMIN", password: legacyHash("vyoma-secure-123") },
});
// Deliberately over-privileged: the legacy DB says ADMIN, Authentik says
// MANAGER. After SSO, Authentik wins.
await prisma.user.create({
  data: { email: "ravi@vyoma.demo", name: "Ravi Kumar", role: "ADMIN", password: legacyHash("ravi-legacy") },
});

const count = await prisma.user.count();
console.log(`OTT seeded: ${courses.length} courses, ${count} existing users (Meera, Asha, Ravi). Priya and Kiran are created at first login.`);
await prisma.$disconnect();
