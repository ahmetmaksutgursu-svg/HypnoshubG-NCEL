# ============================================================
#  API ANAHTARINI DEĞİŞTİR
#  ------------------------------------------------------------
#  Kullanım:  klasörde sağ tık → "PowerShell ile çalıştır"
#             ya da:  powershell -ExecutionPolicy Bypass -File anahtar-degistir.ps1
#
#  Anahtarı yazarken ekranda GÖRÜNMEZ ve komut geçmişine DÜŞMEZ.
#  Sadece server/.env dosyasındaki CR_API_TOKEN satırını değiştirir.
#  Eski dosyanın yedeğini .env.eski adıyla bırakır.
# ============================================================

$ErrorActionPreference = "Stop"
$env_yolu = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path $env_yolu)) {
  Write-Host ".env bulunamadi: $env_yolu" -ForegroundColor Red
  Write-Host "Once .env.example dosyasini .env adiyla kopyalayin." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "  Yeni Clash Royale API anahtarini yapistirin." -ForegroundColor Cyan
Write-Host "  (Yazarken ekranda gorunmeyecek. Yapistirmak icin sag tik.)" -ForegroundColor DarkGray
Write-Host ""
$gizli = Read-Host -Prompt "  Anahtar" -AsSecureString
$anahtar = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($gizli))
$anahtar = $anahtar.Trim()

if ($anahtar.Length -lt 100) {
  Write-Host ""
  Write-Host "  Bu anahtar cok kisa gorunuyor ($($anahtar.Length) karakter)." -ForegroundColor Red
  Write-Host "  Supercell anahtarlari genelde 500+ karakter olur. Iptal edildi." -ForegroundColor Red
  exit 1
}
if ($anahtar -notmatch '^eyJ') {
  Write-Host ""
  Write-Host "  Uyari: anahtar 'eyJ' ile baslamiyor. Yanlis metni mi yapistirdiniz?" -ForegroundColor Yellow
  $devam = Read-Host "  Yine de yazilsin mi? (e/h)"
  if ($devam -ne "e") { Write-Host "  Iptal edildi."; exit 1 }
}

# Yedek al, sonra yaz.
Copy-Item $env_yolu "$env_yolu.eski" -Force

$satirlar = Get-Content $env_yolu -Encoding UTF8
$bulundu = $false
$yeni = foreach ($s in $satirlar) {
  if ($s -match '^\s*CR_API_TOKEN\s*=') { $bulundu = $true; "CR_API_TOKEN=$anahtar" }
  else { $s }
}
if (-not $bulundu) { $yeni = @("CR_API_TOKEN=$anahtar") + $satirlar }

Set-Content -Path $env_yolu -Value $yeni -Encoding UTF8

Write-Host ""
Write-Host "  Yazildi. Yeni anahtar $($anahtar.Length) karakter." -ForegroundColor Green
Write-Host "  Eski dosya: .env.eski  (calistigini gorunce silebilirsiniz)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Simdi sunucuyu yeniden baslatin." -ForegroundColor Cyan
Write-Host ""

# Degiskeni bellekten temizle.
$anahtar = $null
[GC]::Collect()
