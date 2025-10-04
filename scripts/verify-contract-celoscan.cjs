const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

// Configuration for Celo
const CONTRACT_ADDRESS = '0xF1c485Ba184262F1EAC91584f6B26fdcaa3F794a';
const API_KEY = process.env.CELOSCAN_API_KEY || 'KIKD68NXYAGXSKPN9WPN531883PE16BMRV'; // You'll need to get this from Celoscan
const CELOSCAN_API_URL = 'https://api.celoscan.io/api';

// Read contract source code - using single file verification
const contractPath = path.join(__dirname, '..', 'src', 'HedwigPayment.sol');
const sourceCode = fs.readFileSync(contractPath, 'utf8');

// Verification parameters for Celo
const verificationData = {
    apikey: API_KEY,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: CONTRACT_ADDRESS,
    sourceCode: sourceCode,
    codeformat: 'solidity-single-file',
    contractname: 'HedwigPayment',
    compilerversion: 'v0.8.20+commit.a1b79de6',
    optimizationUsed: '1',
    runs: '200',
    constructorArguements: '', // Add constructor arguments if needed
    evmversion: 'paris',
    licenseType: '3' // MIT License
};

function makeRequest(data) {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify(data);
        
        const options = {
            hostname: 'api.celoscan.io',
            port: 443,
            path: '/api',
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
        console.log('Starting Celo contract verification...');
        console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
        console.log(`API Key: ${API_KEY ? 'Set' : 'Not set'}`);
        
        if (API_KEY === 'YourCeloscanAPIKey') {
            console.log('⚠️  Warning: Using placeholder API key. Please set CELOSCAN_API_KEY environment variable.');
            console.log('You can get an API key from: https://celoscan.io/apis');
            return;
        }
        
        const response = await makeRequest(verificationData);
        
        console.log('Verification response:', response);
        
        if (response.status === '1') {
            console.log('✅ Contract verification submitted successfully!');
            console.log(`GUID: ${response.result}`);
            console.log('\nYou can check the verification status at:');
            console.log(`https://celoscan.io/address/${CONTRACT_ADDRESS}#code`);
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