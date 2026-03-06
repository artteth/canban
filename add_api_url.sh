#!/bin/bash

API_URL="const API_URL = 'https://script.google.com/macros/s/AKfycbwOmfbiY6qcoZtJJFyazXATEQKiVakQoFvRtVBwJbtGIFQUlhxFSiXlL89mI2_cxEg0/exec';"

for file in online/index.html online/admin.html online/dashboard.html; do
  # Find the line with "// ===== Initialization ====="
  if grep -q "// ===== Initialization =====" "$file"; then
    # Insert API_URL before it
    sed -i.bak "/\/\/ ===== Initialization =====/i\\
// ===== API Configuration =====\\
$API_URL\\
" "$file"
    rm "$file.bak"
    echo "✅ Added API URL to $file"
  else
    echo "❌ Not found '// ===== Initialization =====' in $file"
  fi
done
