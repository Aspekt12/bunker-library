#!/usr/bin/env bash
# ==============================================================================
# OFFLINE RESILIENCE KNOWLEDGE VAULT
# PHASE 1: Host OS Preparation (Debian 12 / Ubuntu 22.04+ / Kali)
# ==============================================================================
set -euo pipefail

REAL_SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "${REAL_SCRIPT_PATH}")" && pwd)"
VAULT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ZIM_DIR="${VAULT_ROOT}/storage/zim_files"
TARGET_USER="${SUDO_USER:-${USER:-$(id -un)}}"

log_info()  { printf "\033[1;34m[HOST-INFO]\033[0m %s\n" "$*"; }
log_ok()    { printf "\033[1;32m[HOST-OK]\033[0m   %s\n" "$*"; }
log_warn()  { printf "\033[1;33m[HOST-WARN]\033[0m %s\n" "$*"; }
log_error() { printf "\033[1;31m[HOST-ERR]\033[0m  %s\n" "$*" >&2; }

mkdir -p "${ZIM_DIR}"

# ------------------------------------------------------------------------------
# 1. Verify Filesystem Type (ext4, XFS, or Btrfs required; FAT32 forbidden)
# ------------------------------------------------------------------------------
verify_filesystem() {
    local fstype mount_point avail_gb
    fstype="$(df -PT "${ZIM_DIR}" | awk 'NR==2 {print $2}')"
    mount_point="$(df -PT "${ZIM_DIR}" | awk 'NR==2 {print $7}')"
    avail_gb="$(df -PBG "${ZIM_DIR}" | awk 'NR==2 {gsub("G","",$4); print $4}')"

    log_info "Checking filesystem on ${mount_point} (detected: ${fstype}, free: ${avail_gb} GB)..."

    case "${fstype}" in
        ext4|xfs|btrfs|zfs|overlay)
            log_ok "Filesystem '${fstype}' supports large ZIM archives (> 4 GB)."
            ;;
        vfat|fat|fat32|exfat|msdos)
            log_error "Filesystem '${fstype}' is FORBIDDEN (4 GB/file limit on FAT32). Format partition as ext4, XFS, or Btrfs!"
            exit 1
            ;;
        *)
            log_warn "Filesystem '${fstype}' is non-standard (not ext4/xfs/btrfs), but not FAT32. Proceeding."
            ;;
    esac
}

# ------------------------------------------------------------------------------
# 2. Install CLI Utilities, Docker Engine, and Autonomous Network Packages
# ------------------------------------------------------------------------------
install_packages() {
    if [[ "${EUID}" -ne 0 ]]; then
        log_info "Elevating privileges via sudo to install system packages..."
        exec sudo TARGET_USER="${TARGET_USER}" bash "$0" "$@"
    fi

    export DEBIAN_FRONTEND=noninteractive
    log_info "Updating APT package index..."
    apt-get update -qq

    log_info "Installing CLI utilities (curl, wget, git, aria2, whiptail, jq, sqlite3, python3) and network services..."
    apt-get install -y -qq \
        curl wget git aria2 whiptail jq sqlite3 python3 \
        ca-certificates gnupg lsb-release \
        hostapd dnsmasq iptables iw rfkill net-tools

    # Install nodogsplash (from APT or automatic source build if missing from distro repo)
    if ! command -v nodogsplash >/dev/null 2>&1; then
        if apt-cache show nodogsplash >/dev/null 2>&1; then
            log_info "Installing nodogsplash from APT repository..."
            apt-get install -y -qq nodogsplash
        else
            log_info "Package 'nodogsplash' not in current APT repo; building and installing from source..."
            apt-get install -y -qq build-essential libmicrohttpd-dev libnftables-dev libjson-c-dev debhelper pkg-config
            local tmp_nds
            tmp_nds="$(mktemp -d)"
            if git clone --depth 1 https://github.com/nodogsplash/nodogsplash.git "${tmp_nds}/nodogsplash"; then
                (make -C "${tmp_nds}/nodogsplash" || make -C "${tmp_nds}/nodogsplash" WITH_NFTABLES_SUPPORT=0) && \
                make -C "${tmp_nds}/nodogsplash" install
                log_ok "nodogsplash compiled and installed successfully."
            else
                log_warn "Could not clone nodogsplash from GitHub; captive portal will rely on dnsmasq wildcard DNS + Caddy."
            fi
            rm -rf "${tmp_nds}"
        fi
    else
        log_ok "nodogsplash is already installed."
    fi

    # Install Docker Engine & Docker Compose Plugin (v2+) if not already installed
    if ! command -v docker >/dev/null 2>&1; then
        log_info "Installing Docker Engine and Docker Compose Plugin..."
        apt-get install -y -qq docker.io docker-compose-plugin || apt-get install -y -qq docker.io docker-compose-v2
    else
        log_ok "Docker is already installed ($(docker --version))."
    fi

    systemctl enable --now docker >/dev/null 2>&1 || true

    # Add current user to the docker group
    if id "${TARGET_USER}" >/dev/null 2>&1; then
        usermod -aG docker "${TARGET_USER}"
        log_ok "User '${TARGET_USER}' added to the 'docker' group."
    fi

    # Keep AP services stopped in background until the user explicitly switches to Air-Gapped AP Mode
    systemctl stop nodogsplash >/dev/null 2>&1 || true
    systemctl stop hostapd >/dev/null 2>&1 || true
    systemctl stop dnsmasq >/dev/null 2>&1 || true
    systemctl disable hostapd dnsmasq >/dev/null 2>&1 || true

    # Stage configuration files into /etc/ without interrupting active Wi-Fi connection
    bash "${SCRIPT_DIR}/network_ap_control.sh" --install-configs

    chown -R "${TARGET_USER}:${TARGET_USER}" "${VAULT_ROOT}/storage" || true
    log_ok "Phase 1 (Host OS preparation) completed successfully!"
}

verify_filesystem
install_packages "$@"
