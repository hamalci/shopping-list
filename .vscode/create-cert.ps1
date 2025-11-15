# Create self-signed certificate for HTTPS
$certPath = "E:\deploy-shopl\.vscode"
$dnsNames = @("localhost", "192.168.1.182", "127.0.0.1")

# Create certificate with password
$cert = New-SelfSignedCertificate -DnsName $dnsNames -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(1) -KeyAlgorithm RSA -KeyLength 2048 -FriendlyName "Shopping List Dev"

# Export with password
$password = "temp123"
$certPassword = ConvertTo-SecureString -String $password -Force -AsPlainText
$pfxPath = Join-Path $certPath "cert.pfx"
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $certPassword | Out-Null

# Load PFX
$pfxCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxPath, $password, 'Exportable')

# Export certificate (public key) to PEM
$certPem = "-----BEGIN CERTIFICATE-----" + [Environment]::NewLine
$certPem += [System.Convert]::ToBase64String($pfxCert.RawData, 'InsertLineBreaks')
$certPem += [Environment]::NewLine + "-----END CERTIFICATE-----"
[System.IO.File]::WriteAllText((Join-Path $certPath "cert.pem"), $certPem)

# Export private key to PEM
$rsaKey = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($pfxCert)
$keyBytes = $rsaKey.ExportRSAPrivateKey()
$keyPem = "-----BEGIN RSA PRIVATE KEY-----" + [Environment]::NewLine
$keyPem += [System.Convert]::ToBase64String($keyBytes, 'InsertLineBreaks')
$keyPem += [Environment]::NewLine + "-----END RSA PRIVATE KEY-----"
[System.IO.File]::WriteAllText((Join-Path $certPath "key.pem"), $keyPem)

# Cleanup
Remove-Item $pfxPath -Force

Write-Host ""
Write-Host "Certificates created successfully!" -ForegroundColor Green
Write-Host "Location: $certPath" -ForegroundColor Cyan
Write-Host "Files: cert.pem, key.pem" -ForegroundColor Cyan
Write-Host ""
Write-Host "Important:" -ForegroundColor Yellow
Write-Host "  1. Restart Live Server in VS Code" -ForegroundColor White
Write-Host "  2. Access via: https://192.168.1.182:5500" -ForegroundColor White
Write-Host "  3. Accept security warning in browser (self-signed cert)" -ForegroundColor White
Write-Host ""
Write-Host "Certificate Thumbprint: $($cert.Thumbprint)" -ForegroundColor Gray
