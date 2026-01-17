import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function seed() {
  const categories = [
    { name: "Tuition Fee", type: "TUITION", isDefault: true },
    { name: "Transport Fee", type: "TRANSPORT", isDefault: true },
    { name: "Exam Fee", type: "EXAM", isDefault: true },
    { name: "Admission Fee", type: "ADMISSION", isDefault: true },
    { name: "Registration Fee", type: "REGISTRATION", isDefault: true },
    { name: "Security Deposit", type: "CAUTION_MONEY", isDefault: false },
    { name: "ID Card Fee", type: "ID_CARD", isDefault: true },
    {
      name: "Annual Development Charges",
      type: "ANNUAL_CHARGES",
      isDefault: true,
    },
    { name: "Library Fee", type: "LIBRARY", isDefault: true },
    { name: "Computer/IT Fee", type: "COMPUTER", isDefault: true },
    { name: "Science Lab Fee", type: "LABORATORY", isDefault: false },
    { name: "Sports Fee", type: "SPORTS", isDefault: true },
    { name: "Fine Arts/Music Fee", type: "ARTS", isDefault: false },
    { name: "Hostel Fee", type: "HOSTEL", isDefault: false },
    { name: "Mess/Catering Fee", type: "MESS", isDefault: false },
    { name: "Books & Stationery", type: "BOOKS", isDefault: false },
    { name: "Uniform Fee", type: "UNIFORM", isDefault: false },
    { name: "Insurance Fee", type: "INSURANCE", isDefault: true },
  ];

  for (const cat of categories) {
    await prisma.feeCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }

  console.log("Seeded default fee categories");
}

seed()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
