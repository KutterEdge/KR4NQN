<?php
header("Content-Type: application/json");

$url = "https://pskreporter.info/cgi-bin/pskquery?band=VHF&mode=ALL&hours=1&format=json";

echo file_get_contents($url);
?>
