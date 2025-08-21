# PowerShell script to deploy HedwigPayment contract using Foundry
# This script uses environment variables from .env.local

# Load environment variables from .env.local
$envFile = ".env.local"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
} else {
    Write-Error "Error: .env.local file not found"
    exit 1
}

# Check if RPC URL is provided
if (-not $env:BASE_SEPOLIA_RPC_URL) {
    Write-Error "Error: BASE_SEPOLIA_RPC_URL is not set in .env.local"
    exit 1
}

# Check if private key is provided
if (-not $env:PLATFORM_PRIVATE_KEY) {
    Write-Error "Error: PLATFORM_PRIVATE_KEY is not set in .env.local"
    exit 1
}

Write-Host "Deploying HedwigPayment contract to Base Sepolia..." -ForegroundColor Green

# Run the forge script to deploy the contract
forge script script/Counter.s.sol:DeployHedwigPayment `
  --rpc-url "$env:BASE_SEPOLIA_RPC_URL" `
  --broadcast `
  -vvv

Write-Host "`nDeployment complete!" -ForegroundColor Green

# Extract contract address from the logs
$logFile = Get-ChildItem -Path "broadcast\Counter.s.sol\*\run-latest.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (Test-Path $logFile) {
    $deploymentLog = Get-Content $logFile -Raw | ConvertFrom-Json
    $contractAddress = $deploymentLog.transactions | Where-Object { $_.transactionType -eq "CREATE" } | Select-Object -ExpandProperty contractAddress
    
    if ($contractAddress) {
        Write-Host "Contract Address: $contractAddress" -ForegroundColor Cyan
        Write-Host "`nAdd this to your .env.local file:" -ForegroundColor Yellow
        Write-Host "HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET=$contractAddress" -ForegroundColor Yellow
    } else {
        Write-Host "Could not find contract address in deployment logs." -ForegroundColor Red
        Write-Host "Check the logs above for the contract address." -ForegroundColor Yellow
    }
} else {
    Write-Host "Deployment log file not found." -ForegroundColor Red
    Write-Host "Check the logs above for the contract address." -ForegroundColor Yellow
}