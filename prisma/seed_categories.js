const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const categories = [
    { value: "GENERAL", label: "일반" },
    { value: "ACADEMIC", label: "학사" },
    { value: "EVENT", label: "행사" },
    { value: "BROADCAST", label: "방송" },
  ];

  for (const category of categories) {
    await prisma.noticeCategory.upsert({
      where: { value: category.value },
      update: { label: category.label },
      create: category,
    });
  }

  console.log("Categories seeded!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
