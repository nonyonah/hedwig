const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

// Configuration
const CONTRACT_ADDRESS = '0xB5d572B160145a6fc353d3b8c7ff3917fC3599d2';
const API_KEY = process.env.BASESCAN_API_KEY || '771UGNNGQRQ4X2KUG4BSENPKQ8JTSI8FEY';
const BASESCAN_API_URL = 'https://api.basescan.org/api';

// Read contract source code - using single file verification as per Base docs
const contractPath = path.join(__dirname, '..', 'src', 'HedwigPayment.sol');
const sourceCode = fs.readFileSync(contractPath, 'utf8');

// Verification parameters - using single file verification method
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
            hostname: 'api.basescan.org',
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
        console.log('Starting contract verification...');
        console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
        console.log(`API Key: ${API_KEY ? 'Set' : 'Not set'}`);
        
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