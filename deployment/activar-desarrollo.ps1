# Activador de desarrollo del CRM.
# Solo localhost: no publica dominios, no usa TLS ni el edge compartido.
# Reutiliza `dev.js`, que levanta las dos PostgreSQL, el backend, el panel y el
# servicio de IA, instalando dependencias cuando faltan.
# Si Docker Desktop esta detenido, lo inicia y espera al motor (180 s por defecto).
#
# Uso (desde Activar-Desarrollo.bat o directamente):
#   Activar-Desarrollo.bat                          DB + API + panel + IA
#   Activar-Desarrollo.bat -Check                   solo diagnostico, no arranca nada
#   Activar-Desarrollo.bat -Apps db,backend,web     elige servicios
#   Activar-Desarrollo.bat -Restore                 restaura analytics si esta vacia
#   Activar-Desarrollo.bat -BackupDb               vuelca la BD operativa (crm) a backups/ y sale
#   Activar-Desarrollo.bat -RestoreDb              restaura la BD operativa (pg_restore --clean) y arranca
#   Activar-Desarrollo.bat -Init                    primer arranque desde cero: instala dependencias,
#                                                   crea la base y la restaura desde backups/ si esta vacia
#   Activar-Desarrollo.bat -Stop                    detiene todo (incluye PostgreSQL)
#   Activar-Desarrollo.bat -NoPersist               no guarda PATH/DOCKER_HOST del usuario
#   Activar-Desarrollo.bat -DockerDesktopPath "C:\ruta\Docker Desktop.exe"  ruta manual
[CmdletBinding()]
param(
    [string]$Apps = 'db,backend,web,ia',
    [ValidateRange(30, 1800)][int]$TimeoutSeconds = 300,
    [ValidateRange(30, 900)][int]$DockerTimeoutSeconds = 180,
    [string]$DockerDesktopPath = '',
    [switch]$NoPersist,
    [switch]$Check,
    [switch]$Restore,
    [switch]$BackupDb,
    [switch]$RestoreDb,
    [switch]$Init,
    [switch]$Stop
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -eq 'Desktop') {
    $env:PSModulePath = "$PSHOME\Modules;$env:ProgramFiles\WindowsPowerShell\Modules;$env:PSModulePath"
}
$root = Split-Path $PSScriptRoot -Parent
$devJs = Join-Path $root 'dev.js'
$logs = Join-Path $root 'logs'
$started = $false

# Servicio -> puertos que publica en este equipo.
$AppPorts = [ordered]@{
    db         = @(5436, 5437)
    backend    = @(3100)
    web        = @(8444)
    ia         = @(8002)
    clustering = @(8010)
    xgboost    = @(8011)
    uplift     = @(8012)
}
$AppLabel = @{
    db         = 'PostgreSQL (analytics + crm)'
    backend    = 'API (NestJS)'
    web        = 'Panel CRM'
    ia         = 'ia-service'
    clustering = 'ML clustering'
    xgboost    = 'ML xgboost'
    uplift     = 'ML uplift'
}
# Las dos bases comparten servicio pero no nombre ni usuario.
$PortInfo = @{
    5436 = @{ Label = 'PostgreSQL analytics'; Url = 'postgres://postgres:postgres@localhost:5436/analytics' }
    5437 = @{ Label = 'PostgreSQL crm'; Url = 'postgres://postgres:postgres@localhost:5437/crm' }
}

function Get-PortDisplay([string]$App, [int]$Port) {
    if ($PortInfo.ContainsKey($Port)) { return $PortInfo[$Port] }
    return @{ Label = $AppLabel[$App]; Url = "http://localhost:$Port" }
}

function Test-Tcp([string]$Machine, [int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($Machine, $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(400)) { return $false }
        $client.EndConnect($async)
        return $true
    } catch { return $false } finally { $client.Close() }
}

function Wait-Port([int]$Port, [string]$What) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Tcp '127.0.0.1' $Port) {
            Write-Host ("  [ok] {0} -> puerto {1}" -f $What, $Port)
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw ("'{0}' no respondio en el puerto {1}. Revise {2}" -f $What, $Port, $logs)
}

# PowerShell 5.1 convierte stderr nativo en error: un sondeo fallido no debe
# abortar el arranque.
function Test-DockerEngine([string]$Cli) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $null = & $Cli info 2>$null
        return ($LASTEXITCODE -eq 0)
    } finally { $ErrorActionPreference = $previous }
}

function Resolve-Node {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    $fallback = if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'nodejs\node.exe' } else { $null }
    $node = if ($command) { $command.Source } else { $fallback }
    if (-not $node -or -not (Test-Path -LiteralPath $node)) {
        throw 'Instale Node.js LTS x64 (22.12 o superior) y vuelva a ejecutar.'
    }
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $version = (& $node -p 'process.versions.node' 2>$null) } finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0 -or -not $version) { throw 'No fue posible ejecutar Node.js.' }
    $version = "$version".Trim()
    if ([version]$version -lt [version]'22.12.0') {
        throw "Se requiere Node.js 22.12 o superior (instalado: $version)."
    }
    return @{ Path = $node; Version = $version }
}

function Find-DockerDesktop([string]$Explicit) {
    if ($Explicit) {
        if (Test-Path -LiteralPath $Explicit) { return $Explicit }
        return $null
    }
    $candidates = @(
        'C:\Program Files\Docker\Docker\Docker Desktop.exe',
        'C:\Program Files\Docker\Docker Desktop.exe',
        'C:\Program Files (x86)\Docker\Docker\Docker Desktop.exe'
    )
    if ($env:LOCALAPPDATA) {
        $candidates += (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
        $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker Desktop.exe')
    }
    $hit = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($hit) { return $hit }

    # Si ya esta corriendo, su ruta es la respuesta.
    $process = Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($process) {
        try { if ($process.Path) { return $process.Path } } catch { }
    }

    # Instalacion en ruta no estandar: lo que declare el desinstalador.
    $keys = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    $entry = Get-ItemProperty $keys -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'Docker Desktop*' -and $_.InstallLocation } |
        Select-Object -First 1
    if ($entry) {
        $candidate = Join-Path $entry.InstallLocation 'Docker Desktop.exe'
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    foreach ($root in @('C:\Program Files\Docker', 'C:\Program Files (x86)\Docker')) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        $found = Get-ChildItem -LiteralPath $root -Filter 'Docker Desktop.exe' -Recurse -Depth 3 -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

function Resolve-Docker {
    param(
        [switch]$StartIfNeeded = $true,
        [int]$TimeoutSeconds = 180
    )
    # Se prueban todos los CLI conocidos: el de Docker Desktop primero, luego el
    # del PATH y por ultimo C:\DockerCLI (instalacion vieja). Cada uno puede
    # apuntar a un endpoint distinto, asi que se elige el que responda.
    $clis = @()
    $desktopClis = @('C:\Program Files\Docker\Docker\resources\bin\docker.exe')
    if ($env:LOCALAPPDATA) { $desktopClis += (Join-Path $env:LOCALAPPDATA 'Docker\Docker\resources\bin\docker.exe') }
    foreach ($path in $desktopClis) { if ((Test-Path -LiteralPath $path) -and $clis -notcontains $path) { $clis += $path } }
    $command = Get-Command docker.exe -ErrorAction SilentlyContinue
    if ($command -and $clis -notcontains $command.Source) { $clis += $command.Source }
    if ((Test-Path 'C:\DockerCLI\docker.exe') -and $clis -notcontains 'C:\DockerCLI\docker.exe') { $clis += 'C:\DockerCLI\docker.exe' }
    if (-not $clis) {
        return @{ Ok = $false; Path = $null; Detail = 'no se encontro docker.exe (instale Docker Desktop)' }
    }
    foreach ($cliPath in $clis) {
        $directory = Split-Path $cliPath -Parent
        if (($env:PATH -split ';') -notcontains $directory) { $env:PATH = "$directory;$env:PATH" }
    }

    $probe = {
        foreach ($cliPath in $clis) {
            if (Test-DockerEngine $cliPath) { return $cliPath }
        }
        return $null
    }

    $cli = & $probe
    if ($cli) { return @{ Ok = $true; Path = $cli; Detail = 'motor en marcha' } }

    # Un DOCKER_HOST heredado que no responde impide hablar con cualquier motor.
    if ($env:DOCKER_HOST) {
        Remove-Item Env:DOCKER_HOST -ErrorAction SilentlyContinue
        $cli = & $probe
        if ($cli) { return @{ Ok = $true; Path = $cli; Detail = 'motor en marcha (se descarto un DOCKER_HOST sin respuesta)' } }
    }

    # Motor WSL antiguo, expuesto solo en loopback (no necesita Docker Desktop).
    if (Test-Tcp '127.0.0.1' 2375) {
        $env:DOCKER_HOST = 'tcp://127.0.0.1:2375'
        $cli = & $probe
        if ($cli) {
            return @{ Ok = $true; Path = $cli; Detail = 'motor WSL en 127.0.0.1:2375' }
        }
        Remove-Item Env:DOCKER_HOST -ErrorAction SilentlyContinue
    }

    $desktop = Find-DockerDesktop $DockerDesktopPath
    if (-not $desktop) {
        # Puede estar instalado por-usuario en el perfil de otra cuenta.
        $elsewhere = $null
        foreach ($profile in (Get-ChildItem 'C:\Users' -Directory -ErrorAction SilentlyContinue)) {
            $candidate = Join-Path $profile.FullName 'AppData\Local\Docker\Docker Desktop.exe'
            if (Test-Path -LiteralPath $candidate) { $elsewhere = $candidate; break }
        }
        if ($elsewhere) {
            return @{ Ok = $false; Path = $clis[0]; Detail = "Docker Desktop esta instalado en el perfil de otra cuenta: $elsewhere. Ejecute el lanzador con esa cuenta, instalele Docker Desktop a esta, o pase -DockerDesktopPath" }
        }
        return @{ Ok = $false; Path = $clis[0]; Detail = 'motor apagado y no se encontro Docker Desktop (se reviso Program Files, LOCALAPPDATA y el registro); indique la ruta con -DockerDesktopPath' }
    }
    if (-not $StartIfNeeded) {
        return @{ Ok = $false; Path = $clis[0]; Detail = 'Docker Desktop no responde para esta cuenta (puede estar detenido o abierto en otra sesion de Windows)' }
    }

    # Se lanza siempre: si ya esta abierto para ESTE usuario no pasa nada, y si
    # esta abierto en la sesion de OTRA cuenta (cada usuario tiene su propia
    # instancia) asi se inicia la de esta cuenta.
    Write-Host 'Iniciando Docker Desktop para este usuario (puede tardar un minuto)...'
    try {
        Start-Process -FilePath $desktop | Out-Null
    } catch {
        return @{ Ok = $false; Path = $clis[0]; Detail = "no se pudo iniciar Docker Desktop: $($_.Exception.Message)" }
    }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $cli = & $probe
        if ($cli) {
            return @{ Ok = $true; Path = $cli; Detail = 'Docker Desktop iniciado' }
        }
        Start-Sleep -Seconds 3
    }
    return @{ Ok = $false; Path = $clis[0]; Detail = "Docker Desktop no respondio en $TimeoutSeconds s; revise la ventana (licencia/login) o pruebe -DockerTimeoutSeconds 300. Si usa el motor WSL viejo: wsl -d Ubuntu -u root -- systemctl start docker" }
}

function Save-DockerEnvironment([string]$Cli) {
    # Solo se guarda lo que hace falta para que `node dev.js` funcione en una
    # ventana nueva: la carpeta del CLI y, si aplica, la API del motor WSL.
    $changes = @()
    try {
        $directory = Split-Path $Cli -Parent
        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        $entries = @()
        if ($userPath) { $entries = @($userPath -split ';' | Where-Object { $_ }) }
        if ($entries -notcontains $directory) {
            [Environment]::SetEnvironmentVariable('Path', (($entries + $directory) -join ';'), 'User')
            $changes += "PATH del usuario += $directory"
        }

        $userHost = [Environment]::GetEnvironmentVariable('DOCKER_HOST', 'User')
        if ($env:DOCKER_HOST) {
            if ($userHost -ne $env:DOCKER_HOST) {
                [Environment]::SetEnvironmentVariable('DOCKER_HOST', $env:DOCKER_HOST, 'User')
                $changes += "DOCKER_HOST = $env:DOCKER_HOST"
            }
        } elseif ($userHost) {
            # Motor local (Docker Desktop): cualquier DOCKER_HOST persistente
            # solo estorba a `node dev.js` en ventanas nuevas.
            [Environment]::SetEnvironmentVariable('DOCKER_HOST', $null, 'User')
            $changes += "DOCKER_HOST del usuario eliminado ($userHost)"
        }
    } catch {
        Write-Host "Aviso: no se pudo guardar la configuracion de Docker para el usuario: $($_.Exception.Message)" -ForegroundColor Yellow
        return
    }
    if ($changes.Count) {
        Write-Host 'Docker configurado para este usuario (aplica a ventanas nuevas):'
        foreach ($change in $changes) { Write-Host "  $change" }
    } else {
        Write-Host 'Docker ya estaba configurado para este usuario.'
    }
}

function Get-SelectedApps {
    $list = @()
    foreach ($item in ($Apps -split '[,; ]+')) {
        $name = $item.Trim().ToLowerInvariant()
        if (-not $name) { continue }
        if (-not $AppPorts.Contains($name)) {
            throw "Servicio desconocido: '$name'. Use: $($AppPorts.Keys -join ', ')."
        }
        if ($list -notcontains $name) { $list += $name }
    }
    if (-not $list) { throw 'Indique al menos un servicio en -Apps.' }
    return $list
}

# El CRM toma la configuracion de dos archivos que no estan versionados; en un
# equipo nuevo el backend no arranca sin ellos.
function Initialize-EnvFiles {
    $backendEnv = Join-Path $root 'backend\.env.development.local'
    $webEnv = Join-Path $root 'interface web\.env'
    if (-not (Test-Path $backendEnv)) {
        $secret = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
        $customer = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
        $content = @(
            'NODE_ENV=development'
            'PORT=3100'
            'BACKEND_PORT=3100'
            'DATABASE_URL=postgresql://postgres:postgres@localhost:5437/crm'
            'DB_SSL=false'
            "JWT_SECRET=$secret"
            'JWT_EXPIRES_IN=7d'
            'REFRESH_TOKEN_EXPIRES_IN=30d'
            "CUSTOMER_JWT_SECRET=$customer"
            'CUSTOMER_JWT_EXPIRES_IN=7d'
            'CUSTOMER_JWT_REFRESH_EXPIRES_IN=30d'
            'CORS_ORIGIN=http://localhost:8444,http://127.0.0.1:8444'
            'CORS_CREDENTIALS=true'
            'ADMIN_PASSWORD=admin123'
            'CUSTOMER_PASSWORD=cliente123'
        ) -join "`r`n"
        [IO.File]::WriteAllText($backendEnv, $content + "`r`n", (New-Object Text.UTF8Encoding($false)))
        Write-Host 'Aviso: se creo backend\.env.development.local con secretos nuevos.'
        Write-Host '       Complete alli las integraciones opcionales (Cloudinary, pagos, Google, IA).'
    }
    if (-not (Test-Path $webEnv)) {
        [IO.File]::WriteAllText($webEnv, "VITE_API_URL=http://localhost:3100`r`n", (New-Object Text.UTF8Encoding($false)))
        Write-Host 'Aviso: se creo interface web\.env apuntando al API local.'
    }
}

try {
    if (-not (Test-Path -LiteralPath $devJs)) {
        throw 'Debe copiar el proyecto completo: dev.js junto a esta carpeta deployment.'
    }
    $nodeInfo = Resolve-Node
    $node = $nodeInfo.Path
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    $selected = Get-SelectedApps
    $docker = Resolve-Docker -StartIfNeeded:(-not ($Check -or $Stop)) -TimeoutSeconds $DockerTimeoutSeconds
    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($python -and $python.Source -match 'WindowsApps') { $python = $null }

    if ($Stop) {
        Push-Location $root
        try { & $node $devJs --stop; $null = $LASTEXITCODE } finally { Pop-Location }
        Write-Host 'Servicios detenidos (incluye las PostgreSQL del CRM).'
        exit 0
    }

    if ($Check) {
        Write-Host "Proyecto   : $root"
        Write-Host "Node       : $($nodeInfo.Version)"
        Write-Host "pnpm       : $(if ($pnpm) { $pnpm.Source } else { 'no instalado (dev.js usara npm)' })"
        Write-Host "Python     : $(if ($python) { $python.Source } else { 'no instalado (ia y ML no arrancaran)' })"
        Write-Host "Docker     : $(if ($docker.Ok) { "motor OK ($($docker.Detail))" } else { "NO disponible ($($docker.Detail))" })"
        Write-Host "backend\.env.development.local : $(Test-Path (Join-Path $root 'backend\.env.development.local'))"
        Write-Host "interface web\.env             : $(Test-Path (Join-Path $root 'interface web\.env'))"
        Write-Host 'Servicios y puertos:'
        foreach ($app in $selected) {
            foreach ($port in $AppPorts[$app]) {
                $state = if (Test-Tcp '127.0.0.1' $port) { 'ocupado' } else { 'libre' }
                Write-Host ("  {0,-12} {1,5}  {2}" -f $app, $port, $state)
            }
        }
        Write-Host 'Diagnostico finalizado; no se instalo nada ni se iniciaron procesos.'
        exit 0
    }

    if (($selected -contains 'db') -and -not $docker.Ok) {
        throw "Docker no esta disponible: $($docker.Detail). Abra Docker Desktop, complete los avisos (licencia, WSL o login) y ejecute de nuevo este lanzador."
    }
    if ($docker.Ok -and -not $NoPersist) { Save-DockerEnvironment $docker.Path }

    if ($BackupDb) {
        if (-not $docker.Ok) { throw "Docker no esta disponible: $($docker.Detail)." }
        Write-Host 'Respaldando la base de datos operativa (crm)...'
        Push-Location $root
        try { & $node $devJs --backup-db; $code = $LASTEXITCODE } finally { Pop-Location }
        exit $code
    }
    if ($RestoreDb) {
        if (-not $docker.Ok) { throw "Docker no esta disponible: $($docker.Detail)." }
        Write-Host 'Restaurando la base de datos operativa (crm) desde el respaldo (pg_restore --clean)...'
        Push-Location $root
        try { & $node $devJs --restore-db; $code = $LASTEXITCODE } finally { Pop-Location }
        if ($code -ne 0) {
            Write-Host "La restauracion fallo (codigo $code). Revise la salida anterior." -ForegroundColor Red
            exit $code
        }
    }

    if (($selected -contains 'ia') -and -not $python) {
        Write-Host 'Aviso: Python no esta instalado; el servicio ia no arrancara (el resto si).' -ForegroundColor Yellow
    }
    if (($selected -contains 'db') -and $docker.Ok) {
        $previous = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $names = & $docker.Path ps -a --filter 'name=crm_postgres' --format '{{.Names}}' 2>$null
        } finally { $ErrorActionPreference = $previous }
        if (-not (@($names) -contains 'crm_postgres') -and -not $Init) {
            Write-Host 'Aviso: este motor no tiene crm_postgres (volumen nuevo). Se crea vacia.' -ForegroundColor Yellow
            Write-Host '       Si el panel sale sin datos, primero levante el ecommerce y luego: node dev.js --migrate'
            Write-Host '       (o cree solo el esquema con "pnpm db:push" dentro de backend).'
        }
    }

    Initialize-EnvFiles

    $devArgs = @($devJs)
    if ($Restore) {
        if ($selected -notcontains 'db') { throw '-Restore actua sobre la base de datos: agregue db a -Apps.' }
        $devArgs += '--restore'
    }
    if ($Init) {
        if ($selected -contains 'db' -and -not $docker.Ok) { throw "Docker no esta disponible: $($docker.Detail)." }
        Write-Host 'Modo init: instalando dependencias y dejando la base de datos lista...'
        $devArgs += '--init'
    }
    foreach ($app in $selected) { $devArgs += "--$app" }

    Push-Location $root
    try {
        & $node @devArgs
        $code = $LASTEXITCODE
    } finally { Pop-Location }
    if ($code -ne 0) { throw "dev.js termino con codigo $code. Revise los registros en $logs" }
    $started = $true

    Write-Host ''
    Write-Host 'Esperando servicios...'
    foreach ($app in $selected) {
        foreach ($port in $AppPorts[$app]) {
            Wait-Port $port (Get-PortDisplay $app $port).Label
        }
    }

    Write-Host ''
    Write-Host 'DESARROLLO ACTIVO (solo en este equipo)'
    foreach ($app in $selected) {
        foreach ($port in $AppPorts[$app]) {
            $display = Get-PortDisplay $app $port
            Write-Host ("  {0,-30} {1}" -f $display.Label, $display.Url)
        }
    }
    Write-Host "  Registros                       $logs"
    Write-Host ''
    Write-Host 'Mantenga esta ventana abierta. Pulse Q para detener los servicios (incluye PostgreSQL).'

    $interactive = $true
    try { $null = [Console]::KeyAvailable } catch { $interactive = $false }
    $warned = $false
    while ($true) {
        $alive = 0
        foreach ($app in $selected) {
            foreach ($port in $AppPorts[$app]) {
                if (Test-Tcp '127.0.0.1' $port) { $alive++ }
            }
        }
        if ($alive -eq 0 -and -not $warned) {
            Write-Host "Ningun servicio responde. Revise $logs" -ForegroundColor Yellow
            $warned = $true
        }
        if ($interactive -and [Console]::KeyAvailable) {
            if ([Console]::ReadKey($true).Key -eq 'Q') { break }
        }
        Start-Sleep -Milliseconds 700
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($started) {
        Push-Location $root
        try { & $node $devJs --stop; $null = $LASTEXITCODE } finally { Pop-Location }
        Write-Host 'Servicios detenidos.'
    }
}
