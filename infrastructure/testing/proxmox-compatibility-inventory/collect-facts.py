#!/usr/bin/env python3
"""Emit bounded, minimized, read-only Proxmox consumer inventory facts.

This program deliberately contains no endpoint, SSH, credential, package-manager,
configuration-write, service-control, guest-control, storage-write, or reboot
capability. An operator supplies the exact reviewed bytes over an already approved
session and captures stdout.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = "starfiniti.proxmox-compatibility-inventory-facts.v1"
ENDPOINT_ID = "proxmox-host"
MAXIMUM_DURATION_SECONDS = 120
MAXIMUM_COMMAND_OUTPUT_BYTES = 256 * 1024
MAXIMUM_GUESTS = 32
MAXIMUM_STORAGES = 32
CRITICAL_GUESTS = {970: "application", 971: "database"}

PROGRAMS = (
    ("python3", None),
    ("pvesh", "/usr/bin/pvesh"),
    ("qm", "/usr/sbin/qm"),
    ("pct", "/usr/sbin/pct"),
    ("pvesm", "/usr/sbin/pvesm"),
    ("systemctl", "/usr/bin/systemctl"),
    ("pveversion", "/usr/bin/pveversion"),
)

SERVICE_IDS = (
    "pve-cluster.service",
    "pvedaemon.service",
    "pveproxy.service",
    "pvestatd.service",
    "pvescheduler.service",
    "pve-ha-crm.service",
    "pve-ha-lrm.service",
    "qmeventd.service",
    "ssh.service",
)

SAFE_KEY = re.compile(r"^[a-z][a-z0-9_.-]{0,63}$")
SAFE_ENUM = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$")
SAFE_VM_ID = re.compile(r"^[1-9][0-9]{0,8}$")
DISK_KEY = re.compile(r"^(?P<bus>ide|sata|scsi|virtio)(?P<slot>[0-9]{1,2})$")
NIC_KEY = re.compile(r"^net(?P<slot>[0-9]{1,2})$")


class InventoryError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise InventoryError(message)


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_file_digest(path: Path) -> str:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NOATIME", 0)
    descriptor = os.open(path, flags)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_size > 64 * 1024 * 1024:
            fail(f"{path} is not a bounded regular file")
        digest = hashlib.sha256()
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        after = os.fstat(descriptor)
        if (
            before.st_dev != after.st_dev
            or before.st_ino != after.st_ino
            or before.st_size != after.st_size
            or before.st_mtime_ns != after.st_mtime_ns
        ):
            fail(f"{path} changed while reading")
        return digest.hexdigest()
    finally:
        os.close(descriptor)


def verify_program(program_id: str, configured_path: str | None) -> dict[str, str]:
    requested = Path(
        os.path.realpath(sys.executable) if configured_path is None else configured_path
    )
    resolved = requested.resolve(strict=True)
    if resolved != requested:
        fail(f"{program_id} path is not canonical")
    metadata = resolved.stat(follow_symlinks=False)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != 0
        or metadata.st_mode & 0o022
    ):
        fail(f"{program_id} ownership or mode is unsafe")
    return {"id": program_id, "sha256": stable_file_digest(resolved)}


def run_command(argv: list[str], timeout_seconds: int = 20) -> bytes:
    if not argv or any(not isinstance(item, str) or not item for item in argv):
        fail("command arguments are invalid")
    completed = subprocess.run(
        argv,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"},
        check=False,
        timeout=timeout_seconds,
    )
    if len(completed.stdout) > MAXIMUM_COMMAND_OUTPUT_BYTES:
        fail(f"{argv[0]} output exceeds the bound")
    if completed.returncode != 0:
        fail(f"{argv[0]} exited {completed.returncode}")
    return completed.stdout


def read_json_command(argv: list[str], label: str) -> object:
    output = run_command(argv)
    try:
        return json.loads(output.decode("utf-8", "strict"))
    except (json.JSONDecodeError, UnicodeError):
        fail(f"{label} output is not valid UTF-8 JSON")


def parse_config(output: bytes, label: str) -> dict[str, str]:
    try:
        text = output.decode("utf-8", "strict")
    except UnicodeError:
        fail(f"{label} configuration is not UTF-8")
    result: dict[str, str] = {}
    for line in text.splitlines():
        if not line or ": " not in line:
            fail(f"{label} configuration line is malformed")
        key, value = line.split(": ", 1)
        if not SAFE_KEY.fullmatch(key) or key in result or len(value) > 8_192:
            fail(f"{label} configuration key or value is invalid")
        result[key] = value
    if not result:
        fail(f"{label} configuration is empty")
    return result


def safe_enum(value: str, default: str = "default") -> str:
    candidate = value.split(",", 1)[0].strip() if value else default
    if not SAFE_ENUM.fullmatch(candidate):
        fail("configuration enum is unsafe")
    return candidate


def enabled_value(value: str | None) -> bool:
    if value is None:
        return False
    return value.split(",", 1)[0].strip().lower() not in {"", "0", "false", "off", "no"}


def config_projection(config: dict[str, str], guest_type: str) -> dict[str, object]:
    key_names = sorted(config)
    base: dict[str, object] = {
        "keyCount": len(key_names),
        "keySetSha256": sha256_bytes(canonical_json(key_names)),
        "customArguments": "args" in config,
        "hookscript": "hookscript" in config,
        "startupPolicy": "startup" in config,
        "protection": enabled_value(config.get("protection")),
    }
    if guest_type == "qemu":
        disk_buses: Counter[str] = Counter()
        nic_models: Counter[str] = Counter()
        bridged_nics = 0
        firewalled_nics = 0
        for key, value in config.items():
            disk_match = DISK_KEY.fullmatch(key)
            if disk_match:
                disk_buses[disk_match.group("bus")] += 1
            nic_match = NIC_KEY.fullmatch(key)
            if nic_match:
                model = safe_enum(value.split("=", 1)[0])
                nic_models[model] += 1
                bridged_nics += int(",bridge=" in f",{value}")
                firewalled_nics += int(",firewall=1" in f",{value}")
        base.update(
            {
                "ostype": safe_enum(config.get("ostype", "other")),
                "machine": safe_enum(config.get("machine", "default")),
                "bios": safe_enum(config.get("bios", "seabios")),
                "cpuType": safe_enum(config.get("cpu", "default")),
                "scsiController": safe_enum(config.get("scsihw", "default")),
                "diskBuses": dict(sorted(disk_buses.items())),
                "nicModels": dict(sorted(nic_models.items())),
                "bridgedNicCount": bridged_nics,
                "firewalledNicCount": firewalled_nics,
                "guestAgentConfigured": enabled_value(config.get("agent")),
                "numaConfigured": enabled_value(config.get("numa")),
                "efiConfigured": "efidisk0" in config,
                "tpmConfigured": "tpmstate0" in config,
                "hostPciDeviceCount": sum(key.startswith("hostpci") for key in config),
                "usbDeviceCount": sum(key.startswith("usb") for key in config),
                "serialDeviceCount": sum(key.startswith("serial") for key in config),
                "cloudInitConfigured": any(
                    value.split(",", 1)[0].strip() == "cloudinit"
                    for key, value in config.items()
                    if DISK_KEY.fullmatch(key)
                ),
            }
        )
    else:
        base.update(
            {
                "ostype": safe_enum(config.get("ostype", "unmanaged")),
                "architecture": safe_enum(config.get("arch", "amd64")),
                "unprivileged": enabled_value(config.get("unprivileged")),
                "nestingConfigured": "nesting=1" in config.get("features", ""),
                "mountPointCount": sum(
                    re.fullmatch(r"mp[0-9]{1,2}", key) is not None for key in config
                ),
                "networkInterfaceCount": sum(
                    re.fullmatch(r"net[0-9]{1,2}", key) is not None for key in config
                ),
                "devicePassThroughCount": sum(
                    re.fullmatch(r"dev[0-9]{1,2}", key) is not None for key in config
                ),
            }
        )
    return base


def guest_inventory() -> dict[str, object]:
    resources = read_json_command(
        [
            "/usr/bin/pvesh",
            "get",
            "/cluster/resources",
            "--type",
            "vm",
            "--output-format",
            "json",
        ],
        "cluster resources",
    )
    if not isinstance(resources, list) or len(resources) > MAXIMUM_GUESTS:
        fail("guest resource inventory is invalid or oversized")
    raw_guests: list[dict[str, object]] = []
    seen: set[tuple[str, int]] = set()
    for resource in resources:
        if not isinstance(resource, dict):
            fail("guest resource record is invalid")
        guest_type = resource.get("type")
        vmid_value = resource.get("vmid")
        status_value = resource.get("status")
        if guest_type not in {"qemu", "lxc"}:
            fail("guest resource type is unsupported")
        vmid_text = str(vmid_value)
        if not SAFE_VM_ID.fullmatch(vmid_text) or status_value not in {
            "running",
            "stopped",
            "paused",
            "suspended",
        }:
            fail("guest identity or status is invalid")
        vmid = int(vmid_text)
        identity = (guest_type, vmid)
        if identity in seen:
            fail("guest resource is duplicated")
        seen.add(identity)
        executable = "/usr/sbin/qm" if guest_type == "qemu" else "/usr/sbin/pct"
        config = parse_config(
            run_command([executable, "config", vmid_text]),
            f"{guest_type} guest",
        )
        raw_guests.append(
            {
                "vmid": vmid,
                "type": guest_type,
                "status": status_value,
                "projection": config_projection(config, guest_type),
            }
        )
    missing_critical = set(CRITICAL_GUESTS) - {
        int(item["vmid"]) for item in raw_guests
    }
    if missing_critical:
        fail("critical workload inventory is incomplete")
    profile_groups: dict[str, dict[str, object]] = {}
    critical_workloads: list[dict[str, object]] = []
    for guest in raw_guests:
        profile_value = {
            "type": guest["type"],
            "projection": guest["projection"],
        }
        profile_sha256 = sha256_bytes(canonical_json(profile_value))
        group = profile_groups.setdefault(
            profile_sha256,
            {
                "profileSha256": profile_sha256,
                **profile_value,
                "count": 0,
                "statusCounts": {},
            },
        )
        group["count"] = int(group["count"]) + 1
        status_counts = group["statusCounts"]
        if not isinstance(status_counts, dict):
            fail("profile status count is invalid")
        status = str(guest["status"])
        status_counts[status] = int(status_counts.get(status, 0)) + 1
        vmid = int(guest["vmid"])
        if vmid in CRITICAL_GUESTS:
            critical_workloads.append(
                {
                    "id": CRITICAL_GUESTS[vmid],
                    "type": guest["type"],
                    "status": guest["status"],
                    "profileSha256": profile_sha256,
                }
            )
    profiles = sorted(profile_groups.values(), key=lambda item: str(item["profileSha256"]))
    for profile in profiles:
        status_counts = profile["statusCounts"]
        if not isinstance(status_counts, dict):
            fail("profile status count is invalid")
        profile["statusCounts"] = dict(sorted(status_counts.items()))
    return {
        "counts": {
            "total": len(raw_guests),
            "qemu": sum(item["type"] == "qemu" for item in raw_guests),
            "lxc": sum(item["type"] == "lxc" for item in raw_guests),
            "running": sum(item["status"] == "running" for item in raw_guests),
            "stopped": sum(item["status"] == "stopped" for item in raw_guests),
            "pausedOrSuspended": sum(
                item["status"] in {"paused", "suspended"} for item in raw_guests
            ),
        },
        "profiles": profiles,
        "criticalWorkloads": sorted(critical_workloads, key=lambda item: str(item["id"])),
    }


def storage_inventory() -> list[dict[str, object]]:
    records = read_json_command(
        ["/usr/bin/pvesh", "get", "/storage", "--output-format", "json"],
        "storage configuration",
    )
    if not isinstance(records, list) or len(records) > MAXIMUM_STORAGES:
        fail("storage inventory is invalid or oversized")
    status_output = run_command(["/usr/sbin/pvesm", "status"]).decode(
        "utf-8", "strict"
    )
    status_by_id: dict[str, tuple[str, str]] = {}
    for index, line in enumerate(status_output.splitlines()):
        if index == 0:
            if "Type" not in line or "Status" not in line:
                fail("storage status header is invalid")
            continue
        parts = line.split()
        if len(parts) != 7:
            fail("storage status record is invalid")
        storage_id, storage_type, status = parts[:3]
        if (
            not SAFE_ENUM.fullmatch(storage_id)
            or not SAFE_ENUM.fullmatch(storage_type)
            or status not in {"active", "inactive", "disabled"}
            or storage_id in status_by_id
        ):
            fail("storage status identity is invalid")
        if any(not re.fullmatch(r"[0-9]+", value) for value in parts[3:6]) or not re.fullmatch(
            r"[0-9]+(?:\.[0-9]+)?%", parts[6]
        ):
            fail("storage status quantity is invalid")
        status_by_id[storage_id] = (storage_type, status)
    safe_records: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            fail("storage record is invalid")
        storage_id = record.get("storage")
        storage_type = record.get("type")
        content = record.get("content", "")
        if (
            not isinstance(storage_id, str)
            or not SAFE_ENUM.fullmatch(storage_id)
            or storage_id in seen_ids
            or not isinstance(storage_type, str)
            or not SAFE_ENUM.fullmatch(storage_type)
        ):
            fail("storage type is invalid")
        seen_ids.add(storage_id)
        if not isinstance(content, str):
            fail("storage content is invalid")
        content_types = sorted(value for value in content.split(",") if value)
        if any(not SAFE_ENUM.fullmatch(value) for value in content_types):
            fail("storage content type is invalid")
        status_record = status_by_id.get(storage_id)
        disabled = bool(record.get("disable"))
        if status_record is None:
            if not disabled:
                fail("enabled storage lacks a status record")
            active = False
        else:
            if status_record[0] != storage_type:
                fail("storage type differs between configuration and status")
            active = status_record[1] == "active"
        safe_records.append(
            {
                "type": storage_type,
                "content": content_types,
                "active": active,
                "enabled": not disabled,
                "shared": bool(record.get("shared")),
            }
        )
    if set(status_by_id) - seen_ids:
        fail("storage status contains an unknown configuration")
    return sorted(safe_records, key=lambda item: canonical_json(item))


def service_inventory() -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for service_id in SERVICE_IDS:
        output = run_command(
            [
                "/usr/bin/systemctl",
                "show",
                service_id,
                "--no-pager",
                "--property=Id,LoadState,ActiveState,SubState,UnitFileState",
            ]
        ).decode("utf-8", "strict")
        values: dict[str, str] = {}
        for line in output.splitlines():
            if "=" not in line:
                fail("service property line is malformed")
            key, value = line.split("=", 1)
            if key in values or key not in {
                "Id",
                "LoadState",
                "ActiveState",
                "SubState",
                "UnitFileState",
            }:
                fail("service property key is invalid")
            values[key] = value
        if set(values) != {
            "Id",
            "LoadState",
            "ActiveState",
            "SubState",
            "UnitFileState",
        }:
            fail("service property set is incomplete")
        if values["Id"] != service_id or any(
            not SAFE_ENUM.fullmatch(values[key])
            for key in ("LoadState", "ActiveState", "SubState", "UnitFileState")
        ):
            fail("service property value is invalid")
        result.append(
            {
                "id": service_id,
                "loadState": values["LoadState"],
                "activeState": values["ActiveState"],
                "subState": values["SubState"],
                "unitFileState": values["UnitFileState"],
            }
        )
    return result


def network_inventory() -> dict[str, object]:
    root = Path("/sys/class/net")
    kinds: Counter[str] = Counter()
    states: Counter[str] = Counter()
    entries = sorted(root.iterdir(), key=lambda item: item.name)
    if len(entries) > 256:
        fail("network interface inventory is oversized")
    for entry in entries:
        name = entry.name
        if not entry.is_dir():
            if name == "bonding_masters" and entry.is_file():
                continue
            fail("network class contains an unsupported entry")
        if name == "lo":
            kind = "loopback"
        elif re.fullmatch(r"(?:tap|fwbr|fwpr|fwln|veth)[0-9]+[A-Za-z0-9_.-]*", name):
            kind = "guest-virtual"
        elif (entry / "bridge").is_dir():
            kind = "bridge"
        elif (entry / "bonding").is_dir():
            kind = "bond"
        elif (entry / "device").exists():
            kind = "physical"
        elif "." in name:
            kind = "vlan"
        else:
            kind = "other-virtual"
        state = (entry / "operstate").read_text(encoding="ascii").strip()
        if state not in {"up", "down", "unknown", "dormant", "lowerlayerdown", "notpresent", "testing"}:
            fail("network interface state is invalid")
        kinds[kind] += 1
        states[state] += 1
    default_routes = 0
    for line in Path("/proc/net/route").read_text(encoding="ascii").splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 4 and parts[1] == "00000000" and int(parts[3], 16) & 0x1:
            default_routes += 1
    return {
        "kindCounts": dict(sorted(kinds.items())),
        "stateCounts": dict(sorted(states.items())),
        "ipv4DefaultRouteCount": default_routes,
    }


def platform_inventory() -> dict[str, object]:
    cpu_info = Path("/proc/cpuinfo").read_text(encoding="ascii", errors="strict")
    flags: set[str] = set()
    for line in cpu_info.splitlines():
        if line.startswith("flags") and ":" in line:
            flags.update(line.split(":", 1)[1].strip().split())
            break
    relevant_modules = (
        "bridge",
        "kvm",
        "kvm_amd",
        "kvm_intel",
        "vfio_pci",
        "vhost_net",
        "zfs",
    )
    return {
        "architecture": os.uname().machine,
        "runningKernel": os.uname().release,
        "cpuCount": os.cpu_count(),
        "hardwareVirtualizationFlag": "vmx" if "vmx" in flags else "svm" if "svm" in flags else "absent",
        "kvmDevicePresent": Path("/dev/kvm").exists(),
        "iommuGroupCount": len(list(Path("/sys/kernel/iommu_groups").glob("[0-9]*"))),
        "bootMode": "uefi" if Path("/sys/firmware/efi").is_dir() else "bios",
        "loadedModules": {
            module: Path(f"/sys/module/{module}").is_dir()
            for module in relevant_modules
        },
    }


def collect_projection() -> dict[str, object]:
    pve_version = run_command(["/usr/bin/pveversion"]).decode("ascii", "strict").strip()
    if not re.fullmatch(
        r"pve-manager/[0-9][0-9A-Za-z.+:~_-]{0,99}/[0-9a-f]{16} \(running kernel: [0-9A-Za-z.+_-]{1,99}\)",
        pve_version,
    ):
        fail("PVE version output is invalid")
    guests = guest_inventory()
    ha_resources = read_json_command(
        [
            "/usr/bin/pvesh",
            "get",
            "/cluster/ha/resources",
            "--output-format",
            "json",
        ],
        "HA resources",
    )
    if (
        not isinstance(ha_resources, list)
        or len(ha_resources) > MAXIMUM_GUESTS
        or any(not isinstance(resource, dict) for resource in ha_resources)
    ):
        fail("HA resource inventory is invalid or oversized")
    return {
        "pveVersion": pve_version,
        "platform": platform_inventory(),
        "guests": guests,
        "storages": storage_inventory(),
        "services": service_inventory(),
        "network": network_inventory(),
        "haResourceCount": len(ha_resources),
    }


def main() -> None:
    started = time.monotonic()
    if os.geteuid() != 0:
        fail("effective UID must be root for authoritative inventory")
    if sys.flags.isolated != 1 or not sys.flags.safe_path:
        fail("Python isolated safe-path mode is required")
    if sys.argv != [sys.argv[0]]:
        fail("arguments are prohibited")
    tools = [verify_program(program_id, path) for program_id, path in PROGRAMS]
    before = collect_projection()
    after = collect_projection()
    if before != after:
        fail("safe consumer inventory changed during capture")
    elapsed_milliseconds = round((time.monotonic() - started) * 1_000)
    if elapsed_milliseconds > MAXIMUM_DURATION_SECONDS * 1_000:
        fail("consumer inventory exceeded the duration bound")
    document = {
        "schema": SCHEMA,
        "observedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
            "+00:00", "Z"
        ),
        "endpointId": ENDPOINT_ID,
        "tools": tools,
        "projection": before,
        "projectionSha256": sha256_bytes(canonical_json(before)),
        "stableRead": True,
        "elapsedMilliseconds": elapsed_milliseconds,
    }
    encoded = canonical_json(document)
    if len(encoded) > 64 * 1024:
        fail("fact document exceeds the output bound")
    sys.stdout.buffer.write(encoded + b"\n")


if __name__ == "__main__":
    try:
        main()
    except (OSError, InventoryError, subprocess.SubprocessError, UnicodeError, ValueError) as error:
        sys.stderr.write(f"Proxmox consumer inventory refused: {error}\n")
        raise SystemExit(1) from None
