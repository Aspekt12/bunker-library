"""
Built-in starter volumes and downloadable ZIM/Knowledge Pack catalog for BunkerOS XP.
"""

from typing import Dict, List

STARTER_VOLUMES: List[Dict[str, str]] = [
    {
        "id": "vol-linux-syscalls",
        "title": "Linux Syscall Reference (x64 / x86 / ARM64)",
        "category": "Low-Level & Kernel",
        "spine_color": "#1e3a8a",
        "icon": "📘",
        "size_label": "Built-in (2.4 MB)",
        "author": "syscall.sh / Linux Kernel ABI",
        "summary": "Complete register conventions and system call numbers for Linux x86_64, i386, arm64, and riscv64.",
        "content": """# Linux System Call & ABI Reference (x86_64, i386, ARM64, RISC-V)

## 1. Calling Conventions Summary

| Architecture | Syscall instruction | Syscall # Register | Return Register | Arg 1 | Arg 2 | Arg 3 | Arg 4 | Arg 5 | Arg 6 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **x86_64** | `syscall` | `rax` | `rax` | `rdi` | `rsi` | `rdx` | `r10` | `r8` | `r9` |
| **i386 (x86)** | `int 0x80` | `eax` | `eax` | `ebx` | `ecx` | `edx` | `esi` | `edi` | `ebp` |
| **ARM64 (AArch64)** | `svc #0` | `x8` | `x0` | `x0` | `x1` | `x2` | `x3` | `x4` | `x5` |
| **RISC-V 64** | `ecall` | `a7` | `a0` | `a0` | `a1` | `a2` | `a3` | `a4` | `a5` |

> **Clobbered Registers on x86_64**: The `syscall` instruction always clobbers `rcx` (stores return RIP) and `r11` (stores RFLAGS).

---

## 2. Core x86_64 System Call Table (`arch/x86/entry/syscalls/syscall_64.tbl`)

| NR (`rax`) | Name | Signature | Registers (`rdi`, `rsi`, `rdx`, `r10`, `r8`, `r9`) |
| :--- | :--- | :--- | :--- |
| `0` | `sys_read` | `ssize_t read(int fd, void *buf, size_t count)` | `rdi=fd`, `rsi=buf`, `rdx=count` |
| `1` | `sys_write` | `ssize_t write(int fd, const void *buf, size_t count)` | `rdi=fd`, `rsi=buf`, `rdx=count` |
| `2` | `sys_open` | `int open(const char *filename, int flags, umode_t mode)` | `rdi=filename`, `rsi=flags`, `rdx=mode` |
| `3` | `sys_close` | `int close(unsigned int fd)` | `rdi=fd` |
| `9` | `sys_mmap` | `void *mmap(void *addr, size_t len, int prot, int flags, int fd, off_t off)` | `rdi=addr`, `rsi=len`, `rdx=prot`, `r10=flags`, `r8=fd`, `r9=off` |
| `10` | `sys_mprotect` | `int mprotect(unsigned long start, size_t len, unsigned long prot)` | `rdi=start`, `rsi=len`, `rdx=prot` |
| `11` | `sys_munmap` | `int munmap(unsigned long addr, size_t len)` | `rdi=addr`, `rsi=len` |
| `12` | `sys_brk` | `unsigned long brk(unsigned long brk)` | `rdi=brk` |
| `39` | `sys_getpid` | `pid_t getpid(void)` | *(none)* |
| `56` | `sys_clone` | `long clone(unsigned long flags, void *stack, int *parent_tid, int *child_tid, unsigned long tls)` | `rdi=flags`, `rsi=stack`, `rdx=parent_tid`, `r10=child_tid`, `r8=tls` |
| `57` | `sys_fork` | `pid_t fork(void)` | *(none)* |
| `59` | `sys_execve` | `int execve(const char *filename, const char *const argv[], const char *const envp[])` | `rdi=filename`, `rsi=argv`, `rdx=envp` |
| `60` | `sys_exit` | `void _exit(int error_code)` | `rdi=error_code` |
| `62` | `sys_kill` | `int kill(pid_t pid, int sig)` | `rdi=pid`, `rsi=sig` |
| `257` | `sys_openat` | `int openat(int dfd, const char *filename, int flags, umode_t mode)` | `rdi=dfd`, `rsi=filename`, `rdx=flags`, `r10=mode` |

---

## 3. Minimal x86_64 Assembly Example (`sys_write` + `sys_exit`)

```nasm
section .data
    msg db "BunkerOS XP Local Archive Verified", 10
    len equ $ - msg

section .text
    global _start

_start:
    ; sys_write(stdout=1, buf=msg, count=len)
    mov rax, 1          ; syscall number 1 (sys_write)
    mov rdi, 1          ; fd = 1 (STDOUT_FILENO)
    lea rsi, [rel msg]  ; buffer address
    mov rdx, len        ; byte count
    syscall

    ; sys_exit(status=0)
    mov rax, 60         ; syscall number 60 (sys_exit)
    xor rdi, rdi        ; exit code 0
    syscall
```
""",
    },
    {
        "id": "vol-felix-x86",
        "title": "Felix Cloutier x86 & AMD64 Instruction Manual",
        "category": "Low-Level & Kernel",
        "spine_color": "#7c2d12",
        "icon": "📕",
        "size_label": "Built-in (3.1 MB)",
        "author": "Intel SDM / Felix Cloutier",
        "summary": "Core x86-64 instructions, opcodes, flags affected, control registers (CR0-CR4), and paging structures.",
        "content": """# Intel x86 / AMD64 Instruction & Register Reference

## 1. General-Purpose Registers (64-bit Mode)

| 64-bit | 32-bit | 16-bit | 8-bit Low | Role in System V AMD64 ABI |
| :--- | :--- | :--- | :--- | :--- |
| `RAX` | `EAX` | `AX` | `AL` | Return value / Syscall number (Volatile) |
| `RBX` | `EBX` | `BX` | `BL` | Callee-saved base register (Non-volatile) |
| `RCX` | `ECX` | `CX` | `CL` | 4th integer argument / Loop counter (Volatile) |
| `RDX` | `EDX` | `DX` | `DL` | 3rd integer argument / I/O port (Volatile) |
| `RSI` | `ESI` | `SI` | `SIL` | 2nd integer argument / Source index (Volatile) |
| `RDI` | `EDI` | `DI` | `DIL` | 1st integer argument / Destination index (Volatile) |
| `RBP` | `EBP` | `BP` | `BPL` | Frame pointer (Callee-saved) |
| `RSP` | `ESP` | `SP` | `SPL` | Stack pointer (16-byte aligned before `CALL`) |
| `R8`–`R9` | `R8D`–`R9D` | `R8W`–`R9W` | `R8B`–`R9B` | 5th and 6th integer arguments (Volatile) |
| `R12`–`R15` | `R12D`–`R15D` | `R12W`–`R15W` | `R12B`–`R15B` | Callee-saved registers (Non-volatile) |

---

## 2. Essential Instructions Reference

### `MOV` — Move Data
- **Syntax**: `MOV dst, src`
- **Flags Affected**: None.
- **Notes**: Cannot move directly from memory to memory (`MOV [rax], [rbx]` is invalid). Moving a 32-bit value into a 32-bit register (`MOV EAX, 1`) automatically zero-extends the upper 32 bits of `RAX`.

### `LEA` — Load Effective Address
- **Syntax**: `LEA reg64, [base + index*scale + disp]`
- **Flags Affected**: None.
- **Usage**: Computes memory addresses or performs fast arithmetic (e.g., `LEA RAX, [RDI + RDI*4]` multiplies `RDI` by 5 in a single cycle without modifying `RFLAGS`).

### `CMP` / `TEST` — Compare & Bitwise Test
- `CMP a, b`: Computes `a - b` and sets `ZF`, `SF`, `CF`, `OF` without storing the result.
- `TEST a, b`: Computes `a & b` and sets `ZF`, `SF`, `PF` (clears `CF` and `OF`). Common idiom: `TEST RAX, RAX` to check if `RAX == 0` or negative.

### `SYSCALL` / `SYSRET` — Fast Transition to Ring 0
- `SYSCALL` loads `CS` and `SS` from `IA32_STAR` MSR, saves `RIP` into `RCX`, saves `RFLAGS` into `R11`, masks `RFLAGS` with `IA32_FMASK`, and jumps to `IA32_LSTAR` (the kernel syscall entry point).

---

## 3. Control Registers (`CR0`, `CR2`, `CR3`, `CR4`)
- **`CR0`**: Bit 0 = `PE` (Protected Mode Enable), Bit 16 = `WP` (Write Protect), Bit 31 = `PG` (Paging Enable).
- **`CR2`**: Page Fault Linear Address (holds the faulting virtual address on `#PF` exception 14).
- **`CR3`**: Page Directory Base Register (`PML4` physical base address in 4-level paging).
- **`CR4`**: Bit 5 = `PAE` (Physical Address Extension), Bit 7 = `PGE` (Page Global Enable), Bit 20 = `SMEP`, Bit 21 = `SMAP`.
""",
    },
    {
        "id": "vol-osdev-kernel",
        "title": "OSDev Bare-Metal Kernel & Bootloader Guide",
        "category": "Low-Level & Kernel",
        "spine_color": "#065f46",
        "icon": "📗",
        "size_label": "Built-in (1.9 MB)",
        "author": "OSDev.org Archive",
        "summary": "Multiboot2 headers, GDT/IDT setup, 64-bit Long Mode paging, PIC/APIC interrupts, and VGA text buffer.",
        "content": """# OSDev Bare-Metal x86_64 Kernel Engineering Guide

## 1. VGA Text Mode Buffer (`0xB8000`)
In standard 80x25 BIOS/Multiboot text mode, video memory is mapped at physical address `0xB8000`.
Each character cell is **2 bytes** (`uint16_t`):
- **Bits 0–7**: ASCII character code.
- **Bits 8–11**: Foreground color (`0x0` Black .. `0xF` White).
- **Bits 12–15**: Background color.

```c
volatile uint16_t *vga = (volatile uint16_t *)0xB8000;
vga[0] = (uint16_t)'K' | ((uint16_t)0x0A << 8); // Light Green 'K' on Black
```

---

## 2. Entering 64-Bit Long Mode (Step-by-Step)
1. **Disable Interrupts** (`cli`).
2. **Build 4-Level Page Tables** (`PML4 -> PDPT -> PD -> PT`), identity-mapping the first 2 MiB (or using 2 MiB huge pages with bit 7 `PS=1` in PD entries).
3. **Load `CR3`** with the physical address of the `PML4` table.
4. **Enable PAE** in `CR4` (`or eax, 1 << 5`).
5. **Set Long Mode Enable (`LME`, bit 8)** in the `EFER` MSR (`ECX = 0xC0000080`, `rdmsr`, `or eax, 1 << 8`, `wrmsr`).
6. **Enable Paging (`PG`, bit 31) and Protected Mode (`PE`, bit 0)** in `CR0`.
7. **Load a 64-Bit GDT** (Code segment descriptor with `L=1` bit 53 set) and perform a far jump (`jmp 0x08:long_mode_start`) to flush the instruction pipeline.

---

## 3. Interrupt Descriptor Table (IDT) in 64-Bit Mode
Each 64-bit IDT Gate Descriptor is **16 bytes** (128 bits):
- `offset_low` (16 bits): Bits 0–15 of ISR address.
- `selector` (16 bits): Kernel code segment selector (e.g., `0x08`).
- `ist` (8 bits): Interrupt Stack Table index (bits 0–2).
- `type_attributes` (8 bits): `0x8E` for 64-bit Interrupt Gate (`Present=1, DPL=00, Type=1110`), `0x8F` for Trap Gate.
- `offset_mid` (16 bits): Bits 16–31 of ISR address.
- `offset_high` (32 bits): Bits 32–63 of ISR address.
- `zero` (32 bits): Reserved (`0`).
""",
    },
    {
        "id": "vol-survival-med",
        "title": "Offline Resilience, Field Medicine & Infrastructure",
        "category": "Survival & Medical",
        "spine_color": "#92400e",
        "icon": "📙",
        "size_label": "Built-in (2.2 MB)",
        "author": "Field Resilience & Emergency Manual",
        "summary": "Water purification protocols, off-grid solar/battery sizing, radio frequencies, and emergency trauma care.",
        "content": """# Offline Resilience, Field Medicine & Autonomous Infrastructure

## 1. Emergency Water Purification Protocols
1. **Thermal Pasteurization / Boiling**:
   - Bring water to a rolling boil (`100°C / 212°F`) for **at least 1 minute** (or **3 minutes** at altitudes above 2,000 meters).
2. **Chemical Disinfection (Sodium Hypochlorite / Unscented Household Bleach)**:
   - **5%–6% NaOCl**: Add **2 drops per liter** of clear water (or **4 drops per liter** if water is cloudy/cold).
   - Stir and let stand for **30 minutes** before consumption. Water should have a faint chlorine odor.
3. **Solar Disinfection (SODIS)**:
   - Fill clean, transparent PET bottles (remove labels) with clear water (`NTU < 30`) and expose to direct sunlight on a reflective surface for **6 hours** (or **48 hours** under 50%+ cloud cover).

---

## 2. Emergency Trauma & Rehydration Protocol (WHO ORS Formula)
To prepare **1 Liter of Oral Rehydration Solution (ORS)** for severe dehydration:
- **Clean purified water**: `1.0 Liter`
- **Table salt (NaCl)**: `2.6 grams` (~1/2 level teaspoon)
- **Glucose / Sugar (Sucrose)**: `13.5 grams` (~6 level teaspoons)
- *Note*: Never exceed the salt ratio, as hypernatremia can occur.

---

## 3. Off-Grid 12V / 24V LiFePO4 Power Sizing for Bunker Server
- **Mini PC x86_64 Idle/Load Power**: `12W – 25W` average (`~480 Wh / day` at 20W continuous).
- **Battery Bank (3 Days Autonomy without Sun)**:
  - `480 Wh * 3 days / 0.85 (DOD/efficiency) = ~1,700 Wh` -> One **12.8V 150Ah LiFePO4 battery** (`1,920 Wh`).
- **Solar Array Sizing (Winter 3 Peak Sun Hours)**:
  - `480 Wh / (3 h * 0.75 system efficiency) = ~215W` -> Recommend **2x 200W (400W total) Monocrystalline Panels** with a 30A MPPT charge controller.
""",
    },
]


# Catalog of downloadable ZIM archives & Knowledge Packs shown in "Add/Remove Books"
DOWNLOAD_CATALOG: List[Dict[str, str]] = [
    {
        "id": "zim-devops-se",
        "title": "DevOps StackExchange Archive (.zim)",
        "category": "DevDocs & Engineering",
        "kiwix_category": "stack_exchange",
        "prefix_regex": r"devops\.stackexchange\.com_en_all",
        "size_label": "~38 MB (Fast Test Download)",
        "spine_color": "#0284c7",
        "icon": "💿",
        "description": "Complete Q&A archive of DevOps StackExchange: Docker, Linux servers, CI/CD, and infrastructure.",
    },
    {
        "id": "zim-unix-meta",
        "title": "Unix & Linux Meta Archive (.zim)",
        "category": "Low-Level & Kernel",
        "kiwix_category": "stack_exchange",
        "prefix_regex": r"unix\.meta\.stackexchange\.com_en_all",
        "size_label": "~14 MB (Instant Test Download)",
        "spine_color": "#0f766e",
        "icon": "💿",
        "description": "Lightweight Unix & Linux archive ideal for testing instant ZIM bookshelf population.",
    },
    {
        "id": "zim-wiki-ro-mini",
        "title": "Wikipedia Romanian Mini (.zim)",
        "category": "Encyclopedias (Wikipedia)",
        "kiwix_category": "wikipedia",
        "prefix_regex": r"wikipedia_ro_all_mini",
        "size_label": "~450 MB",
        "spine_color": "#2563eb",
        "icon": "🏛️",
        "description": "Fast summary edition of Romanian Wikipedia (all lead sections and infoboxes).",
    },
    {
        "id": "zim-wiki-ro-nopic",
        "title": "Wikipedia Romanian Nopic (.zim)",
        "category": "Encyclopedias (Wikipedia)",
        "kiwix_category": "wikipedia",
        "prefix_regex": r"wikipedia_ro_all_nopic",
        "size_label": "~3.5 GB",
        "spine_color": "#1d4ed8",
        "icon": "🏛️",
        "description": "Full text of every article on Romanian Wikipedia without heavy images.",
    },
    {
        "id": "zim-wiki-ro-maxi",
        "title": "Wikipedia Romanian Maxi (.zim)",
        "category": "Encyclopedias (Wikipedia)",
        "kiwix_category": "wikipedia",
        "prefix_regex": r"wikipedia_ro_all_maxi",
        "size_label": "~8.2 GB",
        "spine_color": "#1e40af",
        "icon": "🏛️",
        "description": "Complete Romanian Wikipedia including high-resolution diagrams and images.",
    },
    {
        "id": "zim-devdocs-c",
        "title": "DevDocs C Programming Reference (.zim)",
        "category": "Low-Level & Kernel",
        "kiwix_category": "devdocs",
        "prefix_regex": r"devdocs_en_c",
        "size_label": "~8 MB (Instant Download)",
        "spine_color": "#4338ca",
        "icon": "⚙️",
        "description": "Complete C standard library, headers, POSIX functions, and language reference.",
    },
    {
        "id": "zim-devdocs-linux",
        "title": "DevDocs Linux Man Pages (.zim)",
        "category": "Low-Level & Kernel",
        "kiwix_category": "devdocs",
        "prefix_regex": r"devdocs_en_linux|devdocs_en_bash",
        "size_label": "~12 MB (Instant Download)",
        "spine_color": "#3730a3",
        "icon": "🐧",
        "description": "Linux system administration, shell commands, and POSIX utilities reference.",
    },
    {
        "id": "zim-devdocs-python",
        "title": "DevDocs Python 3 Standard Library (.zim)",
        "category": "DevDocs & Engineering",
        "kiwix_category": "devdocs",
        "prefix_regex": r"devdocs_en_python",
        "size_label": "~25 MB (Fast Download)",
        "spine_color": "#0369a1",
        "icon": "🐍",
        "description": "Official Python 3 language and standard library offline documentation.",
    },
    {
        "id": "zim-wikimed",
        "title": "WikiMed Medical Encyclopedia (.zim)",
        "category": "Survival & Medical",
        "kiwix_category": "wikipedia",
        "prefix_regex": r"wikipedia_en_medicine_nopic|wikipedia_en_medicine_maxi",
        "size_label": "~1.8 GB",
        "spine_color": "#b91c1c",
        "icon": "⚕️",
        "description": "Offline medical encyclopedia covering anatomy, pharmacology, diagnostics, and emergency care.",
    },
    {
        "id": "zim-ifixit",
        "title": "iFixit Hardware Repair Manuals (.zim)",
        "category": "Survival & Medical",
        "kiwix_category": "ifixit",
        "prefix_regex": r"ifixit_en_all",
        "size_label": "~3.8 GB",
        "spine_color": "#c2410c",
        "icon": "🔧",
        "description": "Step-by-step teardown and repair guides for electronics, appliances, and vehicles.",
    },
    {
        "id": "zim-wiki-en-nopic",
        "title": "Wikipedia English Nopic (.zim)",
        "category": "Encyclopedias (Wikipedia)",
        "kiwix_category": "wikipedia",
        "prefix_regex": r"wikipedia_en_all_nopic",
        "size_label": "~56 GB",
        "spine_color": "#312e81",
        "icon": "🌍",
        "description": "Complete text-only English Wikipedia (over 6.8 million articles).",
    },
]
