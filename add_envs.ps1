$envs = @("production", "preview")
$vars = @{
    "DATABASE_URL" = "postgresql://neondb_owner:npg_Zm0nz2XvrAik@ep-rough-star-a169wlgp-pooler.ap-southeast-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"
    "GOOGLE_SCRIPT_WEB_APP_URL" = "https://script.google.com/macros/s/AKfycbyYd3DDjYMEE60XjdkJdaGNt2ZNMb-nTpi3vrWu9zONene9_7dmN1vqRYGu2bPe9XShTQ/exec"
    "GA4_MEASUREMENT_ID" = "G-CD7QCYGST0"
    "GA4_API_SECRET" = "0GuGoEQ4TqOMNX0sME1Www"
    "GA4_PROPERTY_ID" = "530697728"
}

foreach ($var in $vars.Keys) {
    foreach ($env in $envs) {
        Write-Host "Adding $var to $env..."
        $val = $vars[$var]
        echo "" | vercel env add $var $env --value "$val" --yes
    }
}
