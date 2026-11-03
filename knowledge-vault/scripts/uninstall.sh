#!/usr/bin/env bash
# ==============================================================================
# OFFLINE RESILIENCE KNOWLEDGE VAULT
# UNINSTALL & ENVIRONMENT RESET SCRIPT (CLEAN ENVIRONMENT FOR TESTING)
# ==============================================================================
set -euo pipefail

REAL_SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "${REAL_SCRIPT_PATH}")" && pwd)"
VAULT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log_info()  { printf "\033[1;34m[UNINSTALL]\033[0m %s\n" "$*"; }
log_ok()    { printf "\033[1;32m[CLEAN-OK]\033[0m  %s\n" "$*"; }
log_warn()  { printf "\033[1;33m[WARN]\033[0m      %s\n" "$*"; }

require_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        exec sudo bash "$0" "$@"
    fi
}

# ------------------------------------------------------------------------------
# 1. Stop and remove Docker Compose containers + vault_net bridge network
# ------------------------------------------------------------------------------
clean_docker_stack() {
    local remove_images="${1:-false}"
    log_info "Stopping and removing Docker Compose stack (vault-caddy, vault-openwebui, vault-ollama, vault-kiwix)..."

    if command -v docker >/dev/null 2>&1; then
        cd "${VAULT_ROOT}"
        if [[ "${remove_images}" == "true" ]]; then
            docker compose down --volumes --remove-orphans --rmi all 2>/dev/null || true
        else
            docker compose down --volumes --remove-orphans 2>/dev/null || true
        fi
        docker rm -f vault-caddy vault-openwebui vault-ollama vault-kiwix 2>/dev/null || true
        docker network rm vault_net 2>/dev/null || true
    fi
    log_ok "Docker stack stopped and removed."
}

# ------------------------------------------------------------------------------
# 2. Remove systemd autostart service and /etc/ AP & Captive Portal configs
# ------------------------------------------------------------------------------
clean_system_configs() {
    log_info "Restoring Wi-Fi interface to NetworkManager and cleaning up /etc/ services..."

    # Stop AP mode and return wlan0 to NetworkManager
    if [[ -x "${SCRIPT_DIR}/network_ap_control.sh" ]]; then
        bash "${SCRIPT_DIR}/network_ap_control.sh" --stop || true
    fi

    # Remove systemd unit knowledge-vault.service
    if [[ -f /etc/systemd/system/knowledge-vault.service ]]; then
        systemctl stop knowledge-vault.service 2>/dev/null || true
        systemctl disable knowledge-vault.service 2>/dev/null || true
        rm -f /etc/systemd/system/knowledge-vault.service
        systemctl daemon-reload 2>/dev/null || true
        log_ok "Systemd service 'knowledge-vault.service' removed."
    fi

    # Remove staged network configs from /etc/
    rm -f /etc/dnsmasq.d/knowledge-vault.conf
    rm -f /etc/hostapd/hostapd.conf
    rm -f /etc/nodogsplash/htdocs/splash.html

    log_ok "System configurations (/etc/hostapd, /etc/dnsmasq.d, /etc/nodogsplash) cleaned."
}

# ------------------------------------------------------------------------------
# 3. Clean persistent data in storage/ (selective or full wipe)
# ------------------------------------------------------------------------------
clean_storage_data() {
    local wipe_openwebui="${1:-true}"
    local wipe_ollama="${2:-false}"
    local wipe_zims="${3:-false}"

    # Always clean temporary Caddy data
    rm -rf "${VAULT_ROOT}/storage/caddy_data/"* "${VAULT_ROOT}/storage/caddy_data/".[!.]* 2>/dev/null || true

    if [[ "${wipe_openwebui}" == "true" ]]; then
        log_info "Removing Open WebUI database and sessions (storage/openwebui_data/)..."
        rm -rf "${VAULT_ROOT}/storage/openwebui_data/"* "${VAULT_ROOT}/storage/openwebui_data/".[!.]* 2>/dev/null || true
        log_ok "storage/openwebui_data/ reset to empty."
    fi

    if [[ "${wipe_ollama}" == "true" ]]; then
        log_info "Removing downloaded Ollama models (storage/ollama_data/)..."
        rm -rf "${VAULT_ROOT}/storage/ollama_data/"* "${VAULT_ROOT}/storage/ollama_data/".[!.]* 2>/dev/null || true
        log_ok "storage/ollama_data/ reset to empty."
    else
        log_info "Preserving Ollama model cache in storage/ollama_data/ (for faster reinstall testing)."
    fi

    if [[ "${wipe_zims}" == "true" ]]; then
        log_info "Removing ZIM archives and mirrors (storage/zim_files/)..."
        rm -rf "${VAULT_ROOT}/storage/zim_files/"* "${VAULT_ROOT}/storage/zim_files/".[!.]* 2>/dev/null || true
        log_ok "storage/zim_files/ reset to empty."
    else
        log_info "Preserving existing ZIM archives in storage/zim_files/."
    fi

    # Recreate empty directories and restore ownership
    mkdir -p "${VAULT_ROOT}/storage/"{caddy_data,ollama_data,openwebui_data,zim_files}
    local target_user="${SUDO_USER:-${USER:-$(id -un)}}"
    chown -R "${target_user}:${target_user}" "${VAULT_ROOT}/storage" 2>/dev/null || true
}

# ------------------------------------------------------------------------------
# 4. Interactive TUI Menu (Whiptail) or CLI Modes
# ------------------------------------------------------------------------------
interactive_uninstall() {
    if ! command -v whiptail >/dev/null 2>&1; then
        log_info "whiptail not available; running standard fast reset (preserving ZIMs & model cache)..."
        clean_docker_stack "false"
        clean_system_configs
        clean_storage_data "true" "false" "false"
        return 0
    fi

    local mode
    mode=$(whiptail \
        --title "OFFLINE RESILIENCE KNOWLEDGE VAULT — Uninstall & Reset Environment" \
        --backtitle "Clean Environment Utility for Testing" \
        --menu "Select the desired cleanup level:" \
        18 90 4 \
        "FAST_RESET"  "Fast Test Reset (Stop Docker/AP, wipe WebUI DB, KEEP ZIMs & Ollama cache)" \
        "FULL_RESET"  "Full 100% Reset (Wipe ALL storage/ data: WebUI DB, Ollama models & ZIMs)" \
        "DEEP_PURGE"  "Deep Purge (Full Reset + Delete all local Docker images)" \
        "CANCEL"      "Cancel" \
        3>&1 1>&2 2>&3) || exit 0

    case "${mode}" in
        FAST_RESET)
            clean_docker_stack "false"
            clean_system_configs
            clean_storage_data "true" "false" "false"
            ;;
        FULL_RESET)
            clean_docker_stack "false"
            clean_system_configs
            clean_storage_data "true" "true" "true"
            ;;
        DEEP_PURGE)
            clean_docker_stack "true"
            clean_system_configs
            clean_storage_data "true" "true" "true"
            ;;
        *)
            log_warn "Uninstall cancelled."
            exit 0
            ;;
    esac

    echo ""
    log_ok "=============================================================================="
    log_ok "ENVIRONMENT CLEANED AND READY FOR FRESH INSTALL TESTING!"
    log_ok "To run a fresh installation, execute: /home/aspekt/bunker-library/install.sh"
    log_ok "=============================================================================="
}

require_root "$@"

case "${1:-}" in
    --fast|--keep-cache)
        clean_docker_stack "false"
        clean_system_configs
        clean_storage_data "true" "false" "false"
        log_ok "Fast Reset completed (WebUI DB and services removed; ZIMs and Ollama cache kept)."
        ;;
    --full-reset|--all)
        clean_docker_stack "false"
        clean_system_configs
        clean_storage_data "true" "true" "true"
        log_ok "Full Reset completed (all storage/ data and system services removed)."
        ;;
    --deep-purge)
        clean_docker_stack "true"
        clean_system_configs
        clean_storage_data "true" "true" "true"
        log_ok "Deep Purge completed (including local Docker images)."
        ;;
    *)
        interactive_uninstall
        ;;
esac
