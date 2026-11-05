# Regenerate the PNG branding assets on Windows with built-in System.Drawing.
# The matching vector tab icon lives in public/bridge-icon-v1.svg.
Add-Type -AssemblyName System.Drawing
$assetRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public'))
function Color($hex) { [Drawing.ColorTranslator]::FromHtml($hex) }
function Brush($hex) { [Drawing.SolidBrush]::new((Color $hex)) }
function RoundedPath($x, $y, $width, $height, $radius) {
  $path = [Drawing.Drawing2D.GraphicsPath]::new()
  $path.FillMode = [Drawing.Drawing2D.FillMode]::Winding
  $diameter = 2 * $radius
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc(($x + $width - $diameter), $y, $diameter, $diameter, 270, 90)
  $path.AddArc(($x + $width - $diameter), ($y + $height - $diameter), $diameter, $diameter, 0, 90)
  $path.AddArc($x, ($y + $height - $diameter), $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}
function Card($g, $x, $y, $width, $height, $fill) {
  $path = RoundedPath $x $y $width $height 4
  $brush = Brush $fill
  $pen = [Drawing.Pen]::new((Color '#a7f3d0'), 1.2)
  $g.FillPath($brush, $path); $g.DrawPath($pen, $path)
  $path.Dispose(); $brush.Dispose(); $pen.Dispose()
}
function Suit($g, $heart, $x, $y, $scale) {
  $saved = $g.Save(); $g.TranslateTransform($x, $y); $g.ScaleTransform($scale, $scale)
  $path = [Drawing.Drawing2D.GraphicsPath]::new()
  $path.FillMode = [Drawing.Drawing2D.FillMode]::Winding
  if ($heart) {
    $path.AddBezier(0, 10, -3, 6, -13, -1, -8, -7)
    $path.AddBezier(-8, -7, -4, -12, -1, -9, 0, -6)
    $path.AddBezier(0, -6, 1, -9, 4, -12, 8, -7)
    $path.AddBezier(8, -7, 13, -1, 3, 6, 0, 10)
    $brush = Brush '#dc2626'
  } else {
    $path.AddBezier(0, -12, -4, -6, -14, -2, -10, 5)
    $path.AddBezier(-10, 5, -6, 11, -2, 9, 0, 5)
    $path.AddBezier(0, 5, 2, 9, 6, 11, 10, 5)
    $path.AddBezier(10, 5, 14, -2, 4, -6, 0, -12)
    $path.CloseFigure()
    $path.StartFigure()
    $path.AddLine(-3, 12, 3, 12); $path.AddLine(3, 12, 0, 4)
    $brush = Brush '#0f172a'
  }
  $path.CloseFigure(); $g.FillPath($brush, $path)
  $path.Dispose(); $brush.Dispose(); $g.Restore($saved)
}
function ClubIcon($g, $x, $y, $size) {
  $saved = $g.Save(); $g.TranslateTransform($x, $y); $g.ScaleTransform(($size / 64), ($size / 64))
  $path = RoundedPath 1 1 62 62 14; $brush = Brush '#064e3b'
  $g.FillPath($brush, $path); $path.Dispose(); $brush.Dispose()
  $cardState = $g.Save(); $g.TranslateTransform(24, 32); $g.RotateTransform(-14); $g.TranslateTransform(-24, -32)
  Card $g 9 10 30 43 '#f1f5f9'; Suit $g $true 22 29 .72; $g.Restore($cardState)
  $cardState = $g.Save(); $g.TranslateTransform(40, 34); $g.RotateTransform(12); $g.TranslateTransform(-40, -34)
  Card $g 25 14 28 41 '#ffffff'; Suit $g $false 39 34 .78; $g.Restore($cardState)
  $g.Restore($saved)
}
function Configure($g) {
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
}
foreach ($size in @(32, 180)) {
  $bitmap = [Drawing.Bitmap]::new($size, $size)
  $g = [Drawing.Graphics]::FromImage($bitmap); Configure $g
  $g.Clear([Drawing.Color]::Transparent); ClubIcon $g 0 0 $size
  $name = if ($size -eq 32) { 'favicon-32-v1.png' } else { 'apple-touch-icon.png' }
  $bitmap.Save((Join-Path $assetRoot $name), [Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bitmap.Dispose()
}
# Embed the small PNG in an ICO container for browsers using /favicon.ico.
$png = [IO.File]::ReadAllBytes((Join-Path $assetRoot 'favicon-32-v1.png'))
$stream = [IO.File]::Create((Join-Path $assetRoot 'favicon.ico'))
$writer = [IO.BinaryWriter]::new($stream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]32); $writer.Write([byte]32); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22)
$writer.Write($png); $writer.Dispose()

$bitmap = [Drawing.Bitmap]::new(1200, 630)
$g = [Drawing.Graphics]::FromImage($bitmap); Configure $g
$background = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Rectangle]::new(0, 0, 1200, 630), (Color '#0f172a'), (Color '#064e3b'), 22)
$g.FillRectangle($background, 0, 0, 1200, 630)
$outline = [Drawing.Pen]::new((Color '#145d4b'), 2)
$g.DrawEllipse($outline, 850, -260, 630, 630); $g.DrawEllipse($outline, 970, -150, 630, 630)
ClubIcon $g 100 180 250
$white = Brush '#ffffff'; $muted = Brush '#cbd5e1'; $mint = Brush '#6ee7b7'
$title = [Drawing.Font]::new('Segoe UI', 80, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
$subtitle = [Drawing.Font]::new('Segoe UI', 32, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$body = [Drawing.Font]::new('Segoe UI', 25, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$footer = [Drawing.Font]::new('Segoe UI', 22, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$g.DrawString('Bridge Club', $title, $white, 420, 210)
$g.DrawString('Private bridge with friends', $subtitle, $mint, 428, 315)
$g.DrawString('Play together. Review every hand.', $body, $muted, 428, 375)
$g.DrawString('bridge.si-delivery.com', $footer, $muted, 80, 540)
$bitmap.Save((Join-Path $assetRoot 'bridge-club-share-v1.png'), [Drawing.Imaging.ImageFormat]::Png)
@($background, $outline, $white, $muted, $mint, $title, $subtitle, $body, $footer, $g, $bitmap) | ForEach-Object { $_.Dispose() }
