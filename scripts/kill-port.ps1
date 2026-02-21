$connections = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($connections) {
    $connections.OwningProcess | ForEach-Object {
        taskkill /F /PID $_ 2>$null
    }
}
