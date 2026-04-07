# ============================================================
#  ImmiCare Anti-Sleep Launcher
#  Jalankan file ini dengan klik kanan -> "Run with PowerShell"
#  Bot akan tetap aktif selama script ini berjalan
# ============================================================

# Load Windows API untuk mencegah sleep
$code = @"
[DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
"@
$type = Add-Type -MemberDefinition $code -Name "PowerState" -Namespace "Win32" -PassThru

# Flag: Cegah sleep sistem (tapi layar boleh mati)
$ES_CONTINUOUS      = [uint32]"0x80000000"
$ES_SYSTEM_REQUIRED = [uint32]"0x00000001"

$null = $type::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED)

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "   *** ImmiCare Anti-Sleep Launcher ***" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  [OK] Mode Sleep Windows: DINONAKTIFKAN" -ForegroundColor Green
Write-Host "  [OK] Bot akan tetap berjalan walau layar mati" -ForegroundColor Green
Write-Host "  [!!] Tutup jendela ini untuk menghentikan bot" -ForegroundColor Red
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# Pindah ke direktori bot (path tetap)
$botPath = "C:\Users\IMIGRASI PKP\Downloads\chatbot_new"
Set-Location -Path $botPath
Write-Host "  [DIR] Masuk ke folder: $botPath" -ForegroundColor DarkCyan
Write-Host ""

# Jalankan bot
try {
    npm start
} finally {
    # Saat script ditutup, kembalikan setting sleep ke normal
    $null = $type::SetThreadExecutionState($ES_CONTINUOUS)
    Write-Host ""
    Write-Host "[INFO] Bot dihentikan. Mode sleep Windows dikembalikan ke normal." -ForegroundColor Yellow
    Write-Host "Tekan Enter untuk menutup..." -ForegroundColor Gray
    Read-Host
}
