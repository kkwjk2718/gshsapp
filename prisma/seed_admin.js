const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('1234', 10);

  const admin = await prisma.user.upsert({
    where: { userId: 'admin' },
    update: { passwordHash },
    create: {
      userId: 'admin',
      passwordHash,
      name: '관리자',
      email: 'admin@gshs.kr',
      role: 'ADMIN',
      studentId: 'ADMIN', 
      gisu: 0,
      isOnboarded: true
    },
  });
  console.log('Admin user created:', admin);
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