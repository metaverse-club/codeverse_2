$c = Get-Content c:\Codeverse\public\styles.css -Raw
$c = $c -replace 'width: 100vw;', 'width: 100%;'
$c = $c -replace '(?s)body\s*\{[^}]*overflow-x:\s*hidden;', "$&`n  width: 100%;"
$c = $c -replace '(?s)html\s*\{[^}]*scroll-behavior:\s*smooth;', "$&`n  overflow-x: hidden;`n  width: 100%;"
Set-Content -Path c:\Codeverse\public\styles.css -Value $c
