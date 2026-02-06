const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('1234', 10);

  const user = await prisma.user.upsert({
    where: { userId: 'student' },
    update: { passwordHash },
    create: {
      userId: 'student',
      passwordHash,
      name: '김과학',
      email: 'student@gshs.kr',
      role: 'STUDENT',
      studentId: '3101',
      gisu: 41,
      isOnboarded: true
    },
  });
  console.log({ user });
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })