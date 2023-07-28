const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

const prisma = new PrismaClient();

const apiUrl = 'https://kaspi.kz/yml/offer-view/offers/';

const proxyLimit = 30;
const maxRetries = 3;
const requestTimeout = 7000;

const proxiesQueue = [];
const proxyCount = new Map();

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

async function getDataUsingProxiesForArticles(articles) {
    const data = {};

    while (articles.length > 0) {
        const article = articles.shift();
        let retries = 0;
        let response = null;

        while (!response && retries < maxRetries) {
            let proxy = proxiesQueue.shift();
            if (!proxy) {
                await new Promise((resolve) => setTimeout(resolve, 15000));
                continue;
            }

            if (proxyCount.get(proxy) > proxyLimit) {
                proxyCount.set(proxy, 0);
                await new Promise((resolve) => setTimeout(resolve, 15000));
                proxy = proxiesQueue.shift();
            }

            proxyCount.set(proxy, (proxyCount.get(proxy) || 0) + 1);

            response = await fetchDataWithProxy(article, proxy);
            if (!response) {
                proxiesQueue.push(proxy);
                retries++;
            }
        }

        if (response) {
            data[article] = response;
        }
    }

    return data;
}

async function main() {
    try {
        const numThreads = 5;
        const articlesPerThread = Math.ceil(5000 / numThreads);
        const allArticles = Array.from({length: 5000}, (_, index) => index + 1);

        if (isMainThread) {
            const proxies = await prisma.proxy.findMany();
            proxiesQueue.push(...proxies);

            const workers = [];
            const results = [];

            for (let i = 0; i < numThreads; i++) {
                const articlesChunk = allArticles.splice(0, articlesPerThread);
                const worker = new Worker(__filename, {
                    workerData: {articlesChunk},
                });

                workers.push(worker);

                worker.on('message', (result) => {
                    results.push(result);
                });
            }

            await Promise.all(workers.map((worker) => {
                return new Promise((resolve) => {
                    worker.on('exit', () => {
                        resolve();
                    });
                });
            }));

            const combinedData = Object.assign({}, ...results);
            return combinedData;
        } else {
            const result = await getDataUsingProxiesForArticles(workerData.articlesChunk);
            parentPort.postMessage(result);
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main().then((r) => console.log('SCRIPT DONE'));
