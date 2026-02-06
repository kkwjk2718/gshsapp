
import { prisma } from './src/lib/db';
import bcrypt from 'bcryptjs';

async function repairUser() {
    const userId = 'kkwjk247';
    const plainPassword = 'Aa090420**'; // As provided by user for testing

    console.log(` repairing user ${userId}...`);

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    try {
        const updated = await prisma.user.update({
            where: { userId: userId },
            data: { passwordHash: hashedPassword }
        });
        console.log("Success! User password updated to hash.");
        console.log("New Hash:", updated.passwordHash.substring(0, 20) + "...");
    } catch (error) {
        console.error("Failed to update user:", error);
    }
}

repairUser();
