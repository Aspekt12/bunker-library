#!/usr/bin/env bash
# ==============================================================================
# OFFLINE RESILIENCE KNOWLEDGE VAULT
# PHASE 4: Interactive Selective Archive Downloader (download_assets.sh)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ZIM_DIR="${VAULT_ROOT}/storage/zim_files"
RAW_MIRROR_DIR="${ZIM_DIR}/raw_mirrors"
ARIA2_URL_LIST="${ZIM_DIR}/.aria2_download_queue.txt"

KIWIX_BASE="https://download.kiwix.org/zim"

mkdir -p "${ZIM_DIR}" "${RAW_MIRROR_DIR}"

log_info()  { printf "\033[1;34m[INFO]\033[0m %s\n" "$*"; }
log_ok()    { printf "\033[1;32m[OK]\033[0m   %s\n" "$*"; }
log_warn()  { printf "\033[1;33m[WARN]\033[0m %s\n" "$*"; }
log_error() { printf "\033[1;31m[ERR]\033[0m  %s\n" "$*" >&2; }

# ------------------------------------------------------------------------------
# 1. Verify filesystem type and free disk space on storage/zim_files/
# ------------------------------------------------------------------------------
check_storage_status() {
    local fstype avail_gb total_gb mount_point
    fstype="$(df -PT "${ZIM_DIR}" | awk 'NR==2 {print $2}')"
    avail_gb="$(df -PBG "${ZIM_DIR}" | awk 'NR==2 {gsub("G","",$4); print $4}')"
    total_gb="$(df -PBG "${ZIM_DIR}" | awk 'NR==2 {gsub("G","",$2); print $2}')"
    mount_point="$(df -PT "${ZIM_DIR}" | awk 'NR==2 {print $7}')"

    case "${fstype}" in
        vfat|fat|fat32|msdos)
            log_error "Partition ${mount_point} uses ${fstype} (4 GB/file limit). Use ext4, XFS, or Btrfs!"
            exit 1
            ;;
    esac

    echo "${avail_gb} GB free of ${total_gb} GB (FS: ${fstype} on ${mount_point})"
}

# ------------------------------------------------------------------------------
# 2. Dynamically resolve the latest ZIM file URL from a Kiwix category directory
# ------------------------------------------------------------------------------
resolve_latest_zim() {
    local category="$1"
    local prefix_regex="$2"
    local dir_url="${KIWIX_BASE}/${category}/"

    local latest_file
    latest_file="$(
        curl -fsSL --max-time 20 "${dir_url}" 2>/dev/null \
        | grep -oE "${prefix_regex}_[0-9]{4}-[0-9]{2}\.zim" \
        | sort -V \
        | tail -n 1 || true
    )"

    if [[ -n "${latest_file}" ]]; then
        echo "${dir_url}${latest_file}"
    else
        return 1
    fi
}

enqueue_zim_url() {
    local url="$1"
    local label="$2"
    if [[ -n "${url}" ]]; then
        log_info "Queued for aria2c [${label}]: ${url}"
        echo "${url}" >> "${ARIA2_URL_LIST}"
    else
        log_warn "Could not automatically resolve latest URL for: ${label}"
    fi
}

# ------------------------------------------------------------------------------
# 3. Download a minimal seed ZIM file so kiwix-serve can start immediately
# ------------------------------------------------------------------------------
ensure_seed_zim() {
    shopt -s nullglob
    local existing_zims=("${ZIM_DIR}"/*.zim)
    shopt -u nullglob

    if [[ ${#existing_zims[@]} -gt 0 ]]; then
        log_ok "Found ${#existing_zims[@]} existing ZIM file(s) in ${ZIM_DIR}."
        return 0
    fi

    log_info "No .zim files detected in ${ZIM_DIR}. Downloading a lightweight seed ZIM archive to initialize Kiwix..."
    local seed_url=""
    seed_url="$(
        curl -fsSL --max-time 15 "${KIWIX_BASE}/stack_exchange/" 2>/dev/null \
        | grep -oE 'devops\.stackexchange\.com_en_all_[0-9]{4}-[0-9]{2}\.zim|unix\.meta\.stackexchange\.com_en_all_[0-9]{4}-[0-9]{2}\.zim' \
        | sort -V \
        | tail -n 1 || true
    )"

    if [[ -n "${seed_url}" ]]; then
        aria2c -c -x 8 -s 8 -j 4 --dir="${ZIM_DIR}" "${KIWIX_BASE}/stack_exchange/${seed_url}" || true
    fi

    # Fallback to a small Wikipedia ZIM if stack_exchange directory is unreachable
    shopt -s nullglob
    existing_zims=("${ZIM_DIR}"/*.zim)
    shopt -u nullglob
    if [[ ${#existing_zims[@]} -eq 0 ]]; then
        local fallback_zim
        fallback_zim="$(
            curl -fsSL --max-time 15 "${KIWIX_BASE}/wikipedia/" 2>/dev/null \
            | grep -oE 'wikipedia_en_ray_charles_maxi_[0-9]{4}-[0-9]{2}\.zim|wikipedia_ro_all_mini_[0-9]{4}-[0-9]{2}\.zim' \
            | head -n 1 || true
        )"
        if [[ -n "${fallback_zim}" ]]; then
            aria2c -c -x 8 -s 8 -j 4 --dir="${ZIM_DIR}" "${KIWIX_BASE}/wikipedia/${fallback_zim}" || true
        fi
    fi
}

# ------------------------------------------------------------------------------
# 4. Low-Level: syscall.sh (JSON API for x64, x86, arm64, arm, riscv64 + zimit ZIM)
# ------------------------------------------------------------------------------
download_and_package_syscalls() {
    local syscall_dir="${RAW_MIRROR_DIR}/syscall_sh"
    mkdir -p "${syscall_dir}/api"
    log_info "Downloading syscall.sh JSON tables (x64, x86, arm64, arm, riscv64)..."

    local archs=("x64" "x86" "arm64" "arm" "riscv64")
    for arch in "${archs[@]}"; do
        local api_url="https://api.syscall.sh/v1/syscalls/${arch}"
        local out_json="${syscall_dir}/api/syscalls_${arch}.json"
        log_info " -> Architecture ${arch}: ${api_url}"
        if ! curl -fsSL --retry 3 --max-time 30 "${api_url}" -o "${out_json}" 2>/dev/null; then
            curl -fsSL --retry 3 --max-time 30 "https://syscall.sh/" -o "${syscall_dir}/index_raw.html" 2>/dev/null || true
            printf '[{"arch":"%s","note":"Offline local syscall.sh mirror"}]\n' "${arch}" > "${out_json}"
        fi
    done

    # Generate a unified static HTML index for local browsing and ZIM packaging
    cat > "${syscall_dir}/index.html" <<'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Linux Syscall Reference (x64, x86, arm64, arm, riscv64) - Local Archive</title>
<style>
body { font-family: monospace; background: #0f172a; color: #e2e8f0; margin: 2rem; }
h1, h2 { color: #38bdf8; }
table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
th, td { border: 1px solid #334155; padding: 6px 10px; text-align: left; }
th { background: #1e293b; }
</style>
</head>
<body>
<h1>Linux Syscall Reference Catalog (syscall.sh Local Mirror)</h1>
<p>Indexed architectures: x64, x86, arm64, arm, riscv64. Raw JSON tables are stored in <code>api/</code>.</p>
<ul>
  <li><a href="api/syscalls_x64.json">Syscall Table x64 (JSON)</a></li>
  <li><a href="api/syscalls_x86.json">Syscall Table x86 (JSON)</a></li>
  <li><a href="api/syscalls_arm64.json">Syscall Table arm64 (JSON)</a></li>
  <li><a href="api/syscalls_arm.json">Syscall Table arm (JSON)</a></li>
  <li><a href="api/syscalls_riscv64.json">Syscall Table riscv64 (JSON)</a></li>
</ul>
</body>
</html>
EOF

    if command -v docker >/dev/null 2>&1; then
        log_info "Packaging syscall.sh into ZIM format via ghcr.io/openzim/zimit container..."
        docker run --rm \
            -v "${ZIM_DIR}:/output" \
            ghcr.io/openzim/zimit \
            zimit --seeds "https://syscall.sh" \
                  --name "syscall_sh_local" \
                  --title "Linux Syscall Table (x64, x86, arm64, arm, riscv64)" \
                  --description "Multi-architecture Linux System Call Reference" \
                  --pageLimit 50 \
                  --output /output || log_warn "zimit container crawl did not complete; raw JSON/HTML mirror preserved in ${syscall_dir}."
    fi
    log_ok "syscall.sh archive saved in ${syscall_dir}."
}

# ------------------------------------------------------------------------------
# 5. Low-Level: Felix Cloutier x86 Manual (Clean mirror via wget/curl)
# ------------------------------------------------------------------------------
download_felix_cloutier_x86() {
    local x86_dir="${RAW_MIRROR_DIR}/felix_cloutier_x86"
    mkdir -p "${x86_dir}"
    log_info "Downloading clean mirror of Felix Cloutier x86 Manual (https://www.felixcloutier.com/x86/)..."

    wget --mirror \
         --convert-links \
         --adjust-extension \
         --page-requisites \
         --no-parent \
         --tries=3 \
         --timeout=20 \
         --directory-prefix="${x86_dir}" \
         "https://www.felixcloutier.com/x86/" || log_warn "Felix Cloutier wget mirror ended partially (can be resumed)."

    if command -v docker >/dev/null 2>&1 && [[ ! -f "${ZIM_DIR}/felix_cloutier_x86.zim" ]]; then
        log_info "Packaging Felix Cloutier x86 catalog into ZIM format..."
        docker run --rm \
            -v "${ZIM_DIR}:/output" \
            ghcr.io/openzim/zimit \
            zimit --seeds "https://www.felixcloutier.com/x86/" \
                  --name "felix_cloutier_x86" \
                  --title "Felix Cloutier x86 and amd64 Instruction Reference" \
                  --description "Intel SDM x86/x64 Instruction Set Reference" \
                  --pageLimit 1500 \
                  --output /output || log_warn "HTML mirror available in ${x86_dir}."
    fi
    log_ok "Felix Cloutier x86 manual stored in ${x86_dir}."
}

# ------------------------------------------------------------------------------
# 6. Process selected checklist items
# ------------------------------------------------------------------------------
process_selections() {
    local selections="$1"
    : > "${ARIA2_URL_LIST}"

    for item in ${selections}; do
        # Strip surrounding quotes added by whiptail
        item="${item//\"/}"
        case "${item}" in
            WIKI_RO_MAXI)
                local url
                url="$(resolve_latest_zim "wikipedia" "wikipedia_ro_all_maxi" || true)"
                enqueue_zim_url "${url}" "Romanian Wikipedia Maxi (~8 GB)"
                ;;
            WIKI_RO_NOPIC)
                local url
                url="$(resolve_latest_zim "wikipedia" "wikipedia_ro_all_nopic" || true)"
                enqueue_zim_url "${url}" "Romanian Wikipedia Nopic (~3.5 GB)"
                ;;
            WIKI_EN_MAXI)
                local url
                url="$(resolve_latest_zim "wikipedia" "wikipedia_en_all_maxi" || true)"
                enqueue_zim_url "${url}" "English Wikipedia Maxi (~111 GB)"
                ;;
            WIKI_EN_NOPIC)
                local url
                url="$(resolve_latest_zim "wikipedia" "wikipedia_en_all_nopic" || true)"
                enqueue_zim_url "${url}" "English Wikipedia Nopic (~56 GB)"
                ;;
            WIKI_TOP10_NOPIC)
                local langs=("de" "fr" "es" "it" "ru" "pt" "zh" "ja" "ar" "pl")
                for lang in "${langs[@]}"; do
                    local url
                    url="$(resolve_latest_zim "wikipedia" "wikipedia_${lang}_all_nopic" || true)"
                    enqueue_zim_url "${url}" "Wikipedia ${lang^^} Nopic"
                done
                ;;
            WIKI_ALL_NOPIC)
                log_info "Parsing Kiwix catalog via regex for ALL Wikipedia Nopic languages..."
                local all_nopic_files
                all_nopic_files="$(
                    curl -fsSL --max-time 30 "${KIWIX_BASE}/wikipedia/" \
                    | grep -oE 'wikipedia_[a-z0-9-]+_all_nopic_[0-9]{4}-[0-9]{2}\.zim' \
                    | awk '{
                        lang=$0;
                        sub(/_[0-9]{4}-[0-9]{2}\.zim$/, "", lang);
                        latest[lang]=$0
                    } END {
                        for (l in latest) print latest[l]
                    }' | sort
                )"
                while IFS= read -r zfile; do
                    [[ -n "${zfile}" ]] && echo "${KIWIX_BASE}/wikipedia/${zfile}" >> "${ARIA2_URL_LIST}"
                done <<< "${all_nopic_files}"
                log_ok "All Wikipedia Nopic archives added to download queue."
                ;;
            LOWLEVEL_SYSCALL)
                download_and_package_syscalls
                ;;
            LOWLEVEL_X86)
                download_felix_cloutier_x86
                ;;
            LOWLEVEL_OSDEV_DEVDOCS)
                local osdev_url
                osdev_url="$(resolve_latest_zim "other" "osdev_en_all_maxi|osdev_en_all" || true)"
                if [[ -z "${osdev_url}" ]]; then
                    osdev_url="$(resolve_latest_zim "zimit" "osdev" || true)"
                fi
                enqueue_zim_url "${osdev_url}" "OSDev.org Wiki ZIM (~350 MB)"

                # Enqueue core systems documentation from DevDocs
                local devdocs_files
                devdocs_files="$(
                    curl -fsSL --max-time 25 "${KIWIX_BASE}/devdocs/" 2>/dev/null \
                    | grep -oE 'devdocs_en_(c|cpp|gcc|gnu_fortran|linux|bash|python|rust|go|sqlite|docker|git|nginx|html|http|javascript)_[0-9]{4}-[0-9]{2}\.zim' \
                    | sort -u || true
                )"
                while IFS= read -r dfile; do
                    [[ -n "${dfile}" ]] && echo "${KIWIX_BASE}/devdocs/${dfile}" >> "${ARIA2_URL_LIST}"
                done <<< "${devdocs_files}"
                ;;
            TECH_SURVIVAL)
                local so_url ifixit_url wikimed_url osm_url
                so_url="$(resolve_latest_zim "stack_exchange" "stackoverflow\.com_en_all" || true)"
                ifixit_url="$(resolve_latest_zim "ifixit" "ifixit_en_all" || true)"
                wikimed_url="$(resolve_latest_zim "wikipedia" "wikipedia_en_medicine_maxi" || true)"
                osm_url="$(resolve_latest_zim "other" "openstreetmap-wiki_en_all_maxi|openstreetmap" || true)"

                enqueue_zim_url "${so_url}" "Stack Overflow ZIM (~120 GB)"
                enqueue_zim_url "${ifixit_url}" "iFixit ZIM (~4 GB)"
                enqueue_zim_url "${wikimed_url}" "WikiMed Medical ZIM (~2 GB)"
                enqueue_zim_url "${osm_url}" "OpenStreetMap Wiki ZIM (~40 GB)"
                ;;
        esac
    done

    # Deduplicate and execute parallel multi-segment download via aria2c
    if [[ -s "${ARIA2_URL_LIST}" ]]; then
        sort -u "${ARIA2_URL_LIST}" -o "${ARIA2_URL_LIST}"
        local count
        count="$(wc -l < "${ARIA2_URL_LIST}")"
        log_info "Starting parallel multi-segment download (${count} ZIM archives) with aria2c -c -x 8 -s 8 -j 4..."
        aria2c -c -x 8 -s 8 -j 4 \
               --dir="${ZIM_DIR}" \
               --input-file="${ARIA2_URL_LIST}" \
               --auto-file-renaming=false \
               --allow-overwrite=true \
               --summary-interval=10
        log_ok "All queued ZIM downloads completed in ${ZIM_DIR}!"
    else
        log_info "No direct ZIM URLs were queued for aria2c."
    fi
}

# ------------------------------------------------------------------------------
# 7. Main Entrypoint (Supports CLI flags & Interactive Whiptail Checklist)
# ------------------------------------------------------------------------------
main() {
    local storage_header
    storage_header="$(check_storage_status)"

    if [[ "${1:-}" == "--seed-minimal" ]]; then
        ensure_seed_zim
        exit 0
    elif [[ "${1:-}" == "--non-interactive" ]]; then
        shift
        process_selections "$*"
        exit 0
    fi

    if ! command -v whiptail >/dev/null 2>&1; then
        log_error "'whiptail' is not installed. Run scripts/setup_host.sh first."
        exit 1
    fi

    local choices
    choices=$(whiptail \
        --title "OFFLINE RESILIENCE KNOWLEDGE VAULT - Selective Archive Downloader" \
        --backtitle "ZIM Storage (${ZIM_DIR}): ${storage_header}" \
        --checklist "Available space: ${storage_header}\nSelect archives to download (SPACE = toggle, ENTER = confirm):" \
        22 92 10 \
        "WIKI_RO_MAXI"           "Wikipedia Romanian Maxi (with images, ~8 GB)"                      ON \
        "WIKI_RO_NOPIC"          "Wikipedia Romanian Nopic (text-only, ~3.5 GB)"                     OFF \
        "WIKI_EN_MAXI"           "Wikipedia English Maxi (full with images, ~111 GB)"                OFF \
        "WIKI_EN_NOPIC"          "Wikipedia English Nopic (text-only, ~56 GB)"                       OFF \
        "WIKI_TOP10_NOPIC"       "Top 10 Major Languages Nopic (DE, FR, ES, IT, RU etc. ~230 GB)"    OFF \
        "WIKI_ALL_NOPIC"         "All Wikipedia Languages Nopic (~500 GB - regex catalog parser)"    OFF \
        "LOWLEVEL_SYSCALL"       "Low-Level: syscall.sh (JSON x64/x86/arm64/arm/riscv64 + ZIM)"      ON \
        "LOWLEVEL_X86"           "Low-Level: Felix Cloutier x86 Manual (clean mirror + ZIM)"         OFF \
        "LOWLEVEL_OSDEV_DEVDOCS" "Low-Level: OSDev.org Wiki ZIM (~350 MB) & DevDocs Core (~4 GB)"    ON \
        "TECH_SURVIVAL"          "Technical & Survival: StackOverflow, iFixit, WikiMed, OSM"         OFF \
        3>&1 1>&2 2>&3) || {
        log_warn "Selection cancelled by user."
        exit 0
    }

    if [[ -z "${choices}" ]]; then
        log_warn "No options selected."
        exit 0
    fi

    process_selections "${choices}"
}

main "$@"
