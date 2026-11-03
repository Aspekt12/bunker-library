#!/usr/bin/env bash
# ==============================================================================
# OFFLINE RESILIENCE KNOWLEDGE VAULT
# MASTER INSTALLER & CONTROL CENTER ("CLICK-TO-INSTALL")
# ==============================================================================
set -euo pipefail

REAL_SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
VAULT_ROOT="$(cd "$(dirname "${REAL_SCRIPT_PATH}")" && pwd)"
SCRIPTS_DIR="${VAULT_ROOT}/scripts"

log_info()  { printf "\033[1;34m[VAULT-SETUP]\033[0m %s\n" "$*"; }
log_ok()    { printf "\033[1;32m[VAULT-OK]\033[0m    %s\n" "$*"; }
log_warn()  { printf "\033[1;33m[VAULT-WARN]\033[0m  %s\n" "$*"; }

# ------------------------------------------------------------------------------
# Register systemd service for automatic startup on boot (100% autonomous)
# ------------------------------------------------------------------------------
install_systemd_autostart() {
    log_info "Configuring systemd service 'knowledge-vault.service' for automatic boot startup..."
    sudo tee /etc/systemd/system/knowledge-vault.service >/dev/null <<EOF
[Unit]
Description=Offline Resilience Knowledge Vault (Elena Vancea AI + Kiwix + Caddy)
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${VAULT_ROOT}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable knowledge-vault.service >/dev/null 2>&1 || true
    log_ok "Systemd service 'knowledge-vault.service' enabled for boot."
}

# ------------------------------------------------------------------------------
# End-to-End Automated Setup (Zero-Touch / One-Click)
# ------------------------------------------------------------------------------
run_full_setup() {
    local model_flag="${1:---auto}"

    log_info "STEP 1/6: Configuring host OS, CLI packages, Docker Engine, and AP network files..."
    sudo bash "${SCRIPTS_DIR}/setup_host.sh"

    log_info "STEP 2/6: Ensuring an initial seed ZIM archive exists in storage/zim_files/ for Kiwix..."
    bash "${SCRIPTS_DIR}/download_assets.sh" --seed-minimal

    log_info "STEP 3/6: Starting Docker Compose stack (kiwix-serve, ollama, open-webui, caddy)..."
    cd "${VAULT_ROOT}"
    sudo docker compose up -d

    log_info "STEP 4/6: Pulling quantized GGUF base model and compiling 'elena-vancea' in Ollama..."
    sudo bash "${SCRIPTS_DIR}/init_ollama_model.sh" "${model_flag}"

    log_info "STEP 5/6: Auto-provisioning Open WebUI (registering kiwix_tool.py in DB + Elena Vancea profile)..."
    sudo python3 "${SCRIPTS_DIR}/provision_openwebui.py" || true
    sudo docker restart vault-openwebui >/dev/null 2>&1 || true
    sleep 5

    log_info "STEP 6/6: Registering systemd autostart service and running verification suite..."
    install_systemd_autostart
    sudo bash "${SCRIPTS_DIR}/verify_stack.sh" || true

    echo ""
    log_ok "=============================================================================="
    log_ok "OFFLINE RESILIENCE KNOWLEDGE VAULT INSTALLATION COMPLETED!"
    log_ok " -> Elena Vancea AI (Open WebUI):  http://localhost/ (or http://10.3.141.1/)"
    log_ok " -> Kiwix ZIM Digital Library:     http://localhost/library/ (or http://10.3.141.1/library/)"
    if [[ -f "${VAULT_ROOT}/storage/openwebui_data/ADMIN_CREDENTIALS.txt" ]]; then
        cat "${VAULT_ROOT}/storage/openwebui_data/ADMIN_CREDENTIALS.txt"
    fi
    log_ok " -> To activate Air-Gapped Wi-Fi AP: sudo ${SCRIPTS_DIR}/network_ap_control.sh --start"
    log_ok "=============================================================================="
}

# ------------------------------------------------------------------------------
# Interactive TUI Menu (Click-to-Install Control Center)
# ------------------------------------------------------------------------------
interactive_menu() {
    if ! command -v whiptail >/dev/null 2>&1; then
        sudo bash "${SCRIPTS_DIR}/setup_host.sh"
    fi

    while true; do
        local choice
        choice=$(whiptail \
            --title "OFFLINE RESILIENCE KNOWLEDGE VAULT — Click-to-Install Setup" \
            --backtitle "Autonomous Air-Gapped Architecture: Elena Vancea (Qwen2.5) + Kiwix ZIM + Captive Portal" \
            --menu "Select an action below (all components are auto-configured):" \
            21 90 10 \
            "1" "FULL AUTOMATED INSTALL (Recommended - Configures Everything End-to-End)" \
            "2" "FULL INSTALL (Low-Spec Hardware - Qwen2.5 3B Fallback Model)" \
            "3" "DOWNLOAD ZIM ARCHIVES (Interactive Checklist: Wikipedia / Syscall / x86 / OSDev)" \
            "4" "START / RESTART DOCKER STACK (Kiwix + Ollama + Open WebUI + Caddy)" \
            "5" "ENABLE WI-FI ACCESS POINT MODE (SSID: BIBLIOTECA_DIGITALA_OFFLINE)" \
            "6" "DISABLE WI-FI AP MODE (Return to Internet / NetworkManager)" \
            "7" "RUN VERIFICATION SUITE (verify_stack.sh)" \
            "8" "UNINSTALL / RESET ENVIRONMENT (Clean Environment for Testing)" \
            "0" "Exit" \
            3>&1 1>&2 2>&3) || break

        case "${choice}" in
            1)
                run_full_setup "--auto"
                read -r -p "Press ENTER to return to menu..."
                ;;
            2)
                run_full_setup "--fallback-3b"
                read -r -p "Press ENTER to return to menu..."
                ;;
            3)
                bash "${SCRIPTS_DIR}/download_assets.sh"
                sudo docker restart vault-kiwix >/dev/null 2>&1 || true
                read -r -p "Press ENTER to return to menu..."
                ;;
            4)
                cd "${VAULT_ROOT}" && sudo docker compose up -d
                sudo python3 "${SCRIPTS_DIR}/provision_openwebui.py" || true
                read -r -p "Containers started and provisioned. Press ENTER..."
                ;;
            5)
                sudo bash "${SCRIPTS_DIR}/network_ap_control.sh" --start
                read -r -p "Press ENTER to return to menu..."
                ;;
            6)
                sudo bash "${SCRIPTS_DIR}/network_ap_control.sh" --stop
                read -r -p "Press ENTER to return to menu..."
                ;;
            7)
                sudo bash "${SCRIPTS_DIR}/verify_stack.sh" || true
                read -r -p "Press ENTER to return to menu..."
                ;;
            8)
                sudo bash "${SCRIPTS_DIR}/uninstall.sh"
                read -r -p "Press ENTER to return to menu..."
                ;;
            0)
                break
                ;;
        esac
    done
}

case "${1:-}" in
    --auto|--full)
        run_full_setup "${2:---auto}"
        ;;
    --uninstall|--clean)
        shift
        sudo bash "${SCRIPTS_DIR}/uninstall.sh" "$@"
        ;;
    --fast-verify)
        sudo bash "${SCRIPTS_DIR}/setup_host.sh"
        bash "${SCRIPTS_DIR}/download_assets.sh" --seed-minimal
        cd "${VAULT_ROOT}" && sudo docker compose up -d
        sudo python3 "${SCRIPTS_DIR}/provision_openwebui.py" || true
        install_systemd_autostart
        sudo bash "${SCRIPTS_DIR}/verify_stack.sh"
        ;;
    *)
        interactive_menu
        ;;
esac
