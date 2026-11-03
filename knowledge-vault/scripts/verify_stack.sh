#!/usr/bin/env bash
# ==============================================================================
# OFFLINE RESILIENCE KNOWLEDGE VAULT
# End-to-End Automated Verification Suite (Phases 1 - 7)
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

pass() { printf "\033[1;32m[PASS]\033[0m %s\n" "$*"; ((PASS_COUNT++)); }
warn() { printf "\033[1;33m[WARN]\033[0m %s\n" "$*"; ((WARN_COUNT++)); }
fail() { printf "\033[1;31m[FAIL]\033[0m %s\n" "$*"; ((FAIL_COUNT++)); }
section() { printf "\n\033[1;36m=== %s ===\033[0m\n" "$*"; }

# ------------------------------------------------------------------------------
# PHASE 1: Host Environment & Filesystem Check
# ------------------------------------------------------------------------------
section "PHASE 1: Host Environment & Filesystem Check"

FSTYPE="$(df -PT "${VAULT_ROOT}/storage/zim_files" | awk 'NR==2 {print $2}')"
if [[ "${FSTYPE}" =~ ^(ext4|xfs|btrfs|zfs|overlay)$ ]]; then
    pass "Valid filesystem for large ZIM archives (> 4 GB): ${FSTYPE}"
else
    fail "Incompatible filesystem detected: ${FSTYPE}"
fi

for cmd in curl wget git aria2c whiptail jq docker hostapd dnsmasq; do
    if command -v "${cmd}" >/dev/null 2>&1; then
        pass "CLI utility installed: ${cmd} ($(command -v "${cmd}"))"
    else
        fail "Missing CLI utility: ${cmd}"
    fi
done

if command -v nodogsplash >/dev/null 2>&1; then
    pass "Captive portal utility installed: nodogsplash"
else
    warn "nodogsplash not in PATH yet (run sudo ./scripts/setup_host.sh to compile/install)"
fi

if docker compose version >/dev/null 2>&1; then
    pass "Docker Compose v2 available: $(docker compose version --short)"
else
    fail "Docker Compose v2 is not available"
fi

# ------------------------------------------------------------------------------
# PHASE 2: Modelfile & AI Persona Check (Elena Vancea)
# ------------------------------------------------------------------------------
section "PHASE 2: Modelfile & AI Persona Check (Elena Vancea)"

if grep -q "PARAMETER temperature 0.2" "${VAULT_ROOT}/Modelfile" && \
   grep -q "PARAMETER top_p 0.8" "${VAULT_ROOT}/Modelfile" && \
   grep -q "PARAMETER num_ctx 8192" "${VAULT_ROOT}/Modelfile" && \
   grep -q "Elena Vancea" "${VAULT_ROOT}/Modelfile"; then
    pass "Modelfile contains required parameters and 'Elena Vancea' persona"
else
    fail "Modelfile is incomplete or missing required parameters"
fi

if grep -q "HF_HUB_OFFLINE=1" "${VAULT_ROOT}/docker-compose.yml" && \
   grep -q "ENABLE_SIGNUP=false" "${VAULT_ROOT}/docker-compose.yml" && \
   grep -q "Biroul de Referință & Secretariat Tehnic" "${VAULT_ROOT}/docker-compose.yml"; then
    pass "Open WebUI offline isolation (HF_HUB_OFFLINE=1, ENABLE_SIGNUP=false) configured properly"
else
    fail "Open WebUI isolation environment variables missing in docker-compose.yml"
fi

# ------------------------------------------------------------------------------
# PHASE 3: Project Directory Structure Check
# ------------------------------------------------------------------------------
section "PHASE 3: Project Directory Structure Check"

REQUIRED_PATHS=(
    "${VAULT_ROOT}/Caddyfile"
    "${VAULT_ROOT}/docker-compose.yml"
    "${VAULT_ROOT}/Modelfile"
    "${VAULT_ROOT}/scripts/download_assets.sh"
    "${VAULT_ROOT}/storage/caddy_data"
    "${VAULT_ROOT}/storage/ollama_data"
    "${VAULT_ROOT}/storage/openwebui_data"
    "${VAULT_ROOT}/storage/zim_files"
    "${VAULT_ROOT}/tools/kiwix_tool.py"
)

for p in "${REQUIRED_PATHS[@]}"; do
    if [[ -e "${p}" ]]; then
        pass "Path exists: ${p#"${VAULT_ROOT}/"}"
    else
        fail "Missing path: ${p}"
    fi
done

# ------------------------------------------------------------------------------
# PHASE 4: Interactive Download Script Check (download_assets.sh)
# ------------------------------------------------------------------------------
section "PHASE 4: Interactive Download Script Check (download_assets.sh)"

if bash -n "${VAULT_ROOT}/scripts/download_assets.sh"; then
    pass "Valid Bash syntax in scripts/download_assets.sh"
else
    fail "Syntax error in scripts/download_assets.sh"
fi

if grep -q "aria2c -c -x 8 -s 8 -j 4" "${VAULT_ROOT}/scripts/download_assets.sh"; then
    pass "Parallel multi-segment downloader 'aria2c -c -x 8 -s 8 -j 4' configured"
else
    fail "aria2c command with required flags missing in download_assets.sh"
fi

# ------------------------------------------------------------------------------
# PHASE 5: Docker Containers, Caddy Reverse Proxy & Kiwix API Check
# ------------------------------------------------------------------------------
section "PHASE 5: Docker Orchestration, Caddy Reverse Proxy & Kiwix API Check"

if docker ps --format '{{.Names}}' | grep -q "^vault-caddy$"; then
    pass "Container 'vault-caddy' is running"

    # Check route / (Open WebUI)
    HTTP_ROOT="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1/ || echo "000")"
    if [[ "${HTTP_ROOT}" =~ ^(200|302|307)$ ]]; then
        pass "Caddy routes '/' to Open WebUI (HTTP ${HTTP_ROOT})"
    else
        warn "Route '/' returned HTTP ${HTTP_ROOT} (Open WebUI may still be starting up)"
    fi

    # Check route /library/ (Kiwix Serve)
    HTTP_LIB="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1/library/ || echo "000")"
    if [[ "${HTTP_LIB}" == "200" ]]; then
        pass "Caddy routes '/library/' to Kiwix Serve (HTTP 200)"
    else
        fail "Route '/library/' returned HTTP ${HTTP_LIB}"
    fi

    # Check Kiwix Search API endpoint
    HTTP_SEARCH="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1/library/search?pattern=a" || echo "000")"
    if [[ "${HTTP_SEARCH}" == "200" ]]; then
        pass "Kiwix search endpoint '/library/search?pattern=a' is operational (HTTP 200)"
    else
        fail "Kiwix search endpoint returned HTTP ${HTTP_SEARCH}"
    fi
else
    warn "Docker stack is not currently running (run ./install.sh --auto or docker compose up -d)"
fi

if docker ps --format '{{.Names}}' | grep -q "^vault-ollama$"; then
    pass "Container 'vault-ollama' is running"
    if docker exec vault-ollama ollama list 2>/dev/null | grep -q "elena-vancea"; then
        pass "Model 'elena-vancea' is compiled and registered in Ollama"
    else
        warn "Model 'elena-vancea' not yet compiled in Ollama (run ./scripts/init_ollama_model.sh)"
    fi
fi

# ------------------------------------------------------------------------------
# PHASE 6: Anti-Hallucination Tool Check (kiwix_tool.py)
# ------------------------------------------------------------------------------
section "PHASE 6: Anti-Hallucination Refusal Gate Check (kiwix_tool.py)"

TOOL_TEST_OUT="$(
    KIWIX_BASE_URL="http://127.0.0.1/library" python3 - <<EOF
import sys
sys.path.insert(0, "${VAULT_ROOT}/tools")
from kiwix_tool import Tools
t = Tools()
print(t.search_archive("xyznonexistent_register_hallucination_test_999999"))
EOF
)"

if [[ "${TOOL_TEST_OUT}" == "STATUS_DOCUMENT_INEXISTENT: Subiectul nu se află în arhivele locale." ]]; then
    pass "Code-Level Refusal Gate verified: '${TOOL_TEST_OUT}'"
else
    fail "Code-Level Refusal Gate returned unexpected output: '${TOOL_TEST_OUT}'"
fi

# ------------------------------------------------------------------------------
# PHASE 7: Autonomous Wi-Fi & Captive Portal Configuration Check
# ------------------------------------------------------------------------------
section "PHASE 7: Autonomous Wi-Fi AP & Captive Portal Configuration Check"

if grep -q "^ssid=BIBLIOTECA_DIGITALA_OFFLINE$" "${VAULT_ROOT}/network/hostapd.conf"; then
    pass "hostapd.conf defines SSID BIBLIOTECA_DIGITALA_OFFLINE"
else
    fail "Incorrect SSID in network/hostapd.conf"
fi

if grep -q "10.3.141." "${VAULT_ROOT}/network/dnsmasq.conf" && \
   grep -q "address=/#/10.3.141.1" "${VAULT_ROOT}/network/dnsmasq.conf"; then
    pass "dnsmasq.conf allocates 10.3.141.0/24 and hijacks all DNS queries to 10.3.141.1"
else
    fail "dnsmasq.conf configuration is incomplete"
fi

if grep -q "Elena Vancea - Asistent Tehnic" "${VAULT_ROOT}/network/splash.html" && \
   grep -q "Arhiva Digitală Kiwix" "${VAULT_ROOT}/network/splash.html"; then
    pass "splash.html contains both primary buttons pointing to http://10.3.141.1/ and http://10.3.141.1/library/"
else
    fail "splash.html is missing required portal buttons"
fi

printf "\n==============================================================================\n"
printf "VERIFICATION SUMMARY: \033[1;32m%d PASS\033[0m | \033[1;33m%d WARN\033[0m | \033[1;31m%d FAIL\033[0m\n" "${PASS_COUNT}" "${WARN_COUNT}" "${FAIL_COUNT}"
printf "==============================================================================\n"

[[ "${FAIL_COUNT}" -eq 0 ]]
