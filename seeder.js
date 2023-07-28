const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
    const proxies = [];
    for (let i = 0; i < 50; i++) {
        proxies.push({
            ip: `192.168.0.${i}`,
            port: 8000 + i,
            login: `user${i}`,
            password: `password${i}`,
        });
    }
    await prisma.proxy.createMany({
        data: proxies,
    });

    await prisma.$disconnect();
}

seed().then(r => console.log('SEEDER DONE'));