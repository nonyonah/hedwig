const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

// Configuration for Base Mainnet HedwigProjectContract
const CONTRACT_ADDRESS = '0x5FB474F9A6b1606106Bed1ED901E2660c0FBC9ae';
const API_KEY = process.env.BASESCAN_API_KEY || '771UGNNGQRQ4X2KUG4BSENPKQ8JTSI8FEY';

// Read contract source code
const contractPath = path.join(__dirname, '..', 'src', 'HedwigProjectContract.sol');
const sourceCode = fs.readFileSync(contractPath, 'utf8');

// Constructor arguments: platformWallet (0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d), platformFeeRate (100)
const constructorArgs = '00000000000000000000000029b30cd52d9e8ddf9ffeafb598715db78d3b771d0000000000000000000000000000000000000000000000000000000000000064';

// Verification parameters for V2 API
const verificationData = {
    chainId: '8453', // Base mainnet chain ID
    apikey: API_KEY,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: CONTRACT_ADDRESS,
    sourceCode: sourceCode,
    codeformat: 'solidity-single-file',
    contractname: 'HedwigProjectContract',
    compilerversion: 'v0.8.20+commit.a1b79de6',
    optimizationUsed: '1',
    runs: '200',
    constructorArguements: constructorArgs,
    evmversion: 'paris',
    licenseType: '3' // MIT License
};

function makeRequest(data) {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify(data);

        const options = {
            hostname: 'api.etherscan.io',
            port: 443,
            path: '/v2/api',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonResponse = JSON.parse(responseData);
                    resolve(jsonResponse);
                } catch (error) {
                    reject(new Error(`Failed to parse response: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

async function verifyContract() {
    try {
        console.log('Starting HedwigProjectContract verification on Base...');
        console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
        console.log(`API Key: ${API_KEY ? 'Set' : 'Not set'}`);
        console.log(`Constructor Args: ${constructorArgs}`);

        const response = await makeRequest(verificationData);

        console.log('Verification response:', response);

        if (response.status === '1') {
            console.log('✅ Contract verification submitted successfully!');
            console.log(`GUID: ${response.result}`);
            console.log('\nYou can check the verification status at:');
            console.log(`https://basescan.org/address/${CONTRACT_ADDRESS}#code`);
        } else {
            console.log('❌ Contract verification failed:');
            console.log(response.result);
        }
    } catch (error) {
        console.error('Error during verification:', error.message);
    }
}

// Run verification
verifyContract();