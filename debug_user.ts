
import { prisma } from './src/lib/db';

async function checkUser() {
    const user = await prisma.user.findUnique({
        where: { userId: 'kkwjk247' }
    });

    if (user) {
        console.log("User found:", {
            id: user.id,
            userId: user.userId,
            name: user.name,
            role: user.role,
            hasPasswordHash: !!user.passwordHash
        });
    } else {
        console.log("User 'kkwjk247' not found in database.");
    }
}

checkUser();
