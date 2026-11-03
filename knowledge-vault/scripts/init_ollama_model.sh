#!/usr/bin/env bash
# ==============================================================================
# OFFLINE RESILIENCE KNOWLEDGE VAULT
# PHASE 2: Ollama Model Initialization & Modelfile Compilation (Elena Vancea)
# ==============================================================================
set -euo pipefail

REAL_SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "${REAL_SCRIPT_PATH}")" && pwd)"
VAULT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODEL_PRIMARY="qwen2.5:7b-instruct-q4_K_M"
MODEL_FALLBACK="qwen2.5:3b-instruct-q4_K_M"
CUSTOM_MODEL_NAME="elena-vancea:latest"

log_info()  { printf "\033[1;34m[OLLAMA-INFO]\033[0m %s\n" "$*"; }
log_ok()    { printf "\033[1;32m[OLLAMA-OK]\033[0m   %s\n" "$*"; }
log_warn()  { printf "\033[1;33m[OLLAMA-WARN]\033[0m %s\n" "$*"; }
log_error() { printf "\033[1;31m[OLLAMA-ERR]\033[0m  %s\n" "$*" >&2; }

# Wait for the vault-ollama container daemon to become responsive
wait_for_ollama() {
    log_info "Waiting for Ollama daemon inside container 'vault-ollama'..."
    for _ in {1..30}; do
        if docker exec vault-ollama ollama list >/dev/null 2>&1; then
            log_ok "Ollama service is online."
            return 0
        fi
        sleep 2
    done
    log_error "Container 'vault-ollama' did not respond within timeout."
    exit 1
}

select_and_build_model() {
    local mode="${1:---auto}"
    local base_model="${MODEL_PRIMARY}"
    local modelfile_in_container="/root/Modelfile"

    local total_ram_mb
    total_ram_mb="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)"

    if [[ "${mode}" == "--fallback-3b" ]]; then
        base_model="${MODEL_FALLBACK}"
        modelfile_in_container="/root/Modelfile.fallback"
        log_info "Explicit 3B fallback mode selected: using ${base_model}."
    elif [[ "${mode}" == "--primary-7b" ]]; then
        base_model="${MODEL_PRIMARY}"
        modelfile_in_container="/root/Modelfile"
        log_info "Explicit 7B primary mode selected: using ${base_model}."
    else
        if [[ "${total_ram_mb}" -lt 6500 ]]; then
            log_warn "Detected system RAM (${total_ram_mb} MB < 6.5 GB). Automatically selecting fallback model ${MODEL_FALLBACK}."
            base_model="${MODEL_FALLBACK}"
            modelfile_in_container="/root/Modelfile.fallback"
        else
            log_info "Detected system RAM: ${total_ram_mb} MB. Selecting primary model ${MODEL_PRIMARY}."
        fi
    fi

    log_info "Pulling base model '${base_model}' into Ollama..."
    docker exec vault-ollama ollama pull "${base_model}"

    log_info "Compiling custom persona '${CUSTOM_MODEL_NAME}' from ${modelfile_in_container}..."
    docker exec vault-ollama ollama create "${CUSTOM_MODEL_NAME}" -f "${modelfile_in_container}"

    log_ok "Model '${CUSTOM_MODEL_NAME}' (Elena Vancea) compiled and registered successfully!"
    docker exec vault-ollama ollama list
}

wait_for_ollama
select_and_build_model "${1:---auto}"
