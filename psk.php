<?php
header("Content-Type: application/json");

// PSKReporter query: VHF only (50/144/222/432 MHz)
$url = "https://pskreporter.info/cgi-bin/pskquery?band=VHF&mode=ALL&hours=1&format=json";

$data = file_get_contents($url);

echo $data;
?>
