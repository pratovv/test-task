const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const apiUrl = 'https://kaspi.kz/yml/offer-view/offers/';

const proxyLimit = 30;
const maxRetries = 3;
const requestTimeout = 7000;

async function fetchDataWithProxy(article, proxy) {
    try {
        const response = await axios.post(`${apiUrl}${article}`, {
            proxy: {
                host: proxy.ip,
                port: proxy.port,
                auth: {
                    username: proxy.login,
                    password: proxy.password,
                },
            },
            timeout: requestTimeout,
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching data for article ${article} using proxy ${proxy.ip}:${proxy.port}:`, error.message);
        return null;
    }
}

async function getDataUsingProxies() {
    const data = {};
    const articles = Array.from({ length: 5000 },(_,index)=>index+1);
    const proxies = await prisma.proxy.findMany();
    const proxyCount = new Map();
    for (const article of articles) {
        let retries = 0;
        let response = null;

        while (!response && retries < maxRetries) {
            const proxy = proxies.shift();
            if (!proxy) break;

            if(proxyCount.get(proxy)>proxyLimit) {
                await new Promise((resolve) => setTimeout(resolve,15000));
            }

            proxyCount.set(proxy, (proxyCount.get(proxy) || 0) + 1);

            response = await fetchDataWithProxy(article, proxy);
            if (!response) {
                proxies.push(proxy);
                retries++;
            }
        }

        if (response) {
            data[article] = response;
        }

        if (proxies.length === 0) {
            await new Promise((resolve) => setTimeout(resolve, 15000));
        }
    }

    return data;
}

async function main() {
    try {
        return getDataUsingProxies();
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main().then(r => console.log('SCRIPT DONE'));
