$ErrorActionPreference = 'Stop'

$environmentPath = Join-Path $PSScriptRoot '..\src\environments\environment.ts'
$environmentText = Get-Content -Raw $environmentPath
if ($environmentText -notmatch "clientId:\s*'([^']+)'") {
  throw "No se encontró el Client ID de Sandbox en $environmentPath."
}
$clientId = $Matches[1]
if ([string]::IsNullOrWhiteSpace($clientId)) {
  throw 'Configura primero el Client ID de Sandbox en src/environments/environment.ts.'
}

$secureSecret = Read-Host 'Client Secret nuevo de PayPal Sandbox (entrada oculta)' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
try {
  $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  $credentialBytes = [Text.Encoding]::UTF8.GetBytes("${clientId}:${clientSecret}")
  try {
    $basicCredentials = [Convert]::ToBase64String($credentialBytes)
  }
  finally {
    [Array]::Clear($credentialBytes, 0, $credentialBytes.Length)
  }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
}

try {
  $tokenResponse = Invoke-RestMethod `
    -Method Post `
    -Uri 'https://api-m.sandbox.paypal.com/v1/oauth2/token' `
    -Headers @{ Authorization = "Basic $basicCredentials" } `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body 'grant_type=client_credentials'
}
catch {
  $networkException = $_.Exception
  while ($networkException -and $networkException -isnot [System.Net.WebException]) {
    $networkException = $networkException.InnerException
  }
  if ($networkException -is [System.Net.WebException] -and
    $networkException.Status -eq [System.Net.WebExceptionStatus]::NameResolutionFailure) {
    throw "Windows no pudo resolver api-m.sandbox.paypal.com. No se creó ningún producto ni plan. Comprueba tu conexión/VPN/proxy y ejecuta: Resolve-DnsName api-m.sandbox.paypal.com; después vuelve a intentarlo."
  }
  throw
}
finally {
  $clientSecret = $null
  $basicCredentials = $null
}

if ([string]::IsNullOrWhiteSpace($tokenResponse.access_token)) {
  throw 'PayPal no devolvió un access token. Revisa el Client ID y Client Secret de Sandbox.'
}

$accessToken = $tokenResponse.access_token
$productRequestId = [Guid]::NewGuid().ToString()
$productBody = @{
  name = 'HiloHub Memberships'
  description = 'Planes mensuales de apoyo a la comunidad HiloHub'
  type = 'SERVICE'
  category = 'SOFTWARE'
} | ConvertTo-Json -Depth 5

$product = Invoke-RestMethod `
  -Method Post `
  -Uri 'https://api-m.sandbox.paypal.com/v1/catalogs/products' `
  -Headers @{
    Authorization = "Bearer $accessToken"
    'PayPal-Request-Id' = $productRequestId
  } `
  -ContentType 'application/json' `
  -Body $productBody

if ([string]::IsNullOrWhiteSpace($product.id)) {
  throw 'PayPal creó una respuesta de producto sin devolver un ID.'
}

Write-Output "Producto Sandbox: $($product.id)"

$plans = @(
  @{ key = 'essential'; name = 'Hilo Esencial'; price = '4.99' },
  @{ key = 'plus'; name = 'Hilo Plus'; price = '9.99' },
  @{ key = 'community'; name = 'Hilo Comunidad'; price = '19.99' }
)

foreach ($plan in $plans) {
  $planBody = @{
    product_id = $product.id
    name = $plan.name
    description = "$($plan.name) - suscripción mensual de HiloHub"
    billing_cycles = @(
      @{
        frequency = @{
          interval_unit = 'MONTH'
          interval_count = 1
        }
        tenure_type = 'REGULAR'
        sequence = 1
        total_cycles = 0
        pricing_scheme = @{
          fixed_price = @{
            value = $plan.price
            currency_code = 'USD'
          }
        }
      }
    )
    payment_preferences = @{
      auto_bill_outstanding = $true
      setup_fee_failure_action = 'CONTINUE'
      payment_failure_threshold = 3
    }
  } | ConvertTo-Json -Depth 8

  $createdPlan = Invoke-RestMethod `
    -Method Post `
    -Uri 'https://api-m.sandbox.paypal.com/v1/billing/plans' `
    -Headers @{
      Authorization = "Bearer $accessToken"
      'PayPal-Request-Id' = [Guid]::NewGuid().ToString()
    } `
    -ContentType 'application/json' `
    -Body $planBody

  if ([string]::IsNullOrWhiteSpace($createdPlan.id)) {
    throw "PayPal no devolvió un ID para el plan $($plan.name)."
  }
  Write-Output "$($plan.key) ($($plan.name), USD $($plan.price)/mes): $($createdPlan.id)"
}

$accessToken = $null
Write-Output 'Copia los tres Plan ID en la configuración de HiloHub y Firebase. No compartas el Client Secret.'
