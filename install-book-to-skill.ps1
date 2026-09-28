<#
.SYNOPSIS
  Installa la skill book-to-skill (https://github.com/virgiliojr94/book-to-skill)
  in %USERPROFILE%\.claude\skills\book-to-skill e sistema le dipendenze su Windows.

.DESCRIPTION
  Controlla e, se mancano, installa:
    - Git for Windows (fornisce Git Bash, che Claude Code usa per eseguire i comandi della skill)
    - Python 3.9+ (evitando l'alias finto "python3" del Microsoft Store)
    - pacchetti Python per PDF / EPUB / DOCX / RTF / HTML
  Poi:
    - clona (o aggiorna) la skill in ~/.claude/skills/book-to-skill
    - crea ~/.agents/skills (dove la skill scrive i libri convertiti)
    - imposta le variabili utente PYTHON_BIN, PYTHONUTF8 e, se possibile, MSYS
      (per far funzionare i symlink ~/.claude/skills/<libro> -> ~/.agents/skills/<libro>)
    - esegue il controllo finale "book_to_skill --check"

.PARAMETER Full
  Installa anche docling (serve solo per --mode technical: tabelle, formule; pesante, ~2 GB).

.PARAMETER WithCalibre
  Installa anche Calibre (serve solo per file MOBI / AZW / AZW3).

.PARAMETER WithPoppler
  Installa anche Poppler (pdftotext): estrazione PDF piu' veloce, opzionale.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-book-to-skill.ps1
  powershell -ExecutionPolicy Bypass -File .\install-book-to-skill.ps1 -WithCalibre -WithPoppler
#>
[CmdletBinding()]
param(
    [switch]$Full,
    [switch]$WithCalibre,
    [switch]$WithPoppler
)

$ErrorActionPreference = 'Stop'
$RepoUrl   = 'https://github.com/virgiliojr94/book-to-skill.git'
$SkillsDir = Join-Path $env:USERPROFILE '.claude\skills'
$SkillDir  = Join-Path $SkillsDir 'book-to-skill'
$AgentsDir = Join-Path $env:USERPROFILE '.agents\skills'

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    [!]  $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "    [X]  $msg" -ForegroundColor Red }

# Ricarica il PATH dopo un'installazione winget, senza riaprire il terminale.
function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Test-Winget { [bool](Get-Command winget -ErrorAction SilentlyContinue) }

function Install-WithWinget($id, $name) {
    if (-not (Test-Winget)) {
        Fail "winget non disponibile: installa $name a mano, poi rilancia lo script."
        return $false
    }
    Write-Host "    Installo $name con winget ($id)..."
    winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements --silent
    Update-SessionPath
    return ($LASTEXITCODE -eq 0)
}

# Restituisce il percorso di un Python >= 3.9 funzionante, ignorando gli stub del
# Microsoft Store in %LOCALAPPDATA%\Microsoft\WindowsApps (esistono ma non eseguono nulla).
function Find-Python {
    $candidates = @()
    if (Get-Command py -ErrorAction SilentlyContinue) {
        try {
            $p = & py -3 -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $p) { $candidates += $p.Trim() }
        } catch {}
    }
    foreach ($name in 'python', 'python3') {
        Get-Command $name -All -ErrorAction SilentlyContinue |
            Where-Object { $_.Source -notmatch '\\WindowsApps\\' } |
            ForEach-Object { $candidates += $_.Source }
    }
    foreach ($c in $candidates | Select-Object -Unique) {
        try {
            $ok = & $c -c "import sys; print(sys.version_info >= (3, 9))" 2>$null
            if ($LASTEXITCODE -eq 0 -and $ok -match 'True') { return $c }
        } catch {}
    }
    return $null
}

# ---------------------------------------------------------------------------
Step 'Git / Git Bash'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Warn 'Git non trovato.'
    Install-WithWinget 'Git.Git' 'Git for Windows' | Out-Null
}
if (Get-Command git -ErrorAction SilentlyContinue) {
    Ok (git --version)
} else {
    Fail 'Git ancora non disponibile. Installa https://git-scm.com/download/win e rilancia.'
    exit 1
}
$gitBash = Join-Path (Split-Path (Split-Path (Get-Command git).Source)) 'bin\bash.exe'
if (Test-Path $gitBash) { Ok "Git Bash: $gitBash" } else { Warn 'bash.exe di Git non trovato: Claude Code ne ha bisogno per eseguire i comandi della skill.' }

# ---------------------------------------------------------------------------
Step 'Python 3.9+'
$python = Find-Python
if (-not $python) {
    Warn 'Python 3.9+ non trovato (gli alias "python" del Microsoft Store non contano).'
    Install-WithWinget 'Python.Python.3.12' 'Python 3.12' | Out-Null
    $python = Find-Python
}
if (-not $python) {
    Fail 'Python ancora non disponibile. Installa da https://www.python.org/downloads/ (spunta "Add python.exe to PATH") e rilancia.'
    exit 1
}
Ok "$(& $python --version) -> $python"

# Gli alias del Store intercettano "python3": la skill prova prima python3, quindi
# le diciamo esplicitamente quale interprete usare.
$storeStub = Get-Command python3 -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -match '\\WindowsApps\\' }
if ($storeStub) {
    Warn 'Trovato l''alias "python3" del Microsoft Store: lo aggiro con PYTHON_BIN.'
    Warn 'Per rimuoverlo: Impostazioni > App > Impostazioni app avanzate > Alias di esecuzione app > disattiva python.exe / python3.exe.'
}
[Environment]::SetEnvironmentVariable('PYTHON_BIN', ($python -replace '\\', '/'), 'User')
[Environment]::SetEnvironmentVariable('PYTHONUTF8', '1', 'User')
$env:PYTHON_BIN = $python; $env:PYTHONUTF8 = '1'
Ok 'Impostate le variabili utente PYTHON_BIN e PYTHONUTF8=1'

# ---------------------------------------------------------------------------
Step 'Pacchetti Python'
$packages = @('pdf-inspector>=1.15,<2', 'pypdf', 'pdfminer.six', 'ebooklib', 'beautifulsoup4',
              'python-docx', 'striprtf', 'trafilatura')
if ($Full) { $packages += 'docling' }
& $python -m pip install --user --upgrade pip | Out-Null
& $python -m pip install --user --upgrade @packages
if ($LASTEXITCODE -eq 0) { Ok ($packages -join ', ') } else { Warn 'Alcuni pacchetti non si sono installati: la skill usa comunque i fallback della libreria standard.' }

# ---------------------------------------------------------------------------
if ($WithPoppler) {
    Step 'Poppler (pdftotext)'
    if (Get-Command pdftotext -ErrorAction SilentlyContinue) { Ok 'gia'' presente' }
    else { Install-WithWinget 'oschwartz10612.Poppler' 'Poppler' | Out-Null }
}
if ($WithCalibre) {
    Step 'Calibre (MOBI/AZW)'
    if (Get-Command ebook-convert -ErrorAction SilentlyContinue) { Ok 'gia'' presente' }
    else { Install-WithWinget 'calibre.calibre' 'Calibre' | Out-Null }
}

# ---------------------------------------------------------------------------
Step 'Skill book-to-skill'
New-Item -ItemType Directory -Force -Path $SkillsDir, $AgentsDir | Out-Null
if (Test-Path (Join-Path $SkillDir '.git')) {
    git -C $SkillDir pull --ff-only
    Ok "Aggiornata: $SkillDir"
} elseif (Test-Path $SkillDir) {
    $backup = "$SkillDir.bak-$(Get-Date -Format yyyyMMddHHmmss)"
    Warn "Esiste gia' una cartella non-git: la sposto in $backup"
    Move-Item $SkillDir $backup
    git clone $RepoUrl $SkillDir
} else {
    git clone $RepoUrl $SkillDir
}
if (Test-Path (Join-Path $SkillDir 'SKILL.md')) { Ok "Installata in $SkillDir" } else { Fail 'SKILL.md non trovato dopo il clone.'; exit 1 }
Ok "Cartella per i libri convertiti: $AgentsDir"

# ---------------------------------------------------------------------------
Step 'Symlink per i libri convertiti'
# La skill scrive ogni libro in ~/.agents/skills/<libro> e crea un symlink in
# ~/.claude/skills/<libro>. In Git Bash "ln -s" di default COPIA invece di linkare;
# con la Modalita' sviluppatore attiva e MSYS=winsymlinks:nativestrict crea veri symlink.
$devMode = $false
try {
    $devMode = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -ErrorAction Stop).AllowDevelopmentWithoutDevLicense -eq 1
} catch {}
$probeTarget = Join-Path $env:TEMP "b2s-probe-$PID"
$probeLink   = "$probeTarget-link"
New-Item -ItemType Directory -Force -Path $probeTarget | Out-Null
$canSymlink = $false
try { New-Item -ItemType SymbolicLink -Path $probeLink -Target $probeTarget -ErrorAction Stop | Out-Null; $canSymlink = $true } catch {}
Remove-Item $probeLink, $probeTarget -Force -Recurse -ErrorAction SilentlyContinue

if ($devMode -or $canSymlink) {
    [Environment]::SetEnvironmentVariable('MSYS', 'winsymlinks:nativestrict', 'User')
    Ok 'Symlink disponibili: impostata MSYS=winsymlinks:nativestrict'
} else {
    Warn 'Symlink non disponibili (Modalita'' sviluppatore disattivata).'
    Warn 'Attivala in Impostazioni > Sistema > Per sviluppatori > Modalita'' sviluppatore, poi rilancia questo script.'
    Warn 'Senza, dopo ogni conversione esegui:  New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\<libro>" -Target "$env:USERPROFILE\.agents\skills\<libro>"'
}

# ---------------------------------------------------------------------------
Step 'Verifica finale'
Push-Location $SkillDir
try { & $python -m book_to_skill --check } finally { Pop-Location }

Write-Host "`nFatto. Chiudi e riapri Claude Code, poi usa:" -ForegroundColor Green
Write-Host '    /book-to-skill C:/percorso/del/libro.pdf'
