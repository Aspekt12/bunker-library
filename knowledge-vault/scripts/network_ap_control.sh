#!/usr/bin/env bash
# ==============================================================================
# OFFLINE RESILIENCE KNOWLEDGE VAULT
# PHASE 7: Autonomous Wi-Fi Network & Captive Portal Controller
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
NET_CFG_DIR="${VAULT_ROOT}/network"

WLAN_IFACE="${WLAN_IFACE:-wlan0}"
AP_IP="10.3.141.1"
AP_CIDR="10.3.141.1/24"
AP_SUBNET="10.3.141.0/24"

log_info()  { printf "\033[1;34m[NET-INFO]\033[0m %s\n" "$*"; }
log_ok()    { printf "\033[1;32m[NET-OK]\033[0m   %s\n" "$*"; }
log_warn()  { printf "\033[1;33m[NET-WARN]\033[0m %s\n" "$*"; }
log_error() { printf "\033[1;31m[NET-ERR]\033[0m  %s\n" "$*" >&2; }

require_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        exec sudo WLAN_IFACE="${WLAN_IFACE}" bash "$0" "$@"
    fi
}

detect_wlan_iface() {
    if ip link show "${WLAN_IFACE}" >/dev/null 2>&1; then
        return 0
    fi
    local detected
    detected="$(iw dev 2>/dev/null | awk '$1=="Interface"{print $2; exit}' || true)"
    if [[ -n "${detected}" ]]; then
        WLAN_IFACE="${detected}"
        log_info "Auto-detected wireless interface: ${WLAN_IFACE}"
    else
        log_warn "Wireless interface '${WLAN_IFACE}' not detected; keeping default '${WLAN_IFACE}'."
    fi
}

install_configs() {
    require_root "--install-configs"
    detect_wlan_iface

    log_info "Installing hostapd, dnsmasq, and nodogsplash configurations into /etc/..."
    mkdir -p /etc/hostapd /etc/dnsmasq.d /etc/nodogsplash/htdocs

    # 1. hostapd configuration
    sed "s/^interface=.*/interface=${WLAN_IFACE}/" "${NET_CFG_DIR}/hostapd.conf" > /etc/hostapd/hostapd.conf
    chmod 600 /etc/hostapd/hostapd.conf
    if [[ -f /etc/default/hostapd ]]; then
        sed -i 's|^#\?DAEMON_CONF=.*|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd
    else
        echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd
    fi

    # 2. dnsmasq configuration
    sed "s/^interface=.*/interface=${WLAN_IFACE}/" "${NET_CFG_DIR}/dnsmasq.conf" > /etc/dnsmasq.d/knowledge-vault.conf

    # 3. nodogsplash configuration & captive portal splash page
    sed "s/^GatewayInterface .*/GatewayInterface ${WLAN_IFACE}/" "${NET_CFG_DIR}/nodogsplash.conf" > /etc/nodogsplash/nodogsplash.conf
    cp -f "${NET_CFG_DIR}/splash.html" /etc/nodogsplash/htdocs/splash.html

    # Unmask hostapd so it can be started on demand
    systemctl unmask hostapd >/dev/null 2>&1 || true
    log_ok "Network and Captive Portal configuration files staged in /etc/."
}

start_ap_mode() {
    require_root "--start"
    detect_wlan_iface
    install_configs

    log_info "Switching interface ${WLAN_IFACE} to Air-Gapped Access Point mode (BIBLIOTECA_DIGITALA_OFFLINE)..."

    # Release interface from NetworkManager / wpa_supplicant
    if command -v nmcli >/dev/null 2>&1; then
        nmcli device set "${WLAN_IFACE}" managed no >/dev/null 2>&1 || true
    fi
    pkill -f "wpa_supplicant.*${WLAN_IFACE}" >/dev/null 2>&1 || true
    rfkill unblock wlan >/dev/null 2>&1 || true

    # Assign static gateway IP 10.3.141.1/24 on wlan0
    ip link set "${WLAN_IFACE}" down || true
    ip addr flush dev "${WLAN_IFACE}" || true
    ip addr add "${AP_CIDR}" brd 10.3.141.255 dev "${WLAN_IFACE}"
    ip link set "${WLAN_IFACE}" up

    # Stop systemd-resolved if it is occupying port 53 needed by dnsmasq
    if systemctl is-active --quiet systemd-resolved; then
        systemctl stop systemd-resolved || true
    fi

    systemctl restart hostapd
    systemctl restart dnsmasq

    if command -v nodogsplash >/dev/null 2>&1; then
        systemctl restart nodogsplash || nodogsplash -c /etc/nodogsplash/nodogsplash.conf
    else
        log_warn "nodogsplash binary not active; HTTP port 80 traffic is served directly by Caddy + dnsmasq wildcard DNS."
    fi

    log_ok "Autonomous Wi-Fi Access Point is ACTIVE!"
    log_ok " -> SSID:               BIBLIOTECA_DIGITALA_OFFLINE"
    log_ok " -> Gateway / DNS / IP: ${AP_IP} (${AP_SUBNET})"
    log_ok " -> Elena Vancea AI:    http://${AP_IP}/"
    log_ok " -> Kiwix ZIM Library:  http://${AP_IP}/library/"
}

stop_ap_mode() {
    require_root "--stop"
    detect_wlan_iface

    log_info "Stopping Access Point mode and restoring standard Wi-Fi client mode on ${WLAN_IFACE}..."
    systemctl stop nodogsplash >/dev/null 2>&1 || pkill nodogsplash >/dev/null 2>&1 || true
    systemctl stop hostapd >/dev/null 2>&1 || true
    systemctl stop dnsmasq >/dev/null 2>&1 || true

    ip addr flush dev "${WLAN_IFACE}" || true
    if command -v nmcli >/dev/null 2>&1; then
        nmcli device set "${WLAN_IFACE}" managed yes >/dev/null 2>&1 || true
        systemctl restart NetworkManager >/dev/null 2>&1 || true
    fi

    log_ok "Interface ${WLAN_IFACE} returned to standard client mode (NetworkManager)."
}

status_ap_mode() {
    detect_wlan_iface
    echo "=== AUTONOMOUS NETWORK STATUS (${WLAN_IFACE}) ==="
    ip -br addr show "${WLAN_IFACE}" || true
    for svc in hostapd dnsmasq nodogsplash; do
        if systemctl is-active --quiet "${svc}" 2>/dev/null; then
            echo " * ${svc}: ACTIVE"
        else
            echo " * ${svc}: INACTIVE"
        fi
    done
}

case "${1:---status}" in
    --install-configs) install_configs ;;
    --start|--enable-ap) start_ap_mode ;;
    --stop|--disable-ap) stop_ap_mode ;;
    --status) status_ap_mode ;;
    *)
        echo "Usage: $0 [--install-configs | --start | --stop | --status]"
        exit 1
        ;;
esac
