const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

// Configuration for Base Blockscout
const CONTRACT_ADDRESS = '0x5FB474F9A6b1606106Bed1ED901E2660c0FBC9ae';
const BLOCKSCOUT_API_URL = 'https://base.blockscout.com/api/v2/smart-contracts/verification/via/flattened-code';

// Read contract source code
const contractPath = path.join(__dirname, '..', 'src', 'HedwigProjectContract.sol');
const sourceCode = fs.readFileSync(contractPath, 'utf8');

// Constructor arguments: platformWallet (0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d), platformFeeRate (100)
const constructorArgs = '00000000000000000000000029b30cd52d9e8ddf9ffeafb598715db78d3b771d0000000000000000000000000000000000000000000000000000000000000064';

// Verification data for Blockscout
const verificationData = {
    address_hash: CONTRACT_ADDRESS,
    name: 'HedwigProjectContract',
    compiler_version: 'v0.8.20+commit.a1b79de6',
    optimization: true,
    optimization_runs: 200,
    evm_version: 'paris',
    source_code: sourceCode,
    constructor_arguments: constructorArgs,
    license_type: 'mit'
};

function makeRequest(data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        
        const options = {
            hostname: 'base.blockscout.com',
            port: 443,
            path: '/api/v2/smart-contracts/verification/via/flattened-code',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
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
                    console.log('Raw response:', responseData);
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
        console.log('Starting HedwigProjectContract verification on Base Blockscout...');
        console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
        console.log(`Constructor Args: ${constructorArgs}`);
        
        const response = await makeRequest(verificationData);
        
        console.log('Verification response:', response);
        
        if (response.message === 'OK' || response.status === 'success') {
            console.log('✅ Contract verification submitted successfully!');
            console.log('\nYou can check the verification status at:');
            console.log(`https://base.blockscout.com/address/${CONTRACT_ADDRESS}#code`);
        } else {
            console.log('❌ Contract verification failed:');
            console.log(response);
        }
    } catch (error) {
        console.error('Error during verification:', error.message);
    }
}

// Run verification
verifyContract();