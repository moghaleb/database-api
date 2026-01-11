const https = require('https');

const data = JSON.stringify({
    items: [{ id: 1, name: "Test Item", price: 100, quantity: 1 }],
    totalAmount: 100,
    customerName: "Test User",
    customerEmail: "test@example.com",
    paymentMethod: "online"
});

const options = {
    hostname: 'redme.cfd',
    port: 443,
    path: '/api/process-payment',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = https.request(options, (res) => {
    console.log(`StatusCode: ${res.statusCode}`);

    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (error) => {
    console.error(error);
});

req.write(data);
req.end();
